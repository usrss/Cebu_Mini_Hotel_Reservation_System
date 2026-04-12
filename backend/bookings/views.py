# bookings/views.py
from decimal import Decimal
from django.utils import timezone
from django.db import transaction
from django.db.models import Sum
from rest_framework import generics, status, filters
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend

from rooms.permissions import IsStaffOrAdmin
from bookings.permissions import (
    CanViewAllBookings,
    CanConfirmCancelBookings,
    CanHandleCheckInOut,
    IsAdminOnlyBooking,
)
from .models import Booking, BookingStatus, BookingStatusHistory, BLOCKING_STATUSES
from .serializers import (
    BookingListSerializer,
    BookingDetailSerializer,
    BookingCreateSerializer,
    BookingConfirmSerializer,
    BookingStatusUpdateSerializer,
    CheckInVerifySerializer,
    BookingCancelSerializer,
)
from .filters import BookingFilter
from .permissions import IsOwnerOrStaff


# ─── Public / Guest ───────────────────────────────────────────────────────────

class BookingCreateView(APIView):
    """
    POST /api/bookings/

    Phase 1 — Creates a PENDING_PAYMENT booking.
    - Checks room availability and locks it for PAYMENT_WINDOW_MINUTES.
    - Does NOT generate reference_number, QR code, or checkin_pin.
    - Returns booking id + total_price + payment_deadline for the payment UI.

    Phase 2 (CONFIRMED) happens via BookingConfirmView after payment succeeds.
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

    Guests can retrieve their confirmed booking by reference number.
    reference_number only exists on CONFIRMED (and beyond) bookings, so
    this endpoint naturally cannot expose PENDING_PAYMENT bookings.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        ref = request.query_params.get("reference", "").strip()
        if not ref:
            return Response(
                {"error": "reference query param is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            booking = (
                Booking.objects
                .select_related("room")
                .prefetch_related("status_history")
                .get(reference_number=ref)
            )
        except Booking.DoesNotExist:
            return Response({"error": "Booking not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(BookingDetailSerializer(booking).data)


# ─── Payment confirmation (Phase 2) ──────────────────────────────────────────

class BookingConfirmView(APIView):
    """
    POST /api/bookings/<id>/confirm/

    Called ONLY by the payments app (or a payment webhook handler) after
    verifying a successful payment. Transitions PENDING_PAYMENT → CONFIRMED
    and generates the reference_number, QR code, and checkin_pin.
    """
    permission_classes = [CanConfirmCancelBookings]

    def post(self, request, pk):
        try:
            booking = Booking.objects.get(pk=pk)
        except Booking.DoesNotExist:
            return Response({"error": "Booking not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = BookingConfirmSerializer(
            data={},
            context={"booking": booking, "request": request},
        )
        if serializer.is_valid():
            booking = serializer.save()
            return Response(BookingDetailSerializer(booking).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ─── Authenticated user: my bookings ─────────────────────────────────────────

class MyBookingListView(generics.ListAPIView):
    """GET /api/bookings/my/ — Returns all bookings for the authenticated user."""
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
    """GET /api/bookings/my/<id>/ — Single booking detail for the authenticated user."""
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
    """POST /api/bookings/my/<id>/cancel/ — User cancels their own booking."""
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


# ─── Guest active booking check (food order gate) ────────────────────────────

class MyActiveBookingView(APIView):
    """
    GET /api/bookings/my-active/

    Used by FoodAndDrinks.jsx to verify the guest is currently checked in
    before allowing food orders. Returns the active CHECKED_IN booking or 404.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        booking = (
            Booking.objects
            .filter(user=request.user, status=BookingStatus.CHECKED_IN)
            .select_related("room")
            .order_by("-check_in")
            .first()
        )
        if not booking:
            return Response(
                {"error": "No active booking found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response({
            "booking": {
                "id":          booking.id,
                "status":      booking.status,
                "room_number": booking.room.room_number if booking.room else None,
                "check_in":    str(booking.check_in),
                "check_out":   str(booking.check_out),
                "reference":   booking.reference_number,
            }
        })


# ─── Reception / Staff ────────────────────────────────────────────────────────

class ReceptionBookingListView(generics.ListAPIView):
    """GET /api/bookings/admin/ — All bookings, filterable."""
    serializer_class   = BookingListSerializer
    permission_classes = [CanViewAllBookings]
    filter_backends    = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class    = BookingFilter
    search_fields      = ["reference_number", "full_name", "email"]
    ordering_fields    = ["created_at", "check_in", "total_price"]
    ordering           = ["-created_at"]

    def get_queryset(self):
        return Booking.objects.select_related("room").all()


class ReceptionBookingDetailView(generics.RetrieveAPIView):
    """GET /api/bookings/admin/<id>/ — Full booking detail including status history."""
    serializer_class   = BookingDetailSerializer
    permission_classes = [CanViewAllBookings]
    queryset           = (
        Booking.objects
        .select_related("room")
        .prefetch_related("status_history__changed_by")
    )


class ReceptionBookingStatusView(APIView):
    """PATCH /api/bookings/admin/<id>/status/ — Manually transition a booking's status."""
    permission_classes = [CanConfirmCancelBookings]

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
    """POST /api/bookings/admin/check-in/verify/ — Verify reference + PIN → CHECKED_IN."""
    permission_classes = [CanHandleCheckInOut]

    def post(self, request):
        serializer = CheckInVerifySerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        booking = serializer.validated_data["booking"]

        with transaction.atomic():
            booking = booking.transition_to(
                BookingStatus.CHECKED_IN,
                changed_by=request.user,
                note="Checked in at reception desk (PIN verified).",
            )

        return Response(BookingDetailSerializer(booking).data)


class ReceptionCancelBookingView(APIView):
    """POST /api/bookings/admin/<id>/cancel/ — Staff cancels a booking."""
    permission_classes = [CanConfirmCancelBookings]

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
    """POST /api/bookings/admin/expire/ — Auto-expire unpaid bookings."""
    permission_classes = [IsAdminOnlyBooking]

    def post(self, request):
        count = expire_unpaid_bookings()
        return Response({"expired": count})


def expire_unpaid_bookings():
    from datetime import timedelta

    cutoff = timezone.now() - timedelta(minutes=Booking.PAYMENT_WINDOW_MINUTES)

    with transaction.atomic():
        expired = Booking.objects.filter(
            status=BookingStatus.PENDING_PAYMENT,
            created_at__lt=cutoff,
        )
        ids = list(expired.values_list("id", flat=True))

        expired.update(
            status              = BookingStatus.EXPIRED,
            cancelled_at        = timezone.now(),
            cancellation_reason = (
                f"Auto-expired: payment not received within "
                f"{Booking.PAYMENT_WINDOW_MINUTES} minutes."
            ),
        )

        BookingStatusHistory.objects.bulk_create([
            BookingStatusHistory(
                booking_id = bid,
                old_status = BookingStatus.PENDING_PAYMENT,
                new_status = BookingStatus.EXPIRED,
                note       = (
                    f"Payment timeout — auto-expired by system after "
                    f"{Booking.PAYMENT_WINDOW_MINUTES} minutes. "
                    "No credentials were generated."
                ),
            )
            for bid in ids
        ])

    return len(ids)


# ─── Front Desk: PIN verify ───────────────────────────────────────────────────

class FrontDeskVerifyPinView(APIView):
    """POST /api/bookings/admin/<pk>/verify-pin/ — Validate PIN without status change."""
    permission_classes = [CanHandleCheckInOut]

    def post(self, request, pk):
        try:
            booking = Booking.objects.get(pk=pk)
        except Booking.DoesNotExist:
            return Response({"error": "Booking not found."}, status=status.HTTP_404_NOT_FOUND)

        if booking.status != BookingStatus.CONFIRMED:
            return Response(
                {"error": f"Booking cannot be checked in (status: {booking.status})."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not booking.has_credentials:
            return Response(
                {"error": "This booking has no valid check-in credentials."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        pin = str(request.data.get("pin", "")).strip()
        if not pin:
            return Response({"error": "PIN is required."}, status=status.HTTP_400_BAD_REQUEST)

        if booking.checkin_pin != pin:
            return Response(
                {"valid": False, "error": "Incorrect PIN. Please try again."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response({"valid": True})


# ─── Front Desk: Check-In ─────────────────────────────────────────────────────

class FrontDeskCheckInView(APIView):
    """POST /api/bookings/admin/<pk>/check-in/ — CONFIRMED → CHECKED_IN."""
    permission_classes = [CanHandleCheckInOut]

    def post(self, request, pk):
        try:
            booking = Booking.objects.select_related("room").get(pk=pk)
        except Booking.DoesNotExist:
            return Response({"error": "Booking not found."}, status=status.HTTP_404_NOT_FOUND)

        if booking.status != BookingStatus.CONFIRMED:
            return Response(
                {"error": f"Booking cannot be checked in (status: {booking.status})."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        method = request.data.get("method", "manual_entry")
        note   = f"Checked in at front desk via {method.replace('_', ' ')}."

        with transaction.atomic():
            booking = booking.transition_to(
                BookingStatus.CHECKED_IN,
                changed_by=request.user,
                note=note,
            )

        try:
            from staff.models import StaffActivityLog
            profile = getattr(request.user, "staff_profile", None)
            StaffActivityLog.objects.create(
                staff       = profile,
                action_type = "check_in_guest",
                description = (
                    f"[{method.replace('_', ' ').title()}] Guest '{booking.full_name}' "
                    f"checked in to Room {booking.room.room_number} "
                    f"(Booking {booking.reference_number})."
                ),
                booking_id = booking.pk,
                room_id    = booking.room_id,
                metadata   = {"method": method},
            )
        except Exception:
            pass

        return Response(BookingDetailSerializer(booking).data)


# ─── Front Desk: Collect Payment during Check-In ─────────────────────────────

class FrontDeskCollectPaymentView(APIView):
    """
    POST /api/bookings/admin/<pk>/collect-payment/
    Records remaining balance → transitions CONFIRMED → CHECKED_IN.
    Used during check-in only. For checkout balance see StaffCheckoutAndCollectView.
    """
    permission_classes = [CanHandleCheckInOut]

    def post(self, request, pk):
        try:
            booking = Booking.objects.select_related("room").get(pk=pk)
        except Booking.DoesNotExist:
            return Response({"error": "Booking not found."}, status=status.HTTP_404_NOT_FOUND)

        if booking.status != BookingStatus.CONFIRMED:
            return Response(
                {"error": f"Booking cannot be checked in (status: {booking.status})."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from payments.models import PaymentMethod as PM
        VALID_METHODS = [PM.CASH, PM.GCASH, PM.CARD, "other"]
        raw_method = request.data.get("payment_method", "").strip()
        if raw_method == "other":
            payment_method = PM.CASH
        elif raw_method in VALID_METHODS:
            payment_method = raw_method
        else:
            return Response(
                {"error": f"Invalid payment method '{raw_method}'. Valid: cash, gcash, card, other."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from payments.models import Payment, PaymentStatus as PStatus, PaymentType, PaymentProvider

        paid_total = (
            booking.payments.filter(status=PStatus.PAID)
            .aggregate(total=Sum("amount"))["total"]
        ) or Decimal("0.00")

        remaining = booking.total_price - paid_total

        if remaining <= 0:
            with transaction.atomic():
                booking = booking.transition_to(
                    BookingStatus.CHECKED_IN,
                    changed_by=request.user,
                    note="Checked in at front desk. Balance already cleared.",
                )
            return Response(BookingDetailSerializer(booking).data)

        with transaction.atomic():
            balance_payment = Payment.objects.create(
                booking        = booking,
                user           = booking.user,
                amount         = remaining,
                payment_type   = PaymentType.BALANCE_PAYMENT,
                provider       = PaymentProvider.MANUAL,
                payment_method = payment_method,
                status         = PStatus.PENDING,
            )
            balance_payment.mark_paid(
                transaction_id=f"DESK-{booking.reference_number}-BAL",
                payload={
                    "collected_by":   request.user.email,
                    "payment_method": raw_method,
                    "collected_at":   timezone.now().isoformat(),
                    "notes":          "Balance collected at front desk during check-in.",
                },
            )
            booking.refresh_from_db()
            booking = booking.transition_to(
                BookingStatus.CHECKED_IN,
                changed_by=request.user,
                note=f"Checked in. Remaining balance ₱{remaining} collected via {raw_method}.",
            )

        try:
            from staff.models import StaffActivityLog
            profile = getattr(request.user, "staff_profile", None)
            StaffActivityLog.objects.create(
                staff       = profile,
                action_type = "check_in_guest",
                description = (
                    f"Guest '{booking.full_name}' checked in to Room "
                    f"{booking.room.room_number} (Booking {booking.reference_number}). "
                    f"Remaining balance ₱{remaining} collected via {raw_method}."
                ),
                booking_id = booking.pk,
                room_id    = booking.room_id,
                metadata   = {"payment_method": raw_method, "amount_collected": str(remaining)},
            )
        except Exception:
            pass

        return Response(BookingDetailSerializer(booking).data)


# ─── Front Desk: Check-In With Outstanding Balance ───────────────────────────

class FrontDeskCheckInWithBalanceView(APIView):
    """
    POST /api/bookings/admin/<pk>/check-in-with-balance/
    Check in despite unpaid balance — payment deferred to during-stay or checkout.
    """
    permission_classes = [CanHandleCheckInOut]

    def post(self, request, pk):
        try:
            booking = Booking.objects.select_related("room").get(pk=pk)
        except Booking.DoesNotExist:
            return Response({"error": "Booking not found."}, status=status.HTTP_404_NOT_FOUND)

        if booking.status != BookingStatus.CONFIRMED:
            return Response(
                {"error": f"Booking cannot be checked in (status: {booking.status})."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from payments.models import PaymentStatus as PStatus

        paid_total = (
            booking.payments.filter(status=PStatus.PAID)
            .aggregate(total=Sum("amount"))["total"]
        ) or Decimal("0.00")

        remaining = booking.total_price - paid_total
        method    = request.data.get("method", "manual_entry")

        with transaction.atomic():
            booking = booking.transition_to(
                BookingStatus.CHECKED_IN,
                changed_by=request.user,
                note=(
                    f"Checked in with outstanding balance of ₱{remaining}. "
                    f"Method: {method.replace('_', ' ')}. "
                    "Payment to be settled during stay or at checkout."
                ),
            )

        try:
            from staff.models import StaffActivityLog
            profile = getattr(request.user, "staff_profile", None)
            StaffActivityLog.objects.create(
                staff       = profile,
                action_type = "check_in_guest",
                description = (
                    f"[{method.replace('_', ' ').title()}] Guest '{booking.full_name}' "
                    f"checked in to Room {booking.room.room_number} "
                    f"(Booking {booking.reference_number}) "
                    f"with outstanding balance of ₱{remaining}."
                ),
                booking_id = booking.pk,
                room_id    = booking.room_id,
                metadata   = {
                    "method":            method,
                    "remaining_balance": str(remaining),
                    "check_in_type":     "with_balance",
                },
            )
        except Exception:
            pass

        data = BookingDetailSerializer(booking).data
        data["remaining_balance"] = str(remaining)
        return Response(data)


# ─── Front Desk: Extend Stay ──────────────────────────────────────────────────

class StaffExtendBookingView(APIView):
    """
    POST /api/bookings/admin/<pk>/extend/
    Extends an active CHECKED_IN booking. Cash & card only.
    """
    permission_classes = [CanHandleCheckInOut]

    def post(self, request, pk):
        try:
            booking = Booking.objects.select_related("room").get(pk=pk)
        except Booking.DoesNotExist:
            return Response({"error": "Booking not found."}, status=status.HTTP_404_NOT_FOUND)

        if booking.status != BookingStatus.CHECKED_IN:
            return Response(
                {"error": (
                    f"Only CHECKED_IN bookings can be extended "
                    f"(current status: '{booking.status}')."
                )},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from payments.models import (
            Payment as PaymentModel,
            PaymentStatus as PStatus,
            PaymentType,
            PaymentProvider,
            PaymentMethod as PMethod,
        )
        from bookings.models import BookingModification, ModificationType, ModificationStatus

        raw_new_check_out = request.data.get("new_check_out", "").strip()
        raw_method        = request.data.get("payment_method", "").strip()
        note              = request.data.get("note", "").strip()

        if not raw_new_check_out:
            return Response(
                {"error": "new_check_out is required (YYYY-MM-DD)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if raw_method not in [PMethod.CASH, PMethod.CARD]:
            return Response(
                {"error": f"payment_method must be 'cash' or 'card'. Got: '{raw_method}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            from datetime import datetime
            new_check_out = datetime.strptime(raw_new_check_out, "%Y-%m-%d").date()
        except ValueError:
            return Response(
                {"error": "new_check_out must be in YYYY-MM-DD format."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        today = timezone.now().date()

        if new_check_out <= booking.check_out:
            return Response(
                {"error": (
                    f"new_check_out ({new_check_out}) must be after "
                    f"the current check-out ({booking.check_out})."
                )},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if today >= booking.check_out:
            return Response(
                {"error": "Cannot extend a stay that has already ended."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if (new_check_out - booking.check_in).days > 90:
            return Response(
                {"error": "Total stay cannot exceed 90 nights."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from bookings.serializers import check_overlapping_bookings
        from bookings.modification_serializers import _recalculate

        if check_overlapping_bookings(
            booking.room, booking.check_out, new_check_out, exclude_id=booking.pk
        ):
            return Response(
                {"error": "The room is not available for the requested extension dates."},
                status=status.HTTP_409_CONFLICT,
            )

        room       = booking.room
        price_data = _recalculate(room, booking.check_in, new_check_out)
        price_diff = (price_data["new_total"] - booking.total_price).quantize(Decimal("0.01"))

        if price_diff <= Decimal("0"):
            price_diff = Decimal("0")

        with transaction.atomic():
            room = room.__class__.objects.select_for_update().get(pk=room.pk)

            if check_overlapping_bookings(
                room, booking.check_out, new_check_out, exclude_id=booking.pk
            ):
                return Response(
                    {"error": "Room was just booked for those dates. Please try again."},
                    status=status.HTTP_409_CONFLICT,
                )

            mod = BookingModification.objects.create(
                booking                 = booking,
                requested_by            = request.user,
                modification_type       = ModificationType.EXTEND,
                status                  = ModificationStatus.AWAITING_PAYMENT,
                original_check_in       = booking.check_in,
                original_check_out      = booking.check_out,
                original_nights         = booking.nights,
                original_total          = booking.total_price,
                new_check_in            = booking.check_in,
                new_check_out           = new_check_out,
                new_nights              = price_data["nights"],
                new_room_price_snapshot = price_data["new_room_price_snapshot"],
                new_subtotal            = price_data["new_subtotal"],
                new_tax                 = price_data["new_tax"],
                new_service_fee         = price_data["new_service_fee"],
                new_total               = price_data["new_total"],
                price_difference        = price_diff,
                note                    = note or f"Extension by staff {request.user.email}.",
            )

            payment = PaymentModel.objects.create(
                booking        = booking,
                user           = request.user,
                amount         = price_diff if price_diff > 0 else Decimal("0.01"),
                payment_type   = PaymentType.MODIFICATION,
                provider       = PaymentProvider.MANUAL,
                payment_method = raw_method,
                status         = PStatus.PENDING,
            )

            payment.mark_paid_for_extension(
                modification   = mod,
                transaction_id = f"DESK-EXT-{booking.reference_number}-{payment.pk}",
                payload        = {
                    "extended_by":    request.user.email,
                    "payment_method": raw_method,
                    "extended_at":    timezone.now().isoformat(),
                    "note":           note,
                },
            )

        try:
            from staff.models import StaffActivityLog
            profile = getattr(request.user, "staff_profile", None)
            StaffActivityLog.objects.create(
                staff       = profile,
                action_type = "extend_booking",
                description = (
                    f"Extended booking {booking.reference_number} for "
                    f"'{booking.full_name}' — Room {booking.room.room_number}. "
                    f"New check-out: {new_check_out}. "
                    f"Additional charge: ₱{price_diff} via {raw_method}."
                ),
                booking_id = booking.pk,
                room_id    = booking.room_id,
                metadata   = {
                    "old_check_out":   str(mod.original_check_out),
                    "new_check_out":   str(new_check_out),
                    "price_diff":      str(price_diff),
                    "payment_method":  raw_method,
                    "modification_id": mod.pk,
                },
            )
        except Exception:
            pass

        booking.refresh_from_db()
        data = BookingDetailSerializer(booking).data
        data["extension_summary"] = {
            "modification_id":   mod.pk,
            "old_check_out":     str(mod.original_check_out),
            "new_check_out":     str(new_check_out),
            "additional_nights": price_data["nights"] - mod.original_nights,
            "additional_charge": str(price_diff),
            "payment_method":    raw_method,
            "receipt_number":    payment.receipt_number,
        }

        return Response(data, status=status.HTTP_200_OK)


# ─── Front Desk: Checkout + Collect (Option A) ────────────────────────────────

class StaffCheckoutAndCollectView(APIView):
    """
    POST /api/bookings/admin/<pk>/checkout/

    Replaces the old StaffCheckOutView. Single atomic endpoint that handles
    the complete guest checkout sequence in one DB transaction:

      1. Validates the booking is CHECKED_IN.
      2. Computes outstanding accommodation balance:
           remaining = max(total_price − sum(PAID payments), 0)
      3. If remaining > 0:
           a. Requires payment_method (cash | card) in the request body.
           b. Creates a BALANCE_PAYMENT Payment record (provider=manual).
           c. Calls payment.mark_paid() — creates a receipt, updates
              booking.payment_status to PAID — all inside the transaction.
      4. Transitions CHECKED_IN → CHECKED_OUT.
      5. Creates a ReviewToken and sends the review invitation email.
      6. Writes a StaffActivityLog entry.
      7. Returns BookingDetailSerializer data + checkout_summary.

    ── IMPORTANT: food order settlement ─────────────────────────────────────
    Food order balances (pay_checkout) are settled by GuestCheckoutPage.jsx
    BEFORE calling this endpoint, via individual PATCH /food/orders/<pk>/mark-paid/
    calls. This endpoint handles accommodation balance ONLY. Separation of
    concerns keeps each piece independently testable and rollback-safe.

    ── Why the old StaffCheckOutView was wrong ───────────────────────────────
    It never created a Payment record for outstanding balances. Staff could
    select "Cash", click confirm, and the money was silently lost — no Payment
    row, no receipt, no accounting trail. This view fixes that with atomicity:
    if the Payment creation or mark_paid() call fails for any reason, the
    booking stays CHECKED_IN and no partial state is written.

    Body:
      {
        "payment_method": "cash" | "card",   // required only when balance > 0
        "note":           "optional note"    // always optional
      }

    Returns: BookingDetailSerializer + checkout_summary {
      accommodation_balance_collected, payment_method, receipt_number, checked_out_at
    }

    Permission: CanHandleCheckInOut (front_desk, admin, manager)
    """
    permission_classes = [CanHandleCheckInOut]
    VALID_METHODS      = ("cash", "card")

    def post(self, request, pk):
        try:
            booking = Booking.objects.select_related("room").get(pk=pk)
        except Booking.DoesNotExist:
            return Response(
                {"error": "Booking not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # ── Guard ─────────────────────────────────────────────────────────────
        if booking.status != BookingStatus.CHECKED_IN:
            return Response(
                {
                    "error": (
                        f"Only CHECKED_IN bookings can be checked out "
                        f"(current status: '{booking.status}')."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        from payments.models import (
            Payment,
            PaymentStatus as PStatus,
            PaymentType,
            PaymentProvider,
            PaymentMethod as PMethod,
        )

        note       = request.data.get("note", "").strip()
        raw_method = request.data.get("payment_method", "").strip() or None

        # ── Compute outstanding accommodation balance ──────────────────────────
        paid_total = (
            booking.payments
            .filter(status=PStatus.PAID)
            .aggregate(total=Sum("amount"))["total"]
        ) or Decimal("0.00")

        remaining = max(booking.total_price - paid_total, Decimal("0.00"))

        # ── Validate payment method when balance is outstanding ───────────────
        if remaining > Decimal("0.00"):
            if not raw_method:
                return Response(
                    {
                        "error": (
                            "payment_method is required — "
                            f"there is an outstanding accommodation balance of ₱{remaining}."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if raw_method not in self.VALID_METHODS:
                return Response(
                    {
                        "error": (
                            f"Invalid payment_method '{raw_method}'. "
                            f"Accepted: {', '.join(self.VALID_METHODS)}."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        method_map     = {"cash": PMethod.CASH, "card": PMethod.CARD}
        payment_method = method_map.get(raw_method) if raw_method else None
        balance_payment = None

        # ── Single atomic transaction ─────────────────────────────────────────
        # If anything inside fails the booking stays CHECKED_IN.
        with transaction.atomic():

            # Step 1 — Collect outstanding accommodation balance
            if remaining > Decimal("0.00"):
                balance_payment = Payment.objects.create(
                    booking        = booking,
                    user           = booking.user,
                    amount         = remaining,
                    payment_type   = PaymentType.BALANCE_PAYMENT,
                    provider       = PaymentProvider.MANUAL,
                    payment_method = payment_method,
                    status         = PStatus.PENDING,
                )
                balance_payment.mark_paid(
                    transaction_id = f"CHECKOUT-{booking.reference_number}-BAL",
                    payload        = {
                        "collected_by":   request.user.email,
                        "payment_method": raw_method,
                        "collected_at":   timezone.now().isoformat(),
                        "context":        "Accommodation balance collected at checkout.",
                    },
                )
                # Refresh so booking.payment_status is current before transition
                booking.refresh_from_db()

            # Step 2 — Build checkout note
            note_parts = [p for p in [
                note,
                f"Accommodation balance ₱{remaining} collected via {raw_method}."
                    if remaining > Decimal("0.00") else "",
                f"Checked out by {request.user.email}.",
            ] if p]
            checkout_note = " ".join(note_parts)

            # Step 3 — Transition CHECKED_IN → CHECKED_OUT
            booking = booking.transition_to(
                BookingStatus.CHECKED_OUT,
                changed_by=request.user,
                note=checkout_note,
            )

            # Step 4 — ReviewToken (inside transaction = atomic with checkout)
            from rooms.models import ReviewToken
            token, created = ReviewToken.objects.get_or_create(booking=booking)

        # ── Post-transaction: review email (non-blocking) ─────────────────────
        if created:
            try:
                _send_review_invitation_email(booking, token)
            except Exception as exc:
                import logging
                logging.getLogger(__name__).warning(
                    "Review email failed for booking %s: %s",
                    booking.reference_number, exc,
                )

        # ── Activity log (non-blocking) ───────────────────────────────────────
        try:
            from staff.models import StaffActivityLog
            profile = getattr(request.user, "staff_profile", None)
            StaffActivityLog.objects.create(
                staff       = profile,
                action_type = "check_out_guest",
                description = (
                    f"Guest '{booking.full_name}' checked out from "
                    f"Room {booking.room.room_number} "
                    f"(Booking {booking.reference_number}). "
                    + (
                        f"Accommodation balance ₱{remaining} collected via {raw_method}."
                        if remaining > Decimal("0.00") else
                        "No outstanding accommodation balance."
                    )
                ),
                booking_id = booking.pk,
                room_id    = booking.room_id,
                metadata   = {
                    "accommodation_balance_collected": str(remaining),
                    "payment_method": raw_method or "none",
                    "receipt_number": (
                        balance_payment.receipt_number if balance_payment else None
                    ),
                },
            )
        except Exception:
            pass

        # ── Response ──────────────────────────────────────────────────────────
        data = BookingDetailSerializer(booking).data
        data["checkout_summary"] = {
            "accommodation_balance_collected": str(remaining),
            "payment_method":  raw_method or "none",
            "receipt_number":  (
                balance_payment.receipt_number if balance_payment else None
            ),
            "checked_out_at": timezone.now().isoformat(),
        }
        return Response(data, status=status.HTTP_200_OK)


# ─── Review invitation email helper ──────────────────────────────────────────

def _send_review_invitation_email(booking, token):
    from django.core.mail import send_mail
    from django.conf import settings as django_settings

    frontend_url = getattr(django_settings, "FRONTEND_URL", "http://localhost:5173")
    review_url   = f"{frontend_url}/review/{token.token}/"
    site_name    = getattr(django_settings, "SITE_NAME", "Cebu Mini Hotel")
    from_email   = getattr(django_settings, "DEFAULT_FROM_EMAIL", "")

    subject = f"{site_name} — Share Your Experience"
    message = f"""
Dear {booking.full_name},

Thank you for staying with us at {site_name}!

We hope you had a wonderful experience in Room {booking.room.room_number}.

We would love to hear your feedback. Please take a moment to leave a review
by clicking the link below:

{review_url}

This link is valid for {token.EXPIRY_DAYS} days and can only be used once.

Thank you for choosing {site_name}. We hope to welcome you back soon!

Warm regards,
The {site_name} Team
    """.strip()

    send_mail(
        subject        = subject,
        message        = message,
        from_email     = from_email,
        recipient_list = [booking.email],
        fail_silently  = False,
    )