"""
notifications/service.py

Role-based notification service.
All notification creation goes through this file — never create
Notification objects directly in views or signals.

Role delivery rules (per spec):
  ADMIN        → system alerts, payment failures, booking conflicts, staff account changes
  MANAGER      → booking activity, complaints, task completions, occupancy alerts
  FRONT_DESK   → new bookings, updates, check-in/out, payment confirmations
  HOUSEKEEPING → cleaning assignments, overdue alerts, room status
  MAINTENANCE  → maintenance assignments, repair requests, overdue alerts
  SECURITY     → incidents, emergencies, suspicious activity
  GUEST        → their own booking confirmations, cancellations, reminders
"""

import logging
from django.contrib.auth import get_user_model

from .models import (
    Notification,
    NotificationEvent,
    NotificationChannel,
    NotificationRecipientType,
    NotificationPriority,
)

logger = logging.getLogger(__name__)
User = get_user_model()


# ── Role → staff profile role string mapping ──────────────────────────────────
ROLE_ADMIN        = "admin"
ROLE_MANAGER      = "manager"
ROLE_FRONT_DESK   = "front_desk"
ROLE_HOUSEKEEPING = "housekeeping"
ROLE_MAINTENANCE  = "maintenance"
ROLE_SECURITY     = "security"


def _get_staff_by_roles(roles: list) -> list:
    """
    Return active User objects whose staff_profile.effective_role is in roles.
    """
    users = []
    try:
        from staff.models import StaffProfile
        profiles = StaffProfile.objects.filter(
            is_active=True,
            role__in=roles,
        ).select_related("user")
        users = [p.user for p in profiles if p.user.is_active]
    except Exception as exc:
        logger.warning("_get_staff_by_roles failed: %s", exc)
    return users


def _create(recipient, event, title, description,
            recipient_type, booking=None,
            priority=NotificationPriority.MEDIUM,
            channel=NotificationChannel.DASHBOARD):
    """Internal helper — creates one Notification record safely."""
    try:
        Notification.objects.create(
            recipient      = recipient,
            booking        = booking,
            event          = event,
            recipient_type = recipient_type,
            channel        = channel,
            priority       = priority,
            title          = title,
            description    = description,
        )
    except Exception as exc:
        logger.warning(
            "Failed to create notification [%s] for %s: %s",
            event, recipient.email, exc,
        )


def _bulk_notify(users, event, title, description,
                 recipient_type, booking=None,
                 priority=NotificationPriority.MEDIUM):
    """Create one notification per user in the list."""
    for user in users:
        _create(
            recipient      = user,
            event          = event,
            title          = title,
            description    = description,
            recipient_type = recipient_type,
            booking        = booking,
            priority       = priority,
        )


# ============================================================================
# NOTIFICATION SERVICE
# ============================================================================

class NotificationService:

    # ── Booking events ────────────────────────────────────────────────────────

    @staticmethod
    def notify_booking_created(booking):
        """
        New booking created (PENDING_PAYMENT).
        → Front Desk: needs to know about new reservations
        → Manager: booking activity awareness
        NOT sent to Admin (too noisy) or Guest (not confirmed yet).
        """
        room    = booking.room.room_number
        guest   = booking.full_name
        checkin = booking.check_in

        recipients = _get_staff_by_roles([ROLE_FRONT_DESK, ROLE_MANAGER])
        _bulk_notify(
            users          = recipients,
            event          = NotificationEvent.BOOKING_CREATED,
            title          = f"New Booking — Room {room}",
            description    = (
                f"Guest {guest} created a new booking for Room {room}. "
                f"Check-in: {checkin}. Awaiting payment."
            ),
            recipient_type = NotificationRecipientType.FRONT_DESK,
            booking        = booking,
            priority       = NotificationPriority.MEDIUM,
        )

    @staticmethod
    def notify_booking_confirmed(booking):
        """
        Booking confirmed after payment.
        → Guest: their booking is confirmed
        → Front Desk: prepare for arrival
        → Manager: awareness
        NOT sent to Admin.
        """
        room    = booking.room.room_number
        guest   = booking.full_name
        checkin = booking.check_in
        ref     = booking.reference_number

        # Guest notification
        if booking.user:
            _create(
                recipient      = booking.user,
                event          = NotificationEvent.BOOKING_CONFIRMED,
                title          = "Booking Confirmed!",
                description    = (
                    f"Your booking {ref} for Room {room} is confirmed. "
                    f"Check-in: {checkin}. Your PIN and QR code have been sent to your email."
                ),
                recipient_type = NotificationRecipientType.GUEST,
                booking        = booking,
                priority       = NotificationPriority.HIGH,
            )

        # Staff notifications
        staff = _get_staff_by_roles([ROLE_FRONT_DESK, ROLE_MANAGER])
        _bulk_notify(
            users          = staff,
            event          = NotificationEvent.BOOKING_CONFIRMED,
            title          = f"Booking Confirmed — Room {room}",
            description    = (
                f"Booking {ref} by {guest} for Room {room} has been confirmed. "
                f"Check-in: {checkin}."
            ),
            recipient_type = NotificationRecipientType.FRONT_DESK,
            booking        = booking,
            priority       = NotificationPriority.MEDIUM,
        )

    @staticmethod
    def notify_booking_cancelled(booking):
        """
        Booking cancelled.
        → Guest: confirmation of cancellation + refund info
        → Front Desk: update availability awareness
        → Manager: awareness
        NOT sent to Admin.
        """
        room   = booking.room.room_number
        guest  = booking.full_name
        ref    = booking.reference_number or f"#{booking.pk}"
        refund = booking.refund_amount

        # Guest
        if booking.user:
            refund_text = (
                f" A refund of PHP {refund:,.2f} has been initiated."
                if refund > 0 else " No refund applies."
            )
            _create(
                recipient      = booking.user,
                event          = NotificationEvent.BOOKING_CANCELLED,
                title          = "Booking Cancelled",
                description    = (
                    f"Your booking {ref} for Room {room} has been cancelled.{refund_text}"
                ),
                recipient_type = NotificationRecipientType.GUEST,
                booking        = booking,
                priority       = NotificationPriority.HIGH,
            )

        # Staff
        staff = _get_staff_by_roles([ROLE_FRONT_DESK, ROLE_MANAGER])
        _bulk_notify(
            users          = staff,
            event          = NotificationEvent.BOOKING_CANCELLED,
            title          = f"Booking Cancelled — Room {room}",
            description    = (
                f"Booking {ref} by {guest} for Room {room} has been cancelled. "
                f"Room is now available."
            ),
            recipient_type = NotificationRecipientType.FRONT_DESK,
            booking        = booking,
            priority       = NotificationPriority.MEDIUM,
        )

    @staticmethod
    def notify_booking_modified(booking, modification):
        """
        Booking dates modified (extend or reschedule).
        → Guest: confirmation
        → Front Desk: awareness
        """
        room = booking.room.room_number
        ref  = booking.reference_number

        if booking.user:
            _create(
                recipient      = booking.user,
                event          = NotificationEvent.BOOKING_MODIFIED,
                title          = "Booking Updated",
                description    = (
                    f"Your booking {ref} for Room {room} has been updated. "
                    f"New dates: {modification.new_check_in} → {modification.new_check_out}."
                ),
                recipient_type = NotificationRecipientType.GUEST,
                booking        = booking,
                priority       = NotificationPriority.MEDIUM,
            )

        staff = _get_staff_by_roles([ROLE_FRONT_DESK])
        _bulk_notify(
            users          = staff,
            event          = NotificationEvent.BOOKING_MODIFIED,
            title          = f"Booking Modified — Room {room}",
            description    = (
                f"Booking {ref} has been modified. "
                f"New dates: {modification.new_check_in} → {modification.new_check_out}."
            ),
            recipient_type = NotificationRecipientType.FRONT_DESK,
            booking        = booking,
            priority       = NotificationPriority.MEDIUM,
        )

    # ── Payment events ────────────────────────────────────────────────────────

    @staticmethod
    def notify_deposit_received(booking, amount):
        """
        30% deposit received.
        → Front Desk: payment activity
        → Manager: revenue awareness
        NOT sent to Admin.
        """
        room  = booking.room.room_number
        guest = booking.full_name
        ref   = booking.reference_number or f"#{booking.pk}"

        staff = _get_staff_by_roles([ROLE_FRONT_DESK, ROLE_MANAGER])
        _bulk_notify(
            users          = staff,
            event          = NotificationEvent.DEPOSIT_RECEIVED,
            title          = f"Deposit Received — Room {room}",
            description    = (
                f"Deposit of PHP {amount:,.2f} received for booking {ref} "
                f"from {guest}. Balance due at check-in."
            ),
            recipient_type = NotificationRecipientType.FRONT_DESK,
            booking        = booking,
            priority       = NotificationPriority.MEDIUM,
        )

    @staticmethod
    def notify_full_payment_received(booking, amount):
        """
        Full payment received.
        → Front Desk: payment confirmed
        → Manager: revenue awareness
        """
        room  = booking.room.room_number
        guest = booking.full_name
        ref   = booking.reference_number or f"#{booking.pk}"

        staff = _get_staff_by_roles([ROLE_FRONT_DESK, ROLE_MANAGER])
        _bulk_notify(
            users          = staff,
            event          = NotificationEvent.FULL_PAYMENT_RECEIVED,
            title          = f"Full Payment Received — Room {room}",
            description    = (
                f"Full payment of PHP {amount:,.2f} received for booking {ref} "
                f"from {guest}."
            ),
            recipient_type = NotificationRecipientType.FRONT_DESK,
            booking        = booking,
            priority       = NotificationPriority.MEDIUM,
        )

    @staticmethod
    def notify_payment_failed(booking):
        """
        Payment failed.
        → Admin: needs to know about payment issues
        → Front Desk: may need to contact guest
        """
        room  = booking.room.room_number
        guest = booking.full_name

        staff = _get_staff_by_roles([ROLE_ADMIN, ROLE_FRONT_DESK])
        _bulk_notify(
            users          = staff,
            event          = NotificationEvent.PAYMENT_FAILED,
            title          = f"Payment Failed — Room {room}",
            description    = (
                f"Payment failed for booking by {guest} for Room {room}. "
                f"Follow up may be required."
            ),
            recipient_type = NotificationRecipientType.ADMIN,
            booking        = booking,
            priority       = NotificationPriority.HIGH,
        )

    @staticmethod
    def notify_balance_collected(booking, amount):
        """
        Remaining balance collected at front desk during check-in.
        → Manager: revenue awareness
        """
        room = booking.room.room_number
        ref  = booking.reference_number

        staff = _get_staff_by_roles([ROLE_MANAGER])
        _bulk_notify(
            users          = staff,
            event          = NotificationEvent.BALANCE_COLLECTED,
            title          = f"Balance Collected — Room {room}",
            description    = (
                f"Balance of PHP {amount:,.2f} collected at front desk "
                f"for booking {ref}."
            ),
            recipient_type = NotificationRecipientType.MANAGER,
            booking        = booking,
            priority       = NotificationPriority.LOW,
        )

    # ── Check-in / Check-out ──────────────────────────────────────────────────

    @staticmethod
    def notify_guest_checked_in(booking):
        """
        Guest checked in.
        → Housekeeping: no cleaning needed yet, but aware of occupied room
        → Manager: occupancy awareness
        """
        room  = booking.room.room_number
        guest = booking.full_name

        staff = _get_staff_by_roles([ROLE_MANAGER])
        _bulk_notify(
            users          = staff,
            event          = NotificationEvent.GUEST_CHECKED_IN,
            title          = f"Guest Checked In — Room {room}",
            description    = f"{guest} has checked in to Room {room}.",
            recipient_type = NotificationRecipientType.MANAGER,
            booking        = booking,
            priority       = NotificationPriority.LOW,
        )

    @staticmethod
    def notify_guest_checked_out(booking):
        """
        Guest checked out.
        → Housekeeping: room needs cleaning (primary trigger)
        → Front Desk: room is now free
        → Manager: awareness
        """
        room  = booking.room.room_number
        guest = booking.full_name

        # Housekeeping — high priority, they need to act
        hk_staff = _get_staff_by_roles([ROLE_HOUSEKEEPING])
        _bulk_notify(
            users          = hk_staff,
            event          = NotificationEvent.GUEST_CHECKED_OUT,
            title          = f"Room {room} Needs Cleaning",
            description    = (
                f"Guest {guest} has checked out of Room {room}. "
                f"Please clean and prepare the room."
            ),
            recipient_type = NotificationRecipientType.HOUSEKEEPING,
            booking        = booking,
            priority       = NotificationPriority.HIGH,
        )

        # Front Desk + Manager
        staff = _get_staff_by_roles([ROLE_FRONT_DESK, ROLE_MANAGER])
        _bulk_notify(
            users          = staff,
            event          = NotificationEvent.GUEST_CHECKED_OUT,
            title          = f"Guest Checked Out — Room {room}",
            description    = f"{guest} has checked out of Room {room}.",
            recipient_type = NotificationRecipientType.FRONT_DESK,
            booking        = booking,
            priority       = NotificationPriority.LOW,
        )

    # ── Housekeeping ──────────────────────────────────────────────────────────

    @staticmethod
    def notify_cleaning_assigned(task, assigned_by=None):
        """
        Cleaning task assigned to a specific housekeeping staff member.
        → Assigned housekeeping staff only.
        """
        if not task.assigned_to:
            return

        staff_user  = task.assigned_to.user
        room_number = task.room.room_number if task.room_id else "—"

        assigner_name = "Management"
        if assigned_by:
            assigner_name = assigned_by.get_full_name() or assigned_by.email

        window = ""
        if task.cleaning_started_at and task.cleaning_end_at:
            window = (
                f" Window: "
                f"{task.cleaning_started_at.strftime('%H:%M')}–"
                f"{task.cleaning_end_at.strftime('%H:%M')}."
            )

        _create(
            recipient      = staff_user,
            event          = NotificationEvent.CLEANING_TASK_ASSIGNED,
            title          = f"Cleaning Task — Room {room_number}",
            description    = (
                f"You have been assigned to clean Room {room_number}. "
                f"Assigned by {assigner_name}.{window}"
            ),
            recipient_type = NotificationRecipientType.HOUSEKEEPING,
            booking        = task.booking,
            priority       = NotificationPriority.HIGH,
        )

    @staticmethod
    def notify_cleaning_overdue(task):
        """
        Cleaning task exceeded the 2-hour window.
        → Assigned staff + Manager.
        """
        room_number = task.room.room_number if task.room_id else "—"

        # Notify the assigned staff member
        if task.assigned_to:
            _create(
                recipient      = task.assigned_to.user,
                event          = NotificationEvent.CLEANING_TASK_OVERDUE,
                title          = f"Overdue: Room {room_number} Cleaning",
                description    = (
                    f"Your cleaning task for Room {room_number} is overdue. "
                    f"Please complete it immediately."
                ),
                recipient_type = NotificationRecipientType.HOUSEKEEPING,
                booking        = task.booking,
                priority       = NotificationPriority.URGENT,
            )

        # Notify managers
        managers = _get_staff_by_roles([ROLE_MANAGER])
        _bulk_notify(
            users          = managers,
            event          = NotificationEvent.CLEANING_TASK_OVERDUE,
            title          = f"Overdue Cleaning — Room {room_number}",
            description    = (
                f"Cleaning task for Room {room_number} has exceeded the "
                f"2-hour window."
            ),
            recipient_type = NotificationRecipientType.MANAGER,
            booking        = task.booking,
            priority       = NotificationPriority.URGENT,
        )

    @staticmethod
    def notify_room_cleaned(task):
        """
        Room marked as clean.
        → Manager: room is ready
        → Front Desk: can assign room to new guest
        """
        room_number = task.room.room_number if task.room_id else "—"

        staff = _get_staff_by_roles([ROLE_MANAGER, ROLE_FRONT_DESK])
        _bulk_notify(
            users          = staff,
            event          = NotificationEvent.ROOM_CLEANED,
            title          = f"Room {room_number} Ready",
            description    = f"Room {room_number} has been cleaned and is ready for guests.",
            recipient_type = NotificationRecipientType.FRONT_DESK,
            booking        = task.booking,
            priority       = NotificationPriority.LOW,
        )

    # ── Maintenance ───────────────────────────────────────────────────────────

    @staticmethod
    def notify_maintenance_assigned(task, assigned_by=None):
        """
        Maintenance task assigned.
        → Assigned maintenance staff only.
        """
        if not task.assigned_to:
            return

        staff_user  = task.assigned_to.user
        room_number = task.room.room_number if task.room_id else "—"
        assigner    = assigned_by.get_full_name() if assigned_by else "Management"

        _create(
            recipient      = staff_user,
            event          = NotificationEvent.MAINTENANCE_ASSIGNED,
            title          = f"Maintenance Task — Room {room_number}",
            description    = (
                f"You have been assigned a maintenance task for Room {room_number}: "
                f"{task.title}. Assigned by {assigner}."
            ),
            recipient_type = NotificationRecipientType.MAINTENANCE,
            booking        = getattr(task, "booking", None),
            priority       = NotificationPriority.HIGH,
        )

    @staticmethod
    def notify_maintenance_completed(task):
        """
        Maintenance task completed.
        → Manager: awareness
        → Front Desk: room may be available again
        """
        room_number = task.room.room_number if task.room_id else "—"

        staff = _get_staff_by_roles([ROLE_MANAGER, ROLE_FRONT_DESK])
        _bulk_notify(
            users          = staff,
            event          = NotificationEvent.MAINTENANCE_COMPLETED,
            title          = f"Maintenance Done — Room {room_number}",
            description    = (
                f"Maintenance task '{task.title}' for Room {room_number} "
                f"has been completed."
            ),
            recipient_type = NotificationRecipientType.MANAGER,
            booking        = getattr(task, "booking", None),
            priority       = NotificationPriority.LOW,
        )

    # ── Incidents / Security ──────────────────────────────────────────────────

    @staticmethod
    def notify_incident_reported(incident):
        """
        Incident logged by security.
        → Admin: critical incidents
        → Manager: all incidents
        → Security: team awareness
        """
        severity = getattr(incident, "severity", "medium")
        loc      = getattr(incident, "location", "—")
        inc_type = getattr(incident, "incident_type", "incident")

        priority = (
            NotificationPriority.URGENT
            if severity in ("high", "critical")
            else NotificationPriority.HIGH
        )

        # Admin — urgent/high only
        if severity in ("high", "critical"):
            admins = _get_staff_by_roles([ROLE_ADMIN])
            _bulk_notify(
                users          = admins,
                event          = NotificationEvent.INCIDENT_REPORTED,
                title          = f"Critical Incident — {loc}",
                description    = (
                    f"A {inc_type} incident has been reported at {loc}. "
                    f"Severity: {severity}. Immediate attention required."
                ),
                recipient_type = NotificationRecipientType.ADMIN,
                priority       = NotificationPriority.URGENT,
            )

        # Manager — all incidents
        managers = _get_staff_by_roles([ROLE_MANAGER])
        _bulk_notify(
            users          = managers,
            event          = NotificationEvent.INCIDENT_REPORTED,
            title          = f"Incident Reported — {loc}",
            description    = (
                f"A {inc_type} incident has been reported at {loc}. "
                f"Severity: {severity}."
            ),
            recipient_type = NotificationRecipientType.MANAGER,
            priority       = priority,
        )

        # Security team
        security = _get_staff_by_roles([ROLE_SECURITY])
        _bulk_notify(
            users          = security,
            event          = NotificationEvent.INCIDENT_REPORTED,
            title          = f"Incident — {loc}",
            description    = (
                f"New {inc_type} incident reported at {loc}. "
                f"Severity: {severity}. Please respond."
            ),
            recipient_type = NotificationRecipientType.SECURITY,
            priority       = priority,
        )

    @staticmethod
    def notify_emergency(description, reported_by=None):
        """
        Emergency alert.
        → Security + Admin — urgent priority.
        """
        reporter = reported_by.get_full_name() if reported_by else "System"

        staff = _get_staff_by_roles([ROLE_SECURITY, ROLE_ADMIN])
        _bulk_notify(
            users          = staff,
            event          = NotificationEvent.EMERGENCY_ALERT,
            title          = "⚠ Emergency Alert",
            description    = f"Emergency reported by {reporter}: {description}",
            recipient_type = NotificationRecipientType.SECURITY,
            priority       = NotificationPriority.URGENT,
        )

    # ── System ────────────────────────────────────────────────────────────────

    @staticmethod
    def notify_system_alert(message, priority=NotificationPriority.HIGH):
        """
        System-level alert (errors, failures, conflicts).
        → Admin only.
        """
        admins = _get_staff_by_roles([ROLE_ADMIN])
        _bulk_notify(
            users          = admins,
            event          = NotificationEvent.SYSTEM_ALERT,
            title          = "System Alert",
            description    = message,
            recipient_type = NotificationRecipientType.ADMIN,
            priority       = priority,
        )

    @staticmethod
    def notify_maintenance_request_created(request_obj):
        """
        A new MaintenanceRequest has been submitted by Front Desk or Housekeeping.
        → Admin + Manager: they need to review and act.

        Uses MAINTENANCE_ASSIGNED event as the closest existing event type.
        If a dedicated MAINTENANCE_REQUEST_CREATED event exists in NotificationEvent,
        replace accordingly.
        """
        reported_by = request_obj.reported_by
        reporter_name = (
            reported_by.get_full_name() or reported_by.email
            if reported_by else "Staff"
        )
        room_text = (
            f" — Room {request_obj.room.room_number}"
            if request_obj.room_id else ""
        )

        staff = _get_staff_by_roles([ROLE_ADMIN, ROLE_MANAGER])
        _bulk_notify(
            users=staff,
            event=NotificationEvent.MAINTENANCE_ASSIGNED,  # reuse closest event
            title=f"New Maintenance Request{room_text}",
            description=(
                f"{reporter_name} submitted a maintenance request: "
                f"'{request_obj.title}'.{room_text} Please review and convert to a task."
            ),
            recipient_type=NotificationRecipientType.MANAGER,
            priority=NotificationPriority.MEDIUM,
        )