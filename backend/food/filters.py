# food/filters.py
import django_filters
from .models import FoodOrder


class FoodOrderFilter(django_filters.FilterSet):
    """
    Filterset for FoodOrder admin/front-desk list views.

    Supported query params:
      ?booking=<id>             — scope to a specific booking (used by checkout page)
      ?room=<room_number>       — scope to a room number string
      ?payment_type=pay_now|pay_checkout
      ?payment_status=unpaid|paid
      ?order_status=pending|completed|cancelled|awaiting_payment
    """

    # Filter by booking PK  (?booking=42)
    booking = django_filters.NumberFilter(field_name='booking__id')

    # Filter by room number string stored on the booking's room (?room=101)
    room = django_filters.CharFilter(
        field_name='booking__room__room_number',
        lookup_expr='iexact',
    )

    payment_type   = django_filters.CharFilter(field_name='payment_type',   lookup_expr='exact')
    payment_status = django_filters.CharFilter(field_name='payment_status', lookup_expr='exact')

    # CharFilter (not ChoiceFilter) so 'awaiting_payment' is accepted without
    # maintaining a hard-coded choices list that would need updating each time
    # OrderStatus gains a new value.
    order_status = django_filters.CharFilter(field_name='order_status', lookup_expr='exact')

    class Meta:
        model  = FoodOrder
        fields = ['booking', 'room', 'payment_type', 'payment_status', 'order_status']