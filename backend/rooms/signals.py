from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from django.utils import timezone
from .models import Room, RoomTemporaryLock


@receiver(pre_save, sender=Room)
def track_status_change(sender, instance, **kwargs):
    """
    When a room is saved, release any expired locks automatically.
    Also cleans up stale locks when room status changes to maintenance.
    """
    if not instance.pk:
        return  # new room, nothing to do

    try:
        previous = Room.objects.get(pk=instance.pk)
    except Room.DoesNotExist:
        return

    # If room goes into maintenance, release all its active locks
    if instance.status == "maintenance" and previous.status != "maintenance":
        RoomTemporaryLock.objects.filter(
            room=instance,
            released=False,
        ).update(released=True)


def cleanup_expired_locks():
    """
    Utility to release all expired temporary locks.
    Can be called from a management command or Celery beat task.
    """
    expired = RoomTemporaryLock.objects.filter(
        released=False,
        expires_at__lt=timezone.now(),
    )
    count = expired.update(released=True)
    return count