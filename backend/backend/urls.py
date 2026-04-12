"""
URL configuration for backend project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
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

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)


