"""
staff/services.py

Business logic for report & analytics generation.
All queries are pure Django ORM — no raw SQL.
Called exclusively by staff/views.py ReportView.

Supported reports:
  - booking_report
  - revenue_report
  - occupancy_report
  - guest_report
  - staff_performance_report
"""

from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Count, Q, Sum, Avg, F
from django.utils import timezone

from bookings.models import Booking, BookingStatus, PaymentStatus
from rooms.models import Room
from payments.models import Refund

User = get_user_model()

# Normalize short aliases → full names
_PERIOD_ALIASES = {
    'day': 'daily',
    'week': 'weekly',
    'month': 'monthly',
    'year': 'yearly',
}


class ReportService:

    # ── Period resolver ───────────────────────────────────────────────────────

    @staticmethod
    def resolve_period(
        period: str,
        start_str: str | None,
        end_str: str | None,
    ) -> tuple[date, date]:

        """
        Resolve start_date and end_date from a named period or explicit strings.
        Returns (start_date, end_date) as date objects.
        """
        today = timezone.now().date()
        period = _PERIOD_ALIASES.get(period, period)

        if start_str and end_str:
            try:
                start = date.fromisoformat(start_str)
                end   = date.fromisoformat(end_str)
            except ValueError:
                raise ValueError("start_date and end_date must be in YYYY-MM-DD format.")
            if end < start:
                raise ValueError("end_date must be >= start_date.")
            return start, end

        periods = {
            "daily":   (today,                          today),
            "weekly":  (today - timedelta(days=6),      today),
            "monthly": (today.replace(day=1),           today),
            "yearly":  (today.replace(month=1, day=1),  today),
        }
        if period not in periods:
            raise ValueError(
                f"Unknown period '{period}'. Valid: daily, weekly, monthly, yearly."
            )
        return periods[period]

    # ── Booking Report ────────────────────────────────────────────────────────

    @staticmethod
    def booking_report(start: date, end: date) -> dict:
        """
        Booking counts and revenue breakdown for the given date range.
        Groups by booking date (created_at__date).
        """
        qs = Booking.objects.filter(
            created_at__date__gte=start,
            created_at__date__lte=end,
        )

        total        = qs.count()
        confirmed    = qs.filter(status=BookingStatus.CONFIRMED).count()
        checked_in   = qs.filter(status=BookingStatus.CHECKED_IN).count()
        checked_out  = qs.filter(status=BookingStatus.CHECKED_OUT).count()
        cancelled    = qs.filter(status=BookingStatus.CANCELLED).count()
        expired      = qs.filter(status=BookingStatus.EXPIRED).count()
        no_show      = qs.filter(status=BookingStatus.NO_SHOW).count()

        revenue = (
            qs.filter(payment_status=PaymentStatus.PAID)
              .aggregate(total=Sum("total_price"))["total"] or Decimal("0")
        )

        # Daily breakdown — includes per-day confirmed / cancelled / no_show
        # so the frontend trend chart can render all three lines.
        from django.db.models.functions import TruncDate
        daily = (
            qs.annotate(day=TruncDate("created_at"))
              .values("day")
              .annotate(
                  count=Count("id"),
                  paid_revenue=Sum(
                      "total_price",
                      filter=Q(payment_status=PaymentStatus.PAID),
                  ),
                  day_confirmed=Count(
                      "id", filter=Q(status=BookingStatus.CONFIRMED),
                  ),
                  day_cancelled=Count(
                      "id", filter=Q(status=BookingStatus.CANCELLED),
                  ),
                  day_no_show=Count(
                      "id", filter=Q(status=BookingStatus.NO_SHOW),
                  ),
              )
              .order_by("day")
        )

        # Cancellation rate (overall for the period)
        cancellation_rate = (
            round((cancelled / total) * 100, 1) if total > 0 else 0
        )

        return {
            "summary": {
                "total":       total,
                "total_bookings": total,
                "confirmed":   confirmed,
                "checked_in":  checked_in,
                "checked_out": checked_out,
                "cancelled":   cancelled,
                "cancelled_bookings": cancelled,
                "expired":     expired,
                "no_show":     no_show,
                "no_show_bookings": no_show,
                "pending_payment": qs.filter(status=BookingStatus.PENDING_PAYMENT).count(),
                "cancellation_rate": cancellation_rate,
                "total_revenue": float(revenue),
            },
            "rows": [
                {
                    "date":           str(row["day"]),
                    "total_bookings": row["count"],
                    "bookings":       row["count"],
                    "confirmed":      row["day_confirmed"],
                    "cancelled":      row["day_cancelled"],
                    "no_show":        row["day_no_show"],
                    "paid_revenue":   float(row["paid_revenue"] or 0),
                }
                for row in daily
            ],
        }

    # ── Revenue Report ────────────────────────────────────────────────────────

    @staticmethod
    def revenue_report(start: date, end: date) -> dict:
        """
        Revenue aggregated by day, plus overall totals and average booking value.
        Only paid bookings are counted.
        """
        from django.db.models.functions import TruncDate

        paid_qs = Booking.objects.filter(
            payment_status=PaymentStatus.PAID,
            confirmed_at__date__gte=start,
            confirmed_at__date__lte=end,
        )

        totals = paid_qs.aggregate(
            total_revenue=Sum("total_price"),
            total_tax=Sum("tax"),
            total_service_fee=Sum("service_fee"),
            avg_booking_value=Avg("total_price"),
            count=Count("id"),
        )

        daily = (
            paid_qs.annotate(day=TruncDate("confirmed_at"))
                   .values("day")
                   .annotate(
                       revenue=Sum("total_price"),
                       bookings=Count("id"),
                   )
                   .order_by("day")
        )


        refund_total = (
                Refund.objects.filter(
                    status=Refund.RefundStatus.COMPLETED,
                    created_at__date__gte=start,
                    created_at__date__lte=end,
                ).aggregate(total=Sum("amount"))["total"] or Decimal("0")
        )

        return {
            "summary": {
                "total_revenue":    float(totals["total_revenue"] or 0),
                "total_tax":        float(totals["total_tax"] or 0),
                "total_service_fee": float(totals["total_service_fee"] or 0),
                "net_revenue":      float(
                    (totals["total_revenue"] or 0) - refund_total
                ),
                "avg_booking_value": float(totals["avg_booking_value"] or 0),
                "paid_bookings":    totals["count"] or 0,
                "total_refunds":    float(refund_total),
            },
            "rows": [
                {
                    "date":     str(row["day"]),
                    "revenue":  float(row["revenue"] or 0),
                    "bookings": row["bookings"],
                }
                for row in daily
            ],
        }

    # ── Occupancy Report ──────────────────────────────────────────────────────

    @staticmethod
    def occupancy_report(start: date, end: date) -> dict:
        """
        Room utilization rates.
        For each room, counts the number of nights occupied in the period.
        """
        total_rooms   = Room.objects.filter(is_active=True).count()
        total_days    = (end - start).days + 1
        total_room_nights = total_rooms * total_days

        # Bookings that overlap with the period
        overlapping = Booking.objects.filter(
            status__in=[
                BookingStatus.CONFIRMED,
                BookingStatus.CHECKED_IN,
                BookingStatus.CHECKED_OUT,
            ],
            check_in__lte=end,
            check_out__gte=start,
        )

        # Calculate occupied nights (clipped to the period)
        occupied_nights = 0
        for b in overlapping:
            actual_start = max(b.check_in, start)
            actual_end   = min(b.check_out, end)
            occupied_nights += (actual_end - actual_start).days

        occupancy_rate = (
            round(occupied_nights / total_room_nights * 100, 2)
            if total_room_nights > 0
            else 0.0
        )

        # By room type
        from rooms.models import RoomType
        by_type = []
        for rt_key, rt_label in RoomType.choices:
            rooms_of_type = Room.objects.filter(room_type=rt_key, is_active=True)
            count = rooms_of_type.count()
            if count == 0:
                continue
            booked = overlapping.filter(room__room_type=rt_key)
            type_nights = 0
            for b in booked:
                actual_start = max(b.check_in, start)
                actual_end   = min(b.check_out, end)
                type_nights += (actual_end - actual_start).days
            max_nights = count * total_days
            by_type.append({
                "room_type":       rt_key,
                "room_type_label": rt_label,
                "room_count":      count,
                "occupied_nights": type_nights,
                "max_nights":      max_nights,
                "occupancy_rate":  round(type_nights / max_nights * 100, 2) if max_nights else 0,
            })

        return {
            "summary": {
                "total_rooms":      total_rooms,
                "total_days":       total_days,
                "total_room_nights": total_room_nights,
                "occupied_nights":  occupied_nights,
                "occupancy_rate":   occupancy_rate,
            },
            "rows": by_type,
        }

    # ── Guest Report ──────────────────────────────────────────────────────────

    @staticmethod
    def guest_report(start: date, end: date) -> dict:
        """
        Guest analytics: new vs returning guests, avg stay, time-series trend.
        Field names match what the frontend GuestAnalytics.jsx expects:
          summary.new_guests, summary.returning_guests, summary.avg_stay_nights
          rows[].new_guests, rows[].returning_guests (time-series)
        """
        from django.db.models.functions import TruncDate

        new_users = User.objects.filter(
            date_joined__date__gte=start,
            date_joined__date__lte=end,
            is_staff=False,
        ).count()

        # Returning guests = users who booked in this period AND had a previous booking
        period_bookings = Booking.objects.filter(
            created_at__date__gte=start,
            created_at__date__lte=end,
        )

        unique_users_in_period = set(
            period_bookings.filter(user__isnull=False)
            .values_list("user_id", flat=True)
        )
        returning_count = 0
        for uid in unique_users_in_period:
            prior = Booking.objects.filter(
                user_id=uid, created_at__date__lt=start,
            ).exists()
            if prior:
                returning_count += 1
        new_guest_count = len(unique_users_in_period) - returning_count

        # Average stay duration (nights) for bookings in this period
        from django.db.models import DurationField, ExpressionWrapper
        stays = list(
            period_bookings
            .annotate(
                stay_duration=ExpressionWrapper(
                    F("check_out") - F("check_in"),
                    output_field=DurationField(),
                )
            )
            .values_list("stay_duration", flat=True)
        )
        total_nights = sum((d.days for d in stays if d and hasattr(d, 'days')), 0)
        avg_stay = round(total_nights / len(stays), 1) if stays else 0

        # Time-series: daily new registrations vs returning bookers
        # New registrations by day
        new_by_day = dict(
            User.objects.filter(
                date_joined__date__gte=start,
                date_joined__date__lte=end,
                is_staff=False,
            )
            .annotate(day=TruncDate("date_joined"))
            .values("day")
            .annotate(count=Count("id"))
            .values_list("day", "count")
        )

        # Returning bookers by day (bookings by users who have prior bookings)
        returning_by_day = {}
        returning_bookings = (
            period_bookings.filter(user__isnull=False)
            .annotate(day=TruncDate("created_at"))
            .values("day", "user_id")
        )
        for entry in returning_bookings:
            uid = entry["user_id"]
            day = entry["day"]
            prior = Booking.objects.filter(
                user_id=uid, created_at__date__lt=start,
            ).exists()
            if prior:
                returning_by_day[day] = returning_by_day.get(day, 0) + 1

        # Build sorted date list
        all_days = sorted(set(list(new_by_day.keys()) + list(returning_by_day.keys())))
        rows = [
            {
                "date":             str(day),
                "new_guests":       new_by_day.get(day, 0),
                "returning_guests": returning_by_day.get(day, 0),
            }
            for day in all_days
        ]

        return {
            "summary": {
                "new_guests":       new_guest_count,
                "returning_guests": returning_count,
                "avg_stay_nights":  avg_stay,
                "new_registrations": new_users,
                "walk_in_bookings":  period_bookings.filter(user__isnull=True).count(),
                "registered_bookings": period_bookings.filter(user__isnull=False).count(),
            },
            "rows": rows,
        }

    # ── Staff Performance Report ──────────────────────────────────────────────

    @staticmethod
    def staff_performance_report(start: date, end: date) -> dict:
        """
        Per-staff task completion counts and check-ins handled.
        """
        from .models import StaffProfile, StaffActivityLog, CleaningTask, MaintenanceTask

        # Check-ins handled
        checkins = (
            StaffActivityLog.objects.filter(
                action_type="check_in_guest",
                created_at__date__gte=start,
                created_at__date__lte=end,
            )
            .values("staff__id", "staff__user__email")
            .annotate(count=Count("id"))
        )

        # Cleaning tasks completed
        cleaning = (
            CleaningTask.objects.filter(
                status="clean",
                completed_at__date__gte=start,
                completed_at__date__lte=end,
            )
            .values("assigned_to__id", "assigned_to__user__email")
            .annotate(count=Count("id"))
        )

        # Maintenance tasks completed
        maintenance = (
            MaintenanceTask.objects.filter(
                status="completed",
                completed_at__date__gte=start,
                completed_at__date__lte=end,
            )
            .values("assigned_to__id", "assigned_to__user__email")
            .annotate(count=Count("id"))
        )

        # Combine into a dict keyed by staff email
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

        return {
            "summary": {
                "period_start":        str(start),
                "period_end":          str(end),
                "total_check_ins":     sum(r["check_ins"]   for r in rows),
                "total_cleaning_done": sum(r["cleaning"]    for r in rows),
                "total_maintenance_done": sum(r["maintenance"] for r in rows),
            },
            "rows": rows,
        }