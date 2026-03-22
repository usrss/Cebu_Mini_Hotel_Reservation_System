"""
chatbot/models.py

Models for the hybrid chatbot system.

Tables:
  - Conversation    : one per user session (or anonymous session)
  - Message         : individual messages (user / bot / support)
  - SupportTicket   : created when chat is escalated to human support
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
    CLOSED      = "closed",      "Closed"


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

    # For anonymous users — browser session key
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

    # For support messages — which staff member sent it
    sent_by_staff = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="support_messages",
        help_text="Only set when sender=support.",
    )

    message_text = models.TextField()

    # Structured data from bot responses (optional — for rich cards)
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
    Assigned to Admin or Manager staff.
    One ticket per conversation maximum.
    """

    conversation = models.OneToOneField(
        Conversation,
        on_delete=models.CASCADE,
        related_name="support_ticket",
    )

    # The guest who needs help
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="support_tickets",
    )

    # The staff member handling it
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

    # Short description of the issue (auto-generated from first message)
    subject = models.CharField(max_length=255, blank=True)

    notes = models.TextField(
        blank=True,
        help_text="Internal notes from support staff.",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    closed_at  = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "chatbot_support_tickets"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["assigned_to", "status"]),
        ]

    def __str__(self):
        return f"Ticket #{self.pk} [{self.status}] — {self.subject or 'No subject'}"