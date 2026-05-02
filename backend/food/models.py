"""
food/models.py

FoodItem  — menu catalog managed by admin
FoodOrder — guest order linked to booking, with payment type + status tracking
"""
from django.db import models
from django.conf import settings
from cloudinary.models import CloudinaryField


class FoodCategory(models.TextChoices):
    FOOD      = "food",      "Food"
    DRINKS    = "drinks",    "Drinks"
    SNACKS    = "snacks",    "Snacks"
    DESSERTS  = "desserts",  "Desserts"


class FoodItem(models.Model):
    """Menu item managed by admin."""

    name        = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    category    = models.CharField(
        max_length=20,
        choices=FoodCategory.choices,
        default=FoodCategory.FOOD,
        db_index=True,
    )
    price        = models.DecimalField(max_digits=8, decimal_places=2)
    image        = CloudinaryField(
        'image',
        folder='hotel/food/images',
        null=True,
        blank=True,
    )
    is_available = models.BooleanField(default=True, db_index=True)
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "food_items"
        ordering = ["category", "name"]

    def __str__(self):
        return f"{self.name} (₱{self.price})"


class PaymentType(models.TextChoices):
    PAY_NOW      = "pay_now",      "Pay Now"
    PAY_CHECKOUT = "pay_checkout", "Pay at Checkout"


class OrderStatus(models.TextChoices):
    # ── NEW ──────────────────────────────────────────────────────────────────
    # Placed when guest chooses pay_now but has NOT yet completed payment.
    # Kitchen does NOT see this status — it is filtered out of KitchenOrderListView.
    # Transitions to PENDING (kitchen-visible) only after payment_status → 'paid'.
    AWAITING_PAYMENT = "awaiting_payment", "Awaiting Payment"
    # ─────────────────────────────────────────────────────────────────────────
    PENDING   = "pending",   "Pending"       # kitchen can see & prepare
    PREPARING = "preparing", "Preparing"      # kitchen staff is actively preparing
    COMPLETED = "completed", "Completed"
    CANCELLED = "cancelled", "Cancelled"


class PaymentStatus(models.TextChoices):
    UNPAID = "unpaid", "Unpaid"
    PAID   = "paid",   "Paid"


class FoodOrder(models.Model):
    """
    One order line per food item per guest request.
    A guest placing 3 different items creates 3 FoodOrder rows.
    """

    guest = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="food_orders",
    )
    booking = models.ForeignKey(
        "bookings.Booking",
        on_delete=models.CASCADE,
        related_name="food_orders",
        help_text="The active booking this order is attached to.",
    )
    food_item = models.ForeignKey(
        FoodItem,
        on_delete=models.PROTECT,  # never delete a menu item that has orders
        related_name="orders",
    )

    quantity    = models.PositiveSmallIntegerField(default=1)
    unit_price  = models.DecimalField(
        max_digits=8, decimal_places=2,
        help_text="Snapshot of price at time of order.",
    )
    total_price = models.DecimalField(max_digits=10, decimal_places=2)

    payment_type   = models.CharField(max_length=20, choices=PaymentType.choices)
    payment_status = models.CharField(
        max_length=10,
        choices=PaymentStatus.choices,
        default=PaymentStatus.UNPAID,
        db_index=True,
    )
    order_status = models.CharField(
        max_length=20,
        choices=OrderStatus.choices,
        default=OrderStatus.PENDING,
        db_index=True,
    )

    # Filled when kitchen marks completed
    completed_by = models.ForeignKey(
        "staff.StaffProfile",
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="completed_food_orders",
    )
    completed_at = models.DateTimeField(null=True, blank=True)

    # PayMongo checkout session ID (for pay_now orders)
    paymongo_session_id = models.CharField(max_length=100, blank=True)

    notes      = models.TextField(blank=True, help_text="Guest notes for this order.")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "food_orders"
        ordering = ["-created_at"]
        indexes  = [
            models.Index(fields=["order_status"]),
            models.Index(fields=["booking", "order_status"]),
            models.Index(fields=["guest", "created_at"]),
        ]

    def __str__(self):
        return (
            f"Order #{self.pk} — {self.food_item.name} x{self.quantity} [{self.order_status}]"
        )

    def save(self, *args, **kwargs):
        # Always keep total_price in sync
        self.total_price = self.unit_price * self.quantity
        super().save(*args, **kwargs)

    # ── Convenience helpers ───────────────────────────────────────────────────

    @property
    def is_kitchen_visible(self):
        """True when the kitchen should see and prepare this order."""
        return self.order_status == OrderStatus.PENDING

    def release_to_kitchen(self):
        """
        Call after pay_now payment is confirmed.
        Moves the order from AWAITING_PAYMENT → PENDING so kitchen can see it.
        Does nothing if the order is already in a terminal or kitchen state.
        """
        if self.order_status == OrderStatus.AWAITING_PAYMENT:
            self.order_status   = OrderStatus.PENDING
            self.payment_status = PaymentStatus.PAID
            self.save(update_fields=["order_status", "payment_status", "updated_at"])