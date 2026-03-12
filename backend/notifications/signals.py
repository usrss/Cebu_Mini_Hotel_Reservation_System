"""
notifications/signals.py
========================
Django signals that listen to booking and payment events and
fire NotificationService automatically.

Key design decisions:
  - Uses `created` flag for BOOKING_CREATED so it only fires once.
  - For status transitions (CONFIRMED / CANCELLED) we compare against the
    previously saved value stored in instance.__original_status, which is
    injected by the pre_save signal below. This prevents duplicate
    notifications on every unrelated save.
  - DEPOSIT_RECEIVED fires when a Payment transitions to PAID and its
    payment_type is DEPOSIT. Uses the same pre_save/post_save diff pattern.
"""

from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from bookings.models import Booking, BookingStatus
from payments.models import Payment, PaymentStatus, PaymentType
from .models import NotificationEvent
from .service import NotificationService


# ============================================================================
# BOOKING SIGNALS
# ============================================================================

@receiver(pre_save, sender=Booking)
def cache_original_booking_status(sender, instance, **kwargs):
    """
    Captures the current DB status before save so post_save can detect
    real status transitions and avoid firing duplicate notifications.
    """
    if instance.pk:
        try:
            instance.__original_status = Booking.objects.values_list(
                "status", flat=True
            ).get(pk=instance.pk)
        except Booking.DoesNotExist:
            instance.__original_status = None
    else:
        instance.__original_status = None


@receiver(post_save, sender=Booking)
def on_booking_saved(sender, instance, created, **kwargs):
    """
    Fires after every Booking save.

    Rules:
      - New record (created=True)         → BOOKING_CREATED
      - Status changed to 'confirmed'     → BOOKING_CONFIRMED
      - Status changed to 'cancelled'     → BOOKING_CANCELLED
      - All other saves are ignored
    """
    new_status = instance.status
    old_status = getattr(instance, "__original_status", None)

    if created:
        NotificationService.notify(
            event=NotificationEvent.BOOKING_CREATED,
            booking=instance,
        )
        return

    # Only fire on a real status transition
    if new_status == old_status:
        return

    if new_status == BookingStatus.CONFIRMED:
        NotificationService.notify(
            event=NotificationEvent.BOOKING_CONFIRMED,
            booking=instance,
        )

    elif new_status == BookingStatus.CANCELLED:
        NotificationService.notify(
            event=NotificationEvent.BOOKING_CANCELLED,
            booking=instance,
        )


# ============================================================================
# PAYMENT SIGNALS
# ============================================================================

@receiver(pre_save, sender=Payment)
def cache_original_payment_status(sender, instance, **kwargs):
    """
    Captures the current DB payment status before save so post_save
    can detect the transition to PAID without firing on every save.
    """
    if instance.pk:
        try:
            instance.__original_payment_status = Payment.objects.values_list(
                "status", flat=True
            ).get(pk=instance.pk)
        except Payment.DoesNotExist:
            instance.__original_payment_status = None
    else:
        instance.__original_payment_status = None


@receiver(post_save, sender=Payment)
def on_payment_saved(sender, instance, created, **kwargs):
    """
    Fires after every Payment save.

    Rules:
      - Payment transitions to PAID and payment_type is DEPOSIT
        → DEPOSIT_RECEIVED notification for guest + admins
      - All other saves are ignored
    """
    new_status = instance.status
    old_status = getattr(instance, "__original_payment_status", None)

    # Only fire when status just changed TO paid (not on every save)
    if new_status != PaymentStatus.PAID:
        return
    if old_status == PaymentStatus.PAID:
        return  # already paid, don't re-fire

    # Only send DEPOSIT_RECEIVED for deposit payments, not full/balance payments
    if instance.payment_type != PaymentType.DEPOSIT:
        return

    NotificationService.notify(
        event=NotificationEvent.DEPOSIT_RECEIVED,
        booking=instance.booking,
    )