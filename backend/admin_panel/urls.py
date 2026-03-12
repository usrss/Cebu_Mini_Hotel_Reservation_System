"""
admin_panel/urls.py

All routes are under /api/admin/  (registered in root urls.py).

Guest Management:
  GET    /api/admin/guests/                    GuestListView
  GET    /api/admin/guests/<id>/               GuestDetailView
  PATCH  /api/admin/guests/<id>/block/         GuestBlockView
  GET    /api/admin/guests/<id>/bookings/      GuestBookingHistoryView

Payment Management:
  GET    /api/admin/payments/                  PaymentListView
  GET    /api/admin/payments/revenue/          PaymentRevenueSummaryView  ← before <int:pk>
  GET    /api/admin/payments/<id>/             PaymentDetailView
  POST   /api/admin/payments/<id>/confirm/     PaymentConfirmView
  POST   /api/admin/payments/<id>/refund/      PaymentRefundView

Review & Feedback:
  GET    /api/admin/reviews/                   ReviewListView
  GET    /api/admin/reviews/stats/             ReviewStatsView            ← before <int:pk>
  GET    /api/admin/reviews/<id>/              ReviewDetailView
  PATCH  /api/admin/reviews/<id>/visibility/   ReviewVisibilityView
"""

from django.urls import path

from .views import (
    # Guests
    GuestBookingHistoryView,
    GuestBlockView,
    GuestDetailView,
    GuestListView,
    # Payments
    PaymentConfirmView,
    PaymentDetailView,
    PaymentListView,
    PaymentRefundView,
    PaymentRevenueSummaryView,
    # Reviews
    ReviewDetailView,
    ReviewListView,
    ReviewStatsView,
    ReviewVisibilityView,
)

app_name = "admin_panel"

urlpatterns = [
    # ── Guest Management ───────────────────────────────────────────────────────
    path("guests/",                      GuestListView.as_view(),           name="guest-list"),
    path("guests/<int:pk>/",             GuestDetailView.as_view(),         name="guest-detail"),
    path("guests/<int:pk>/block/",       GuestBlockView.as_view(),          name="guest-block"),
    path("guests/<int:pk>/bookings/",    GuestBookingHistoryView.as_view(), name="guest-bookings"),

    # ── Payment Management ─────────────────────────────────────────────────────
    # revenue/ MUST come before <int:pk>/ — Django matches "revenue" as pk otherwise
    path("payments/",                    PaymentListView.as_view(),           name="payment-list"),
    path("payments/revenue/",            PaymentRevenueSummaryView.as_view(), name="payment-revenue"),
    path("payments/<int:pk>/",           PaymentDetailView.as_view(),         name="payment-detail"),
    path("payments/<int:pk>/confirm/",   PaymentConfirmView.as_view(),        name="payment-confirm"),
    path("payments/<int:pk>/refund/",    PaymentRefundView.as_view(),         name="payment-refund"),

    # ── Review & Feedback ──────────────────────────────────────────────────────
    # stats/ MUST come before <int:pk>/ for the same reason
    path("reviews/",                     ReviewListView.as_view(),            name="review-list"),
    path("reviews/stats/",               ReviewStatsView.as_view(),           name="review-stats"),
    path("reviews/<int:pk>/",            ReviewDetailView.as_view(),          name="review-detail"),
    path("reviews/<int:pk>/visibility/", ReviewVisibilityView.as_view(),      name="review-visibility"),
]