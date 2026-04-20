"""
chatbot/services/support_service.py

Handles support escalation logic with role-based ticket routing.

Routing hierarchy (per spec):
  1. All new tickets → FRONT_DESK tier (Receptionist / Front Desk)
  2. Front Desk can escalate → MANAGER tier
  3. Manager can escalate → ADMIN tier
  4. Critical/system issues → ADMIN tier directly

Notifications (FIXED):
  - Uses SYSTEM_ALERT event with a clear title so FD/Manager/Admin
    can distinguish ticket notifications from other system alerts.
  - FRONT_DESK ticket → notifies roles: ["front_desk", "front_desk"]
    (role string in StaffProfile is "front_desk", NOT "receptionist")
  - MANAGER tier ticket → notifies role: ["manager"]
  - ADMIN tier ticket   → notifies roles: ["admin"]
  - Escalation          → notifies ONLY the NEW tier recipients
"""

import logging
from django.utils import timezone

from chatbot.models import (
    Conversation, SupportTicket, ConversationStatus,
    TicketStatus, TicketTier, TicketPriority, TicketCategory,
)

logger = logging.getLogger(__name__)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _get_staff_by_roles(roles: list):
    """Return active User objects for the given staff role strings."""
    try:
        from staff.models import StaffProfile
        profiles = StaffProfile.objects.filter(
            is_active=True,
            role__in=roles,
        ).select_related("user")
        return [p.user for p in profiles if p.user.is_active]
    except Exception as exc:
        logger.warning("_get_staff_by_roles failed: %s", exc)
        return []


def _tier_to_roles(tier: str) -> list:
    """
    Map a TicketTier value to the list of StaffProfile.role strings
    that should receive notifications for that tier.

    IMPORTANT: StaffProfile uses "front_desk" (underscore), never "receptionist"
    for the primary routing role. Receptionist is a separate role that maps
    to FRONT_DESK tier in the support system.
    """
    if tier == TicketTier.ADMIN:
        return ["admin"]
    if tier == TicketTier.MANAGER:
        return ["manager"]
    # FRONT_DESK — also notify receptionist since they handle the same queue
    return ["front_desk", "receptionist"]


def _tier_to_recipient_type(tier: str):
    """Map TicketTier to NotificationRecipientType."""
    from notifications.models import NotificationRecipientType
    if tier == TicketTier.ADMIN:
        return NotificationRecipientType.ADMIN
    if tier == TicketTier.MANAGER:
        return NotificationRecipientType.MANAGER
    return NotificationRecipientType.FRONT_DESK


def _send_ticket_notification(
    ticket: SupportTicket,
    is_new: bool = True,
    escalation_reason: str = "",
):
    """
    Send a dashboard notification to the staff tier that now owns the ticket.

    Uses SYSTEM_ALERT event (closest available) with a structured title
    so the frontend can filter/display ticket notifications correctly.

    Only notifies the CURRENT tier — previous tiers are NOT re-notified
    on escalation (they can see the updated status in their dashboard).
    """
    try:
        from notifications.models import (
            NotificationEvent,
            NotificationChannel,
            NotificationPriority,
            Notification,
        )

        # Map ticket priority → notification priority
        priority_map = {
            TicketPriority.LOW:      NotificationPriority.LOW,
            TicketPriority.NORMAL:   NotificationPriority.MEDIUM,
            TicketPriority.HIGH:     NotificationPriority.HIGH,
            TicketPriority.CRITICAL: NotificationPriority.URGENT,
        }
        notif_priority = priority_map.get(ticket.priority, NotificationPriority.MEDIUM)

        recipient_type = _tier_to_recipient_type(ticket.tier)
        roles          = _tier_to_roles(ticket.tier)
        recipients     = _get_staff_by_roles(roles)

        tier_label = ticket.tier.replace("_", " ").title()

        if is_new:
            title = f"🎫 New Support Ticket #{ticket.pk} — {ticket.get_category_display()}"
            description = (
                f"A guest support ticket has been created and assigned to the "
                f"{tier_label} team. "
                f"Subject: \"{ticket.subject or 'No subject'}\". "
                f"Priority: {ticket.priority.upper()}."
            )
        else:
            title = f"⬆ Ticket #{ticket.pk} Escalated → {tier_label}"
            description = (
                f"Support ticket escalated to the {tier_label} team. "
                f"Subject: \"{ticket.subject or 'No subject'}\". "
                f"Reason: {escalation_reason or 'No reason provided'}."
            )

        created_count = 0
        for user in recipients:
            try:
                Notification.objects.create(
                    recipient      = user,
                    event          = NotificationEvent.SYSTEM_ALERT,
                    recipient_type = recipient_type,
                    channel        = NotificationChannel.DASHBOARD,
                    priority       = notif_priority,
                    title          = title,
                    description    = description,
                )
                created_count += 1
            except Exception as exc:
                logger.warning(
                    "Failed to create ticket notification for %s: %s",
                    user.email, exc,
                )

        logger.info(
            "Ticket #%s notification sent to %d recipient(s) [tier=%s, is_new=%s]",
            ticket.pk, created_count, ticket.tier, is_new,
        )

    except Exception as exc:
        logger.error("_send_ticket_notification failed: %s", exc, exc_info=True)


# ─── Main escalation entry point ──────────────────────────────────────────────

def escalate_to_support(
    conversation: Conversation,
    subject: str = "",
    tier: str = TicketTier.FRONT_DESK,
    priority: str = TicketPriority.NORMAL,
    category: str = TicketCategory.GENERAL_INQUIRY,
) -> SupportTicket:
    """
    Escalate a conversation to human support with role-based routing.

    Idempotent — returns the existing ticket if the conversation is already
    escalated. If the existing ticket has a LOWER tier than requested,
    upgrades it (e.g. a second message classified as critical mid-conversation).

    Args:
        conversation: The Conversation being escalated.
        subject:      Short description of the issue (≤120 chars).
        tier:         Initial routing tier (default: FRONT_DESK).
        priority:     Ticket priority (default: NORMAL).
        category:     Issue category for routing and analytics.

    Returns:
        The created (or existing) SupportTicket.
    """

    # ── Idempotency: return existing ticket, upgrading tier if needed ─────────
    existing = getattr(conversation, "support_ticket", None)
    if existing is not None:
        tier_order = [TicketTier.FRONT_DESK, TicketTier.MANAGER, TicketTier.ADMIN]
        try:
            requested_idx = tier_order.index(tier)
            current_idx   = tier_order.index(existing.tier)
        except ValueError:
            return existing

        if requested_idx > current_idx:
            # Upgrade tier — notify new tier recipients
            existing.tier     = tier
            existing.priority = priority
            existing.status   = TicketStatus.ESCALATED
            existing.save(update_fields=["tier", "priority", "status", "updated_at"])
            _send_ticket_notification(
                existing,
                is_new=False,
                escalation_reason="Tier upgraded on re-classification",
            )

        return existing

    # ── Transition conversation to support mode ───────────────────────────────
    conversation.status = ConversationStatus.SUPPORT
    conversation.save(update_fields=["status", "updated_at"])

    # ── Auto-generate subject if not provided ─────────────────────────────────
    if not subject:
        first_msg = conversation.messages.filter(sender="user").first()
        subject   = first_msg.message_text[:120] if first_msg else "Support request"

    # ── Create ticket ─────────────────────────────────────────────────────────
    ticket = SupportTicket.objects.create(
        conversation = conversation,
        user         = conversation.user,
        status       = TicketStatus.OPEN,
        tier         = tier,
        priority     = priority,
        category     = category,
        subject      = subject,
    )

    logger.info(
        "Support ticket #%s created [tier=%s, priority=%s, category=%s] "
        "for conversation #%s",
        ticket.pk, tier, priority, category, conversation.pk,
    )

    # ── Notify the appropriate staff tier ─────────────────────────────────────
    _send_ticket_notification(ticket, is_new=True)

    return ticket


# ─── Escalate existing ticket to next tier ────────────────────────────────────

def escalate_ticket(
    ticket: SupportTicket,
    escalated_by=None,
    reason: str = "",
) -> SupportTicket:
    """
    Move a ticket up the routing chain: FD → Manager → Admin.

    Clears the current assignee so the new tier can self-assign.
    Notifies ONLY the new tier recipients.

    Raises:
        ValueError if ticket is already at ADMIN tier or is closed.
    """
    if ticket.status == TicketStatus.CLOSED:
        raise ValueError("Cannot escalate a closed ticket.")

    next_tier = ticket.next_tier
    if not next_tier:
        raise ValueError(
            f"Ticket #{ticket.pk} is already at the highest tier (Admin)."
        )

    ticket.tier              = next_tier
    ticket.status            = TicketStatus.ESCALATED
    ticket.assigned_to       = None          # clear — new tier self-assigns
    ticket.escalated_at      = timezone.now()
    ticket.escalated_by      = escalated_by
    ticket.escalation_reason = reason or "Escalated by staff"

    ticket.save(update_fields=[
        "tier", "status", "assigned_to",
        "escalated_at", "escalated_by", "escalation_reason",
        "updated_at",
    ])

    logger.info(
        "Ticket #%s escalated to %s by %s. Reason: %s",
        ticket.pk, next_tier,
        escalated_by.email if escalated_by else "system",
        reason,
    )

    # Notify new tier
    _send_ticket_notification(ticket, is_new=False, escalation_reason=reason)

    return ticket


# ─── Query helpers ────────────────────────────────────────────────────────────

def get_tickets_for_user(user) -> list:
    """
    Returns tickets visible to the given staff user based on their role.

    Admin       → all tickets
    Manager     → MANAGER + ADMIN tier
    Front Desk / Receptionist → FRONT_DESK tier only
    """
    try:
        profile = getattr(user, "staff_profile", None)
        if not profile:
            return []

        role = profile.effective_role
        qs   = SupportTicket.objects.select_related(
            "conversation", "user", "assigned_to"
        ).order_by("-created_at")

        if role == "admin":
            return list(qs)
        elif role == "manager":
            return list(qs.filter(tier__in=[TicketTier.MANAGER, TicketTier.ADMIN]))
        elif role in ("front_desk", "receptionist"):
            return list(qs.filter(tier=TicketTier.FRONT_DESK))
        return []

    except Exception as exc:
        logger.error("get_tickets_for_user failed: %s", exc)
        return []


def get_open_tickets_for_staff() -> list:
    """All open/in-progress/escalated support tickets. Used by admin dashboard."""
    tickets = (
        SupportTicket.objects
        .filter(
            status__in=[
                TicketStatus.OPEN,
                TicketStatus.IN_PROGRESS,
                TicketStatus.ESCALATED,
            ]
        )
        .select_related("conversation", "user", "assigned_to")
        .order_by("-created_at")
    )

    results = []
    for t in tickets:
        results.append({
            "id":               t.pk,
            "conversation_id":  t.conversation_id,
            "subject":          t.subject,
            "status":           t.status,
            "tier":             t.tier,
            "priority":         t.priority,
            "category":         t.category,
            "user_email":       t.user.email if t.user else "Anonymous",
            "assigned_to":      t.assigned_to.get_full_name() if t.assigned_to else None,
            "created_at":       t.created_at.isoformat(),
            "message_count":    t.conversation.messages.count(),
            "escalation_reason": t.escalation_reason,
        })

    return results


# ─── Close ticket ─────────────────────────────────────────────────────────────

def close_ticket(ticket: SupportTicket, closed_by=None) -> SupportTicket:
    """Close a support ticket and mark conversation as closed."""
    ticket.status    = TicketStatus.CLOSED
    ticket.closed_at = timezone.now()
    ticket.save(update_fields=["status", "closed_at", "updated_at"])

    ticket.conversation.status = ConversationStatus.CLOSED
    ticket.conversation.save(update_fields=["status", "updated_at"])

    logger.info("Ticket #%s closed by %s", ticket.pk, closed_by)
    return ticket