import django_filters
from .models import Room, RoomType, RoomStatus, BedType


class RoomFilter(django_filters.FilterSet):
    """
    Flexible filter set for room queries.
    Supports filtering by type, capacity, price range, status, and availability dates.
    Used in both public room listings and admin panel.
    """
    room_type = django_filters.MultipleChoiceFilter(choices=RoomType.choices)
    status = django_filters.MultipleChoiceFilter(choices=RoomStatus.choices)
    bed_type = django_filters.MultipleChoiceFilter(choices=BedType.choices)
    min_price = django_filters.NumberFilter(field_name="price_per_night", lookup_expr="gte")
    max_price = django_filters.NumberFilter(field_name="price_per_night", lookup_expr="lte")
    min_capacity = django_filters.NumberFilter(field_name="capacity", lookup_expr="gte")
    max_capacity = django_filters.NumberFilter(field_name="capacity", lookup_expr="lte")
    floor = django_filters.NumberFilter(field_name="floor")
    floor_min = django_filters.NumberFilter(field_name="floor", lookup_expr="gte")
    floor_max = django_filters.NumberFilter(field_name="floor", lookup_expr="lte")
    is_active = django_filters.BooleanFilter(field_name="is_active")

    class Meta:
        model = Room
        fields = [
            "room_type", "status", "bed_type",
            "min_price", "max_price",
            "min_capacity", "max_capacity",
            "floor", "floor_min", "floor_max",
            "is_active",
        ]