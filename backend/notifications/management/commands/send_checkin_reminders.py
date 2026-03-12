"""
notifications/management/commands/send_checkin_reminders.py
============================================================
Management command that sends check-in reminder notifications
for all bookings whose check-in date is tomorrow.

Schedule this via cron or Celery beat to run daily at 09:00.

Example cron:
    0 9 * * * python manage.py send_checkin_reminders

Example Celery beat task (in celery.py):
    app.conf.beat_schedule = {
        "send-checkin-reminders": {
            "task": "notifications.tasks.send_checkin_reminders",
            "schedule": crontab(hour=9, minute=0),
        }
    }
"""

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from bookings.models import Booking, BookingStatus
from notifications.models import NotificationEvent
from notifications.service import NotificationService


class Command(BaseCommand):
    help = "Send check-in reminder notifications for tomorrow's arrivals."

    def handle(self, *args, **options):
        tomorrow = timezone.now().date() + timedelta(days=1)

        bookings = Booking.objects.filter(
            check_in=tomorrow,
            status=BookingStatus.CONFIRMED,
        ).select_related("guest", "room")

        count = 0
        for booking in bookings:
            NotificationService.notify(
                event=NotificationEvent.CHECKIN_REMINDER,
                booking=booking,
            )
            count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Sent check-in reminders for {count} booking(s) arriving on {tomorrow}."
            )
        )