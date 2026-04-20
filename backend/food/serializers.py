# food/serializers.py
from rest_framework import serializers
from .models import FoodItem, FoodOrder, PaymentType, OrderStatus, PaymentStatus


class FoodItemSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()

    class Meta:
        model  = FoodItem
        fields = [
            "id", "name", "description", "category",
            "price", "image", "image_url", "is_available",
        ]
        extra_kwargs = {
            "image": {"required": False, "allow_null": True},
        }

    def get_image_url(self, obj):
        if not obj.image:
            return None
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.image.url)
        return obj.image.url


class FoodOrderCreateSerializer(serializers.Serializer):
    """
    Validates a guest placing an order.

    pay_now orders are created with order_status='awaiting_payment' so the
    kitchen cannot see them until payment is confirmed.
    pay_checkout orders go straight to order_status='pending' (kitchen-visible).
    """
    food_item_id = serializers.IntegerField()
    quantity     = serializers.IntegerField(min_value=1, max_value=20)
    payment_type = serializers.ChoiceField(choices=PaymentType.choices)
    notes        = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_food_item_id(self, value):
        try:
            item = FoodItem.objects.get(pk=value, is_available=True)
        except FoodItem.DoesNotExist:
            raise serializers.ValidationError("Food item not found or unavailable.")
        return item  # return the object so create() can use it directly

    def create(self, validated_data):
        food_item    = validated_data["food_item_id"]   # already the FoodItem object
        quantity     = validated_data["quantity"]
        payment_type = validated_data["payment_type"]
        notes        = validated_data.get("notes", "")
        guest        = self.context["guest"]
        booking      = self.context["booking"]

        # ── Key logic: pay_now orders start INVISIBLE to the kitchen ─────────
        # They only become 'pending' (kitchen-visible) after payment is confirmed
        # by FoodOrderVerifyPaymentView or the PayMongo webhook.
        if payment_type == PaymentType.PAY_NOW:
            initial_order_status = OrderStatus.AWAITING_PAYMENT
        else:
            initial_order_status = OrderStatus.PENDING

        order = FoodOrder.objects.create(
            guest        = guest,
            booking      = booking,
            food_item    = food_item,
            quantity     = quantity,
            unit_price   = food_item.price,
            total_price  = food_item.price * quantity,
            payment_type = payment_type,
            order_status = initial_order_status,
            notes        = notes,
        )
        return order


class FoodOrderSerializer(serializers.ModelSerializer):
    food_item_name  = serializers.CharField(source="food_item.name",     read_only=True)
    food_item_image = serializers.SerializerMethodField()
    category        = serializers.CharField(source="food_item.category", read_only=True)

    # ── Booking / room info ───────────────────────────────────────────────────
    booking_id  = serializers.IntegerField(source="booking.id",              read_only=True)
    room_number = serializers.CharField(
        source="booking.room.room_number",
        read_only=True,
        default=None,
    )

    # ── Guest account info (for front-desk modal) ─────────────────────────────
    # These pull from the guest User object attached to the order.
    # The frontend FoodOrdersFrontDeskPage uses these to display guest details
    # inside the room order modal without a separate API call.
    guest_name  = serializers.SerializerMethodField()
    guest_email = serializers.SerializerMethodField()
    guest_phone = serializers.SerializerMethodField()

    class Meta:
        model  = FoodOrder
        fields = [
            "id",
            "booking_id",
            "room_number",
            # Guest account info
            "guest_name",
            "guest_email",
            "guest_phone",
            # Item info
            "food_item",
            "food_item_name",
            "food_item_image",
            "category",
            # Order details
            "quantity",
            "unit_price",
            "total_price",
            "payment_type",
            "payment_status",
            "order_status",
            "notes",
            "completed_at",
            "created_at",
        ]

    def get_food_item_image(self, obj):
        if not obj.food_item.image:
            return None
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.food_item.image.url)
        return obj.food_item.image.url

    def get_guest_name(self, obj):
        guest = obj.guest
        if not guest:
            return None
        # Try full_name first (custom User model field), then compose from first/last
        full = getattr(guest, "full_name", None)
        if full:
            return full
        parts = [
            getattr(guest, "first_name", "") or "",
            getattr(guest, "last_name",  "") or "",
        ]
        composed = " ".join(p for p in parts if p).strip()
        return composed or guest.email or None

    def get_guest_email(self, obj):
        guest = obj.guest
        if not guest:
            return None
        return getattr(guest, "email", None)

    def get_guest_phone(self, obj):
        guest = obj.guest
        if not guest:
            return None
        # Common field names for phone — adjust to match your User model
        for field in ("phone", "phone_number", "contact_number", "mobile"):
            val = getattr(guest, field, None)
            if val:
                return val
        return None