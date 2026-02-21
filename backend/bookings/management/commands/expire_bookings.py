from django.core.management.base import BaseCommand
from bookings.views import expire_bookings


class Command(BaseCommand):
    help = "Cancel AWAITING_PAYMENT bookings that have not been paid within 30 minutes."

    def handle(self, *args, **options):
        count = expire_bookings()
        self.stdout.write(
            self.style.SUCCESS(f"Expired {count} unpaid booking(s).")
        )