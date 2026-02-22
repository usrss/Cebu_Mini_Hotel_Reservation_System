from django.contrib import admin
from .models import Payment, Refund


class RefundInline(admin.TabularInline):
    model       = Refund
    extra       = 0
    readonly_fields = ["provider_refund_id", "initiated_by", "created_at"]
    fields      = ["amount", "reason", "status", "provider_refund_id", "initiated_by", "created_at"]
    can_delete  = False


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display  = [
        "receipt_number", "booking_reference", "amount", "currency",
        "payment_type", "payment_method", "provider", "status", "paid_at", "created_at",
    ]
    list_filter   = ["status", "payment_method", "provider", "payment_type"]
    search_fields = [
        "receipt_number",
        "booking__reference_number",
        "booking__full_name",
        "booking__email",
        "transaction_id",
    ]
    readonly_fields = [
        "receipt_number", "transaction_id", "checkout_session_id",
        "checkout_url", "provider_payload", "paid_at", "created_at", "updated_at",
    ]
    inlines    = [RefundInline]
    ordering   = ["-created_at"]

    @admin.display(description="Booking Reference")
    def booking_reference(self, obj):
        return obj.booking.reference_number


@admin.register(Refund)
class RefundAdmin(admin.ModelAdmin):
    list_display  = ["id", "payment", "amount", "status", "initiated_by", "created_at"]
    list_filter   = ["status"]
    readonly_fields = ["provider_refund_id", "created_at", "updated_at"]
    ordering      = ["-created_at"]