from django.contrib import admin
from django.utils.html import format_html
from .models import FoodItem, FoodOrder


@admin.register(FoodItem)
class FoodItemAdmin(admin.ModelAdmin):
    list_display   = ["image_preview", "name", "category", "price", "is_available"]
    list_filter    = ["category", "is_available"]
    search_fields  = ["name"]
    readonly_fields = ["image_preview"]

    @admin.display(description="Image")
    def image_preview(self, obj):
        if obj.image:
            return format_html(
                '<img src="{}" style="width:60px;height:60px;object-fit:cover;border-radius:6px;">',
                obj.image.url,
            )
        return "—"


@admin.register(FoodOrder)
class FoodOrderAdmin(admin.ModelAdmin):
    list_display    = ["id", "guest", "food_item", "quantity", "payment_type", "order_status", "payment_status", "created_at"]
    list_filter     = ["order_status", "payment_status", "payment_type"]
    readonly_fields = ["created_at", "updated_at"]