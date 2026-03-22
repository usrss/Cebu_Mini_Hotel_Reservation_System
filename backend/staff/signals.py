"""
staff/signals.py

Django signals for automatic staff-module side-effects.

Signals handled:
  1. post_save on Booking  — auto-create CleaningTask on CHECKED_OUT,
                             set room to CLEANING, set cleaning window.
                             Auto-assigns to housekeeping staff via round-robin.
                             Fires in-app notification to assigned staff.
  2. post_save on Booking  — log check-in/check-out actions to StaffActivityLog.
  3. post_save on Booking  — update room status on CHECKED_IN.
  4. post_save on Room     — log room status changes.

Connect in staff/apps.py → StaffConfig.ready().
"""

import logging
from datetime import timedelta

from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

logger = logging.getLogger(__name__)

# Cleaning window — room is expected to be cleaned within 2 hours of checkout
CLEANING_WINDOW_HOURS = 2


# ─── Round-robin auto-assignment ──────────────────────────────────────────────

def _get_next_housekeeping_staff():
    """
    Selects the next available housekeeping staff member using round-robin.

    Strategy:
      1. Get all active housekeeping staff profiles.
      2. Find who has the fewest active (dirty/cleaning) tasks currently assigned.
      3. Among those tied on task count, pick the one who was assigned least
         recently (oldest last assigned task), so work is spread evenly over time.
      4. If no housekeeping staff exist, return None (task stays unassigned).

    This is a simple least-loaded round-robin — good enough for a small hotel.
    It never assigns to offline/inactive staff.
    """
    from .models import StaffProfile, StaffRole, CleaningTask, CleaningStatus

    # All active housekeeping staff
    hk_staff = list(
        StaffProfile.objects.filter(
            role=StaffRole.HOUSEKEEPING,
            is_active=True,
        ).select_related("user")
    )

    if not hk_staff:
        logger.warning(
            "round-robin: no active housekeeping staff found — task will be unassigned."
        )
        return None

    # Count active tasks per staff member
    # active = dirty or cleaning (not yet done)
    active_tasks = (
        CleaningTask.objects
        .filter(
            assigned_to__in=hk_staff,
            status__in=[CleaningStatus.DIRTY, CleaningStatus.CLEANING],
        )
        .values("assigned_to_id")
    )
    task_counts = {}
    for row in active_tasks:
        pk = row["assigned_to_id"]
        task_counts[pk] = task_counts.get(pk, 0) + 1

    # Build (task_count, last_assigned_at, staff) tuples for sorting
    # last_assigned_at: most recent cleaning task assigned to this staff member
    # Use epoch 0 as default so staff with no history sort before those with history
    from django.utils import timezone as tz
    from datetime import datetime
    epoch = datetime(2000, 1, 1, tzinfo=tz.utc)

    last_assigned = {}
    latest_tasks = (
        CleaningTask.objects
        .filter(assigned_to__in=hk_staff)
        .order_by("-created_at")
        .values("assigned_to_id", "created_at")
    )
    seen = set()
    for row in latest_tasks:
        pk = row["assigned_to_id"]
        if pk not in seen:
            last_assigned[pk] = row["created_at"]
            seen.add(pk)

    ranked = sorted(
        hk_staff,
        key=lambda s: (
            task_counts.get(s.pk, 0),          # fewer active tasks = higher priority
            last_assigned.get(s.pk, epoch),    # assigned less recently = higher priority
        ),
    )

    chosen = ranked[0]
    logger.info(
        "round-robin: assigned to %s (active tasks: %d)",
        chosen.user.email,
        task_counts.get(chosen.pk, 0),
    )
    return chosen


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

    # ── Checked In → mark room OCCUPIED ──────────────────────────────────────
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

    # ── Checked Out → set CLEANING status, create CleaningTask ───────────────
    elif new_status == BookingStatus.CHECKED_OUT:

        now          = timezone.now()
        cleaning_end = now + timedelta(hours=CLEANING_WINDOW_HOURS)

        # Step 1: Update room status to CLEANING immediately
        try:
            Room.objects.filter(pk=instance.room_id).update(
                status=RoomStatus.CLEANING
            )
        except Exception as exc:
            logger.error("Signal: failed to set room to CLEANING — %s", exc)

        # Step 2: Create CleaningTask only if no pending/in-progress task exists
        exists = CleaningTask.objects.filter(
            room_id    = instance.room_id,
            status__in = [CleaningStatus.DIRTY, CleaningStatus.CLEANING],
        ).exists()

        if not exists:
            # ── Round-robin auto-assignment ───────────────────────────────────
            assignee = _get_next_housekeeping_staff()

            try:
                task = CleaningTask.objects.create(
                    room_id             = instance.room_id,
                    booking             = instance,
                    assigned_to         = assignee,        # None if no hk staff
                    status              = CleaningStatus.DIRTY,
                    priority            = 2,
                    cleaning_started_at = now,
                    cleaning_end_at     = cleaning_end,
                    notes               = (
                        f"Auto-created on checkout of booking "
                        f"{instance.reference_number} by {instance.full_name}. "
                        f"Cleaning window: {now.strftime('%H:%M')} — "
                        f"{cleaning_end.strftime('%H:%M')}."
                        + (
                            f" Auto-assigned to {assignee.user.get_full_name() or assignee.user.email}."
                            if assignee else
                            " No housekeeping staff available — task is unassigned."
                        )
                    ),
                )
                logger.info(
                    "CleaningTask created for room %s — window ends at %s — assigned to %s",
                    instance.room_id,
                    cleaning_end,
                    assignee.user.email if assignee else "nobody",
                )

                # ── Fire in-app notification to assigned staff ─────────────────
                if assignee:
                    try:
                        from notifications.service import NotificationService
                        NotificationService.notify_cleaning_assigned(
                            task=task,
                            assigned_by=None,  # system-assigned, not a specific user
                        )
                    except Exception as exc:
                        logger.warning(
                            "notify_cleaning_assigned failed for task pk=%s: %s",
                            task.pk, exc,
                        )

            except Exception as exc:
                logger.error("Signal: failed to create CleaningTask — %s", exc)

        else:
            # Task already exists — update the cleaning window only.
            # Do NOT reassign — respect any existing assignment.
            try:
                CleaningTask.objects.filter(
                    room_id    = instance.room_id,
                    status__in = [CleaningStatus.DIRTY, CleaningStatus.CLEANING],
                ).update(
                    cleaning_started_at = now,
                    cleaning_end_at     = cleaning_end,
                )
                logger.info(
                    "Existing CleaningTask cleaning window updated for room %s",
                    instance.room_id,
                )
            except Exception as exc:
                logger.error("Signal: failed to update cleaning window — %s", exc)

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
                        f"(Booking {instance.reference_number}). "
                        f"Room set to CLEANING. "
                        f"Cleaning window: {now.strftime('%Y-%m-%d %H:%M')} — "
                        f"{cleaning_end.strftime('%H:%M')}."
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
    post_save.connect(
        _handle_booking_post_save,
        sender=Booking,
        dispatch_uid="staff_booking_post_save",
    )
    logger.info("Staff signals connected.")