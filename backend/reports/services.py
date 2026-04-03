"""
reports/services.py

Enhanced ReportService for the custom report generation feature.

Extends the existing staff/services.py with:
  - Metric selection  — only return requested metrics
  - Flexible grouping — day | week | month | room_type | status
  - Role-based scoping — admin = system-wide, manager = limited
  - Result caching     — django.core.cache (default backend)
  - PDF export         — via ReportLab
  - Excel export       — via openpyxl

All methods return a standard envelope:
  {
    "summary": { ... selected metrics ... },
    "rows":    [ ... grouped rows ... ],
    "meta": {
      "report_type": ...,
      "start_date":  ...,
      "end_date":    ...,
      "group_by":    ...,
      "metrics":     [...],
      "generated_at": ...,
      "cached":      bool,
    }
  }
"""

import hashlib
import io
import json
import logging
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.cache   import cache
from django.db.models    import Avg, Count, F, Q, Sum
from django.db.models.functions import TruncDate, TruncMonth, TruncWeek
from django.utils        import timezone

from bookings.models import Booking, BookingStatus
from bookings.models import PaymentStatus as BookingPaymentStatus
from rooms.models    import Room

logger = logging.getLogger(__name__)
User   = get_user_model()

CACHE_TTL = 300  # 5 minutes


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _trunc_fn(group_by: str):
    """Return the ORM truncation function for a group_by value."""
    return {
        "day":   TruncDate,
        "week":  TruncWeek,
        "month": TruncMonth,
    }.get(group_by, TruncDate)


def _cache_key(report_type: str, config: dict) -> str:
    payload = json.dumps({"t": report_type, "c": config}, sort_keys=True)
    return f"report:{hashlib.md5(payload.encode()).hexdigest()}"


def _filter_summary(summary: dict, metrics: list) -> dict:
    """Return only the requested metrics from the summary dict."""
    if not metrics:
        return summary
    return {k: v for k, v in summary.items() if k in metrics}


def _resolve_dates(config: dict):
    """Resolve start_date and end_date from config."""
    today  = timezone.now().date()
    period = config.get("period", "monthly")

    if period == "custom":
        start = date.fromisoformat(config["start_date"])
        end   = date.fromisoformat(config["end_date"])
        return start, end

    mapping = {
        "daily":   (today,                         today),
        "weekly":  (today - timedelta(days=6),     today),
        "monthly": (today.replace(day=1),          today),
        "yearly":  (today.replace(month=1, day=1), today),
    }
    return mapping.get(period, mapping["monthly"])


# ─── EnhancedReportService ────────────────────────────────────────────────────

class EnhancedReportService:

    # ── Public dispatcher ──────────────────────────────────────────────────────

    @classmethod
    def run(cls, report_type: str, config: dict, user=None) -> dict:
        """
        Main entry point.
        Checks cache first, calls the appropriate generator, caches result.
        """
        key    = _cache_key(report_type, config)
        cached = cache.get(key)
        if cached:
            cached["meta"]["cached"] = True
            return cached

        start, end = _resolve_dates(config)
        metrics    = config.get("metrics", [])
        group_by   = config.get("group_by", "day")
        filters    = config.get("filters", {})

        generators = {
            "bookings":  cls._bookings,
            "revenue":   cls._revenue,
            "occupancy": cls._occupancy,
            "guests":    cls._guests,
            "staff":     cls._staff,
        }

        fn = generators.get(report_type)
        if not fn:
            raise ValueError(f"Unknown report_type: {report_type}")

        data = fn(start, end, metrics=metrics, group_by=group_by, filters=filters, user=user)
        data["meta"] = {
            "report_type":  report_type,
            "start_date":   str(start),
            "end_date":     str(end),
            "group_by":     group_by,
            "metrics":      metrics,
            "generated_at": timezone.now().isoformat(),
            "cached":       False,
        }

        cache.set(key, data, CACHE_TTL)
        return data

    # ── Bookings ───────────────────────────────────────────────────────────────

    @staticmethod
    def _bookings(
        start: date, end: date,
        metrics: list, group_by: str, filters: dict, user=None
    ) -> dict:
        qs = Booking.objects.filter(
            created_at__date__gte=start,
            created_at__date__lte=end,
        )

        # Apply optional filters
        if filters.get("room_type"):
            qs = qs.filter(room__room_type=filters["room_type"])
        if filters.get("status"):
            qs = qs.filter(status=filters["status"])

        summary_full = {
            "total":         qs.count(),
            "confirmed":     qs.filter(status=BookingStatus.CONFIRMED).count(),
            "checked_in":    qs.filter(status=BookingStatus.CHECKED_IN).count(),
            "checked_out":   qs.filter(status=BookingStatus.CHECKED_OUT).count(),
            "cancelled":     qs.filter(status=BookingStatus.CANCELLED).count(),
            "expired":       qs.filter(status=BookingStatus.EXPIRED).count(),
            "no_show":       qs.filter(status=BookingStatus.NO_SHOW).count(),
            "total_revenue": float(
                qs.filter(payment_status=BookingPaymentStatus.PAID)
                  .aggregate(t=Sum("total_price"))["t"] or 0
            ),
        }

        # Grouping
        if group_by in ("day", "week", "month"):
            trunc = _trunc_fn(group_by)
            rows_qs = (
                qs.annotate(period=trunc("created_at"))
                  .values("period")
                  .annotate(
                      count=Count("id"),
                      paid_revenue=Sum(
                          "total_price",
                          filter=Q(payment_status=BookingPaymentStatus.PAID),
                      ),
                  )
                  .order_by("period")
            )
            rows = [
                {
                    "period":       str(r["period"]),
                    "bookings":     r["count"],
                    "paid_revenue": float(r["paid_revenue"] or 0),
                }
                for r in rows_qs
            ]
        elif group_by == "status":
            rows = [
                {"status": s, "count": qs.filter(status=s).count()}
                for s in BookingStatus.values
            ]
        elif group_by == "room_type":
            from rooms.models import RoomType
            rows = [
                {
                    "room_type":  rt,
                    "label":      label,
                    "count":      qs.filter(room__room_type=rt).count(),
                }
                for rt, label in RoomType.choices
            ]
        else:
            rows = []

        return {
            "summary": _filter_summary(summary_full, metrics),
            "rows":    rows,
        }

    # ── Revenue ────────────────────────────────────────────────────────────────

    @staticmethod
    def _revenue(
        start: date, end: date,
        metrics: list, group_by: str, filters: dict, user=None
    ) -> dict:
        paid_qs = Booking.objects.filter(
            payment_status=BookingPaymentStatus.PAID,
            confirmed_at__date__gte=start,
            confirmed_at__date__lte=end,
        )

        if filters.get("room_type"):
            paid_qs = paid_qs.filter(room__room_type=filters["room_type"])

        totals = paid_qs.aggregate(
            total_revenue    = Sum("total_price"),
            total_tax        = Sum("tax"),
            total_service_fee= Sum("service_fee"),
            avg_booking_value= Avg("total_price"),
            count            = Count("id"),
        )

        refund_total = (
            Booking.objects.filter(
                refund_status="completed",
                cancelled_at__date__gte=start,
                cancelled_at__date__lte=end,
            ).aggregate(t=Sum("refund_amount"))["t"] or Decimal("0")
        )

        summary_full = {
            "total_revenue":     float(totals["total_revenue"] or 0),
            "total_tax":         float(totals["total_tax"] or 0),
            "total_service_fee": float(totals["total_service_fee"] or 0),
            "net_revenue":       float((totals["total_revenue"] or 0) - refund_total),
            "avg_booking_value": float(totals["avg_booking_value"] or 0),
            "paid_bookings":     totals["count"] or 0,
            "total_refunds":     float(refund_total),
        }

        # Grouping
        if group_by in ("day", "week", "month"):
            trunc = _trunc_fn(group_by)
            rows_qs = (
                paid_qs.annotate(period=trunc("confirmed_at"))
                       .values("period")
                       .annotate(revenue=Sum("total_price"), bookings=Count("id"))
                       .order_by("period")
            )
            rows = [
                {
                    "period":   str(r["period"]),
                    "revenue":  float(r["revenue"] or 0),
                    "bookings": r["bookings"],
                }
                for r in rows_qs
            ]
        elif group_by == "room_type":
            from rooms.models import RoomType
            rows = []
            for rt, label in RoomType.choices:
                sub = paid_qs.filter(room__room_type=rt)
                rev = sub.aggregate(t=Sum("total_price"))["t"] or 0
                rows.append({
                    "room_type": rt,
                    "label":     label,
                    "revenue":   float(rev),
                    "bookings":  sub.count(),
                })
        else:
            rows = []

        return {
            "summary": _filter_summary(summary_full, metrics),
            "rows":    rows,
        }

    # ── Occupancy ──────────────────────────────────────────────────────────────

    @staticmethod
    def _occupancy(
        start: date, end: date,
        metrics: list, group_by: str, filters: dict, user=None
    ) -> dict:
        rooms_qs = Room.objects.filter(is_active=True)
        if filters.get("room_type"):
            rooms_qs = rooms_qs.filter(room_type=filters["room_type"])

        total_rooms       = rooms_qs.count()
        total_days        = (end - start).days + 1
        total_room_nights = total_rooms * total_days

        overlapping = Booking.objects.filter(
            status__in=[
                BookingStatus.CONFIRMED,
                BookingStatus.CHECKED_IN,
                BookingStatus.CHECKED_OUT,
            ],
            check_in__lte=end,
            check_out__gte=start,
        )
        if filters.get("room_type"):
            overlapping = overlapping.filter(room__room_type=filters["room_type"])

        occupied_nights = 0
        for b in overlapping:
            actual_start    = max(b.check_in, start)
            actual_end      = min(b.check_out, end)
            occupied_nights += (actual_end - actual_start).days

        occupancy_rate = (
            round(occupied_nights / total_room_nights * 100, 2)
            if total_room_nights > 0 else 0.0
        )

        summary_full = {
            "total_rooms":       total_rooms,
            "total_days":        total_days,
            "total_room_nights": total_room_nights,
            "occupied_nights":   occupied_nights,
            "occupancy_rate":    occupancy_rate,
        }

        # By room type
        from rooms.models import RoomType
        rows = []
        for rt_key, rt_label in RoomType.choices:
            type_rooms = rooms_qs.filter(room_type=rt_key)
            count = type_rooms.count()
            if count == 0:
                continue
            booked      = overlapping.filter(room__room_type=rt_key)
            type_nights = 0
            for b in booked:
                actual_start = max(b.check_in, start)
                actual_end   = min(b.check_out, end)
                type_nights += (actual_end - actual_start).days
            max_nights = count * total_days
            rows.append({
                "room_type":       rt_key,
                "room_type_label": rt_label,
                "room_count":      count,
                "occupied_nights": type_nights,
                "max_nights":      max_nights,
                "occupancy_rate":  round(type_nights / max_nights * 100, 2) if max_nights else 0,
            })

        return {
            "summary": _filter_summary(summary_full, metrics),
            "rows":    rows,
        }

    # ── Guests ─────────────────────────────────────────────────────────────────

    @staticmethod
    def _guests(
        start: date, end: date,
        metrics: list, group_by: str, filters: dict, user=None
    ) -> dict:
        new_users = User.objects.filter(
            date_joined__date__gte=start,
            date_joined__date__lte=end,
            is_staff=False,
        ).count()

        repeat_guests = (
            Booking.objects.filter(payment_status=BookingPaymentStatus.PAID)
            .values("user")
            .annotate(c=Count("id"))
            .filter(c__gt=1)
            .count()
        )

        period_qs = Booking.objects.filter(
            created_at__date__gte=start,
            created_at__date__lte=end,
        )
        walk_ins   = period_qs.filter(user__isnull=True).count()
        registered = period_qs.filter(user__isnull=False).count()

        top_guests = (
            period_qs.filter(user__isnull=False)
            .values("user__email", "full_name")
            .annotate(bookings=Count("id"), spent=Sum("total_price"))
            .order_by("-bookings")[:10]
        )

        summary_full = {
            "new_registrations":   new_users,
            "repeat_guests":       repeat_guests,
            "walk_in_bookings":    walk_ins,
            "registered_bookings": registered,
        }

        rows = [
            {
                "email":    g["user__email"],
                "name":     g["full_name"],
                "bookings": g["bookings"],
                "spent":    float(g["spent"] or 0),
            }
            for g in top_guests
        ]

        return {
            "summary": _filter_summary(summary_full, metrics),
            "rows":    rows,
        }

    # ── Staff Performance ──────────────────────────────────────────────────────

    @staticmethod
    def _staff(
        start: date, end: date,
        metrics: list, group_by: str, filters: dict, user=None
    ) -> dict:
        from staff.models import StaffActivityLog, CleaningTask, MaintenanceTask, StaffProfile

        # Role-based scope: managers cannot see admin/manager staff data
        role = getattr(getattr(user, "staff_profile", None), "effective_role", None) if user else None

        def _scoped_profiles():
            qs = StaffProfile.objects.all()
            if role == "manager":
                qs = qs.exclude(role__in=["admin", "manager"])
            if filters.get("staff_id"):
                qs = qs.filter(pk=filters["staff_id"])
            return qs

        profiles = _scoped_profiles()
        profile_ids = list(profiles.values_list("id", flat=True))

        checkins = (
            StaffActivityLog.objects.filter(
                action_type="check_in_guest",
                created_at__date__gte=start,
                created_at__date__lte=end,
                staff_id__in=profile_ids,
            )
            .values("staff__id", "staff__user__email")
            .annotate(count=Count("id"))
        )

        cleaning = (
            CleaningTask.objects.filter(
                status="clean",
                completed_at__date__gte=start,
                completed_at__date__lte=end,
                assigned_to_id__in=profile_ids,
            )
            .values("assigned_to__id", "assigned_to__user__email")
            .annotate(count=Count("id"))
        )

        maintenance = (
            MaintenanceTask.objects.filter(
                status="completed",
                completed_at__date__gte=start,
                completed_at__date__lte=end,
                assigned_to_id__in=profile_ids,
            )
            .values("assigned_to__id", "assigned_to__user__email")
            .annotate(count=Count("id"))
        )

        perf: dict[str, dict] = {}
        for row in checkins:
            email = row["staff__user__email"]
            perf.setdefault(email, {"email": email, "check_ins": 0, "cleaning": 0, "maintenance": 0})
            perf[email]["check_ins"] = row["count"]
        for row in cleaning:
            email = row["assigned_to__user__email"]
            perf.setdefault(email, {"email": email, "check_ins": 0, "cleaning": 0, "maintenance": 0})
            perf[email]["cleaning"] = row["count"]
        for row in maintenance:
            email = row["assigned_to__user__email"]
            perf.setdefault(email, {"email": email, "check_ins": 0, "cleaning": 0, "maintenance": 0})
            perf[email]["maintenance"] = row["count"]

        rows = sorted(perf.values(), key=lambda r: -(r["check_ins"] + r["cleaning"] + r["maintenance"]))

        summary_full = {
            "total_check_ins":       sum(r["check_ins"]    for r in rows),
            "total_cleaning_done":   sum(r["cleaning"]     for r in rows),
            "total_maintenance_done":sum(r["maintenance"]  for r in rows),
        }

        return {
            "summary": _filter_summary(summary_full, metrics),
            "rows":    rows,
        }


# ─── Export helpers ───────────────────────────────────────────────────────────

def export_csv(data: dict, report_type: str) -> bytes:
    """Render report data as CSV bytes."""
    import csv as _csv

    buf  = io.StringIO()
    rows = data.get("rows", [])
    if not rows:
        return buf.getvalue().encode()

    writer = _csv.DictWriter(buf, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(rows)
    return buf.getvalue().encode("utf-8")


def export_pdf(data: dict, report_type: str) -> bytes:
    """
    Render report data as a PDF using ReportLab.
    Falls back to a plain-text PDF if ReportLab is unavailable.
    """
    try:
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.lib.styles    import getSampleStyleSheet
        from reportlab.lib.units     import cm
        from reportlab.platypus      import (
            SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer,
        )
        from reportlab.lib           import colors

        buf  = io.BytesIO()
        doc  = SimpleDocTemplate(buf, pagesize=landscape(A4))
        styles = getSampleStyleSheet()
        story  = []

        # Title
        title = f"{report_type.replace('_',' ').title()} Report"
        story.append(Paragraph(title, styles["Title"]))
        meta = data.get("meta", {})
        story.append(Paragraph(
            f"Period: {meta.get('start_date','')} — {meta.get('end_date','')} | "
            f"Generated: {meta.get('generated_at','')}",
            styles["Normal"],
        ))
        story.append(Spacer(1, 0.4 * cm))

        # Summary table
        summary = data.get("summary", {})
        if summary:
            story.append(Paragraph("Summary", styles["Heading2"]))
            s_data = [["Metric", "Value"]] + [
                [k.replace("_", " ").title(), str(v)]
                for k, v in summary.items()
            ]
            t = Table(s_data, colWidths=[8 * cm, 6 * cm])
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a2744")),
                ("TEXTCOLOR",  (0, 0), (-1, 0), colors.white),
                ("FONTNAME",   (0, 0), (-1, 0), "Helvetica-Bold"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f3f4f6")]),
                ("GRID",       (0, 0), (-1, -1), 0.5, colors.grey),
                ("FONTSIZE",   (0, 0), (-1, -1), 9),
            ]))
            story.append(t)
            story.append(Spacer(1, 0.4 * cm))

        # Rows table
        rows = data.get("rows", [])
        if rows:
            story.append(Paragraph("Data", styles["Heading2"]))
            headers   = list(rows[0].keys())
            col_width = max(2 * cm, 25 * cm / len(headers))
            r_data    = [headers] + [[str(row.get(h, "")) for h in headers] for row in rows]
            t2 = Table(r_data, colWidths=[col_width] * len(headers))
            t2.setStyle(TableStyle([
                ("BACKGROUND",    (0, 0), (-1, 0), colors.HexColor("#1a2744")),
                ("TEXTCOLOR",     (0, 0), (-1, 0), colors.white),
                ("FONTNAME",      (0, 0), (-1, 0), "Helvetica-Bold"),
                ("ROWBACKGROUNDS",(0, 1), (-1, -1), [colors.white, colors.HexColor("#f3f4f6")]),
                ("GRID",          (0, 0), (-1, -1), 0.5, colors.grey),
                ("FONTSIZE",      (0, 0), (-1, -1), 8),
            ]))
            story.append(t2)

        doc.build(story)
        return buf.getvalue()

    except ImportError:
        # Fallback: plain text PDF-like response
        content = f"Report: {report_type}\n\n"
        content += json.dumps(data.get("summary", {}), indent=2)
        return content.encode("utf-8")


def export_excel(data: dict, report_type: str) -> bytes:
    """Render report data as an Excel workbook using openpyxl."""
    try:
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment

        wb = openpyxl.Workbook()

        # ── Summary sheet ──────────────────────────────────────────────────────
        ws_summary = wb.active
        ws_summary.title = "Summary"

        header_font = Font(bold=True, color="FFFFFF")
        header_fill = PatternFill("solid", fgColor="1a2744")

        ws_summary.append(["Metric", "Value"])
        ws_summary["A1"].font = header_font
        ws_summary["A1"].fill = header_fill
        ws_summary["B1"].font = header_font
        ws_summary["B1"].fill = header_fill

        for k, v in data.get("summary", {}).items():
            ws_summary.append([k.replace("_", " ").title(), v])

        ws_summary.column_dimensions["A"].width = 30
        ws_summary.column_dimensions["B"].width = 20

        # ── Data sheet ────────────────────────────────────────────────────────
        rows = data.get("rows", [])
        if rows:
            ws_data = wb.create_sheet(title="Data")
            headers = list(rows[0].keys())
            ws_data.append(headers)
            for col_idx, h in enumerate(headers, 1):
                cell = ws_data.cell(row=1, column=col_idx)
                cell.font = header_font
                cell.fill = header_fill
                cell.alignment = Alignment(horizontal="center")

            for row in rows:
                ws_data.append([row.get(h, "") for h in headers])

            for col in ws_data.columns:
                max_len = max(len(str(cell.value or "")) for cell in col) + 2
                ws_data.column_dimensions[col[0].column_letter].width = min(max_len, 30)

        # ── Meta sheet ────────────────────────────────────────────────────────
        ws_meta = wb.create_sheet(title="Meta")
        for k, v in data.get("meta", {}).items():
            ws_meta.append([k, str(v)])

        buf = io.BytesIO()
        wb.save(buf)
        return buf.getvalue()

    except ImportError:
        # Fallback to CSV bytes
        return export_csv(data, report_type)


# ─── Execution runner (moved here from views.py to avoid circular imports) ────
# tasks.py imports this directly; views.py also imports and re-uses it.

def _notify_report_ready(user, report_type, execution, is_scheduled, export_format):
    """
    Creates a dashboard notification for the report owner when a report
    completes — used for scheduled runs and file-export (CSV/PDF/Excel) runs.
    """
    try:
        from notifications.models import (
            Notification,
            NotificationEvent,
            NotificationChannel,
            NotificationRecipientType,
            NotificationPriority,
        )
        trigger   = "Scheduled report" if is_scheduled else "Your report"
        fmt_label = {"csv": "CSV", "pdf": "PDF", "excel": "Excel", "json": "In-App"}.get(
            export_format, export_format.upper()
        )
        type_label = report_type.replace("_", " ").title()
        Notification.objects.create(
            recipient      = user,
            booking        = None,
            event          = NotificationEvent.SYSTEM_ALERT,
            recipient_type = NotificationRecipientType.ADMIN,
            channel        = NotificationChannel.DASHBOARD,
            priority       = NotificationPriority.MEDIUM,
            title          = f"Report Ready — {type_label}",
            description    = (
                f"{trigger} '{type_label}' ({fmt_label}) has completed successfully. "
                f"Go to Reports → History to view or download the results."
            ),
        )
    except Exception as exc:
        logger.warning(
            "Failed to send report-ready notification for execution %s: %s",
            execution.pk, exc,
        )


def _notify_report_failed(user, report_type, execution):
    """Creates a HIGH priority notification when a scheduled report fails."""
    try:
        from notifications.models import (
            Notification,
            NotificationEvent,
            NotificationChannel,
            NotificationRecipientType,
            NotificationPriority,
        )
        type_label = report_type.replace("_", " ").title()
        Notification.objects.create(
            recipient      = user,
            booking        = None,
            event          = NotificationEvent.SYSTEM_ALERT,
            recipient_type = NotificationRecipientType.ADMIN,
            channel        = NotificationChannel.DASHBOARD,
            priority       = NotificationPriority.HIGH,
            title          = f"Report Failed — {type_label}",
            description    = (
                f"Scheduled '{type_label}' report (execution #{execution.pk}) failed. "
                f"Error: {execution.error_message or 'Unknown error'}. "
                f"Check Reports → History for details."
            ),
        )
    except Exception as exc:
        logger.warning(
            "Failed to send report-failed notification for execution %s: %s",
            execution.pk, exc,
        )


def run_report_and_log(
    report_type: str,
    config: dict,
    export_format: str,
    user,
    template=None,
    schedule=None,
    is_scheduled: bool = False,
):
    """
    Execute a report, persist a ReportExecution log, write a StaffActivityLog
    audit entry, and fire a notification on completion or failure.

    Returns (data, execution).
    Imported by both views.py and tasks.py — keeping it here prevents the
    circular import that occurred when tasks.py imported from views.py.
    """
    from .models import ReportExecution, ExecutionStatus, ExportFormat

    execution = ReportExecution.objects.create(
        template        = template,
        schedule        = schedule,
        report_type     = report_type,
        config_snapshot = config,
        export_format   = export_format,
        triggered_by    = user,
        is_scheduled    = is_scheduled,
        status          = ExecutionStatus.PENDING,
    )

    # ── Audit log ─────────────────────────────────────────────────────────────
    try:
        from staff.models import StaffActivityLog
        profile = getattr(user, "staff_profile", None) if user else None
        period  = config.get("period", "—")
        filters = config.get("filters", {})
        metrics = config.get("metrics", [])

        StaffActivityLog.objects.create(
            staff       = profile,
            action_type = "generate_report",
            description = (
                f"Generated '{report_type}' report. "
                f"Period: {period}. Format: {export_format}. "
                f"Metrics: {metrics or 'all'}. Filters: {filters or 'none'}. "
                f"{'Scheduled run.' if is_scheduled else 'On-demand run.'}"
            ),
            metadata = {
                "report_type":   report_type,
                "period":        period,
                "export_format": export_format,
                "metrics":       metrics,
                "filters":       filters,
                "execution_id":  execution.pk,
                "is_scheduled":  is_scheduled,
                "template_id":   template.pk if template else None,
            },
        )
    except Exception as exc:
        logger.warning("StaffActivityLog write failed for execution %s: %s", execution.pk, exc)

    # ── Run ───────────────────────────────────────────────────────────────────
    try:
        data = EnhancedReportService.run(report_type, config, user=user)
        execution.mark_success(data)

        if user and (is_scheduled or export_format != ExportFormat.JSON):
            _notify_report_ready(
                user          = user,
                report_type   = report_type,
                execution     = execution,
                is_scheduled  = is_scheduled,
                export_format = export_format,
            )

        return data, execution

    except Exception as exc:
        logger.exception("Report execution %s failed: %s", execution.pk, exc)
        execution.mark_failed(str(exc))

        if user and is_scheduled:
            _notify_report_failed(
                user        = user,
                report_type = report_type,
                execution   = execution,
            )

        return None, execution