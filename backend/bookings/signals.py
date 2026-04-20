from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Booking, BookingStatus

import logging
logger = logging.getLogger(__name__)


@receiver(post_save, sender=Booking)
def release_room_lock_on_confirm_or_cancel(sender, instance, created, **kwargs):
    """
    When a booking is CONFIRMED or CANCELLED/EXPIRED, release any temporary
    room lock held for the same room/dates (from the rooms module).
    """
    if created:
        return

    release_statuses = [
        BookingStatus.CONFIRMED,
        BookingStatus.CANCELLED,
        BookingStatus.EXPIRED,
    ]

    if instance.status in release_statuses:
        try:
            from rooms.models import RoomTemporaryLock
            RoomTemporaryLock.objects.filter(
                room=instance.room,
                check_in=instance.check_in,
                check_out=instance.check_out,
                released=False,
            ).update(released=True)
        except Exception:
            pass  # Don't block the save if rooms app is unavailable


@receiver(post_save, sender=Booking)
def send_booking_notification_on_status_change(sender, instance, created, **kwargs):
    """
    Fires role-based in-app notifications on every relevant booking status change.

    Created  → notify Front Desk + Manager (new pending booking)
    CONFIRMED → notify Guest + Front Desk + Manager
    CANCELLED → notify Guest + Front Desk + Manager
    CHECKED_IN  → notify Manager
    CHECKED_OUT → notify Housekeeping (high priority) + Front Desk + Manager
    """
    try:
        from notifications.service import NotificationService
        from bookings.models import Booking as B
        # Re-fetch with room relation to avoid AttributeError on room_number
        booking = B.objects.select_related("room").get(pk=instance.pk)
    except Exception as exc:
        logger.warning("Could not fetch booking for notification: %s", exc)
        return

    # ── New booking created (PENDING_PAYMENT) ─────────────────────────────
    if created:
        try:
            NotificationService.notify_booking_created(booking)
        except Exception as exc:
            logger.warning("notify_booking_created failed for booking %s: %s", instance.pk, exc)
        return  # nothing else to check on creation

    # ── Booking confirmed (payment received) ──────────────────────────────
    if instance.status == BookingStatus.CONFIRMED and instance.has_credentials:
        try:
            NotificationService.notify_booking_confirmed(booking)
        except Exception as exc:
            logger.warning("notify_booking_confirmed failed for booking %s: %s", instance.pk, exc)

    # ── Booking cancelled ─────────────────────────────────────────────────
    if instance.status == BookingStatus.CANCELLED:
        try:
            NotificationService.notify_booking_cancelled(booking)
        except Exception as exc:
            logger.warning("notify_booking_cancelled failed for booking %s: %s", instance.pk, exc)

    # ── Guest checked in ──────────────────────────────────────────────────
    if instance.status == BookingStatus.CHECKED_IN:
        try:
            NotificationService.notify_guest_checked_in(booking)
        except Exception as exc:
            logger.warning("notify_guest_checked_in failed for booking %s: %s", instance.pk, exc)

    # ── Guest checked out → trigger housekeeping ──────────────────────────
    if instance.status == BookingStatus.CHECKED_OUT:
        try:
            NotificationService.notify_guest_checked_out(booking)
        except Exception as exc:
            logger.warning("notify_guest_checked_out failed for booking %s: %s", instance.pk, exc)