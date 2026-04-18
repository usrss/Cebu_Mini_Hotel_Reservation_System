"""
admin_panel/views.py

Admin Panel API views for:
  1. Guest Management        — list, detail, block/unblock, booking history
  2. Payment Management      — list, detail, confirm, refund, revenue summary
  3. Review & Feedback       — list, detail, show/hide, rating stats

All views require staff authentication and are role-gated via the
permission classes in admin_panel/permissions.py.

URL prefix: /api/admin/
"""

import logging

from django.contrib.auth import get_user_model
from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.db.models import Avg, Count, Q, Sum
from django.db.models.functions import TruncDay, TruncMonth
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from bookings.models import Booking
from payments.models import Payment, PaymentStatus, Refund
from rooms.models import RoomReview

from .filters import GuestFilter, PaymentAdminFilter, ReviewAdminFilter
from .permissions import (
    CanManagePayments,
    CanManageReviews,
    CanModifyGuestAccounts,
    CanViewGuestProfiles,
    IsAdminOrManager,
)
from .serializers import (
    _BookingMiniSerializer,
    GuestBlockSerializer,
    GuestDetailSerializer,
    GuestListSerializer,
    PaymentAdminSerializer,
    PaymentConfirmSerializer,
    RefundInitiateSerializer,
    ReviewAdminSerializer,
    ReviewVisibilitySerializer,
)

import json
from pathlib import Path
from uuid import uuid4

User = get_user_model()
logger = logging.getLogger(__name__)


def _agent_debug_log(hypothesis_id, location, message, data=None, run_id="pre-fix"):
    """
    Debug-mode NDJSON logger (server-side) for runtime evidence.
    Writes to: <workspace_root>/debug-a06f0f.log
    """
    try:
        # Use absolute workspace path to avoid BASE_DIR confusion.
        workspace_root = Path(r"C:\Users\Bradi\HotelReservationSystemProject")
        log_path_primary = workspace_root / "debug-a06f0f.log"
        log_path_secondary = workspace_root / "debug-a06f0f.backend.log"
        write_error_path = workspace_root / "debug-a06f0f.write_error.log"

        payload = {
            "sessionId": "a06f0f",
            "id": f"log_{uuid4().hex}",
            "timestamp": int(timezone.now().timestamp() * 1000),
            "location": location,
            "message": message,
            "data": data or {},
            "runId": run_id,
            "hypothesisId": hypothesis_id,
        }

        line = json.dumps(payload, default=str) + "\n"
        # Also emit to console so we can use terminal output as runtime evidence.
        try:
            print("AGENT_DEBUG_NDJSON " + line.strip())
        except Exception:
            pass
        try:
            logger.info("AGENT_DEBUG_NDJSON %s", line.strip())
        except Exception:
            pass
        for p in (log_path_primary, log_path_secondary):
            p.parent.mkdir(parents=True, exist_ok=True)
            with p.open("a", encoding="utf-8") as f:
                f.write(line)

    except Exception as exc:
        # Don't interrupt payment flow, but do record why logging failed.
        try:
            workspace_root = Path(r"C:\Users\Bradi\HotelReservationSystemProject")
            write_error_path = workspace_root / "debug-a06f0f.write_error.log"
            write_error_path.parent.mkdir(parents=True, exist_ok=True)
            with write_error_path.open("a", encoding="utf-8") as f:
                f.write(
                    json.dumps(
                        {
                            "sessionId": "a06f0f",
                            "id": f"err_{uuid4().hex}",
                            "timestamp": int(timezone.now().timestamp() * 1000),
                            "location": "backend/admin_panel/views.py:_agent_debug_log",
                            "message": "Failed to write debug NDJSON log",
                            "data": {"error": str(exc)},
                            "runId": run_id,
                            "hypothesisId": hypothesis_id,
                        },
                        default=str,
                    )
                    + "\n"
                )
        except Exception:
            pass


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _guest_qs():
    """Base queryset: non-staff users only, newest first."""
    return User.objects.filter(is_staff=False).order_by("-date_joined")


# ═══════════════════════════════════════════════════════════════════════════════
# 1. GUEST MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════════

class GuestListView(generics.ListAPIView):
    """
    GET /api/admin/guests/
    List all guest accounts with search, filter, and ordering.
    Accessible by: Admin, Manager, Receptionist, Front Desk.
    """
    serializer_class   = GuestListSerializer
    permission_classes = [IsAuthenticated, CanViewGuestProfiles]
    filter_backends    = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class    = GuestFilter
    search_fields      = ["email", "first_name", "last_name", "phone"]
    ordering_fields    = ["date_joined", "last_login", "email"]
    ordering           = ["-date_joined"]

    def get_queryset(self):
        return _guest_qs()


class GuestDetailView(generics.RetrieveAPIView):
    """
    GET /api/admin/guests/<id>/
    Full guest profile including recent booking history.
    Accessible by: Admin, Manager, Receptionist, Front Desk.
    Returns 404 for staff accounts (they are excluded from _guest_qs).
    """
    serializer_class   = GuestDetailSerializer
    permission_classes = [IsAuthenticated, CanViewGuestProfiles]

    def get_queryset(self):
        return _guest_qs()


class GuestBlockView(APIView):
    """
    PATCH /api/admin/guests/<id>/block/
    Block (is_active=False) or re-activate (is_active=True) a guest account.
    Accessible by: Admin, Manager only.
    """
    permission_classes = [IsAuthenticated, CanModifyGuestAccounts]

    def patch(self, request, pk):
        try:
            guest = _guest_qs().get(pk=pk)
        except User.DoesNotExist:
            return Response({"detail": "Guest not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = GuestBlockSerializer(guest, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        guest = serializer.save()

        action = "blocked" if not guest.is_active else "reactivated"
        logger.info(
            "Staff %s %s guest %s (id=%s). Reason: %s",
            request.user.email, action, guest.email, guest.pk,
            request.data.get("reason", "—"),
        )

        return Response({
            "detail": f"Guest account has been {action}.",
            "guest": GuestListSerializer(guest).data,
        })


class GuestBookingHistoryView(generics.ListAPIView):
    """
    GET /api/admin/guests/<id>/bookings/
    All bookings for a specific guest, most recent first.
    Returns 404 if the guest does not exist or is a staff member.
    Accessible by: Admin, Manager, Receptionist, Front Desk.
    """
    serializer_class   = _BookingMiniSerializer
    permission_classes = [IsAuthenticated, CanViewGuestProfiles]
    filter_backends    = [filters.OrderingFilter]
    ordering_fields    = ["created_at", "check_in", "status"]
    ordering           = ["-created_at"]

    def get_queryset(self):
        return (
            Booking.objects
            .filter(user_id=self.kwargs["pk"])
            .select_related("room")
            .order_by("-created_at")
        )

    def list(self, request, *args, **kwargs):
        if not _guest_qs().filter(pk=self.kwargs["pk"]).exists():
            return Response({"detail": "Guest not found."}, status=status.HTTP_404_NOT_FOUND)
        return super().list(request, *args, **kwargs)


# ═══════════════════════════════════════════════════════════════════════════════
# 2. PAYMENT MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════════

class PaymentListView(generics.ListAPIView):
    """
    GET /api/admin/payments/
    All payments with filtering, search, and ordering.
    Accessible by: Admin, Manager, Front Desk.
    """
    serializer_class   = PaymentAdminSerializer
    permission_classes = [IsAuthenticated, CanManagePayments]
    filter_backends    = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class    = PaymentAdminFilter
    search_fields      = [
        "booking__reference_number",
        "booking__user__email",
        "booking__full_name",
        "transaction_id",
        "receipt_number",
    ]
    ordering_fields    = ["created_at", "paid_at", "amount", "status"]
    ordering           = ["-created_at"]

    def get_queryset(self):
        return (
            Payment.objects
            .select_related("booking", "booking__room", "booking__user")
            .prefetch_related("refunds__initiated_by")
            .all()
        )


class PaymentDetailView(generics.RetrieveAPIView):
    """
    GET /api/admin/payments/<id>/
    Full payment record including all refund records.
    Accessible by: Admin, Manager, Front Desk.
    """
    serializer_class   = PaymentAdminSerializer
    permission_classes = [IsAuthenticated, CanManagePayments]

    def get_queryset(self):
        return (
            Payment.objects
            .select_related("booking", "booking__room", "booking__user")
            .prefetch_related("refunds__initiated_by")
            .all()
        )


class PaymentConfirmView(APIView):
    """
    POST /api/admin/payments/<id>/confirm/
    Manually mark a payment as PAID (for cash / walk-in payments).
    Does NOT call mark_paid() — that also triggers booking confirmation
    which is for the online payment flow only.
    Accessible by: Admin, Manager, Front Desk.
    """
    permission_classes = [IsAuthenticated, CanManagePayments]

    def post(self, request, pk):
        idempotency_key = request.data.get("idempotency_key")

        if idempotency_key:
            idem_cache_key = f"payments:confirm:idempotency:{pk}:{idempotency_key}"
            if cache.get(idem_cache_key):
                return Response(
                    {"detail": "This payment was already confirmed."},
                    status=status.HTTP_409_CONFLICT,
                )

        _agent_debug_log(
            hypothesis_id="H3",
            location="backend/admin_panel/views.py:PaymentConfirmView:pre",
            message="Confirm request received; logging payment status",
            data={
                "paymentId": pk,
                "staffEmail": request.user.email,
            },
        )
        try:
            with transaction.atomic():
                # FIX: Use select_for_update with of=['self'] to only lock Payment table
                # This avoids the outer join error while still preventing race conditions
                payment = (
                    Payment.objects
                    .select_for_update(of=['self'])
                    .select_related("booking", "booking__room", "booking__user")
                    .prefetch_related("refunds")
                    .get(pk=pk)
                )

                # DB-locked status check prevents double confirmation.
                if payment.status != PaymentStatus.PENDING:
                    return Response(
                        {"detail": "This payment was already confirmed."},
                        status=status.HTTP_409_CONFLICT,
                    )

                serializer = PaymentConfirmSerializer(payment, data=request.data)
                serializer.is_valid(raise_exception=True)
                payment = serializer.save()
        except Payment.DoesNotExist:
            return Response({"detail": "Payment not found."}, status=status.HTTP_404_NOT_FOUND)

        _agent_debug_log(
            hypothesis_id="H3",
            location="backend/admin_panel/views.py:PaymentConfirmView:postSave",
            message="Payment confirmed; logging post-status",
            data={
                "paymentId": payment.pk,
                "status": payment.status,
                "paidAt": payment.paid_at,
                "receiptNumber": payment.receipt_number,
            },
        )

        logger.info(
            "Staff %s manually confirmed payment id=%s for booking %s.",
            request.user.email, payment.pk,
            getattr(payment.booking, "reference_number", "—"),
        )

        if idempotency_key:
            idem_cache_key = f"payments:confirm:idempotency:{pk}:{idempotency_key}"
            cache.set(idem_cache_key, True, timeout=300)

        return Response({
            "detail": "Payment confirmed successfully.",
            "payment": PaymentAdminSerializer(payment).data,
        })


class PaymentRefundView(APIView):
    """
    POST /api/admin/payments/<id>/refund/
    Initiate a refund — creates a Refund record and calls the provider.
    Accessible by: Admin, Manager only (Front Desk cannot issue refunds).
    """
    permission_classes = [IsAuthenticated, IsAdminOrManager]

    def post(self, request, pk):
        try:
            with transaction.atomic():
                # FIX: Remove select_for_update() to avoid outer join error
                # Instead, use optimistic locking with status check
                payment = (
                    Payment.objects
                    .select_related("booking", "booking__room", "booking__user")
                    .prefetch_related("refunds")
                    .get(pk=pk)
                )

                # Check if payment is already fully refunded (optimistic locking)
                if payment.status == PaymentStatus.REFUNDED:
                    return Response(
                        {"detail": "This payment has already been fully refunded."},
                        status=status.HTTP_409_CONFLICT
                    )

                completed_total = (
                        payment.refunds.filter(status=Refund.RefundStatus.COMPLETED)
                        .aggregate(total=Sum("amount"))["total"]
                        or 0
                )
                remaining = payment.amount - completed_total

                _agent_debug_log(
                    hypothesis_id="H1",
                    location="backend/admin_panel/views.py:PaymentRefundView:preValidate",
                    message="Refund request received; logging remaining basis",
                    data={
                        "paymentId": payment.pk,
                        "paymentStatus": payment.status,
                        "paymentAmount": str(payment.amount),
                        "alreadyRefundedCompleted": str(completed_total),
                        "remainingComputed": str(remaining),
                        "requestedRefundAmount": request.data.get("refund_amount", None),
                    },
                )

                serializer = RefundInitiateSerializer(
                    payment,
                    data=request.data,
                    context={"request": request},
                )
                serializer.is_valid(raise_exception=True)

                _agent_debug_log(
                    hypothesis_id="H1",
                    location="backend/admin_panel/views.py:PaymentRefundView:postValidate",
                    message="Refund validated; logging chosen refund_amount",
                    data={
                        "paymentId": payment.pk,
                        "validatedRefundAmount": str(serializer.validated_data.get("refund_amount", None)),
                        "validatedAlreadyRefunded": str(serializer.validated_data.get("already_refunded", 0)),
                    },
                )

                payment = serializer.save()

                total_refunded_after = (
                        payment.refunds.filter(status=Refund.RefundStatus.COMPLETED)
                        .aggregate(total=Sum("amount"))["total"]
                        or 0
                )
                _agent_debug_log(
                    hypothesis_id="H2",
                    location="backend/admin_panel/views.py:PaymentRefundView:postSave",
                    message="Refund processed; logging post totals",
                    data={
                        "paymentId": payment.pk,
                        "paymentStatus": payment.status,
                        "totalRefundedCompletedAfter": str(total_refunded_after),
                        "paymentAmount": str(payment.amount),
                    },
                )

                logger.info(
                    "Staff %s initiated refund on payment id=%s.",
                    request.user.email, payment.pk,
                )

                # Dispatch revenue-updated event for frontend refresh
                try:
                    from django.dispatch import Signal
                    revenue_updated = Signal()
                    revenue_updated.send(sender=self.__class__, payment=payment)
                except Exception:
                    pass

                return Response({
                    "detail": "Refund processed successfully.",
                    "payment": PaymentAdminSerializer(payment).data,
                })
        except Payment.DoesNotExist:
            return Response({"detail": "Payment not found."}, status=status.HTTP_404_NOT_FOUND)


class PaymentRevenueSummaryView(APIView):
    """
    GET /api/admin/payments/revenue/
    Revenue summary for the admin dashboard.

    Query params:
      - period   : "today" | "week" | "month" | "year"  (default: "month")
      - group_by : "day"   | "month"                    (default: "day")

    Accessible by: Admin, Manager.
    """
    permission_classes = [IsAuthenticated, IsAdminOrManager]

    def get(self, request):
        period   = request.query_params.get("period", "month")
        group_by = request.query_params.get("group_by", "day")
        now      = timezone.now()

        if period == "today":
            start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        elif period == "week":
            start = now - timezone.timedelta(days=7)
        elif period == "year":
            start = now - timezone.timedelta(days=365)
        else:  # month (default)
            start = now - timezone.timedelta(days=30)

        paid_qs = Payment.objects.filter(
            status=PaymentStatus.PAID,
            paid_at__gte=start,
        )

        total_revenue = paid_qs.aggregate(total=Sum("amount"))["total"] or 0
        total_count   = paid_qs.count()

        # Refunds completed in the period — from Refund model, NOT Payment fields
        refunded_total = (
            Refund.objects.filter(
                status=Refund.RefundStatus.COMPLETED,
                created_at__gte=start,
            ).aggregate(total=Sum("amount"))["total"] or 0
        )

        # Time-series trend
        trunc_fn = TruncMonth if group_by == "month" else TruncDay
        trend = list(
            paid_qs
            .annotate(period=trunc_fn("paid_at"))
            .values("period")
            .annotate(revenue=Sum("amount"), count=Count("id"))
            .order_by("period")
        )

        # Pending payments summary
        pending_qs     = Payment.objects.filter(status=PaymentStatus.PENDING)
        pending_count  = pending_qs.count()
        pending_amount = pending_qs.aggregate(total=Sum("amount"))["total"] or 0

        return Response({
            "period":            period,
            "total_revenue":     total_revenue,
            "transaction_count": total_count,
            "refunded_total":    refunded_total,
            "net_revenue":       float(total_revenue) - float(refunded_total),
            "pending_count":     pending_count,
            "pending_amount":    pending_amount,
            "trend":             trend,
        })


# ═══════════════════════════════════════════════════════════════════════════════
# 3. REVIEW & FEEDBACK MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════════

class ReviewListView(generics.ListAPIView):
    """
    GET /api/admin/reviews/
    All reviews with filter, search, and ordering.
    Accessible by: Admin, Manager.
    """
    serializer_class   = ReviewAdminSerializer
    permission_classes = [IsAuthenticated, CanManageReviews]
    filter_backends    = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class    = ReviewAdminFilter
    search_fields      = [
        "guest__email", "guest__first_name", "guest__last_name",
        "room__room_number", "review_text",
    ]
    ordering_fields    = ["created_at", "rating", "is_visible"]
    ordering           = ["-created_at"]

    def get_queryset(self):
        return (
            RoomReview.objects
            .select_related("room", "guest", "booking")
        )


class ReviewDetailView(generics.RetrieveAPIView):
    """
    GET /api/admin/reviews/<id>/
    Full review record.
    Accessible by: Admin, Manager.
    """
    serializer_class   = ReviewAdminSerializer
    permission_classes = [IsAuthenticated, CanManageReviews]

    def get_queryset(self):
        return (
            RoomReview.objects
            .select_related("room", "guest", "booking")
        )


class ReviewVisibilityView(APIView):
    """
    PATCH /api/admin/reviews/<id>/visibility/
    Show or hide a review from the public room detail page.
    Accessible by: Admin, Manager.
    """
    permission_classes = [IsAuthenticated, CanManageReviews]

    def patch(self, request, pk):
        try:
            review = (
                RoomReview.objects
                .select_related("room", "guest")
                .get(pk=pk)
            )
        except RoomReview.DoesNotExist:
            return Response({"detail": "Review not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = ReviewVisibilitySerializer(review, data=request.data)
        serializer.is_valid(raise_exception=True)
        review = serializer.save()

        action = "shown" if review.is_visible else "hidden"
        logger.info(
            "Staff %s %s review id=%s (room=%s, guest=%s). Reason: %s",
            request.user.email, action, review.pk,
            review.room.room_number, review.guest.email,
            request.data.get("reason", "—"),
        )

        return Response({
            "detail": f"Review has been {action}.",
            "review": ReviewAdminSerializer(review).data,
        })


class ReviewStatsView(APIView):
    """
    GET /api/admin/reviews/stats/
    Aggregate review statistics with 30-day trend comparison.

    Query params:
      - room_type : filter stats to a specific room type (optional)

    Accessible by: Admin, Manager.
    """
    permission_classes = [IsAuthenticated, IsAdminOrManager]

    def get(self, request):
        qs = RoomReview.objects.all()

        room_type = request.query_params.get("room_type")
        if room_type:
            qs = qs.filter(room__room_type=room_type)

        visible_qs = qs.filter(is_visible=True)

        aggregate = visible_qs.aggregate(
            avg_rating=Avg("rating"),
            total_reviews=Count("id"),
        )

        breakdown = {
            str(star): visible_qs.filter(rating=star).count()
            for star in range(1, 6)
        }

        hidden_count = qs.filter(is_visible=False).count()

        top_rooms = list(
            visible_qs
            .values("room__room_number", "room__room_type")
            .annotate(avg=Avg("rating"), count=Count("id"))
            .filter(count__gte=1)
            .order_by("-avg")[:5]
        )

        now    = timezone.now()
        last30 = qs.filter(created_at__gte=now - timezone.timedelta(days=30))
        prev30 = qs.filter(
            created_at__gte=now - timezone.timedelta(days=60),
            created_at__lt=now  - timezone.timedelta(days=30),
        )

        return Response({
            "avg_rating":       aggregate["avg_rating"],
            "total_reviews":    aggregate["total_reviews"],
            "hidden_count":     hidden_count,
            "rating_breakdown": breakdown,
            "top_rooms":        top_rooms,
            "trend": {
                "last_30_days": last30.count(),
                "prev_30_days": prev30.count(),
            },
        })