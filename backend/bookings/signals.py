from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Booking, BookingStatus


@receiver(post_save, sender=Booking)
def release_room_lock_on_confirm_or_cancel(sender, instance, created, **kwargs):
    """
    When a booking is CONFIRMED or CANCELLED, release any temporary room lock
    held for the same room/dates (from the rooms module).
    """
    if created:
        return

    if instance.booking_status in [BookingStatus.CONFIRMED, BookingStatus.CANCELLED]:
        try:
            from rooms.models import RoomTemporaryLock
            RoomTemporaryLock.objects.filter(
                room=instance.room,
                check_in=instance.check_in_date,
                check_out=instance.check_out_date,
                released=False,
            ).update(released=True)
        except Exception:
            pass  # Don't block the save if rooms app unavailable