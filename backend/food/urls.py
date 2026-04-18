# food/urls.py
from django.urls import path
from . import views

urlpatterns = [
    # ── Menu ──────────────────────────────────────────────────────────────────
    path('menu/',                    views.FoodMenuView.as_view(),       name='food-menu'),
    path('menu/all/',                views.FoodMenuAdminView.as_view(),  name='food-menu-all'),
    path('menu/<int:pk>/',           views.FoodItemDetailView.as_view(), name='food-menu-detail'),

    # ── Analytics ─────────────────────────────────────────────────────────────
    path('analytics/',               views.FoodAnalyticsView.as_view(),  name='food-analytics'),

    # ── Orders — fixed string paths MUST come before <int:pk> patterns ────────
    #
    # /orders/my/              — guest views their own orders
    # /orders/kitchen/         — kitchen staff view (excludes awaiting_payment)
    # /orders/admin/           — front desk / admin view (all statuses)
    # /orders/initiate-payment/ — NEW: create pay_now order + PayMongo session
    #                             Body: { food_item_id, quantity, payment_method }
    #                                or { order_id, payment_method }  (upgrade)
    #
    path('orders/my/',               views.GuestFoodOrderListView.as_view(),       name='food-orders-my'),
    path('orders/kitchen/',          views.KitchenOrderListView.as_view(),         name='food-orders-kitchen'),
    path('orders/admin/',            views.FoodOrdersAdminView.as_view(),          name='food-orders-admin'),
    path('orders/initiate-payment/', views.FoodOrderInitiatePaymentView.as_view(), name='food-initiate-payment'),

    # ── Orders — <int:pk> patterns LAST (Django matches top-down) ─────────────
    #
    # /orders/               POST — pay_checkout orders only (pay_now → initiate-payment)
    # /orders/<pk>/cancel/   PATCH — guest cancels unpaid pay_now order
    # /orders/<pk>/prepare/  PATCH — kitchen marks order preparing (PENDING → PREPARING)
    # /orders/<pk>/complete/ PATCH — kitchen marks order completed (PENDING/PREPARING → COMPLETED)
    # /orders/<pk>/mark-paid/ PATCH — front desk marks order paid at desk
    # /orders/<pk>/verify-payment/ GET — frontend polls after PayMongo redirect
    #
    path('orders/',                          views.FoodOrderCreateView.as_view(),          name='food-order-create'),
    path('orders/<int:pk>/cancel/',          views.FoodOrderCancelView.as_view(),          name='food-order-cancel'),
    path('orders/<int:pk>/prepare/',         views.FoodOrderPrepareView.as_view(),         name='food-order-prepare'),
    path('orders/<int:pk>/complete/',        views.FoodOrderCompleteView.as_view(),        name='food-order-complete'),
    path('orders/<int:pk>/mark-paid/',       views.FoodOrderMarkPaidView.as_view(),        name='food-order-mark-paid'),
    path('orders/<int:pk>/verify-payment/',  views.FoodOrderVerifyPaymentView.as_view(),   name='food-verify-payment'),
]