# ============================================================================
# UPDATE backend/rooms/filters.py
# REPLACE YOUR EXISTING RoomFilter
# ============================================================================

import django_filters
from .models import Room, RoomType, RoomStatus, BedType, RoomViewType


class RoomFilter(django_filters.FilterSet):
    """
    Comprehensive filter set for room queries.
    NOW INCLUDES: featured, view_type, discounts, capacity split
    """
    # Existing filters
    room_type = django_filters.MultipleChoiceFilter(choices=RoomType.choices)
    status = django_filters.MultipleChoiceFilter(choices=RoomStatus.choices)
    bed_type = django_filters.MultipleChoiceFilter(choices=BedType.choices)

    # Price filters
    min_price = django_filters.NumberFilter(field_name="price_per_night", lookup_expr="gte")
    max_price = django_filters.NumberFilter(field_name="price_per_night", lookup_expr="lte")

    # Capacity filters (existing)
    min_capacity = django_filters.NumberFilter(field_name="capacity", lookup_expr="gte")
    max_capacity = django_filters.NumberFilter(field_name="capacity", lookup_expr="lte")

    # NEW: Adult/Child capacity filters
    min_adults = django_filters.NumberFilter(field_name="max_adults", lookup_expr="gte")
    min_children = django_filters.NumberFilter(field_name="max_children", lookup_expr="gte")

    # Floor filters
    floor = django_filters.NumberFilter(field_name="floor")
    floor_min = django_filters.NumberFilter(field_name="floor", lookup_expr="gte")
    floor_max = django_filters.NumberFilter(field_name="floor", lookup_expr="lte")

    # Status filters
    is_active = django_filters.BooleanFilter(field_name="is_active")

    # NEW: Featured filter
    is_featured = django_filters.BooleanFilter(field_name="is_featured")

    # NEW: View type filter
    view_type = django_filters.MultipleChoiceFilter(choices=RoomViewType.choices)

    # NEW: Discount filters
    has_discount = django_filters.BooleanFilter(
        method="filter_has_discount",
        label="Has Active Discount"
    )
    min_discount = django_filters.NumberFilter(
        field_name="discount_percentage",
        lookup_expr="gte"
    )

    # NEW: Trending filter
    is_trending = django_filters.BooleanFilter(
        method="filter_is_trending",
        label="Trending Rooms Only"
    )

    class Meta:
        model = Room
        fields = [
            "room_type", "status", "bed_type", "view_type",
            "min_price", "max_price",
            "min_capacity", "max_capacity",
            "min_adults", "min_children",
            "floor", "floor_min", "floor_max",
            "is_active", "is_featured",
            "has_discount", "min_discount",
            "is_trending",
        ]

    def filter_has_discount(self, queryset, name, value):
        """Filter rooms with active discounts."""
        if value:
            return queryset.filter(discount_percentage__gt=0)
        return queryset.filter(discount_percentage=0)

    def filter_is_trending(self, queryset, name, value):
        """
        Filter trending rooms.
        Note: This uses database queries. For better performance,
        consider adding a cached field.
        """
        if not value:
            return queryset

        # Get rooms with >= 5 reviews
        from django.db.models import Count, Avg

        return queryset.annotate(
            avg_rating=Avg('reviews__rating', filter=models.Q(reviews__is_visible=True)),
            review_cnt=Count('reviews', filter=models.Q(reviews__is_visible=True))
        ).filter(
            review_cnt__gte=5,
            avg_rating__gte=4.5
        )