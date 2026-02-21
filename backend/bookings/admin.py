from django.contrib import admin
from .models import Booking, BookingStatusHistory


class BookingStatusHistoryInline(admin.TabularInline):
    model      = BookingStatusHistory
    extra      = 0
    readonly_fields = ["old_status", "new_status", "changed_by", "note", "changed_at"]
    can_delete = False


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display  = [
        "reference_number", "full_name", "room",
        "check_in", "check_out", "nights",
        "total_price", "status", "payment_status", "created_at",
    ]
    list_filter   = ["status", "payment_status", "check_in"]
    search_fields = ["reference_number", "full_name", "email", "phone"]
    readonly_fields = [
        "reference_number", "checkin_pin",
        "nights", "room_price_snapshot", "subtotal", "tax", "service_fee", "total_price",
        "created_at", "updated_at",
    ]
    inlines = [BookingStatusHistoryInline]

    fieldsets = (
        ("Reference", {"fields": ("reference_number", "checkin_pin")}),
        ("Relations", {"fields": ("user", "room")}),
        ("Guest", {"fields": ("full_name", "email", "phone")}),
        ("Stay", {"fields": ("check_in", "check_out", "nights", "guests_count")}),
        ("Pricing", {"fields": ("room_price_snapshot", "subtotal", "tax", "service_fee", "total_price")}),
        ("Status", {"fields": ("status", "payment_status")}),
        ("Cancellation", {"fields": (
            "cancelled_at", "cancellation_reason",
            "refund_percentage", "refund_amount", "refund_status",
        )}),
        ("Timestamps", {"fields": ("created_at", "updated_at")}),
    )


@admin.register(BookingStatusHistory)
class BookingStatusHistoryAdmin(admin.ModelAdmin):
    list_display  = ["booking", "old_status", "new_status", "changed_by", "changed_at"]
    list_filter   = ["new_status"]
    search_fields = ["booking__reference_number"]
    readonly_fields = ["booking", "old_status", "new_status", "changed_by", "changed_at"]