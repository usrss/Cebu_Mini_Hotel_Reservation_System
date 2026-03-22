"""
chatbot/services/support_service.py

Handles support escalation logic.
Creates SupportTicket, transitions conversation to SUPPORT mode.
"""

import logging
from django.utils import timezone

from chatbot.models import Conversation, SupportTicket, ConversationStatus, TicketStatus

logger = logging.getLogger(__name__)


def escalate_to_support(conversation: Conversation, subject: str = "") -> SupportTicket:
    """
    Escalate a conversation to human support.
    Creates a SupportTicket and updates conversation status.
    Idempotent — returns existing ticket if already escalated.
    """
    # Check if already escalated
    if hasattr(conversation, "support_ticket"):
        return conversation.support_ticket

    # Transition conversation to support mode
    conversation.status = ConversationStatus.SUPPORT
    conversation.save(update_fields=["status", "updated_at"])

    # Auto-generate subject from first user message if not provided
    if not subject:
        first_msg = conversation.messages.filter(sender="user").first()
        if first_msg:
            subject = first_msg.message_text[:120]
        else:
            subject = "Support request"

    ticket = SupportTicket.objects.create(
        conversation=conversation,
        user=conversation.user,
        status=TicketStatus.OPEN,
        subject=subject,
    )

    logger.info(
        "Support ticket #%s created for conversation #%s",
        ticket.pk, conversation.pk,
    )

    return ticket


def get_open_tickets_for_staff() -> list:
    """
    Returns all open/in-progress support tickets.
    Used by admin support dashboard.
    """
    tickets = (
        SupportTicket.objects
        .filter(status__in=[TicketStatus.OPEN, TicketStatus.IN_PROGRESS])
        .select_related("conversation", "user", "assigned_to")
        .order_by("-created_at")
    )

    results = []
    for t in tickets:
        results.append({
            "id":             t.pk,
            "conversation_id": t.conversation_id,
            "subject":        t.subject,
            "status":         t.status,
            "user_email":     t.user.email if t.user else "Anonymous",
            "assigned_to":    t.assigned_to.get_full_name() if t.assigned_to else None,
            "created_at":     t.created_at.isoformat(),
            "message_count":  t.conversation.messages.count(),
        })

    return results


def close_ticket(ticket: SupportTicket, closed_by=None) -> SupportTicket:
    """Close a support ticket and mark conversation as closed."""
    ticket.status = TicketStatus.CLOSED
    ticket.closed_at = timezone.now()
    ticket.save(update_fields=["status", "closed_at", "updated_at"])

    ticket.conversation.status = ConversationStatus.CLOSED
    ticket.conversation.save(update_fields=["status", "updated_at"])

    logger.info("Ticket #%s closed by %s", ticket.pk, closed_by)
    return ticket