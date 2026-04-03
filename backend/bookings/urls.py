from django.urls import path
from . import views
from .modification_views import (
    RescheduleRequestView,
    ExtendStayRequestView,
    MyModificationListView,
    MyModificationDetailView,
    ModificationConfirmView,
    ModificationCancelView,
    ModificationPaymentInitiateView,
    ModificationRefundConfirmView,
)

app_name = "bookings"

urlpatterns = [
    # Phase 1: Create a PENDING_PAYMENT booking (no credentials yet)
    path("", views.BookingCreateView.as_view(), name="booking-create"),
    # Lookup by reference number (only works for CONFIRMED+ bookings)
    path("lookup/", views.BookingLookupView.as_view(), name="booking-lookup"),

    # Authenticated user: my bookings
    path("my/", views.MyBookingListView.as_view(), name="my-booking-list"),
    path("my/<int:pk>/", views.MyBookingDetailView.as_view(), name="my-booking-detail"),
    path("my/<int:pk>/cancel/", views.MyBookingCancelView.as_view(), name="my-booking-cancel"),

    # Reception / Staff
    path("admin/", views.ReceptionBookingListView.as_view(), name="admin-booking-list"),
    path("admin/check-in/verify/", views.ReceptionCheckInVerifyView.as_view(), name="admin-checkin-verify"),
    path("admin/expire/", views.ExpireBookingsView.as_view(), name="admin-expire"),
    path("admin/<int:pk>/", views.ReceptionBookingDetailView.as_view(), name="admin-booking-detail"),
    path("admin/<int:pk>/status/", views.ReceptionBookingStatusView.as_view(), name="admin-booking-status"),
    path("admin/<int:pk>/cancel/", views.ReceptionCancelBookingView.as_view(), name="admin-booking-cancel"),

    # Phase 2: Confirm after payment (generates reference_number, QR, PIN)
    path("admin/<int:pk>/confirm/", views.BookingConfirmView.as_view(), name="admin-booking-confirm"),

    path("admin/<int:pk>/verify-pin/", views.FrontDeskVerifyPinView.as_view(), name="admin-verify-pin"),
    path("admin/<int:pk>/check-in/", views.FrontDeskCheckInView.as_view(), name="admin-check-in"),
    path("admin/<int:pk>/collect-payment/", views.FrontDeskCollectPaymentView.as_view(), name="admin-collect-payment"),
    path("admin/<int:pk>/check-in-with-balance/", views.FrontDeskCheckInWithBalanceView.as_view(), name="admin-check-in-with-balance"),

    # ── Booking modification (reschedule + extend) ──────────────────────────
    path("my/<int:pk>/reschedule/", RescheduleRequestView.as_view(), name="my-booking-reschedule"),
    path("my/<int:pk>/extend/", ExtendStayRequestView.as_view(), name="my-booking-extend"),
    path("my/<int:pk>/modifications/", MyModificationListView.as_view(), name="my-modification-list"),
    path("my/modification/<int:mod_id>/", MyModificationDetailView.as_view(), name="my-modification-detail"),
    path("my/modification/<int:mod_id>/confirm/", ModificationConfirmView.as_view(), name="my-modification-confirm"),
    path("my/modification/<int:mod_id>/cancel/", ModificationCancelView.as_view(), name="my-modification-cancel"),
    path("my/modification/<int:mod_id>/pay/", ModificationPaymentInitiateView.as_view(), name="my-modification-pay"),
    path("my/modification/<int:mod_id>/confirm-refund/", ModificationRefundConfirmView.as_view(), name="my-modification-confirm-refund"),

    path("admin/<int:pk>/extend/",   views.StaffExtendBookingView.as_view(),  name="admin-extend"),
    path("admin/<int:pk>/checkout/", views.StaffCheckOutView.as_view(),       name="admin-checkout"),
]