from django.contrib import admin
from .models import FoodItem, FoodOrder

@admin.register(FoodItem)
class FoodItemAdmin(admin.ModelAdmin):
    list_display  = ["name", "category", "price", "is_available"]
    list_filter   = ["category", "is_available"]
    search_fields = ["name"]

@admin.register(FoodOrder)
class FoodOrderAdmin(admin.ModelAdmin):
    list_display  = ["id", "guest", "food_item", "quantity", "payment_type", "order_status", "payment_status", "created_at"]
    list_filter   = ["order_status", "payment_status", "payment_type"]
    readonly_fields = ["created_at", "updated_at"]