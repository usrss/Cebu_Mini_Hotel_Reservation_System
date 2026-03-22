"""
chatbot/serializers.py
"""

from rest_framework import serializers
from .models import Conversation, Message, SupportTicket, SenderType


class MessageSerializer(serializers.ModelSerializer):
    sender_display = serializers.CharField(source="get_sender_display", read_only=True)

    class Meta:
        model  = Message
        fields = [
            "id", "sender", "sender_display",
            "message_text", "metadata", "timestamp",
        ]
        read_only_fields = fields


class ConversationSerializer(serializers.ModelSerializer):
    messages = MessageSerializer(many=True, read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model  = Conversation
        fields = [
            "id", "status", "status_display",
            "created_at", "updated_at", "messages",
        ]
        read_only_fields = fields


class ChatInputSerializer(serializers.Serializer):
    """Input for POST /api/chat/"""
    message         = serializers.CharField(max_length=2000)
    conversation_id = serializers.IntegerField(required=False, allow_null=True)
    session_key     = serializers.CharField(max_length=100, required=False, allow_blank=True)


class SupportTicketSerializer(serializers.ModelSerializer):
    user_email    = serializers.SerializerMethodField()
    assigned_to_name = serializers.SerializerMethodField()
    status_display   = serializers.CharField(source="get_status_display", read_only=True)
    message_count    = serializers.SerializerMethodField()

    class Meta:
        model  = SupportTicket
        fields = [
            "id", "conversation", "subject",
            "status", "status_display",
            "user_email", "assigned_to", "assigned_to_name",
            "notes", "message_count",
            "created_at", "updated_at", "closed_at",
        ]
        read_only_fields = [
            "id", "conversation", "user_email",
            "assigned_to_name", "status_display",
            "message_count", "created_at", "updated_at",
        ]

    def get_user_email(self, obj):
        return obj.user.email if obj.user else "Anonymous"

    def get_assigned_to_name(self, obj):
        if obj.assigned_to:
            return obj.assigned_to.get_full_name() or obj.assigned_to.email
        return None

    def get_message_count(self, obj):
        return obj.conversation.messages.count()


class SupportReplySerializer(serializers.Serializer):
    """Input for staff replying to a support conversation."""
    message = serializers.CharField(max_length=2000)