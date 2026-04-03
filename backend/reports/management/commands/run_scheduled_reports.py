"""
reports/management/commands/run_scheduled_reports.py

Management command to trigger scheduled report execution manually.
Useful for testing or as a cron job alternative to Celery beat.

Usage:
    python manage.py run_scheduled_reports
    python manage.py run_scheduled_reports --dry-run
"""
from django.core.management.base import BaseCommand
from django.utils                import timezone


class Command(BaseCommand):
    help = "Execute all active scheduled reports that are due."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="List due schedules without executing them.",
        )

    def handle(self, *args, **options):
        from reports.models import ScheduledReport

        now = timezone.now()
        due = ScheduledReport.objects.filter(
            is_active=True,
            next_run__lte=now,
        ).select_related("template")

        if not due.exists():
            self.stdout.write("No scheduled reports are due.")
            return

        self.stdout.write(f"Found {due.count()} due schedule(s).")

        if options["dry_run"]:
            for s in due:
                self.stdout.write(
                    f"  [DRY-RUN] {s.template.name} "
                    f"({s.frequency}) — next_run={s.next_run}"
                )
            return

        from reports.tasks import run_scheduled_reports
        count = run_scheduled_reports()
        self.stdout.write(
            self.style.SUCCESS(f"Executed {count} scheduled report(s).")
        )