from django.urls import path
from . import views
from .views import HotelSettingsView, RoomUnavailableDatesView

app_name = "rooms"

urlpatterns = [
    # ── Public ────────────────────────────────────────────────────────────────
    path("", views.RoomListView.as_view(), name="room-list"),
    path("<int:pk>/", views.RoomDetailView.as_view(), name="room-detail"),
    path("availability/", views.RoomAvailabilityView.as_view(), name="room-availability"),
    path('<int:pk>/unavailable-dates/', RoomUnavailableDatesView.as_view()),
    path("lock/", views.RoomLockView.as_view(), name="room-lock"),
    path("lock/release/", views.RoomLockReleaseView.as_view(), name="room-lock-release"),
    path("featured/", views.FeaturedRoomsView.as_view(), name="featured-rooms"),
    path("trending/", views.TrendingRoomsView.as_view(), name="trending-rooms"),
    path("by-view/", views.RoomsByViewTypeView.as_view(), name="rooms-by-view"),
    path("<int:pk>/calculate-price/", views.RoomPriceCalculationView.as_view(), name="room-price-calculation"),

    # ── Reviews ───────────────────────────────────────────────────────────────
    path("reviews/", views.RoomReviewCreateView.as_view(), name="review-create"),
    path("reviews/pending/", views.GuestPendingReviewsView.as_view(), name="review-pending"),
    path("reviews/<int:review_id>/helpful/", views.ReviewHelpfulnessVoteView.as_view(), name="review-helpfulness"),
    path("reviews/token/<uuid:token>/", views.ReviewTokenView.as_view(), name="review-token"),

    # ── Admin rooms ───────────────────────────────────────────────────────────
    path("admin/", views.AdminRoomListCreateView.as_view(), name="admin-room-list-create"),
    path("admin/<int:pk>/", views.AdminRoomDetailView.as_view(), name="admin-room-detail"),
    path("admin/<int:pk>/status/", views.AdminRoomStatusView.as_view(), name="admin-room-status"),
    path("admin/<int:pk>/images/", views.AdminRoomImageUploadView.as_view(), name="admin-room-images"),
    path("admin/<int:pk>/price-history/", views.AdminRoomPriceHistoryView.as_view(), name="admin-room-price-history"),

    # ── Amenities ─────────────────────────────────────────────────────────────
    # FIX: these routes were missing — caused 404 on every amenity/inclusion call
    path("amenities/", views.AmenityListCreateView.as_view(), name="amenity-list-create"),
    path("amenities/<int:pk>/", views.AmenityDetailView.as_view(), name="amenity-detail"),

    # ── Inclusions ────────────────────────────────────────────────────────────
    path("inclusions/", views.InclusionListCreateView.as_view(), name="inclusion-list-create"),
    path("inclusions/<int:pk>/", views.InclusionDetailView.as_view(), name="inclusion-detail"),

    # ── Hotel settings ────────────────────────────────────────────────────────
    path("hotel/settings/", HotelSettingsView.as_view(), name="hotel-settings"),
]