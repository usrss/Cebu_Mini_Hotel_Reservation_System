import django_filters
from .models import Booking, BookingStatus, PaymentStatus


class BookingFilter(django_filters.FilterSet):
    """
    Filter set for the reception dashboard.
    Status choices updated to match the new two-phase booking flow.
    """
    status         = django_filters.MultipleChoiceFilter(choices=BookingStatus.choices)
    payment_status = django_filters.MultipleChoiceFilter(choices=PaymentStatus.choices)
    check_in_from  = django_filters.DateFilter(field_name="check_in",  lookup_expr="gte")
    check_in_to    = django_filters.DateFilter(field_name="check_in",  lookup_expr="lte")
    check_out_from = django_filters.DateFilter(field_name="check_out", lookup_expr="gte")
    check_out_to   = django_filters.DateFilter(field_name="check_out", lookup_expr="lte")
    room           = django_filters.NumberFilter(field_name="room__id")
    room_number    = django_filters.CharFilter(field_name="room__room_number", lookup_expr="icontains")
    email          = django_filters.CharFilter(lookup_expr="icontains")
    created_from   = django_filters.DateTimeFilter(field_name="created_at", lookup_expr="gte")
    created_to     = django_filters.DateTimeFilter(field_name="created_at", lookup_expr="lte")
    # Filter to quickly find bookings that have credentials (i.e. confirmed+)
    has_credentials = django_filters.BooleanFilter(method="filter_has_credentials")

    class Meta:
        model  = Booking
        fields = [
            "status", "payment_status",
            "check_in_from", "check_in_to",
            "check_out_from", "check_out_to",
            "room", "room_number", "email",
            "created_from", "created_to",
            "has_credentials",
        ]

    def filter_has_credentials(self, queryset, name, value):
        """
        has_credentials=true  → bookings with a reference_number (CONFIRMED+)
        has_credentials=false → bookings without (PENDING_PAYMENT / EXPIRED / CANCELLED)
        """
        if value:
            return queryset.exclude(reference_number__isnull=True).exclude(reference_number="")
        return queryset.filter(reference_number__isnull=True)