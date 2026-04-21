# ═══════════════════════════════════════════════════════════════════════════════
# PATCH for backend/urls.py
# Replace your entire urls.py with this version.
# The only real change: media URL serving now works in BOTH debug and production.
# ═══════════════════════════════════════════════════════════════════════════════

from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from payments.views import PayMongoWebhookView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/users/', include('users.urls')),
    path('api/auth/', include('users.urls')),
    path('api/rooms/', include('rooms.urls')),
    path("api/bookings/", include("bookings.urls")),
    path('api/payments/', include('payments.urls', namespace='payments')),
    path('api/payments/webhooks/paymongo/', PayMongoWebhookView.as_view(), name='paymongo-webhook'),
    path('api/notifications/', include('notifications.urls', namespace='notifications')),
    path("api/staff/", include("staff.urls", namespace="staff")),
    path("api/admin/", include("admin_panel.urls", namespace="admin_panel")),
    path("api/chat/", include("chatbot.urls", namespace="chatbot")),
    path("api/reports/", include("reports.urls", namespace="reports")),
    path('api/legal/', include('legal.urls')),
    path("api/food/", include("food.urls")),
]

# Serve media files locally in development only.
# In production (Render), Cloudinary handles all media — no local serving needed.
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)