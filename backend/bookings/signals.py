from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Booking, BookingStatus


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
            from rooms.models import RoomTemporaryLock # noqa
            RoomTemporaryLock.objects.filter(
                room=instance.room,
                check_in=instance.check_in,
                check_out=instance.check_out,
                released=False,
            ).update(released=True)
        except Exception:
            pass  # Don't block the save if rooms app is unavailable


@receiver(post_save, sender=Booking)
def send_booking_confirmation_notification(sender, instance, created, **kwargs):
    """
    Fires a confirmation notification (email/SMS) when a booking transitions
    to CONFIRMED. At this point reference_number, checkin_pin, and QR data
    are all guaranteed to be present on the instance.

    Wire up your email/SMS service here (e.g. Celery task, SendGrid, Twilio).
    """
    if created:
        return

    if instance.status == BookingStatus.CONFIRMED and instance.has_credentials:
        try:
            # Example: send_confirmation_email.delay(instance.pk)
            # Replace with your actual notification dispatch below.
            import logging
            logging.getLogger(__name__).info(
                "Booking %s confirmed — notification dispatch triggered for %s.",
                instance.reference_number, instance.email,
            )
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning(
                "Failed to dispatch confirmation notification for booking %s: %s",
                instance.reference_number, exc,
            )