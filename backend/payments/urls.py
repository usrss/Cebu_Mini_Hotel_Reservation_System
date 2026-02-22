from django.urls import path
from . import views

app_name = "payments"

urlpatterns = [
    # ── Authenticated user ──────────────────────────────────────────────────
    # POST — initiate a checkout session (returns checkout_url)
    path("initiate/",           views.InitiatePaymentView.as_view(),   name="initiate"),

    # GET  — list user's own payments
    path("my/",                 views.MyPaymentListView.as_view(),      name="my-list"),

    # GET  — single payment detail
    path("my/<int:pk>/",        views.MyPaymentDetailView.as_view(),    name="my-detail"),

    # GET  — poll payment status after provider redirect
    path("<int:pk>/verify/",    views.PaymentVerifyView.as_view(),      name="verify"),

    # ── Webhooks (no auth — verified by signature) ──────────────────────────
    path("webhooks/paymongo/",  views.PayMongoWebhookView.as_view(),    name="webhook-paymongo"),
    path("webhooks/paypal/",    views.PayPalWebhookView.as_view(),      name="webhook-paypal"),

    # ── Admin / Staff ───────────────────────────────────────────────────────
    # GET  — all payments with filters
    path("admin/",                          views.AdminPaymentListView.as_view(),     name="admin-list"),

    # GET  — aggregated dashboard stats
    path("admin/dashboard/",               views.AdminPaymentDashboardView.as_view(), name="admin-dashboard"),

    # POST — expire stale pending payments (call from cron/Celery)
    path("admin/expire/",                  views.ExpirePaymentsView.as_view(),        name="admin-expire"),

    # GET  — single payment detail
    path("admin/<int:pk>/",               views.AdminPaymentDetailView.as_view(),    name="admin-detail"),

    # POST — manually confirm a cash payment
    path("admin/<int:pk>/confirm/",       views.AdminManualConfirmView.as_view(),    name="admin-confirm"),

    # POST — initiate a refund
    path("admin/<int:pk>/refund/",        views.AdminInitiateRefundView.as_view(),   name="admin-refund"),
]