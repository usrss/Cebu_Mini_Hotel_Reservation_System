"""
chatbot/urls.py

URL patterns for the chatbot system.
All routes are under /api/chat/ (registered in root urls.py).
"""

from django.urls import path
from .views import (
    ChatView,
    ConversationHistoryView,
    PollMessagesView,
    DebugIntentView,
    SupportTicketListView,
    SupportTicketDetailView,
    SupportReplyView,
    SupportTicketCloseView,
    SupportTicketAssignView,
)

app_name = "chatbot"

urlpatterns = [
    # ── Main chat endpoint ─────────────────────────────────────────────────
    path("",                                  ChatView.as_view(),                name="chat"),

    # ── Conversation history ───────────────────────────────────────────────
    path("history/<int:conversation_id>/",    ConversationHistoryView.as_view(), name="history"),

    # ── Poll for new messages (widget polling for admin replies) ───────────
    path("poll/<int:conversation_id>/",       PollMessagesView.as_view(),        name="poll"),

    # ── Debug — test Gemini directly (disable in production) ──────────────
    path("debug/",                            DebugIntentView.as_view(),         name="debug"),

    # ── Support ticket management (Admin/Manager) ──────────────────────────
    path("support/tickets/",                  SupportTicketListView.as_view(),   name="ticket-list"),
    path("support/<int:ticket_id>/",          SupportTicketDetailView.as_view(), name="ticket-detail"),
    path("support/<int:ticket_id>/reply/",    SupportReplyView.as_view(),        name="ticket-reply"),
    path("support/<int:ticket_id>/close/",    SupportTicketCloseView.as_view(),  name="ticket-close"),
    path("support/<int:ticket_id>/assign/",   SupportTicketAssignView.as_view(), name="ticket-assign"),
]