import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.conf import settings
from django.utils import timezone
from django.db.models import Sum, Count, Avg
from django.db.models.functions import TruncDate, TruncMonth
from django_filters.rest_framework import DjangoFilterBackend

from bookings.models import Booking, BookingStatus
from .models import FoodItem, FoodOrder, OrderStatus, PaymentType, PaymentStatus
from .serializers import FoodItemSerializer, FoodOrderCreateSerializer, FoodOrderSerializer
from .filters import FoodOrderFilter

logger = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_active_booking(user):
    """Return the guest's currently checked-in booking, or None."""
    return (
        Booking.objects
        .filter(user=user, status=BookingStatus.CHECKED_IN)
        .order_by("-check_in")
        .first()
    )


def _get_role(user):
    """Return the effective role string for a user, or None."""
    profile = getattr(user, "staff_profile", None)
    return profile.effective_role if profile else None


# ── Menu ──────────────────────────────────────────────────────────────────────

class FoodMenuView(generics.ListCreateAPIView):
    """
    GET  /api/food/menu/  — authenticated users see available items
    POST /api/food/menu/  — admin only, create a new menu item (supports multipart)
    """
    serializer_class   = FoodItemSerializer
    permission_classes = [IsAuthenticated]
    parser_classes     = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        return FoodItem.objects.filter(is_available=True)

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["request"] = self.request
        return ctx

    def perform_create(self, serializer):
        if _get_role(self.request.user) != "admin":
            raise PermissionDenied("Admin only.")
        serializer.save()


class FoodMenuAdminView(generics.ListAPIView):
    """
    GET /api/food/menu/all/
    Admin + Manager see ALL items including unavailable ones.
    """
    serializer_class   = FoodItemSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        role = _get_role(self.request.user)
        if role not in ("admin", "manager"):
            raise PermissionDenied("Admin or Manager only.")
        return FoodItem.objects.all().order_by("category", "name")

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["request"] = self.request
        return ctx


class FoodItemDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    /api/food/menu/<pk>/  — any authenticated user
    PATCH  /api/food/menu/<pk>/  — admin only (supports multipart for image upload)
    DELETE /api/food/menu/<pk>/  — admin only
    """
    serializer_class   = FoodItemSerializer
    permission_classes = [IsAuthenticated]
    parser_classes     = [MultiPartParser, FormParser, JSONParser]
    queryset           = FoodItem.objects.all()

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["request"] = self.request
        return ctx

    def check_object_permissions(self, request, obj):
        super().check_object_permissions(request, obj)
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            if _get_role(request.user) != "admin":
                raise PermissionDenied("Admin only.")


# ── Guest: place order ────────────────────────────────────────────────────────

class FoodOrderCreateView(APIView):
    """
    POST /api/food/orders/
    Guest places a pay_checkout food order. Must have an active (checked-in) booking.

    NOTE: pay_now orders are NOT created through this endpoint anymore.
    They are created inside FoodOrderInitiatePaymentView so the order only
    exists after a PayMongo session is successfully created. This prevents
    orphaned orders from guests who never reach the payment page.

    Body: { food_item_id, quantity, notes? }
    payment_type is always 'pay_checkout' here.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        booking = _get_active_booking(request.user)
        if not booking:
            return Response(
                {"error": "You must be checked in to order food."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Force pay_checkout — pay_now goes through initiate-payment endpoint
        data = request.data.copy()
        data["payment_type"] = PaymentType.PAY_CHECKOUT

        serializer = FoodOrderCreateSerializer(
            data=data,
            context={"guest": request.user, "booking": booking},
        )
        serializer.is_valid(raise_exception=True)
        order = serializer.save()

        return Response({
            "message":    "Order placed successfully!",
            "order":      FoodOrderSerializer(order, context={"request": request}).data,
            "booking_id": booking.id,
        }, status=status.HTTP_201_CREATED)


# ── Guest: view own orders ────────────────────────────────────────────────────

class GuestFoodOrderListView(generics.ListAPIView):
    """
    GET /api/food/orders/my/
    Returns all food orders for the logged-in guest, newest first.
    Excludes awaiting_payment orders with no session (never reached checkout).
    """
    serializer_class   = FoodOrderSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            FoodOrder.objects
            .filter(guest=self.request.user)
            .exclude(
                # Hide ghost orders: awaiting_payment with no PayMongo session started
                order_status=OrderStatus.AWAITING_PAYMENT,
                paymongo_session_id="",
            )
            .select_related("food_item", "booking__room")
            .order_by("-created_at")
        )

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["request"] = self.request
        return ctx


# ── Kitchen staff ─────────────────────────────────────────────────────────────

class KitchenOrderListView(generics.ListAPIView):
    """
    GET /api/food/orders/kitchen/?status=pending|completed
    Kitchen staff, admin, and manager can access.

    IMPORTANT: 'awaiting_payment' orders are EXCLUDED — kitchen only sees
    orders where payment has been confirmed (order_status='pending').
    """
    serializer_class   = FoodOrderSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        role = _get_role(self.request.user)
        if role not in ("kitchen_staff", "admin", "manager"):
            return FoodOrder.objects.none()

        # Never show awaiting_payment to kitchen regardless of filter param
        qs = (
            FoodOrder.objects
            .exclude(order_status=OrderStatus.AWAITING_PAYMENT)
            .select_related("food_item", "booking__room")
        )

        status_param = self.request.query_params.get("status")
        if status_param == "pending":
            qs = qs.filter(order_status=OrderStatus.PENDING)
        elif status_param == "completed":
            today = timezone.now().date()
            qs    = qs.filter(order_status=OrderStatus.COMPLETED, completed_at__date=today)

        return qs.order_by("-created_at")

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["request"] = self.request
        return ctx


class FoodOrderCompleteView(APIView):
    """
    PATCH /api/food/orders/<pk>/complete/
    Kitchen staff, admin, or manager marks an order as completed.
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        role = _get_role(request.user)
        if role not in ("kitchen_staff", "admin", "manager"):
            return Response(
                {"error": "Not authorised."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            order = FoodOrder.objects.select_related("food_item").get(pk=pk)
        except FoodOrder.DoesNotExist:
            return Response(
                {"error": "Order not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if order.order_status != OrderStatus.PENDING:
            return Response(
                {"error": "Order is not pending."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        profile            = getattr(request.user, "staff_profile", None)
        order.order_status = OrderStatus.COMPLETED
        order.completed_by = profile
        order.completed_at = timezone.now()
        order.save(update_fields=["order_status", "completed_by", "completed_at", "updated_at"])

        return Response(FoodOrderSerializer(order, context={"request": request}).data)


# ── Admin + Front Desk: all orders ────────────────────────────────────────────

class FoodOrdersAdminView(generics.ListAPIView):
    """
    GET /api/food/orders/admin/
    Admin, Manager, Front Desk, Receptionist — all orders with room + guest info.

    Supported query filters (via FoodOrderFilter):
      ?booking=<id>
      ?room=<room_number>
      ?payment_type=pay_now|pay_checkout
      ?payment_status=unpaid|paid
      ?order_status=pending|completed|cancelled|awaiting_payment
    """
    serializer_class   = FoodOrderSerializer
    permission_classes = [IsAuthenticated]
    filter_backends    = [DjangoFilterBackend]
    filterset_class    = FoodOrderFilter

    def get_queryset(self):
        role = _get_role(self.request.user)
        if role not in ("admin", "manager", "front_desk", "receptionist"):
            raise PermissionDenied("Not authorised.")

        return (
            FoodOrder.objects
            .select_related("food_item", "booking__room", "guest")
            .all()
            .order_by("-created_at")
        )

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["request"] = self.request
        return ctx


# ── Food Analytics ────────────────────────────────────────────────────────────

class FoodAnalyticsView(APIView):
    """
    GET /api/food/analytics/?period=daily|weekly|monthly|yearly
    Admin and Manager only.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        role = _get_role(request.user)
        if role not in ("admin", "manager"):
            return Response({"error": "Not authorised."}, status=status.HTTP_403_FORBIDDEN)

        period = request.query_params.get("period", "monthly")
        today  = timezone.now().date()

        period_map = {
            "daily":   (today, today),
            "weekly":  (today - timezone.timedelta(days=6), today),
            "monthly": (today.replace(day=1), today),
            "yearly":  (today.replace(month=1, day=1), today),
        }
        start, end = period_map.get(period, period_map["monthly"])

        # Exclude awaiting_payment from analytics (never fulfilled)
        qs = (
            FoodOrder.objects
            .exclude(order_status=OrderStatus.AWAITING_PAYMENT)
            .filter(created_at__date__gte=start, created_at__date__lte=end)
            .select_related("food_item")
        )

        totals = qs.aggregate(
            total_orders    = Count("id"),
            total_revenue   = Sum("total_price"),
            avg_order_value = Avg("total_price"),
        )
        pending_count   = qs.filter(order_status=OrderStatus.PENDING).count()
        completed_count = qs.filter(order_status=OrderStatus.COMPLETED).count()
        paid_revenue    = (
            qs.filter(payment_status=PaymentStatus.PAID)
              .aggregate(t=Sum("total_price"))["t"] or 0
        )

        summary = {
            "total_orders":     totals["total_orders"] or 0,
            "total_revenue":    float(totals["total_revenue"] or 0),
            "paid_revenue":     float(paid_revenue),
            "avg_order_value":  float(totals["avg_order_value"] or 0),
            "pending_orders":   pending_count,
            "completed_orders": completed_count,
        }

        top_items = (
            qs.values("food_item__id", "food_item__name", "food_item__category")
            .annotate(orders=Count("id"), revenue=Sum("total_price"), qty=Sum("quantity"))
            .order_by("-revenue")[:10]
        )
        top_items_data = [
            {
                "id":       row["food_item__id"],
                "name":     row["food_item__name"],
                "category": row["food_item__category"],
                "orders":   row["orders"],
                "revenue":  float(row["revenue"] or 0),
                "quantity": row["qty"] or 0,
            }
            for row in top_items
        ]

        categories = (
            qs.values("food_item__category")
            .annotate(orders=Count("id"), revenue=Sum("total_price"))
            .order_by("-revenue")
        )
        category_data = [
            {
                "category": row["food_item__category"],
                "orders":   row["orders"],
                "revenue":  float(row["revenue"] or 0),
            }
            for row in categories
        ]

        status_breakdown = [
            {"status": "pending",   "count": pending_count},
            {"status": "completed", "count": completed_count},
            {"status": "cancelled", "count": qs.filter(order_status=OrderStatus.CANCELLED).count()},
        ]

        trunc_fn = TruncDate if period in ("daily", "weekly") else (
            TruncMonth if period == "yearly" else TruncDate
        )

        trend_qs = (
            qs.annotate(period=trunc_fn("created_at"))
            .values("period")
            .annotate(orders=Count("id"), revenue=Sum("total_price"))
            .order_by("period")
        )
        trend_data = [
            {
                "period":  str(row["period"]),
                "orders":  row["orders"],
                "revenue": float(row["revenue"] or 0),
            }
            for row in trend_qs
        ]

        return Response({
            "period":     period,
            "start_date": str(start),
            "end_date":   str(end),
            "summary":    summary,
            "top_items":  top_items_data,
            "categories": category_data,
            "trend":      trend_data,
            "status_breakdown": status_breakdown,
            "payment_split": [
                {"type": "Pay Now",      "count": qs.filter(payment_type=PaymentType.PAY_NOW).count()},
                {"type": "Pay Checkout", "count": qs.filter(payment_type=PaymentType.PAY_CHECKOUT).count()},
            ],
        })


# ── PayMongo: initiate food order payment ─────────────────────────────────────

class FoodOrderInitiatePaymentView(APIView):
    """
    POST /api/food/orders/initiate-payment/

    Handles TWO scenarios:

    ① NEW PAY NOW ORDER (guest ordering from menu):
       Body: { food_item_id, quantity, payment_method, notes? }
       → Creates a FoodOrder with order_status='awaiting_payment'
       → Creates a PayMongo checkout session
       → Returns { checkout_url, order_id }
       The order only becomes kitchen-visible after payment is confirmed.

    ② UPGRADE: pay_checkout → pay_now (guest changes mind in My Orders):
       Body: { order_id, payment_method }
       → Looks up existing pay_checkout order
       → Changes payment_type to pay_now, order_status to awaiting_payment
       → Creates a PayMongo checkout session
       → Returns { checkout_url, order_id }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        payment_method = request.data.get("payment_method", "card")
        food_item_id   = request.data.get("food_item_id")
        order_id       = request.data.get("order_id")

        # ── Route: new order vs upgrade ───────────────────────────────────────
        if food_item_id:
            order = self._create_new_order(request, food_item_id, payment_method)
            if isinstance(order, Response):
                return order   # validation error bubbled up
        elif order_id:
            order = self._upgrade_existing_order(request, order_id)
            if isinstance(order, Response):
                return order
        else:
            return Response(
                {"error": "Provide either food_item_id (new order) or order_id (upgrade)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ── Create PayMongo checkout session ──────────────────────────────────
        from payments.services import PayMongoService

        frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:5173")
        description  = f"Food Order #{order.id} — {order.food_item.name} x{order.quantity}"
        amount_cents = int(order.total_price * 100)

        if amount_cents < 10000:
            # Roll back: cancel the order we just created so it doesn't dangle
            if food_item_id:
                order.order_status = OrderStatus.CANCELLED
                order.save(update_fields=["order_status", "updated_at"])
            return Response(
                {"error": "Order total is below the minimum payable amount of ₱100.00."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            result = PayMongoService.create_food_checkout(
                amount_cents   = amount_cents,
                description    = description,
                payment_method = payment_method,
                metadata       = {"type": "food_order", "order_id": str(order.id)},
                success_url    = f"{frontend_url}/food-payment/success?order_id={order.id}",
                cancel_url     = f"{frontend_url}/food-payment/cancel?order_id={order.id}",
            )
        except Exception as exc:
            logger.exception("Food payment checkout failed for order %s: %s", order.id, exc)
            # Mark the new order cancelled so it doesn't sit as a ghost
            if food_item_id:
                order.order_status = OrderStatus.CANCELLED
                order.save(update_fields=["order_status", "updated_at"])
            return Response(
                {"error": "Payment gateway error. Please try again."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        order.paymongo_session_id = result.get("id", "")
        order.save(update_fields=["paymongo_session_id", "updated_at"])

        return Response({
            "checkout_url": result["checkout_url"],
            "order_id":     order.id,
        })

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _create_new_order(self, request, food_item_id, payment_method):
        """Create a new FoodOrder in AWAITING_PAYMENT state."""
        booking = _get_active_booking(request.user)
        if not booking:
            return Response(
                {"error": "You must be checked in to order food."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        quantity = request.data.get("quantity", 1)
        notes    = request.data.get("notes", "")

        serializer = FoodOrderCreateSerializer(
            data={
                "food_item_id": food_item_id,
                "quantity":     quantity,
                "payment_type": PaymentType.PAY_NOW,
                "notes":        notes,
            },
            context={"guest": request.user, "booking": booking},
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        # serializer.create() sets order_status='awaiting_payment' for pay_now
        order = serializer.save()
        return order

    def _upgrade_existing_order(self, request, order_id):
        """
        Convert an existing pay_checkout order to pay_now.
        Only the order's own guest can do this.
        """
        try:
            order = FoodOrder.objects.select_related("booking", "food_item").get(
                pk=order_id,
                guest=request.user,
                payment_status=PaymentStatus.UNPAID,
            )
        except FoodOrder.DoesNotExist:
            return Response(
                {"error": "Order not found or already paid."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if order.order_status == OrderStatus.CANCELLED:
            return Response(
                {"error": "Cannot pay for a cancelled order."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Switch to pay_now + awaiting_payment so kitchen stays blind until paid
        order.payment_type = PaymentType.PAY_NOW
        order.order_status = OrderStatus.AWAITING_PAYMENT
        order.save(update_fields=["payment_type", "order_status", "updated_at"])
        return order


class FoodOrderVerifyPaymentView(APIView):
    """
    GET /api/food/orders/<pk>/verify-payment/
    Called by FoodPaymentSuccessPage after PayMongo redirects back.

    Polls PayMongo, and if payment is confirmed:
      1. Sets payment_status = 'paid'
      2. Sets order_status   = 'pending'  ← releases order to kitchen
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            order = FoodOrder.objects.select_related("food_item").get(
                pk=pk, guest=request.user
            )
        except FoodOrder.DoesNotExist:
            return Response({"error": "Order not found."}, status=status.HTTP_404_NOT_FOUND)

        # Already confirmed — return immediately
        if order.payment_status == PaymentStatus.PAID:
            return Response(FoodOrderSerializer(order, context={"request": request}).data)

        if not order.paymongo_session_id:
            return Response(
                {"error": "No payment session found for this order."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            from payments.services import PayMongoService
            session       = PayMongoService.get_full_session(order.paymongo_session_id)
            payments_list = session.get("payments") or []
            is_paid       = any(
                p.get("attributes", {}).get("status") == "paid"
                for p in payments_list
            )

            if is_paid:
                # ── CRITICAL: release to kitchen here ─────────────────────
                order.payment_status = PaymentStatus.PAID
                order.order_status   = OrderStatus.PENDING   # ← kitchen can now see it
                order.save(update_fields=["payment_status", "order_status", "updated_at"])

            elif session.get("status") == "expired":
                order.order_status = OrderStatus.CANCELLED
                order.save(update_fields=["order_status", "updated_at"])

        except Exception as exc:
            logger.exception("Food payment verify failed for order %s: %s", pk, exc)
            return Response(
                {"error": "Could not verify payment. Please try again."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response(FoodOrderSerializer(order, context={"request": request}).data)


class FoodOrderCancelView(APIView):
    """
    PATCH /api/food/orders/<pk>/cancel/
    Guest cancelled at PayMongo checkout — mark order cancelled.

    Accepts pay_now orders in either 'pending' or 'awaiting_payment' state
    (both are valid pre-payment states) that are still unpaid.
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        try:
            order = FoodOrder.objects.get(
                pk=pk,
                guest=request.user,
                payment_type=PaymentType.PAY_NOW,
                payment_status=PaymentStatus.UNPAID,
                order_status__in=[OrderStatus.AWAITING_PAYMENT, OrderStatus.PENDING],
            )
        except FoodOrder.DoesNotExist:
            return Response(
                {"error": "Order not found or cannot be cancelled."},
                status=status.HTTP_404_NOT_FOUND,
            )

        order.order_status = OrderStatus.CANCELLED
        order.save(update_fields=["order_status", "updated_at"])
        return Response(FoodOrderSerializer(order, context={"request": request}).data)


class FoodOrderMarkPaidView(APIView):
    """
    PATCH /api/food/orders/<pk>/mark-paid/
    Front desk / admin marks a food order as paid at the desk (cash or POS).

    Works for BOTH payment types:
      - pay_checkout: settled during room checkout flow
      - pay_now:      guest paying in person (rare but valid)

    Also releases the order to the kitchen if it was stuck in awaiting_payment.
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        role = _get_role(request.user)
        if role not in ("admin", "manager", "front_desk", "receptionist"):
            return Response(
                {"error": "Not authorised."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            order = FoodOrder.objects.select_related("food_item").get(
                pk=pk,
                payment_status=PaymentStatus.UNPAID,   # no double-charging
            )
        except FoodOrder.DoesNotExist:
            return Response(
                {"error": "Order not found or already paid."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if order.order_status == OrderStatus.CANCELLED:
            return Response(
                {"error": "Cannot mark a cancelled order as paid."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        update_fields = ["payment_status", "updated_at"]
        order.payment_status = PaymentStatus.PAID

        # If kitchen hasn't seen it yet (was awaiting_payment), release it now
        if order.order_status == OrderStatus.AWAITING_PAYMENT:
            order.order_status = OrderStatus.PENDING
            update_fields.append("order_status")

        order.save(update_fields=update_fields)
        return Response(FoodOrderSerializer(order, context={"request": request}).data)