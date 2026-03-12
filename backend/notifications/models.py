# notifications/models.py

from django.db import models
from django.conf import settings


# ============================================================================
# NOTIFICATION EVENT TYPES
# ============================================================================

class NotificationEvent(models.TextChoices):
    BOOKING_CREATED    = "booking_created",    "New Booking Created"
    DEPOSIT_RECEIVED   = "deposit_received",   "Deposit Payment Received"
    BOOKING_CONFIRMED  = "booking_confirmed",  "Booking Confirmed"
    BOOKING_CANCELLED  = "booking_cancelled",  "Booking Cancelled"
    CHECKIN_REMINDER   = "checkin_reminder",   "Check-in Reminder"


# ============================================================================
# NOTIFICATION RECIPIENT TYPES
# ============================================================================

class NotificationRecipientType(models.TextChoices):
    GUEST = "guest", "Guest"
    ADMIN = "admin", "Admin"


# ============================================================================
# NOTIFICATION CHANNEL TYPES
# ============================================================================

class NotificationChannel(models.TextChoices):
    DASHBOARD = "dashboard", "Dashboard"
    EMAIL     = "email",     "Email"
    BOTH      = "both",      "Both"


# ============================================================================
# NOTIFICATION READ STATUS
# ============================================================================

class NotificationStatus(models.TextChoices):
    UNREAD = "unread", "Unread"
    READ   = "read",   "Read"


# ============================================================================
# NOTIFICATION MODEL
# ============================================================================

class Notification(models.Model):
    """
    Stores all system notifications for guests and admins.

    Flow:
      1. A system event fires (booking created, deposit paid, etc.)
      2. NotificationService.notify() is called with the event + booking
      3. Notification records are created for the appropriate recipients
      4. Frontend polls /api/notifications/ to display the badge + list
      5. User opens a notification → PATCH /api/notifications/<id>/read/
         sets status = READ
    """

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
        help_text="The user who receives this notification",
    )

    # Booking reference — null-safe so we can send system-wide admin notices
    booking = models.ForeignKey(
        "bookings.Booking",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notifications",
        help_text="Related booking (if applicable)",
    )

    event = models.CharField(
        max_length=30,
        choices=NotificationEvent.choices,
        help_text="The system event that triggered this notification",
    )

    recipient_type = models.CharField(
        max_length=10,
        choices=NotificationRecipientType.choices,
        default=NotificationRecipientType.GUEST,
    )

    channel = models.CharField(
        max_length=10,
        choices=NotificationChannel.choices,
        default=NotificationChannel.DASHBOARD,
    )

    title = models.CharField(max_length=200)
    description = models.TextField()

    status = models.CharField(
        max_length=10,
        choices=NotificationStatus.choices,
        default=NotificationStatus.UNREAD,
        db_index=True,
    )

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "notifications"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["recipient", "status"]),
            models.Index(fields=["recipient", "-created_at"]),
            models.Index(fields=["event"]),
        ]

    def __str__(self):
        return f"[{self.get_event_display()}] → {self.recipient.email} ({self.status})"

    @property
    def is_unread(self):
        return self.status == NotificationStatus.UNREAD