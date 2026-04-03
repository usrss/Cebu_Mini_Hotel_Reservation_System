
from django.urls import path
from . import views

app_name = "rooms"

urlpatterns = [
    # Public Endpoints
    path("", views.RoomListView.as_view(), name="room-list"),
    path("<int:pk>/", views.RoomDetailView.as_view(), name="room-detail"),
    path("availability/", views.RoomAvailabilityView.as_view(), name="room-availability"),
    path("lock/", views.RoomLockView.as_view(), name="room-lock"),
    path("lock/release/", views.RoomLockReleaseView.as_view(), name="room-lock-release"),

    # Review endpoints - NEW
    path("reviews/", views.RoomReviewCreateView.as_view(), name="review-create"),
    path("reviews/pending/", views.GuestPendingReviewsView.as_view(), name="review-pending"),

    # Admin Endpoints
    path("admin/", views.AdminRoomListCreateView.as_view(), name="admin-room-list-create"),
    path("admin/<int:pk>/", views.AdminRoomDetailView.as_view(), name="admin-room-detail"),
    path("admin/<int:pk>/status/", views.AdminRoomStatusView.as_view(), name="admin-room-status"),
    path("admin/<int:pk>/images/", views.AdminRoomImageUploadView.as_view(), name="admin-room-images"),
    path("admin/<int:pk>/price-history/", views.AdminRoomPriceHistoryView.as_view(), name="admin-room-price-history"),

    path("<int:pk>/calculate-price/", views.RoomPriceCalculationView.as_view(), name="room-price-calculation"),

    path("featured/", views.FeaturedRoomsView.as_view(), name="featured-rooms"),
    path("trending/", views.TrendingRoomsView.as_view(), name="trending-rooms"),
    path("by-view/", views.RoomsByViewTypeView.as_view(), name="rooms-by-view"),

    path("reviews/token/<uuid:token>/", views.ReviewTokenValidateView.as_view(),  name="review-token-validate"),
]