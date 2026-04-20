"""
chatbot/models.py

Models for the hybrid chatbot system with role-based ticket routing.

Tables:
  - Conversation    : one per user session (or anonymous session)
  - Message         : individual messages (user / bot / support)
  - SupportTicket   : created when chat is escalated to human support
                      now includes tier/priority routing for role-based dispatch
"""

from django.db import models
from django.conf import settings


# ─── Sender types ─────────────────────────────────────────────────────────────

class SenderType(models.TextChoices):
    USER    = "user",    "User"
    BOT     = "bot",     "Bot"
    SUPPORT = "support", "Support Agent"


# ─── Conversation status ──────────────────────────────────────────────────────

class ConversationStatus(models.TextChoices):
    ACTIVE   = "active",   "Active"
    SUPPORT  = "support",  "Escalated to Support"
    CLOSED   = "closed",   "Closed"


# ─── Support ticket status ────────────────────────────────────────────────────

class TicketStatus(models.TextChoices):
    OPEN        = "open",        "Open"
    IN_PROGRESS = "in_progress", "In Progress"
    ESCALATED   = "escalated",   "Escalated"   # NEW: moved up to Manager/Admin
    CLOSED      = "closed",      "Closed"


# ─── Ticket priority ──────────────────────────────────────────────────────────

class TicketPriority(models.TextChoices):
    LOW      = "low",      "Low"
    NORMAL   = "normal",   "Normal"
    HIGH     = "high",     "High"
    CRITICAL = "critical", "Critical"


# ─── Ticket tier (routing layer) ──────────────────────────────────────────────

class TicketTier(models.TextChoices):
    """
    Determines which staff role handles this ticket.

    FRONT_DESK  → Receptionist / Front Desk handles first.
    MANAGER     → Escalated to Manager (unresolved, VIP, refund approval).
    ADMIN       → Critical or system-level; Admin oversight.
    """
    FRONT_DESK = "front_desk", "Front Desk"
    MANAGER    = "manager",    "Manager"
    ADMIN      = "admin",      "Admin"


# ─── Ticket category ──────────────────────────────────────────────────────────

class TicketCategory(models.TextChoices):
    """
    Broad issue category used by the classifier and for analytics.
    """
    BOOKING_INQUIRY     = "booking_inquiry",     "Booking Inquiry"
    PAYMENT_ISSUE       = "payment_issue",       "Payment Issue"
    ROOM_COMPLAINT      = "room_complaint",      "Room Complaint"
    CANCELLATION        = "cancellation",        "Cancellation / Refund"
    VIP_REQUEST         = "vip_request",         "VIP Request"
    TECHNICAL_ERROR     = "technical_error",     "Technical Error"
    GENERAL_INQUIRY     = "general_inquiry",     "General Inquiry"
    SECURITY_CONCERN    = "security_concern",    "Security Concern"
    OTHER               = "other",               "Other"


# ─── Conversation ─────────────────────────────────────────────────────────────

class Conversation(models.Model):
    """
    One conversation per user session.
    user is NULL for unauthenticated visitors.
    session_key is used to track anonymous users.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="chat_conversations",
        help_text="NULL for unauthenticated users.",
    )

    session_key = models.CharField(
        max_length=100,
        blank=True,
        db_index=True,
        help_text="Used to track anonymous users across requests.",
    )

    status = models.CharField(
        max_length=20,
        choices=ConversationStatus.choices,
        default=ConversationStatus.ACTIVE,
        db_index=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "chatbot_conversations"
        ordering = ["-updated_at"]
        indexes = [
            models.Index(fields=["user", "status"]),
            models.Index(fields=["session_key"]),
        ]

    def __str__(self):
        identifier = self.user.email if self.user else f"anon:{self.session_key[:8]}"
        return f"Conversation [{self.status}] — {identifier}"

    @property
    def is_in_support_mode(self):
        return self.status == ConversationStatus.SUPPORT


# ─── Message ──────────────────────────────────────────────────────────────────

class Message(models.Model):
    """
    Single message within a conversation.
    sender distinguishes user, bot, and human support agent messages.
    """

    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name="messages",
    )

    sender = models.CharField(
        max_length=10,
        choices=SenderType.choices,
        default=SenderType.USER,
        db_index=True,
    )

    sent_by_staff = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="support_messages",
        help_text="Only set when sender=support.",
    )

    message_text = models.TextField()

    metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text="Optional structured data (e.g. room list, booking info).",
    )

    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "chatbot_messages"
        ordering = ["timestamp"]
        indexes = [
            models.Index(fields=["conversation", "timestamp"]),
        ]

    def __str__(self):
        return f"[{self.sender}] {self.message_text[:60]}"


# ─── SupportTicket ────────────────────────────────────────────────────────────

class SupportTicket(models.Model):
    """
    Created when a conversation is escalated to human support.

    Role-based routing:
      tier = FRONT_DESK → assigned to Receptionist or Front Desk first.
      tier = MANAGER    → escalated from Front Desk or identified as VIP/complex.
      tier = ADMIN      → critical/system-level issues; Admin oversight.

    priority drives notification urgency and queue ordering.
    category classifies the issue type for analytics and smart routing.

    Escalation chain:
      FRONT_DESK → (escalate) → MANAGER → (escalate) → ADMIN
    """

    conversation = models.OneToOneField(
        Conversation,
        on_delete=models.CASCADE,
        related_name="support_ticket",
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="support_tickets",
    )

    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_support_tickets",
    )

    status = models.CharField(
        max_length=20,
        choices=TicketStatus.choices,
        default=TicketStatus.OPEN,
        db_index=True,
    )

    # ── Routing fields ────────────────────────────────────────────────────────
    tier = models.CharField(
        max_length=20,
        choices=TicketTier.choices,
        default=TicketTier.FRONT_DESK,
        db_index=True,
        help_text="Which staff tier currently owns this ticket.",
    )

    priority = models.CharField(
        max_length=10,
        choices=TicketPriority.choices,
        default=TicketPriority.NORMAL,
        db_index=True,
    )

    category = models.CharField(
        max_length=30,
        choices=TicketCategory.choices,
        default=TicketCategory.GENERAL_INQUIRY,
        db_index=True,
        help_text="Issue category used for routing and analytics.",
    )

    # Short description of the issue (auto-generated or extracted)
    subject = models.CharField(max_length=255, blank=True)

    notes = models.TextField(
        blank=True,
        help_text="Internal notes from support staff.",
    )

    # ── Escalation audit ──────────────────────────────────────────────────────
    escalated_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When this ticket was last escalated to a higher tier.",
    )
    escalated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="escalated_tickets",
        help_text="Staff member who triggered the last escalation.",
    )
    escalation_reason = models.TextField(
        blank=True,
        help_text="Reason recorded when escalating to Manager/Admin.",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    closed_at  = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "chatbot_support_tickets"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["tier", "status"]),
            models.Index(fields=["priority", "tier"]),
            models.Index(fields=["assigned_to", "status"]),
            models.Index(fields=["category"]),
        ]

    def __str__(self):
        return (
            f"Ticket #{self.pk} [{self.status}] "
            f"[{self.tier}] [{self.priority}] — {self.subject or 'No subject'}"
        )

    @property
    def can_escalate(self) -> bool:
        """True if ticket can be moved to a higher tier."""
        return (
            self.status not in (TicketStatus.CLOSED,)
            and self.tier != TicketTier.ADMIN
        )

    @property
    def next_tier(self) -> str | None:
        """Returns the next tier in the escalation chain, or None."""
        chain = [TicketTier.FRONT_DESK, TicketTier.MANAGER, TicketTier.ADMIN]
        try:
            idx = chain.index(self.tier)
            return chain[idx + 1] if idx + 1 < len(chain) else None
        except ValueError:
            return None