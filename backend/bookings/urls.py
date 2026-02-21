from django.urls import path
from . import views

app_name = "bookings"

urlpatterns = [
    # ── Public / Guest ──────────────────────────────────────────────────────
    path("", views.BookingCreateView.as_view(), name="booking-create"),
    path("lookup/", views.BookingLookupView.as_view(), name="booking-lookup"),

    # ── Authenticated user: my bookings ─────────────────────────────────────
    path("my/", views.MyBookingListView.as_view(), name="my-booking-list"),
    path("my/<int:pk>/", views.MyBookingDetailView.as_view(), name="my-booking-detail"),
    path("my/<int:pk>/cancel/", views.MyBookingCancelView.as_view(), name="my-booking-cancel"),

    # ── Reception / Staff ───────────────────────────────────────────────────
    path("admin/", views.ReceptionBookingListView.as_view(), name="admin-booking-list"),
    path("admin/check-in/verify/", views.ReceptionCheckInVerifyView.as_view(), name="admin-checkin-verify"),
    path("admin/expire/", views.ExpireBookingsView.as_view(), name="admin-expire"),
    path("admin/<int:pk>/", views.ReceptionBookingDetailView.as_view(), name="admin-booking-detail"),
    path("admin/<int:pk>/status/", views.ReceptionBookingStatusView.as_view(), name="admin-booking-status"),
    path("admin/<int:pk>/cancel/", views.ReceptionCancelBookingView.as_view(), name="admin-booking-cancel"),
]