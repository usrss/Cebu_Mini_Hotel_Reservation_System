import django_filters
from .models import Booking, BookingStatus, PaymentStatus


class BookingFilter(django_filters.FilterSet):
    """
    Filter set for the reception dashboard.
    Field names match the Booking model: check_in, check_out, status.
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

    class Meta:
        model  = Booking
        fields = [
            "status", "payment_status",
            "check_in_from", "check_in_to",
            "check_out_from", "check_out_to",
            "room", "room_number", "email",
            "created_from", "created_to",
        ]