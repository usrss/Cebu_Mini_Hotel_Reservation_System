# notifications/models.py

from django.db import models
from django.conf import settings


# ============================================================================
# NOTIFICATION EVENT TYPES
# ============================================================================

class NotificationEvent(models.TextChoices):
    # ── Booking events ────────────────────────────────────────────────────────
    BOOKING_CREATED       = "booking_created",       "New Booking Created"
    BOOKING_CONFIRMED     = "booking_confirmed",     "Booking Confirmed"
    BOOKING_CANCELLED     = "booking_cancelled",     "Booking Cancelled"
    BOOKING_MODIFIED      = "booking_modified",      "Booking Modified"

    # ── Payment events ────────────────────────────────────────────────────────
    DEPOSIT_RECEIVED      = "deposit_received",      "Deposit Received"
    FULL_PAYMENT_RECEIVED = "full_payment_received", "Full Payment Received"
    PAYMENT_FAILED        = "payment_failed",        "Payment Failed"
    BALANCE_COLLECTED     = "balance_collected",     "Balance Collected"

    # ── Check-in / Check-out ──────────────────────────────────────────────────
    GUEST_CHECKED_IN      = "guest_checked_in",      "Guest Checked In"
    GUEST_CHECKED_OUT     = "guest_checked_out",     "Guest Checked Out"
    CHECKIN_REMINDER      = "checkin_reminder",      "Check-in Reminder"

    # ── Housekeeping ──────────────────────────────────────────────────────────
    CLEANING_TASK_ASSIGNED = "cleaning_task_assigned", "Cleaning Task Assigned"
    CLEANING_TASK_OVERDUE  = "cleaning_task_overdue",  "Cleaning Task Overdue"
    ROOM_CLEANED           = "room_cleaned",            "Room Cleaned"

    # ── Maintenance ───────────────────────────────────────────────────────────
    MAINTENANCE_ASSIGNED   = "maintenance_assigned",   "Maintenance Task Assigned"
    MAINTENANCE_OVERDUE    = "maintenance_overdue",    "Maintenance Task Overdue"
    MAINTENANCE_COMPLETED  = "maintenance_completed",  "Maintenance Completed"

    # ── Incidents / Security ──────────────────────────────────────────────────
    INCIDENT_REPORTED      = "incident_reported",      "Incident Reported"
    EMERGENCY_ALERT        = "emergency_alert",        "Emergency Alert"

    # ── System ────────────────────────────────────────────────────────────────
    SYSTEM_ALERT           = "system_alert",           "System Alert"


# ============================================================================
# RECIPIENT TYPE
# ============================================================================

class NotificationRecipientType(models.TextChoices):
    GUEST       = "guest",       "Guest"
    ADMIN       = "admin",       "Admin"
    MANAGER     = "manager",     "Manager"
    FRONT_DESK  = "front_desk",  "Front Desk"
    HOUSEKEEPING = "housekeeping", "Housekeeping"
    MAINTENANCE = "maintenance", "Maintenance"
    SECURITY    = "security",    "Security"
    STAFF       = "staff",       "Staff (Generic)"


# ============================================================================
# CHANNEL
# ============================================================================

class NotificationChannel(models.TextChoices):
    DASHBOARD = "dashboard", "Dashboard"
    EMAIL     = "email",     "Email"
    BOTH      = "both",      "Both"


# ============================================================================
# STATUS
# ============================================================================

class NotificationStatus(models.TextChoices):
    UNREAD = "unread", "Unread"
    READ   = "read",   "Read"


# ============================================================================
# PRIORITY
# ============================================================================

class NotificationPriority(models.TextChoices):
    LOW    = "low",    "Low"
    MEDIUM = "medium", "Medium"
    HIGH   = "high",   "High"
    URGENT = "urgent", "Urgent"


# ============================================================================
# NOTIFICATION MODEL
# ============================================================================

class Notification(models.Model):
    """
    Stores all in-app notifications for guests and staff.

    Role-based delivery:
      - NotificationService creates one Notification per recipient user.
      - recipient_type records which role/type the notification targets
        (used for frontend routing and filtering).
      - priority drives badge colour and optional email escalation.
    """

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )

    booking = models.ForeignKey(
        "bookings.Booking",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="notifications",
    )

    event = models.CharField(
        max_length=40,
        choices=NotificationEvent.choices,
    )

    recipient_type = models.CharField(
        max_length=15,
        choices=NotificationRecipientType.choices,
        default=NotificationRecipientType.GUEST,
    )

    channel = models.CharField(
        max_length=10,
        choices=NotificationChannel.choices,
        default=NotificationChannel.DASHBOARD,
    )

    priority = models.CharField(
        max_length=10,
        choices=NotificationPriority.choices,
        default=NotificationPriority.MEDIUM,
    )

    title       = models.CharField(max_length=200)
    description = models.TextField()

    status = models.CharField(
        max_length=10,
        choices=NotificationStatus.choices,
        default=NotificationStatus.UNREAD,
        db_index=True,
    )

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    read_at    = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "notifications"
        ordering = ["-created_at"]
        indexes  = [
            models.Index(fields=["recipient", "status"]),
            models.Index(fields=["recipient", "-created_at"]),
            models.Index(fields=["event"]),
            models.Index(fields=["priority"]),
        ]

    def __str__(self):
        return f"[{self.get_event_display()}] → {self.recipient.email} ({self.status})"

    @property
    def is_unread(self):
        return self.status == NotificationStatus.UNREAD