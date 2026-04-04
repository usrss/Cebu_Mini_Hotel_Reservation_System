from django.contrib import admin
from .models import Conversation, Message, SupportTicket


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display   = ["id", "user", "status", "created_at", "updated_at"]
    list_filter    = ["status"]
    search_fields  = ["user__email", "session_key"]
    readonly_fields = ["created_at", "updated_at"]


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display   = ["id", "conversation", "sender", "message_text", "timestamp"]
    list_filter    = ["sender"]
    search_fields  = ["message_text"]
    readonly_fields = ["timestamp"]


@admin.register(SupportTicket)
class SupportTicketAdmin(admin.ModelAdmin):
    list_display   = [
        "id", "subject", "status", "tier", "priority", "category",
        "user", "assigned_to", "created_at",
    ]
    list_filter    = ["status", "tier", "priority", "category"]
    search_fields  = ["subject", "user__email"]
    readonly_fields = [
        "created_at", "updated_at", "closed_at",
        "escalated_at", "escalated_by",
    ]