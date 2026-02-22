import django_filters
from .models import Payment, PaymentStatus, PaymentMethod, PaymentProvider, PaymentType


class PaymentFilter(django_filters.FilterSet):
    """
    Filter set for admin payment list.
    Field names match the Payment model exactly.
    """
    status         = django_filters.MultipleChoiceFilter(choices=PaymentStatus.choices)
    payment_method = django_filters.MultipleChoiceFilter(choices=PaymentMethod.choices)
    provider       = django_filters.MultipleChoiceFilter(choices=PaymentProvider.choices)
    payment_type   = django_filters.MultipleChoiceFilter(choices=PaymentType.choices)

    amount_min = django_filters.NumberFilter(field_name="amount", lookup_expr="gte")
    amount_max = django_filters.NumberFilter(field_name="amount", lookup_expr="lte")

    created_from = django_filters.DateTimeFilter(field_name="created_at", lookup_expr="gte")
    created_to   = django_filters.DateTimeFilter(field_name="created_at", lookup_expr="lte")

    paid_from = django_filters.DateTimeFilter(field_name="paid_at", lookup_expr="gte")
    paid_to   = django_filters.DateTimeFilter(field_name="paid_at", lookup_expr="lte")

    booking      = django_filters.NumberFilter(field_name="booking__id")
    booking_ref  = django_filters.CharFilter(field_name="booking__reference_number", lookup_expr="icontains")

    class Meta:
        model  = Payment
        fields = [
            "status", "payment_method", "provider", "payment_type",
            "amount_min", "amount_max",
            "created_from", "created_to",
            "paid_from", "paid_to",
            "booking", "booking_ref",
        ]