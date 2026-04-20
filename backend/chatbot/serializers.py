"""
chatbot/serializers.py
"""

from rest_framework import serializers
from .models import (
    Conversation, Message, SupportTicket,
    SenderType, TicketTier, TicketPriority, TicketCategory,
)


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
    messages       = MessageSerializer(many=True, read_only=True)
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
    user_email        = serializers.SerializerMethodField()
    assigned_to_name  = serializers.SerializerMethodField()
    status_display    = serializers.CharField(source="get_status_display",   read_only=True)
    tier_display      = serializers.CharField(source="get_tier_display",     read_only=True)
    priority_display  = serializers.CharField(source="get_priority_display", read_only=True)
    category_display  = serializers.CharField(source="get_category_display", read_only=True)
    message_count     = serializers.SerializerMethodField()
    escalated_by_name = serializers.SerializerMethodField()
    can_escalate      = serializers.BooleanField(read_only=True)
    next_tier         = serializers.CharField(read_only=True)

    class Meta:
        model  = SupportTicket
        fields = [
            # Identity
            "id", "conversation", "subject",
            # Status / routing
            "status", "status_display",
            "tier", "tier_display",
            "priority", "priority_display",
            "category", "category_display",
            # People
            "user_email", "assigned_to", "assigned_to_name",
            # Escalation audit
            "escalated_at", "escalated_by_name", "escalation_reason",
            # Misc
            "notes", "message_count", "can_escalate", "next_tier",
            "created_at", "updated_at", "closed_at",
        ]
        read_only_fields = [
            "id", "conversation", "user_email",
            "assigned_to_name", "status_display",
            "tier_display", "priority_display", "category_display",
            "message_count", "escalated_by_name",
            "can_escalate", "next_tier",
            "created_at", "updated_at",
        ]

    def get_user_email(self, obj):
        return obj.user.email if obj.user else "Anonymous"

    def get_assigned_to_name(self, obj):
        if obj.assigned_to:
            return obj.assigned_to.get_full_name() or obj.assigned_to.email
        return None

    def get_message_count(self, obj):
        return obj.conversation.messages.count()

    def get_escalated_by_name(self, obj):
        if obj.escalated_by:
            return obj.escalated_by.get_full_name() or obj.escalated_by.email
        return None


class SupportReplySerializer(serializers.Serializer):
    """Input for staff replying to a support conversation."""
    message = serializers.CharField(max_length=2000)


class EscalateTicketSerializer(serializers.Serializer):
    """Input for escalating a ticket to the next tier."""
    reason = serializers.CharField(
        max_length=500,
        required=False,
        allow_blank=True,
        default="",
    )