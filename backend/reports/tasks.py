"""
reports/tasks.py

Celery tasks for scheduled report execution.

Setup:
  1. Install Celery:   pip install celery celery[redis]
  2. Add to settings:
       CELERY_BROKER_URL  = "redis://localhost:6379/0"
       CELERY_RESULT_BACKEND = "redis://localhost:6379/0"
  3. Add beat schedule to settings:
       from celery.schedules import crontab
       CELERY_BEAT_SCHEDULE = {
           "run-scheduled-reports": {
               "task":     "reports.tasks.run_scheduled_reports",
               "schedule": crontab(minute=0),   # every hour
           },
       }
  4. Run workers:
       celery -A your_project worker -l info
       celery -A your_project beat   -l info
"""

import logging
from django.utils import timezone

logger = logging.getLogger(__name__)


def run_scheduled_reports():
    """
    Execute all active scheduled reports whose next_run is due.
    Safe to call from Celery beat, a management command, or a cron job.
    Returns the number of reports executed.
    """
    from .models   import ScheduledReport, ExecutionStatus
    # Fix #4 — import from services.py, not views.py, to avoid loading the
    # entire DRF view layer at Celery worker startup.
    from .services import run_report_and_log

    now     = timezone.now()
    due     = ScheduledReport.objects.filter(
        is_active=True,
        next_run__lte=now,
    ).select_related("template", "created_by")

    count = 0
    for schedule in due:
        template = schedule.template
        config   = template.config

        logger.info(
            "Running scheduled report: template=%s frequency=%s",
            template.name, schedule.frequency,
        )

        _, execution = run_report_and_log(
            report_type   = template.report_type,
            config        = config,
            export_format = schedule.export_format,
            user          = schedule.created_by,
            template      = template,
            schedule      = schedule,
            is_scheduled  = True,
        )

        if execution.status == ExecutionStatus.SUCCESS:
            schedule.advance_next_run()
            count += 1
            logger.info(
                "Scheduled report %s completed. Next run: %s",
                template.name, schedule.next_run,
            )
        else:
            logger.error(
                "Scheduled report %s FAILED: %s",
                template.name, execution.error_message,
            )

    return count


# ── Celery task wrapper (only used if Celery is installed) ────────────────────
try:
    from celery import shared_task

    @shared_task(name="reports.tasks.run_scheduled_reports_task")
    def run_scheduled_reports_task():
        """Celery-wrapped version of run_scheduled_reports."""
        count = run_scheduled_reports()
        return {"executed": count}

except ImportError:
    # Celery not installed — scheduled reports can still be triggered
    # via management command or direct function call
    pass