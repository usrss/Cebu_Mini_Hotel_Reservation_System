"""
payments/signals.py

Post-save hooks for the Payment model.
Keep side-effects here — not in views — so they fire from
management commands, Celery tasks, and tests too.
"""
import logging
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Payment, PaymentStatus

logger = logging.getLogger(__name__)


@receiver(post_save, sender=Payment)
def log_payment_status_change(sender, instance, created, **kwargs):
    """Log every payment save for audit purposes."""
    action = "created" if created else "updated"
    logger.info(
        "Payment %s %s — status=%s amount=%s %s booking=%s",
        instance.pk, action,
        instance.status, instance.amount, instance.currency,
        instance.booking_id,
    )