# bookings/views.py
from django.utils import timezone
from django.db import transaction
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
                .get(reference_number=ref)   # NULL reference_number never matches
            )
        except Booking.DoesNotExist:
            return Response({"error": "Booking not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(BookingDetailSerializer(booking).data)


# ─── Payment confirmation (Phase 2) ──────────────────────────────────────────

class BookingConfirmView(APIView):
    """
    POST /api/bookings/<id>/confirm/

    Called ONLY by the payments app (or a payment webhook handler) after
    verifying a successful payment.  Transitions PENDING_PAYMENT → CONFIRMED
    and generates the reference_number, QR code, and checkin_pin.

    This is the sole entry-point for credential generation.
    Requires IsStaffOrAdmin or a dedicated payments service permission.
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
    Only PENDING_PAYMENT and CONFIRMED bookings can be cancelled.
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
    """
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
    """
    GET /api/bookings/admin/<id>/
    Full booking detail including status history.
    """
    serializer_class   = BookingDetailSerializer
    permission_classes = [CanViewAllBookings]
    queryset           = (
        Booking.objects
        .select_related("room")
        .prefetch_related("status_history__changed_by")
    )


class ReceptionBookingStatusView(APIView):
    """
    PATCH /api/bookings/admin/<id>/status/
    Staff: manually transition a booking's status.
    NOTE: To confirm after payment use /admin/<id>/confirm/ instead.
    Body: { "status": "checked_in", "note": "optional note" }
    """
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
    """
    POST /api/bookings/admin/check-in/verify/
    Reception verifies reference + PIN then marks booking CHECKED_IN.
    Only CONFIRMED bookings with valid credentials can pass.
    Body: { "reference_number": "CMH-2026-000001", "checkin_pin": "4821" }
    """
    permission_classes = [CanHandleCheckInOut]

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
    Works for both PENDING_PAYMENT and CONFIRMED bookings.
    """
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
    """
    POST /api/bookings/admin/expire/
    Cancels all PENDING_PAYMENT bookings older than PAYMENT_WINDOW_MINUTES.
    Intended to be called by Celery beat or a cron job.
    No reference_number or PIN was ever generated for these bookings.
    """
    permission_classes = [IsAdminOnlyBooking]

    def post(self, request):
        count = expire_unpaid_bookings()
        return Response({"expired": count})


# ─── Utility (callable from management command / Celery task) ─────────────────

def expire_unpaid_bookings():
    """
    Expires PENDING_PAYMENT bookings that exceeded the payment window.
    Safe to call from management commands, Celery tasks, or the API view above.
    Guarantees: no reference_number or checkin_pin is ever generated for expired bookings.
    """
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
                    f"No credentials were generated."
                ),
            )
            for bid in ids
        ])

    return len(ids)

class FrontDeskVerifyPinView(APIView):
    """
    POST /api/bookings/admin/<pk>/verify-pin/

    Step 2 of the check-in flow.
    Validates the guest's PIN without changing booking status.
    The frontend uses this to gate the payment/confirm step.

    Body:  { "pin": "1234" }
    Returns: { "valid": true } or 400 with error detail.

    Allowed: front_desk, admin, manager (CanHandleCheckInOut)
    """
    permission_classes = [CanHandleCheckInOut]

    def post(self, request, pk):
        try:
            booking = Booking.objects.get(pk=pk)
        except Booking.DoesNotExist:
            return Response(
                {"error": "Booking not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Only CONFIRMED bookings can be checked in
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
            return Response(
                {"error": "PIN is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if booking.checkin_pin != pin:
            return Response(
                {"valid": False, "error": "Incorrect PIN. Please try again."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response({"valid": True})


class FrontDeskCheckInView(APIView):
    """
    POST /api/bookings/admin/<pk>/check-in/

    Step 3a — used when booking is FULLY PAID.
    PIN must have already been verified (step 2).
    Transitions booking: CONFIRMED → CHECKED_IN.
    Room status automatically becomes OCCUPIED via existing signal in staff/signals.py.

    Body:  { "method": "qr_scan" | "manual_entry" }
    Returns: updated BookingDetailSerializer data.

    Allowed: front_desk, admin, manager (CanHandleCheckInOut)
    """
    permission_classes = [CanHandleCheckInOut]

    def post(self, request, pk):
        try:
            booking = Booking.objects.select_related("room").get(pk=pk)
        except Booking.DoesNotExist:
            return Response(
                {"error": "Booking not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

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

        # Log to StaffActivityLog (imported here to avoid circular dependency)
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
                booking_id  = booking.pk,
                room_id     = booking.room_id,
                metadata    = {"method": method},
            )
        except Exception:
            pass  # Never block check-in due to logging failure

        return Response(BookingDetailSerializer(booking).data)


class FrontDeskCollectPaymentView(APIView):
    """
    POST /api/bookings/admin/<pk>/collect-payment/

    Step 3b — used when booking has a remaining balance (deposit paid).
    Records the remaining balance payment then transitions to CHECKED_IN.

    What it does:
      1. Calculates remaining balance = total_price - sum(paid payments)
      2. Creates a Payment record with payment_type=balance_payment, provider=manual
      3. Calls payment.mark_paid() which sets booking.payment_status = PAID
      4. Transitions booking: CONFIRMED → CHECKED_IN

    Body:  { "payment_method": "cash"|"gcash"|"card"|"other" }
    Returns: updated BookingDetailSerializer data.

    Allowed: front_desk, admin, manager (CanHandleCheckInOut)
    """
    permission_classes = [CanHandleCheckInOut]

    def post(self, request, pk):
        try:
            booking = Booking.objects.select_related("room").get(pk=pk)
        except Booking.DoesNotExist:
            return Response(
                {"error": "Booking not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if booking.status != BookingStatus.CONFIRMED:
            return Response(
                {"error": f"Booking cannot be checked in (status: {booking.status})."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate payment method
        from payments.models import PaymentMethod as PM
        VALID_METHODS = [PM.CASH, PM.GCASH, PM.CARD, "other"]
        raw_method = request.data.get("payment_method", "").strip()
        if raw_method == "other":
            payment_method = PM.CASH   # map "other" to cash internally
        elif raw_method in VALID_METHODS:
            payment_method = raw_method
        else:
            return Response(
                {"error": f"Invalid payment method '{raw_method}'. "
                          f"Valid: cash, gcash, card, other."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Calculate remaining balance
        from decimal import Decimal
        from payments.models import Payment, PaymentStatus as PStatus, PaymentType, PaymentProvider
        from django.db.models import Sum

        paid_total = booking.payments.filter(
            status=PStatus.PAID
        ).aggregate(total=Sum("amount"))["total"] or Decimal("0.00")

        remaining = booking.total_price - paid_total

        if remaining <= 0:
            # Nothing to collect — just check in
            with transaction.atomic():
                booking = booking.transition_to(
                    BookingStatus.CHECKED_IN,
                    changed_by=request.user,
                    note="Checked in at front desk. Balance already cleared.",
                )
            return Response(BookingDetailSerializer(booking).data)

        with transaction.atomic():
            # 1. Create Payment record for the balance
            balance_payment = Payment.objects.create(
                booking        = booking,
                user           = booking.user,
                amount         = remaining,
                payment_type   = PaymentType.BALANCE_PAYMENT,
                provider       = PaymentProvider.MANUAL,
                payment_method = payment_method,
                status         = PStatus.PENDING,
            )

            # 2. Mark paid — this sets booking.payment_status = PAID
            balance_payment.mark_paid(
                transaction_id=f"DESK-{booking.reference_number}-BAL",
                payload={
                    "collected_by":    request.user.email,
                    "payment_method":  raw_method,
                    "collected_at":    timezone.now().isoformat(),
                    "notes":           "Balance collected at front desk during check-in.",
                },
            )

            # 3. Transition booking to CHECKED_IN
            booking.refresh_from_db()
            booking = booking.transition_to(
                BookingStatus.CHECKED_IN,
                changed_by=request.user,
                note=f"Checked in. Remaining balance of ₱{remaining} collected via {raw_method}.",
            )

        # Log to StaffActivityLog
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
                metadata   = {
                    "payment_method": raw_method,
                    "amount_collected": str(remaining),
                },
            )
        except Exception:
            pass

        return Response(BookingDetailSerializer(booking).data)


class FrontDeskCheckInWithBalanceView(APIView):
    """
    POST /api/bookings/admin/<pk>/check-in-with-balance/

    Step 3c — hotel allows check-in despite unpaid balance.
    Does NOT collect payment. Records a partial-payment note.
    Transitions booking: CONFIRMED → CHECKED_IN
    Booking.payment_status stays as-is (UNPAID or PAID based on deposit).

    Body:  { "method": "qr_scan" | "manual_entry" }
    Returns: updated BookingDetailSerializer data.
    Response also includes remaining_balance for the frontend warning.

    Allowed: front_desk, admin, manager (CanHandleCheckInOut)
    """
    permission_classes = [CanHandleCheckInOut]

    def post(self, request, pk):
        try:
            booking = Booking.objects.select_related("room").get(pk=pk)
        except Booking.DoesNotExist:
            return Response(
                {"error": "Booking not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if booking.status != BookingStatus.CONFIRMED:
            return Response(
                {"error": f"Booking cannot be checked in (status: {booking.status})."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Calculate remaining for the log / response
        from decimal import Decimal
        from payments.models import Payment, PaymentStatus as PStatus
        from django.db.models import Sum

        paid_total = booking.payments.filter(
            status=PStatus.PAID
        ).aggregate(total=Sum("amount"))["total"] or Decimal("0.00")

        remaining = booking.total_price - paid_total
        method    = request.data.get("method", "manual_entry")

        with transaction.atomic():
            booking = booking.transition_to(
                BookingStatus.CHECKED_IN,
                changed_by=request.user,
                note=(
                    f"Checked in with outstanding balance of ₱{remaining}. "
                    f"Method: {method.replace('_', ' ')}. "
                    f"Payment to be settled during stay or at checkout."
                ),
            )

        # Log to StaffActivityLog
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


class StaffExtendBookingView(APIView):
    """
    POST /api/bookings/admin/<pk>/extend/

    Staff-only endpoint to extend an active (CHECKED_IN) booking.
    No guest account required — staff locates the booking and handles
    all payment at the desk.

    Flow:
      1. Staff provides new_check_out + payment_method (cash | card).
      2. Availability is checked for the extension window only
         (booking.check_out → new_check_out).
      3. Additional charge is calculated (new total − original total).
      4. A BookingModification record is created (type=extend).
      5. A Payment record is created (provider=manual).
      6. payment.mark_paid_for_extension() is called which:
           - Marks payment PAID + generates receipt
           - Updates booking.payment_status
           - Calls modification.commit_to_booking() → updates check_out + totals
           - Writes BookingStatusHistory entry
      7. Returns the updated booking.

    Body:
      {
        "new_check_out":   "YYYY-MM-DD",   // required
        "payment_method":  "cash" | "card", // required
        "note":            "optional note"  // optional
      }

    Returns: BookingDetailSerializer data + extension_summary

    Permission: CanHandleCheckInOut (front_desk, admin, manager)
    """
    permission_classes = [CanHandleCheckInOut]

    def post(self, request, pk):
        try:
            booking = Booking.objects.select_related("room").get(pk=pk)
        except Booking.DoesNotExist:
            return Response(
                {"error": "Booking not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # ── Validate booking status ────────────────────────────────────────────
        if booking.status != BookingStatus.CHECKED_IN:
            return Response(
                {
                    "error": (
                        f"Only CHECKED_IN bookings can be extended "
                        f"(current status: '{booking.status}')."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ── Validate input ─────────────────────────────────────────────────────
        from datetime import date as date_type
        from decimal import Decimal
        from payments.models import (
            Payment as PaymentModel,
            PaymentStatus as PStatus,
            PaymentType,
            PaymentProvider,
            PaymentMethod as PMethod,
        )
        from bookings.models import BookingModification, ModificationType, ModificationStatus

        raw_new_check_out = request.data.get("new_check_out", "").strip()
        raw_method = request.data.get("payment_method", "").strip()
        note = request.data.get("note", "").strip()

        if not raw_new_check_out:
            return Response(
                {"error": "new_check_out is required (YYYY-MM-DD)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        VALID_METHODS = [PMethod.CASH, PMethod.CARD]
        if raw_method not in VALID_METHODS:
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
                {
                    "error": (
                        f"new_check_out ({new_check_out}) must be after "
                        f"the current check-out ({booking.check_out})."
                    )
                },
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

        # ── Check availability for the extension window only ──────────────────
        # The current booking already blocks check_in → current check_out.
        # We only need to verify check_out → new_check_out is free.
        from bookings.serializers import check_overlapping_bookings

        if check_overlapping_bookings(
                booking.room,
                booking.check_out,
                new_check_out,
                exclude_id=booking.pk,
        ):
            return Response(
                {
                    "error": (
                        "The room is not available for the requested extension dates. "
                        "Another booking exists for that period."
                    )
                },
                status=status.HTTP_409_CONFLICT,
            )

        # ── Recalculate prices ─────────────────────────────────────────────────
        from bookings.modification_serializers import _recalculate

        room = booking.room
        price_data = _recalculate(room, booking.check_in, new_check_out)
        price_diff = (price_data["new_total"] - booking.total_price).quantize(Decimal("0.01"))

        if price_diff <= Decimal("0"):
            # Edge case: same or cheaper — no charge needed but still update dates
            price_diff = Decimal("0")

        with transaction.atomic():
            # ── Lock room row to prevent race conditions ───────────────────────
            room = room.__class__.objects.select_for_update().get(pk=room.pk)

            # Re-check overlap inside transaction
            if check_overlapping_bookings(
                    room, booking.check_out, new_check_out, exclude_id=booking.pk
            ):
                return Response(
                    {"error": "Room was just booked for those dates. Please try again."},
                    status=status.HTTP_409_CONFLICT,
                )

            # ── Create BookingModification ─────────────────────────────────────
            from bookings.models import BookingModification, ModificationType, ModificationStatus
            mod = BookingModification.objects.create(
                booking=booking,
                requested_by=request.user,
                modification_type=ModificationType.EXTEND,
                status=ModificationStatus.AWAITING_PAYMENT,
                original_check_in=booking.check_in,
                original_check_out=booking.check_out,
                original_nights=booking.nights,
                original_total=booking.total_price,
                new_check_in=booking.check_in,
                new_check_out=new_check_out,
                new_nights=price_data["nights"],
                new_room_price_snapshot=price_data["new_room_price_snapshot"],
                new_subtotal=price_data["new_subtotal"],
                new_tax=price_data["new_tax"],
                new_service_fee=price_data["new_service_fee"],
                new_total=price_data["new_total"],
                price_difference=price_diff,
                note=note or f"Extension by staff {request.user.email}.",
            )

            # ── Create Payment record ──────────────────────────────────────────
            payment = PaymentModel.objects.create(
                booking=booking,
                user=request.user,  # staff member who processed payment
                amount=price_diff if price_diff > 0 else Decimal("0.01"),
                payment_type=PaymentType.MODIFICATION,
                provider=PaymentProvider.MANUAL,
                payment_method=raw_method,
                status=PStatus.PENDING,
            )

            # ── Settle payment + commit extension ──────────────────────────────
            # mark_paid_for_extension() handles the full chain:
            #   payment PAID → booking.payment_status updated →
            #   mod.commit_to_booking() → BookingStatusHistory logged
            payment.mark_paid_for_extension(
                modification=mod,
                transaction_id=f"DESK-EXT-{booking.reference_number}-{payment.pk}",
                payload={
                    "extended_by": request.user.email,
                    "payment_method": raw_method,
                    "extended_at": timezone.now().isoformat(),
                    "note": note,
                },
            )

        # Log to StaffActivityLog
        try:
            from staff.models import StaffActivityLog
            profile = getattr(request.user, "staff_profile", None)
            StaffActivityLog.objects.create(
                staff=profile,
                action_type="extend_booking",
                description=(
                    f"Extended booking {booking.reference_number} for "
                    f"'{booking.full_name}' — Room {booking.room.room_number}. "
                    f"New check-out: {new_check_out}. "
                    f"Additional charge: ₱{price_diff} via {raw_method}."
                ),
                booking_id=booking.pk,
                room_id=booking.room_id,
                metadata={
                    "old_check_out": str(mod.original_check_out),
                    "new_check_out": str(new_check_out),
                    "price_diff": str(price_diff),
                    "payment_method": raw_method,
                    "modification_id": mod.pk,
                },
            )
        except Exception:
            pass

        booking.refresh_from_db()
        data = BookingDetailSerializer(booking).data
        data["extension_summary"] = {
            "modification_id": mod.pk,
            "old_check_out": str(mod.original_check_out),
            "new_check_out": str(new_check_out),
            "additional_nights": price_data["nights"] - mod.original_nights,
            "additional_charge": str(price_diff),
            "payment_method": raw_method,
            "receipt_number": payment.receipt_number,
        }

        return Response(data, status=status.HTTP_200_OK)


class StaffCheckOutView(APIView):
    """
    POST /api/bookings/admin/<pk>/checkout/

    Transitions a CHECKED_IN booking to CHECKED_OUT.
    Automatically generates a ReviewToken and sends the review
    invitation email to the guest.

    Body: { "note": "optional note" }

    Returns: BookingDetailSerializer data

    Permission: CanHandleCheckInOut (front_desk, admin, manager)
    """
    permission_classes = [CanHandleCheckInOut]

    def post(self, request, pk):
        try:
            booking = Booking.objects.select_related("room").get(pk=pk)
        except Booking.DoesNotExist:
            return Response(
                {"error": "Booking not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

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

        note = request.data.get("note", "").strip()

        with transaction.atomic():
            booking = booking.transition_to(
                BookingStatus.CHECKED_OUT,
                changed_by=request.user,
                note=note or f"Checked out by {request.user.email}.",
            )

            # ── Generate ReviewToken ───────────────────────────────────────────
            # One token per booking — get_or_create is safe here since
            # OneToOneField prevents duplicates, but transition_to only
            # fires once so create() is fine too.
            from rooms.models import ReviewToken
            token, created = ReviewToken.objects.get_or_create(booking=booking)

        # ── Send review invitation email ───────────────────────────────────────
        # Outside transaction so email failure never rolls back the checkout.
        if created:
            try:
                _send_review_invitation_email(booking, token)
            except Exception as exc:
                import logging
                logging.getLogger(__name__).warning(
                    "Review invitation email failed for booking %s: %s",
                    booking.reference_number, exc,
                )

        # Log to StaffActivityLog
        try:
            from staff.models import StaffActivityLog
            profile = getattr(request.user, "staff_profile", None)
            StaffActivityLog.objects.create(
                staff=profile,
                action_type="check_out_guest",
                description=(
                    f"Guest '{booking.full_name}' checked out from "
                    f"Room {booking.room.room_number} "
                    f"(Booking {booking.reference_number})."
                ),
                booking_id=booking.pk,
                room_id=booking.room_id,
            )
        except Exception:
            pass

        return Response(BookingDetailSerializer(booking).data)


# ─── Review invitation email helper ──────────────────────────────────────────

def _send_review_invitation_email(booking, token):
    """
    Sends a post-checkout review invitation to the guest.
    Called by StaffCheckOutView after checkout is confirmed.
    Uses Django's built-in email backend (Gmail SMTP as configured).
    """
    from django.core.mail import send_mail
    from django.conf import settings as django_settings

    frontend_url = getattr(django_settings, "FRONTEND_URL", "http://localhost:5173")
    review_url = f"{frontend_url}/review/{token.token}/"
    site_name = getattr(django_settings, "SITE_NAME", "Cebu Mini Hotel")
    from_email = getattr(django_settings, "DEFAULT_FROM_EMAIL", "")

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
        subject=subject,
        message=message,
        from_email=from_email,
        recipient_list=[booking.email],
        fail_silently=False,
    )

