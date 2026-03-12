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

        # Daily breakdown
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
              )
              .order_by("day")
        )

        return {
            "summary": {
                "total":       total,
                "confirmed":   confirmed,
                "checked_in":  checked_in,
                "checked_out": checked_out,
                "cancelled":   cancelled,
                "expired":     expired,
                "no_show":     no_show,
                "total_revenue": float(revenue),
            },
            "rows": [
                {
                    "date":         str(row["day"]),
                    "bookings":     row["count"],
                    "paid_revenue": float(row["paid_revenue"] or 0),
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
        New guest registrations and repeat/returning guests.
        """
        new_users = User.objects.filter(
            date_joined__date__gte=start,
            date_joined__date__lte=end,
            is_staff=False,
        ).count()

        # Guests with >1 confirmed booking ever (repeat guests)
        repeat_guests = (
            Booking.objects.filter(
                payment_status=PaymentStatus.PAID,
            )
            .values("user")
            .annotate(bookings=Count("id"))
            .filter(bookings__gt=1)
            .count()
        )

        # Bookings in period by unique user
        period_bookings = Booking.objects.filter(
            created_at__date__gte=start,
            created_at__date__lte=end,
        )
        walk_ins = period_bookings.filter(user__isnull=True).count()
        registered = period_bookings.filter(user__isnull=False).count()

        # Top guests by number of bookings in period
        top_guests = (
            period_bookings.filter(user__isnull=False)
            .values("user__email", "full_name")
            .annotate(bookings=Count("id"), spent=Sum("total_price"))
            .order_by("-bookings")[:10]
        )

        return {
            "summary": {
                "new_registrations": new_users,
                "repeat_guests":     repeat_guests,
                "walk_in_bookings":  walk_ins,
                "registered_bookings": registered,
            },
            "rows": [
                {
                    "email":    g["user__email"],
                    "name":     g["full_name"],
                    "bookings": g["bookings"],
                    "spent":    float(g["spent"] or 0),
                }
                for g in top_guests
            ],
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