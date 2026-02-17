from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from . import views


app_name = "rooms"
urlpatterns = [
    # Django admin panel
    path("admin/", admin.site.urls),

    # Auth module — includes register, login, logout, token refresh, profile, etc.
    # All routes are defined in users/urls.py and prefixed with /api/auth/
    path("api/auth/", include("users.urls")),

    # Rooms module — public listings + admin management
    path("", views.RoomListView.as_view(), name="room-list"),


    # Future modules (add as they're built):
    # path("api/bookings/", include("bookings.urls")),
    # path("api/payments/", include("payments.urls")),
    # path("api/notifications/", include("notifications.urls")),
]

# Serve media files in development (room images, etc.)
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)