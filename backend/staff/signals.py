"""
staff/signals.py

Django signals for automatic staff-module side-effects.

Signals handled:
  1. post_save on Booking  — auto-create CleaningTask on CHECKED_OUT.
  2. post_save on Booking  — log check-in/check-out actions to StaffActivityLog.
  3. post_save on Booking  — update room status on CHECKED_IN.
  4. post_save on Room     — log room status changes.

Connect in staff/apps.py → StaffConfig.ready().
"""

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)


# ─── Booking post_save ────────────────────────────────────────────────────────

def _handle_booking_post_save(sender, instance, created, **kwargs):
    """
    Triggered every time a Booking is saved.
    Uses BookingStatusHistory to detect transitions rather than comparing
    instance fields (which reflect the new state only).
    """
    from bookings.models import Booking, BookingStatus, BookingStatusHistory
    from rooms.models import Room, RoomStatus
    from .models import CleaningTask, CleaningStatus, StaffActivityLog

    if created:
        return  # Only react to updates

    # Fetch the latest status history entry to determine what transition happened
    latest_hist = (
        BookingStatusHistory.objects
        .filter(booking=instance)
        .order_by("-changed_at")
        .first()
    )
    if not latest_hist:
        return

    new_status = latest_hist.new_status

    # ── Checked In → mark room Occupied ───────────────────────────────────────
    if new_status == BookingStatus.CHECKED_IN:
        try:
            Room.objects.filter(pk=instance.room_id).update(status=RoomStatus.OCCUPIED)
        except Exception as exc:
            logger.error("Signal: failed to mark room occupied — %s", exc)

        # Log the check-in action
        changed_by = latest_hist.changed_by
        if changed_by:
            profile = getattr(changed_by, "staff_profile", None)
            if profile:
                StaffActivityLog.objects.create(
                    staff       = profile,
                    action_type = "check_in_guest",
                    description = (
                        f"Guest '{instance.full_name}' checked in to "
                        f"Room {instance.room.room_number} "
                        f"(Booking {instance.reference_number})."
                    ),
                    booking_id  = instance.pk,
                    room_id     = instance.room_id,
                )

    # ── Checked Out → create CleaningTask, log check-out ─────────────────────
    elif new_status == BookingStatus.CHECKED_OUT:
        # Only create if no pending/in-progress task exists for this room
        exists = CleaningTask.objects.filter(
            room_id=instance.room_id,
            status__in=[CleaningStatus.DIRTY, CleaningStatus.CLEANING],
        ).exists()

        if not exists:
            try:
                CleaningTask.objects.create(
                    room_id    = instance.room_id,
                    booking    = instance,
                    status     = CleaningStatus.DIRTY,
                    priority   = 2,
                    notes      = (
                        f"Auto-created on checkout of booking "
                        f"{instance.reference_number} by {instance.full_name}."
                    ),
                )
                # NOTE: We do NOT update Room.status here intentionally.
                # RoomStatus has no CLEANING value (choices: AVAILABLE, OCCUPIED,
                # MAINTENANCE, RESERVED). Room status will be updated by
                # CleaningTask.transition_to() when housekeeping staff starts
                # (→ RESERVED) and completes (→ AVAILABLE) the task.
            except Exception as exc:
                logger.error("Signal: failed to create CleaningTask — %s", exc)

        # Log check-out
        changed_by = latest_hist.changed_by
        if changed_by:
            profile = getattr(changed_by, "staff_profile", None)
            if profile:
                StaffActivityLog.objects.create(
                    staff       = profile,
                    action_type = "check_out_guest",
                    description = (
                        f"Guest '{instance.full_name}' checked out from "
                        f"Room {instance.room.room_number} "
                        f"(Booking {instance.reference_number})."
                    ),
                    booking_id  = instance.pk,
                    room_id     = instance.room_id,
                )


def connect_signals():
    """
    Called from StaffConfig.ready().
    Wraps the signal connection so it is only performed once.
    """
    from bookings.models import Booking
    post_save.connect(_handle_booking_post_save, sender=Booking, dispatch_uid="staff_booking_post_save")
    logger.info("Staff signals connected.")