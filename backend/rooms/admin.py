from django.contrib import admin
from django.utils.html import format_html
from .models import Room, RoomAmenity, RoomAmenityAssignment, RoomImage, RoomPriceHistory, RoomTemporaryLock


class RoomImageInline(admin.TabularInline):
    model = RoomImage
    extra = 1
    fields = ("image", "caption", "is_primary", "sort_order", "image_preview")
    readonly_fields = ("image_preview",)

    def image_preview(self, obj):
        if obj.image:
            return format_html('<img src="{}" height="60" style="border-radius:4px;" />', obj.image.url)
        return "—"
    image_preview.short_description = "Preview"


class RoomAmenityAssignmentInline(admin.TabularInline):
    model = RoomAmenityAssignment
    extra = 1
    autocomplete_fields = ["amenity"]


class RoomPriceHistoryInline(admin.TabularInline):
    model = RoomPriceHistory
    extra = 0
    readonly_fields = ("old_price", "new_price", "changed_at", "changed_by", "reason")
    can_delete = False
    max_num = 10
    ordering = ["-changed_at"]


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = (
        "room_number", "room_type", "floor", "bed_type",
        "capacity", "price_per_night", "status_badge", "is_active"
    )
    list_filter = ("room_type", "status", "floor", "bed_type", "is_active")
    search_fields = ("room_number", "description")
    ordering = ("floor", "room_number")
    list_editable = ("is_active",)
    readonly_fields = ("created_at", "updated_at")
    inlines = [RoomImageInline, RoomAmenityAssignmentInline, RoomPriceHistoryInline]
    fieldsets = (
        ("Room Identification", {
            "fields": ("room_number", "room_type", "floor", "bed_type")
        }),
        ("Capacity & Pricing", {
            "fields": ("capacity", "price_per_night", "size_sqm")
        }),
        ("Status & Visibility", {
            "fields": ("status", "is_active", "description")
        }),
        ("Timestamps", {
            "fields": ("created_at", "updated_at"),
            "classes": ("collapse",),
        }),
    )

    def status_badge(self, obj):
        colors = {
            "available": "#22c55e",
            "occupied": "#ef4444",
            "maintenance": "#f97316",
            "reserved": "#3b82f6",
        }
        color = colors.get(obj.status, "#6b7280")
        return format_html(
            '<span style="background:{};color:white;padding:2px 8px;border-radius:12px;font-size:11px;">{}</span>',
            color,
            obj.get_status_display()
        )
    status_badge.short_description = "Status"

    def save_model(self, request, obj, form, change):
        if change and "price_per_night" in form.changed_data:
            old = Room.objects.get(pk=obj.pk)
            RoomPriceHistory.objects.create(
                room=obj,
                old_price=old.price_per_night,
                new_price=obj.price_per_night,
                changed_by=request.user,
                reason="Updated via admin panel",
            )
        super().save_model(request, obj, form, change)


@admin.register(RoomAmenity)
class RoomAmenityAdmin(admin.ModelAdmin):
    list_display = ("name", "icon", "category")
    list_filter = ("category",)
    search_fields = ("name", "category")
    ordering = ("category", "name")


@admin.register(RoomPriceHistory)
class RoomPriceHistoryAdmin(admin.ModelAdmin):
    list_display = ("room", "old_price", "new_price", "changed_at", "changed_by")
    list_filter = ("changed_at",)
    search_fields = ("room__room_number",)
    readonly_fields = ("room", "old_price", "new_price", "changed_at", "changed_by")
    ordering = ("-changed_at",)


@admin.register(RoomTemporaryLock)
class RoomTemporaryLockAdmin(admin.ModelAdmin):
    list_display = ("room", "session_key", "check_in", "check_out", "expires_at", "released", "is_active_display")
    list_filter = ("released",)
    readonly_fields = ("locked_at", "expires_at")
    ordering = ("-locked_at",)

    def is_active_display(self, obj):
        return obj.is_active
    is_active_display.boolean = True
    is_active_display.short_description = "Active"