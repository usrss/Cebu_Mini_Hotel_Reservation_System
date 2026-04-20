"""
Management command to clean up expired verification codes
Run with: python manage.py cleanup_verification_codes
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from users.models import VerificationCode


class Command(BaseCommand):
    help = 'Delete expired verification codes from the database'

    def add_arguments(self, parser):
        parser.add_argument(
            '--days',
            type=int,
            default=1,
            help='Delete codes older than this many days (default: 1)',
        )

    def handle(self, *args, **options):
        days = options['days']

        # Delete expired codes
        expired_codes = VerificationCode.objects.filter(
            expires_at__lt=timezone.now()
        )

        count = expired_codes.count()
        expired_codes.delete()

        self.stdout.write(
            self.style.SUCCESS(
                f'Successfully deleted {count} expired verification code(s)'
            )
        )
