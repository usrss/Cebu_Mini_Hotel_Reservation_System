from django.utils import timezone
from rest_framework import generics
from rest_framework import status as http_status   # renamed to avoid shadowing
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import Notification, NotificationStatus
from .serializers import NotificationSerializer, NotificationUnreadCountSerializer


class NotificationListView(generics.ListAPIView):
    """
    GET /api/notifications/
    Returns the authenticated user's notifications, newest first.
    Optional query param: ?status=unread  or  ?status=read

    Used by: dashboard bell panel and /notifications page.
    """
    serializer_class   = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = (
            Notification.objects
            .filter(recipient=self.request.user)
            .select_related("booking")   # avoids N+1 on booking_reference
        )

        status_param = self.request.query_params.get("status")
        if status_param in (NotificationStatus.UNREAD, NotificationStatus.READ):
            qs = qs.filter(status=status_param)

        return qs


class NotificationUnreadCountView(APIView):
    """
    GET /api/notifications/unread-count/
    Returns {"unread_count": <int>} for the nav-bar badge.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        count = Notification.objects.filter(
            recipient=request.user,
            status=NotificationStatus.UNREAD,
        ).count()
        serializer = NotificationUnreadCountSerializer({"unread_count": count})
        return Response(serializer.data)


class NotificationMarkReadView(APIView):
    """
    PATCH /api/notifications/<pk>/read/
    Marks one notification as READ and records read_at.
    Returns the updated notification object.
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        try:
            notification = Notification.objects.select_related("booking").get(
                pk=pk,
                recipient=request.user,   # security: users can only mark their own
            )
        except Notification.DoesNotExist:
            return Response(
                {"detail": "Notification not found."},
                status=http_status.HTTP_404_NOT_FOUND,
            )

        if notification.status == NotificationStatus.UNREAD:
            notification.status  = NotificationStatus.READ
            notification.read_at = timezone.now()
            notification.save(update_fields=["status", "read_at"])

        # Pass request context so any absolute URL fields resolve correctly
        serializer = NotificationSerializer(
            notification, context={"request": request}
        )
        return Response(serializer.data)


class NotificationMarkAllReadView(APIView):
    """
    PATCH /api/notifications/mark-all-read/
    Marks ALL of the current user's unread notifications as read.
    Returns {"marked_read": <count>}.
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request):
        now = timezone.now()
        updated = Notification.objects.filter(
            recipient=request.user,
            status=NotificationStatus.UNREAD,
        ).update(
            status=NotificationStatus.READ,
            read_at=now,
        )
        return Response({"marked_read": updated})