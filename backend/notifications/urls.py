from django.urls import path
from . import views

app_name = "notifications"

urlpatterns = [
    # List all notifications for the authenticated user
    path("", views.NotificationListView.as_view(), name="notification-list"),

    # Unread badge counter
    path("unread-count/", views.NotificationUnreadCountView.as_view(), name="unread-count"),

    # Mark all unread → read
    path("mark-all-read/", views.NotificationMarkAllReadView.as_view(), name="mark-all-read"),

    # Mark a single notification as read
    path("<int:pk>/read/", views.NotificationMarkReadView.as_view(), name="mark-read"),
]