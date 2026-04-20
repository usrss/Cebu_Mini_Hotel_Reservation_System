from rest_framework import serializers
from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    """
    Read serializer for the notification list and detail endpoints.
    All fields are read-only — writes are handled by dedicated PATCH endpoints.
    """
    event_display          = serializers.CharField(source="get_event_display",           read_only=True)
    status_display         = serializers.CharField(source="get_status_display",          read_only=True)
    recipient_type_display = serializers.CharField(source="get_recipient_type_display",  read_only=True)
    channel_display        = serializers.CharField(source="get_channel_display",         read_only=True)
    is_unread              = serializers.ReadOnlyField()

    # Booking FK id exposed directly (no extra query)
    booking_id = serializers.IntegerField(read_only=True)
    # Reference number requires a related object lookup
    booking_reference = serializers.SerializerMethodField()

    class Meta:
        model  = Notification
        fields = [
            "id",
            "event",
            "event_display",
            "recipient_type",
            "recipient_type_display",
            "channel",
            "channel_display",
            "title",
            "description",
            "status",
            "status_display",
            "is_unread",
            "booking_id",
            "booking_reference",
            "created_at",
            "read_at",
        ]
        # Explicitly list every field as read-only using a tuple literal
        read_only_fields = (
            "id",
            "event",
            "event_display",
            "recipient_type",
            "recipient_type_display",
            "channel",
            "channel_display",
            "title",
            "description",
            "status",
            "status_display",
            "is_unread",
            "booking_id",
            "booking_reference",
            "created_at",
            "read_at",
        )

    def get_booking_reference(self, obj):
        """Return the booking reference number, or None if no booking attached."""
        if obj.booking_id is None:
            return None
        return getattr(obj.booking, "reference_number", None)


class NotificationUnreadCountSerializer(serializers.Serializer):
    """Response shape for GET /api/notifications/unread-count/"""
    unread_count = serializers.IntegerField()