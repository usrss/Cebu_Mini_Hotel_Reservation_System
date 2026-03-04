from django.contrib import admin
from django.utils.html import format_html
from django.utils.safestring import mark_safe
from .models import (
    Room, RoomAmenity, RoomAmenityAssignment, RoomImage,
    RoomPriceHistory, RoomTemporaryLock, RoomReview, ReviewHelpfulness,
    Inclusion, RoomInclusion, SeasonalPrice
)


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


class RoomInclusionInline(admin.TabularInline):
    """Inline for managing room inclusions."""
    model = RoomInclusion
    extra = 1
    autocomplete_fields = ["inclusion"]
    fields = ("inclusion", "notes")


class SeasonalPriceInline(admin.TabularInline):
    """Inline for managing seasonal pricing rules."""
    model = SeasonalPrice
    extra = 0
    fields = (
        "name", "start_date", "end_date",
        "price_per_night", "priority",
        "is_weekend_only", "is_active"
    )
    ordering = ["-priority", "start_date"]


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = (
        "room_number",
        "room_type",
        "floor",
        "bed_type",
        "capacity_display",
        "price_display",
        "status_badge",
        "featured_badge",
        "trending_badge",
        "view_type",
        "is_active"
    )

    list_filter = (
        "room_type",
        "status",
        "floor",
        "bed_type",
        "is_active",
        "is_featured",
        "view_type",
        "discount_percentage",
    )

    search_fields = ("room_number", "description")
    ordering = ("floor", "room_number")
    list_editable = ("is_active",)
    readonly_fields = (
        "created_at",
        "updated_at",
        "discounted_price_display",
        "trending_status",
        "seasonal_pricing_summary"
    )

    inlines = [
        RoomImageInline,
        RoomAmenityAssignmentInline,
        RoomInclusionInline,
        SeasonalPriceInline,
        RoomPriceHistoryInline
    ]

    fieldsets = (
        ("Room Identification", {
            "fields": (
                "room_number",
                "room_type",
                "floor",
                "bed_type",
                "view_type"
            )
        }),
        ("Capacity & Pricing", {
            "fields": (
                "capacity",
                ("max_adults", "max_children"),
                "price_per_night",
                "discount_percentage",
                "discounted_price_display",
                "size_sqm"
            )
        }),
        ("Marketing & Features", {
            "fields": (
                "is_featured",
                "trending_status",
            )
        }),
        ("360° Virtual Tour", {
            "fields": ("panorama_image",),
            "classes": ("collapse",),
            "description": "Upload an equirectangular panoramic image (2:1 ratio) for 360° room view"
        }),
        ("Policies", {
            "fields": (
                "cancellation_policy",
                ("checkin_time", "checkout_time"),
            ),
            "classes": ("collapse",),
        }),
        ("Seasonal Pricing Summary", {
            "fields": ("seasonal_pricing_summary",),
            "classes": ("collapse",),
            "description": "Active seasonal pricing rules for this room"
        }),
        ("Status & Visibility", {
            "fields": ("status", "is_active", "description")
        }),
        ("Timestamps", {
            "fields": ("created_at", "updated_at"),
            "classes": ("collapse",),
        }),
    )

    # ========================================================================
    # CUSTOM LIST DISPLAY METHODS
    # ========================================================================

    def capacity_display(self, obj):
        """Show adult/child capacity."""
        return format_html(
            '<span title="Total: {}">{} adults + {} children</span>',
            obj.total_capacity,
            obj.max_adults,
            obj.max_children
        )

    capacity_display.short_description = "Capacity"

    def price_display(self, obj):
        """Show price with discount if applicable."""
        if obj.discount_percentage > 0:
            return format_html(
                '<span style="text-decoration:line-through;color:#999;">₱{}</span> '
                '<span style="color:#059669;font-weight:600;">₱{}</span> '
                '<span style="color:#059669;font-size:11px;">(-{}%)</span>',
                obj.price_per_night,
                obj.discounted_price,
                obj.discount_percentage
            )
        return f"₱{obj.price_per_night}"

    price_display.short_description = "Price"

    def status_badge(self, obj):
        """Existing status badge."""
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

    def featured_badge(self, obj):
        """Show featured badge."""
        if obj.is_featured:
            return mark_safe(
                '<span style="background:#4f46e5;color:white;padding:2px 8px;border-radius:12px;font-size:11px;">⭐ Featured</span>'
            )
        return "—"

    featured_badge.short_description = "Featured"

    def trending_badge(self, obj):
        """Show trending badge."""
        if obj.is_trending:
            return mark_safe(
                '<span style="background:#10b981;color:white;padding:2px 8px;border-radius:12px;font-size:11px;">🔥 Trending</span>'
            )
        return "—"

    trending_badge.short_description = "Trending"

    # ========================================================================
    # CUSTOM READONLY FIELD DISPLAYS
    # ========================================================================

    def discounted_price_display(self, obj):
        """Show calculated discounted price."""
        if obj.discount_percentage > 0:
            return format_html(
                '<div style="font-size:14px;">'
                '<div>Original: <span style="text-decoration:line-through;">₱{}</span></div>'
                '<div style="color:#059669;font-weight:600;font-size:18px;">Discounted: ₱{}</div>'
                '<div style="color:#6b7280;font-size:12px;">Discount: {}%</div>'
                '</div>',
                obj.price_per_night,
                obj.discounted_price,
                obj.discount_percentage
            )
        return mark_safe('<div style="color:#6b7280;">No discount applied</div>')

    discounted_price_display.short_description = "Calculated Price"

    def trending_status(self, obj):
        """Show if room qualifies as trending."""
        if obj.is_trending:
            return format_html(
                '<div style="color:#059669;font-weight:600;">✓ Trending Room</div>'
                '<div style="font-size:12px;color:#6b7280;">'
                'Rating: {} ⭐ | Reviews: {}'
                '</div>',
                obj.average_rating or 0,
                obj.review_count
            )
        else:
            msg = []
            if obj.review_count < 5:
                msg.append(f"Need {5 - obj.review_count} more reviews")
            if (obj.average_rating or 0) < 4.5:
                msg.append(f"Need {4.5 - (obj.average_rating or 0):.1f} more rating points")

            return format_html(
                '<div style="color:#999;">Not trending</div>'
                '<div style="font-size:11px;color:#999;">{}</div>',
                ", ".join(msg) if msg else "Requirements not met"
            )

    trending_status.short_description = "Trending Status"

    def seasonal_pricing_summary(self, obj):
        """Display active seasonal pricing rules."""
        active_prices = obj.seasonal_prices.filter(is_active=True).order_by('-priority', 'start_date')

        if not active_prices.exists():
            return mark_safe('<div style="color:#999;">No active seasonal pricing</div>')

        html = '<table style="width:100%;border-collapse:collapse;">'
        html += '<thead><tr style="background:#f3f4f6;"><th>Name</th><th>Dates</th><th>Price</th><th>Priority</th><th>Weekend Only</th></tr></thead>'
        html += '<tbody>'

        for sp in active_prices[:10]:  # Limit to 10
            html += f'<tr style="border-bottom:1px solid #e5e7eb;">'
            html += f'<td style="padding:8px;">{sp.name}</td>'
            html += f'<td style="padding:8px;">{sp.start_date} to {sp.end_date}</td>'
            html += f'<td style="padding:8px;font-weight:600;">₱{sp.price_per_night}</td>'
            html += f'<td style="padding:8px;">{sp.get_priority_display()}</td>'
            html += f'<td style="padding:8px;">{"Yes" if sp.is_weekend_only else "No"}</td>'
            html += '</tr>'

        html += '</tbody></table>'

        if active_prices.count() > 10:
            html += f'<div style="margin-top:8px;color:#6b7280;font-size:12px;">...and {active_prices.count() - 10} more</div>'

        return mark_safe(html)

    seasonal_pricing_summary.short_description = "Active Seasonal Prices"

    # ========================================================================
    # SAVE OVERRIDE FOR PRICE HISTORY
    # ========================================================================

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


@admin.register(Inclusion)
class InclusionAdmin(admin.ModelAdmin):
    list_display = ("name", "category", "icon", "is_highlighted", "usage_count")
    list_filter = ("category", "is_highlighted")
    search_fields = ("name", "category", "description")
    ordering = ("category", "name")

    def usage_count(self, obj):
        """Show how many rooms use this inclusion."""
        count = obj.room_assignments.count()
        return format_html(
            '<span style="{}">Used by {} room{}</span>',
            "color:#059669;font-weight:600;" if count > 0 else "color:#999;",
            count,
            "s" if count != 1 else ""
        )

    usage_count.short_description = "Usage"


@admin.register(SeasonalPrice)
class SeasonalPriceAdmin(admin.ModelAdmin):
    list_display = (
        "room",
        "name",
        "date_range",
        "price_per_night",
        "priority_badge",
        "weekend_badge",
        "is_active"
    )
    list_filter = ("priority", "is_weekend_only", "is_active", "room__room_type")
    search_fields = ("name", "room__room_number")
    ordering = ("-priority", "start_date")
    date_hierarchy = "start_date"

    def date_range(self, obj):
        """Display date range."""
        return f"{obj.start_date} to {obj.end_date}"

    date_range.short_description = "Date Range"

    def priority_badge(self, obj):
        """Show priority with color."""
        colors = {
            1: "#6b7280",
            2: "#3b82f6",
            3: "#f59e0b",
            4: "#ef4444",
        }
        return format_html(
            '<span style="background:{};color:white;padding:2px 8px;border-radius:12px;font-size:11px;">{}</span>',
            colors.get(obj.priority, "#6b7280"),
            obj.get_priority_display()
        )

    priority_badge.short_description = "Priority"

    def weekend_badge(self, obj):
        """Show if weekend-only."""
        if obj.is_weekend_only:
            return mark_safe(
                '<span style="background:#8b5cf6;color:white;padding:2px 8px;border-radius:12px;font-size:11px;">Weekend</span>'
            )
        return "—"

    weekend_badge.short_description = "Type"


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


@admin.register(RoomReview)
class RoomReviewAdmin(admin.ModelAdmin):
    list_display = (
        'room',
        'guest_display',
        'rating_stars',
        'created_at',
        'is_visible',
        'is_verified'
    )
    list_filter = ('rating', 'is_visible', 'is_verified', 'created_at')
    search_fields = ('room__room_number', 'guest__email', 'review_text')
    readonly_fields = ('room', 'booking', 'guest', 'rating', 'review_text', 'created_at', 'updated_at')
    list_editable = ('is_visible',)
    ordering = ('-created_at',)

    def rating_stars(self, obj):
        return obj.star_display

    rating_stars.short_description = "Rating"

    def guest_display(self, obj):
        return obj.guest.email

    guest_display.short_description = "Guest"


@admin.register(ReviewHelpfulness)
class ReviewHelpfulnessAdmin(admin.ModelAdmin):
    list_display = (
        'review',
        'user_email',
        'vote_display',
        'voted_at'
    )
    list_filter = ('is_helpful', 'voted_at')
    search_fields = ('review__room__room_number', 'user__email')
    readonly_fields = ('review', 'user', 'is_helpful', 'voted_at')
    ordering = ('-voted_at',)

    def user_email(self, obj):
        return obj.user.email

    user_email.short_description = "User"

    def vote_display(self, obj):
        return "👍 Helpful" if obj.is_helpful else "👎 Not Helpful"

    vote_display.short_description = "Vote"