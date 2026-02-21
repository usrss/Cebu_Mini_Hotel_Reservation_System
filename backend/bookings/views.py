from django.utils import timezone
from django.db import transaction
from rest_framework import generics, status, filters
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend

from rooms.permissions import IsStaffOrAdmin
from .models import Booking, BookingStatus, BookingStatusHistory, BLOCKING_STATUSES
from .serializers import (
    BookingListSerializer,
    BookingDetailSerializer,
    BookingCreateSerializer,
    BookingStatusUpdateSerializer,
    CheckInVerifySerializer,
    BookingCancelSerializer,
)
from .filters import BookingFilter


# ─── Public / Guest ───────────────────────────────────────────────────────────

class BookingCreateView(APIView):
    """
    POST /api/bookings/
    Creates a booking for authenticated users or anonymous guests.
    Price is always calculated server-side. Uses DB transaction + SELECT FOR UPDATE.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = BookingCreateSerializer(data=request.data, context={"request": request})
        if serializer.is_valid():
            booking = serializer.save()
            return Response(
                BookingDetailSerializer(booking).data,
                status=status.HTTP_201_CREATED,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class BookingLookupView(APIView):
    """
    GET /api/bookings/lookup/?reference=CMH-2026-000001
    Allows guests to retrieve their booking by reference number.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        ref = request.query_params.get("reference", "").strip()
        if not ref:
            return Response({"error": "reference query param is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            booking = Booking.objects.select_related("room").prefetch_related("status_history").get(
                reference_number=ref
            )
        except Booking.DoesNotExist:
            return Response({"error": "Booking not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(BookingDetailSerializer(booking).data)


# ─── Authenticated user: my bookings ─────────────────────────────────────────

class MyBookingListView(generics.ListAPIView):
    """
    GET /api/bookings/my/
    Returns all bookings belonging to the authenticated user.
    """
    serializer_class   = BookingListSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            Booking.objects
            .filter(user=self.request.user)
            .select_related("room")
            .order_by("-created_at")
        )


class MyBookingDetailView(generics.RetrieveAPIView):
    """
    GET /api/bookings/my/<id>/
    Single booking detail for the authenticated user.
    """
    serializer_class   = BookingDetailSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            Booking.objects
            .filter(user=self.request.user)
            .select_related("room")
            .prefetch_related("status_history")
        )


class MyBookingCancelView(APIView):
    """
    POST /api/bookings/my/<id>/cancel/
    User cancels their own booking. Refund calculated automatically.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            booking = Booking.objects.get(pk=pk, user=request.user)
        except Booking.DoesNotExist:
            return Response({"error": "Booking not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = BookingCancelSerializer(
            data=request.data,
            context={"booking": booking, "request": request},
        )
        if serializer.is_valid():
            booking = serializer.save()
            return Response(BookingDetailSerializer(booking).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ─── Reception / Staff ────────────────────────────────────────────────────────

class ReceptionBookingListView(generics.ListAPIView):
    """
    GET /api/bookings/admin/
    All bookings. Filterable by status, dates, room, guest name/email.
    Searchable by reference_number, full_name, email.
    """
    serializer_class   = BookingListSerializer
    permission_classes = [IsStaffOrAdmin]
    filter_backends    = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class    = BookingFilter
    search_fields      = ["reference_number", "full_name", "email"]
    ordering_fields    = ["created_at", "check_in", "total_price"]
    ordering           = ["-created_at"]

    def get_queryset(self):
        return Booking.objects.select_related("room").all()


class ReceptionBookingDetailView(generics.RetrieveAPIView):
    """
    GET /api/bookings/admin/<id>/
    Full booking detail including status history.
    """
    serializer_class   = BookingDetailSerializer
    permission_classes = [IsStaffOrAdmin]
    queryset           = (
        Booking.objects
        .select_related("room")
        .prefetch_related("status_history__changed_by")
    )


class ReceptionBookingStatusView(APIView):
    """
    PATCH /api/bookings/admin/<id>/status/
    Staff: manually transition a booking's status.
    Body: { "status": "confirmed", "note": "optional note" }
    """
    permission_classes = [IsStaffOrAdmin]

    def patch(self, request, pk):
        try:
            booking = Booking.objects.get(pk=pk)
        except Booking.DoesNotExist:
            return Response({"error": "Booking not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = BookingStatusUpdateSerializer(
            data=request.data,
            context={"booking": booking, "request": request},
        )
        if serializer.is_valid():
            booking = serializer.save()
            return Response(BookingDetailSerializer(booking).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ReceptionCheckInVerifyView(APIView):
    """
    POST /api/bookings/admin/check-in/verify/
    Reception verifies reference + PIN then marks booking CHECKED_IN.
    Body: { "reference_number": "CMH-2026-000001", "checkin_pin": "4821" }
    """
    permission_classes = [IsStaffOrAdmin]

    def post(self, request):
        serializer = CheckInVerifySerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        booking = serializer.validated_data["booking"]

        with transaction.atomic():
            booking = booking.transition_to(
                BookingStatus.CHECKED_IN,
                changed_by = request.user,
                note       = "Checked in at reception desk (PIN verified).",
            )

        return Response(BookingDetailSerializer(booking).data)


class ReceptionCancelBookingView(APIView):
    """
    POST /api/bookings/admin/<id>/cancel/
    Staff cancels a booking with optional reason.
    """
    permission_classes = [IsStaffOrAdmin]

    def post(self, request, pk):
        try:
            booking = Booking.objects.get(pk=pk)
        except Booking.DoesNotExist:
            return Response({"error": "Booking not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = BookingCancelSerializer(
            data=request.data,
            context={"booking": booking, "request": request},
        )
        if serializer.is_valid():
            booking = serializer.save()
            return Response(BookingDetailSerializer(booking).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ─── Booking expiration ───────────────────────────────────────────────────────

class ExpireBookingsView(APIView):
    """
    POST /api/bookings/admin/expire/
    Cancels all AWAITING_PAYMENT / PENDING bookings older than 30 minutes.
    Intended to be called by Celery beat or a cron job.
    """
    permission_classes = [IsStaffOrAdmin]

    def post(self, request):
        count = expire_unpaid_bookings()
        return Response({"expired": count})


# ─── Utility (also callable from management command / Celery task) ─────────────

def expire_unpaid_bookings():
    """
    Cancels unpaid bookings that have exceeded the 30-minute payment window.
    Safe to call from management commands, Celery tasks, or the API view above.
    """
    from datetime import timedelta

    cutoff = timezone.now() - timedelta(minutes=30)

    with transaction.atomic():
        expired = Booking.objects.filter(
            status__in=[BookingStatus.AWAITING_PAYMENT, BookingStatus.PENDING],
            created_at__lt=cutoff,
        )
        ids = list(expired.values_list("id", flat=True))

        expired.update(
            status              = BookingStatus.CANCELLED,
            cancelled_at        = timezone.now(),
            cancellation_reason = "Auto-cancelled: payment not received within 30 minutes.",
        )

        BookingStatusHistory.objects.bulk_create([
            BookingStatusHistory(
                booking_id = bid,
                old_status = BookingStatus.AWAITING_PAYMENT,
                new_status = BookingStatus.CANCELLED,
                note       = "Payment timeout — auto-cancelled by system.",
            )
            for bid in ids
        ])

    return len(ids)