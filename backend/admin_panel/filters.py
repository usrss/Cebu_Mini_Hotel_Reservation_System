"""
admin_panel/filters.py

django-filter FilterSets for the Admin Panel endpoints.

Verified against:
  - users/models.py    : CustomUser fields → email, first_name, last_name,
                         phone, is_staff, is_active, date_joined
                         NOTE: no auth_provider field on CustomUser
  - payments/models.py : Payment fields, Refund model (related_name="refunds")
                         NOTE: Payment has no refund_status field
  - rooms/models.py    : RoomReview fields
"""

import django_filters
from django.contrib.auth import get_user_model

from payments.models import Payment, PaymentMethod, PaymentProvider, PaymentStatus
from rooms.models import RoomReview

User = get_user_model()


# ─── Guest Filters ─────────────────────────────────────────────────────────────

class GuestFilter(django_filters.FilterSet):
    """
    Filters for the guest list endpoint.
    Only uses fields confirmed to exist on CustomUser:
    email, first_name, last_name, phone, is_active, date_joined.
    """
    email      = django_filters.CharFilter(lookup_expr="icontains")
    first_name = django_filters.CharFilter(lookup_expr="icontains")
    last_name  = django_filters.CharFilter(lookup_expr="icontains")
    phone      = django_filters.CharFilter(lookup_expr="icontains")
    is_active  = django_filters.BooleanFilter()

    joined_from = django_filters.DateTimeFilter(field_name="date_joined", lookup_expr="gte")
    joined_to   = django_filters.DateTimeFilter(field_name="date_joined", lookup_expr="lte")

    class Meta:
        model  = User
        fields = [
            "email", "first_name", "last_name", "phone",
            "is_active",
            "joined_from", "joined_to",
        ]


# ─── Payment Filters ───────────────────────────────────────────────────────────

class PaymentAdminFilter(django_filters.FilterSet):
    """
    FilterSet for admin payment list endpoint.

    IMPORTANT - Payment model field notes (verified against payments/models.py):
      - Field is checkout_session_id  (NOT session_id)
      - Payment has NO refund_status / refund_amount / refunded_at fields.
        Refunds live on the separate Refund model (FK to Payment, related_name="refunds").
        Use refunds__status to filter payments by their refund status.
    """
    status         = django_filters.MultipleChoiceFilter(choices=PaymentStatus.choices)
    payment_method = django_filters.MultipleChoiceFilter(choices=PaymentMethod.choices)
    provider       = django_filters.MultipleChoiceFilter(choices=PaymentProvider.choices)

    amount_min = django_filters.NumberFilter(field_name="amount", lookup_expr="gte")
    amount_max = django_filters.NumberFilter(field_name="amount", lookup_expr="lte")

    created_from = django_filters.DateTimeFilter(field_name="created_at", lookup_expr="gte")
    created_to   = django_filters.DateTimeFilter(field_name="created_at", lookup_expr="lte")
    paid_from    = django_filters.DateTimeFilter(field_name="paid_at",    lookup_expr="gte")
    paid_to      = django_filters.DateTimeFilter(field_name="paid_at",    lookup_expr="lte")

    booking_ref = django_filters.CharFilter(
        field_name="booking__reference_number", lookup_expr="icontains"
    )
    guest_email = django_filters.CharFilter(
        field_name="booking__user__email", lookup_expr="icontains"
    )

    # Payment has no refund_status field — traverse the Refund FK relation instead
    refund_status = django_filters.CharFilter(
        field_name="refunds__status", lookup_expr="exact"
    )

    class Meta:
        model  = Payment
        fields = [
            "status", "payment_method", "provider",
            "amount_min", "amount_max",
            "created_from", "created_to",
            "paid_from", "paid_to",
            "booking_ref", "guest_email",
            "refund_status",
        ]


# ─── Review Filters ────────────────────────────────────────────────────────────

class ReviewAdminFilter(django_filters.FilterSet):
    rating      = django_filters.NumberFilter()
    rating_min  = django_filters.NumberFilter(field_name="rating", lookup_expr="gte")
    rating_max  = django_filters.NumberFilter(field_name="rating", lookup_expr="lte")
    is_visible  = django_filters.BooleanFilter()
    is_verified = django_filters.BooleanFilter()
    room        = django_filters.NumberFilter(field_name="room__id")
    room_number = django_filters.CharFilter(
        field_name="room__room_number", lookup_expr="icontains"
    )
    guest_email = django_filters.CharFilter(
        field_name="guest__email", lookup_expr="icontains"
    )
    created_from = django_filters.DateTimeFilter(field_name="created_at", lookup_expr="gte")
    created_to   = django_filters.DateTimeFilter(field_name="created_at", lookup_expr="lte")

    class Meta:
        model  = RoomReview
        fields = [
            "rating", "rating_min", "rating_max",
            "is_visible", "is_verified",
            "room", "room_number", "guest_email",
            "created_from", "created_to",
        ]