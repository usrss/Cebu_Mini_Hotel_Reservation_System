"""
notifications/service.py
========================
Central service for creating and dispatching notifications.

Usage (from signals, views, or management commands):

    from notifications.service import NotificationService
    from notifications.models import NotificationEvent

    NotificationService.notify(
        event=NotificationEvent.BOOKING_CREATED,
        booking=booking_instance,
    )
"""

from django.db import models
from django.contrib.auth import get_user_model

from .models import (
    Notification,
    NotificationEvent,
    NotificationChannel,
    NotificationRecipientType,
    NotificationStatus,
)

User = get_user_model()


# ============================================================================
# NOTIFICATION TEMPLATE REGISTRY
# ============================================================================

NOTIFICATION_TEMPLATES = {
    NotificationEvent.BOOKING_CREATED: {
        "title_guest":       "Booking Received",
        "description_guest": (
            "Your booking for Room {room_number} has been received. "
            "Reference: {reference}. Please complete your deposit payment to confirm."
        ),
        "title_admin":       "New Booking Created",
        "description_admin": (
            "Guest {guest_name} created a new booking for Room {room_number}. "
            "Reference: {reference}. Check-in: {check_in}."
        ),
        "channel":    NotificationChannel.BOTH,
        "recipients": "both",
    },
    NotificationEvent.DEPOSIT_RECEIVED: {
        "title_guest":       "Deposit Payment Received",
        "description_guest": (
            "We have received your deposit payment for Room {room_number}. "
            "Reference: {reference}. Your booking is now being processed."
        ),
        "title_admin":       "Deposit Received",
        "description_admin": (
            "Deposit payment received for booking {reference} (Room {room_number}) "
            "from guest {guest_name}."
        ),
        "channel":    NotificationChannel.BOTH,
        "recipients": "both",
    },
    NotificationEvent.BOOKING_CONFIRMED: {
        "title_guest":       "Booking Confirmed! 🎉",
        "description_guest": (
            "Great news! Your booking for Room {room_number} is confirmed. "
            "Reference: {reference}. Check-in: {check_in}, Check-out: {check_out}."
        ),
        "title_admin":       "Booking Confirmed",
        "description_admin": (
            "Booking {reference} for Room {room_number} has been confirmed. "
            "Guest: {guest_name}. Check-in: {check_in}."
        ),
        "channel":    NotificationChannel.BOTH,
        "recipients": "both",
    },
    NotificationEvent.BOOKING_CANCELLED: {
        "title_guest":       "Booking Cancelled",
        "description_guest": (
            "Your booking for Room {room_number} (Reference: {reference}) "
            "has been cancelled. If you have any questions, please contact us."
        ),
        "title_admin":       "Booking Cancelled",
        "description_admin": (
            "Booking {reference} for Room {room_number} has been cancelled. "
            "Guest: {guest_name}."
        ),
        "channel":    NotificationChannel.BOTH,
        "recipients": "both",
    },
    NotificationEvent.CHECKIN_REMINDER: {
        "title_guest":       "Check-in Reminder",
        "description_guest": (
            "Reminder: Your check-in for Room {room_number} is tomorrow ({check_in}). "
            "Reference: {reference}. We look forward to welcoming you!"
        ),
        "title_admin":       "Upcoming Check-in",
        "description_admin": (
            "Reminder: Guest {guest_name} is checking into Room {room_number} "
            "tomorrow ({check_in}). Reference: {reference}."
        ),
        "channel":    NotificationChannel.BOTH,
        "recipients": "both",
    },
}


# ============================================================================
# NOTIFICATION SERVICE
# ============================================================================

class NotificationService:
    """
    Stateless service class.  All methods are class-level.
    Handles: recipient resolution, message rendering, DB persistence,
             and optional email dispatch.
    """

    @classmethod
    def notify(cls, event: str, booking=None, extra_context: dict = None):
        """
        Main entry point.  Creates Notification records for all appropriate
        recipients and dispatches emails if the channel requires it.

        Args:
            event:         One of NotificationEvent choices.
            booking:       bookings.Booking instance (may be None for system events).
            extra_context: Additional template variables to merge in.
        """
        template = NOTIFICATION_TEMPLATES.get(event)
        if not template:
            return []

        context = cls._build_context(booking, extra_context)
        notifications = []

        # ---- Guest notification (only if booking has a registered user) ----
        if template["recipients"] in ("guest", "both") and booking and booking.user:  # FIX 1: was booking.guest, added null guard
            guest_notif = cls._create_notification(
                recipient=booking.user,          # FIX 1: was booking.guest
                recipient_type=NotificationRecipientType.GUEST,
                event=event,
                booking=booking,
                title=template["title_guest"].format(**context),
                description=template["description_guest"].format(**context),
                channel=template["channel"],
            )
            notifications.append(guest_notif)

        # ---- Admin notifications ----
        if template["recipients"] in ("admin", "both"):
            for admin in cls._get_admin_users():
                admin_notif = cls._create_notification(
                    recipient=admin,
                    recipient_type=NotificationRecipientType.ADMIN,
                    event=event,
                    booking=booking,
                    title=template["title_admin"].format(**context),
                    description=template["description_admin"].format(**context),
                    channel=template["channel"],
                )
                notifications.append(admin_notif)

        # ---- Email dispatch ----
        for notif in notifications:
            if notif.channel in (NotificationChannel.EMAIL, NotificationChannel.BOTH):
                cls._send_email(notif)

        return notifications

    # ------------------------------------------------------------------

    @classmethod
    def _build_context(cls, booking, extra_context):
        ctx = {
            "room_number": "N/A",
            "reference":   "N/A",
            "check_in":    "N/A",
            "check_out":   "N/A",
            "guest_name":  "Guest",
            "guest_email": "",
        }
        if booking:
            ctx.update({
                "room_number": getattr(booking.room, "room_number", "N/A"),
                "reference":   getattr(booking, "reference_number", "N/A"),
                "check_in":    str(booking.check_in),
                "check_out":   str(booking.check_out),
                # FIX 2: was booking.guest.email — now null-safe for anonymous bookings
                "guest_name":  cls._get_guest_name(booking.user) if booking.user else (booking.full_name or "Guest"),
                "guest_email": booking.user.email if booking.user else (booking.email or ""),
            })
        if extra_context:
            ctx.update(extra_context)
        return ctx

    @staticmethod
    def _get_guest_name(user):
        full = f"{user.first_name} {user.last_name}".strip()
        return full or user.email

    @staticmethod
    def _get_admin_users():
        return User.objects.filter(
            is_active=True,
        ).filter(
            models.Q(is_staff=True) | models.Q(is_superuser=True)
        )

    @staticmethod
    def _create_notification(recipient, recipient_type, event, booking,
                              title, description, channel):
        return Notification.objects.create(
            recipient=recipient,
            booking=booking,
            event=event,
            recipient_type=recipient_type,
            channel=channel,
            title=title,
            description=description,
            status=NotificationStatus.UNREAD,
        )

    @staticmethod
    def _send_email(notification):
        """
        Dispatch email via Django's email backend.
        Silently skips on failure so it never breaks the booking flow.
        """
        try:
            from django.core.mail import send_mail
            from django.conf import settings as django_settings

            send_mail(
                subject=notification.title,
                message=notification.description,
                from_email=getattr(django_settings, "DEFAULT_FROM_EMAIL", "noreply@hotel.com"),
                recipient_list=[notification.recipient.email],
                fail_silently=True,
            )
        except Exception:
            pass