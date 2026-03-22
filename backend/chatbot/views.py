"""
chatbot/views.py

API views for the chatbot system.

Endpoints:
  POST /api/chat/                         — send a message, get bot response
  GET  /api/chat/history/<conversation_id>/ — get conversation history
  GET  /api/chat/support/tickets/         — list open tickets (Admin/Manager)
  GET  /api/chat/support/<ticket_id>/     — get ticket + conversation
  POST /api/chat/support/<ticket_id>/reply/ — staff reply to a conversation
  PATCH /api/chat/support/<ticket_id>/close/ — close a ticket
  PATCH /api/chat/support/<ticket_id>/assign/ — assign ticket to staff
"""

import logging

from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    Conversation, Message, SupportTicket,
    SenderType, ConversationStatus, TicketStatus,
)
from .serializers import (
    ChatInputSerializer, ConversationSerializer,
    MessageSerializer, SupportTicketSerializer, SupportReplySerializer,
)
from .services.gemini import detect_intent
from .services.intent_router import route
from .services.support_service import close_ticket

logger = logging.getLogger(__name__)


# ─── Helper: get or create conversation ──────────────────────────────────────

def _get_or_create_conversation(user, conversation_id, session_key):
    """
    Get an existing conversation or create a new one.

    Rules:
    - Authenticated users: match by conversation_id + user FK.
    - Anonymous users: match by conversation_id + session_key.
    - If the conversation_id doesn't belong to this user/session,
      silently create a NEW conversation instead of returning 403.
      This handles page reloads, token refreshes, and session changes.
    """
    is_auth = bool(user and user.is_authenticated)

    if conversation_id:
        try:
            conv = Conversation.objects.get(pk=conversation_id)

            # Authenticated user — conversation must belong to them
            # (conv.user may be None if it was started anonymously)
            if is_auth:
                if conv.user is None or conv.user == user:
                    # Claim anonymous conversation or return own conversation
                    if conv.user is None:
                        conv.user = user
                        conv.session_key = ""
                        conv.save(update_fields=["user", "session_key", "updated_at"])
                    return conv, False
                # Belongs to a different user — start fresh, don't 403
            else:
                # Anonymous user — match by session_key
                if not conv.session_key or conv.session_key == session_key:
                    return conv, False
                # Different session — start fresh, don't 403

        except Conversation.DoesNotExist:
            pass  # conversation_id is stale — create new below

    # Create a new conversation
    conv = Conversation.objects.create(
        user=user if is_auth else None,
        session_key="" if is_auth else (session_key or ""),
    )
    return conv, True


# ─── Chat endpoint ────────────────────────────────────────────────────────────

class ChatView(APIView):
    """
    POST /api/chat/

    Accepts a user message, runs intent detection via Gemini,
    routes to the appropriate backend service, and returns a bot response.

    Works for both authenticated and unauthenticated users.
    Unauthenticated users get general info only (no booking data).
    """
    permission_classes     = [AllowAny]
    authentication_classes = []  # Skip JWT auth entirely — we handle user manually below

    def post(self, request):
        serializer = ChatInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user_message    = serializer.validated_data["message"].strip()
        conversation_id = serializer.validated_data.get("conversation_id")
        session_key     = serializer.validated_data.get("session_key", "")

        # ── Manually resolve user from JWT if present ──────────────────────
        user = _get_user_from_request(request)

        # ── Staff recognition — redirect to support dashboard ─────────────
        # Staff should use the Support Dashboard, not the guest chat widget.
        if user and getattr(user, 'is_staff', False):
            profile = getattr(user, 'staff_profile', None)
            role = profile.effective_role if profile else 'staff'
            return Response({
                "conversation_id": None,
                "message":         (
                    f"Hi {user.first_name or user.email}! 👋 "
                    f"As a **{role.replace('_', ' ').title()}**, you can manage guest support tickets "
                    f"directly from the **Support Dashboard** at `/admin/support`.\n\n"
                    f"This chat widget is for hotel guests only."
                ),
                "intent":          "STAFF_REDIRECT",
                "data":            {"redirect": "/admin/support"},
                "escalated":       False,
                "quick_replies":   [],
                "user_message_id": None,
                "bot_message_id":  None,
            })

        # ── Get or create conversation ─────────────────────────────────────
        conversation, is_new = _get_or_create_conversation(
            user, conversation_id, session_key
        )

        # ── Save user message ──────────────────────────────────────────────
        user_msg = Message.objects.create(
            conversation=conversation,
            sender=SenderType.USER,
            message_text=user_message,
        )

        # ── If conversation is in support mode ────────────────────────────
        # Just save the user message. No bot auto-reply spam.
        # The admin will reply from the Support Dashboard.
        # Only send the "sent to support" message ONCE (first time entering support mode).
        if conversation.is_in_support_mode:
            # Check if we already sent the "connected to support" notice
            already_notified = conversation.messages.filter(
                sender=SenderType.BOT,
                message_text__icontains="support team"
            ).exists()

            if not already_notified:
                bot_text = (
                    "Your message has been sent to our support team. 🙋\n"
                    "A staff member will respond shortly. "
                    "Thank you for your patience!"
                )
                bot_msg = Message.objects.create(
                    conversation=conversation,
                    sender=SenderType.BOT,
                    message_text=bot_text,
                )
                return Response({
                    "conversation_id": conversation.id,
                    "message":         bot_text,
                    "intent":          "SUPPORT_REQUEST",
                    "data":            None,
                    "escalated":       True,
                    "quick_replies":   [],
                    "user_message_id": user_msg.id,
                    "bot_message_id":  bot_msg.id,
                })
            else:
                # Already notified — just confirm message was received, no spam
                return Response({
                    "conversation_id": conversation.id,
                    "message":         "✓ Message received. Our support team will reply shortly.",
                    "intent":          "SUPPORT_REQUEST",
                    "data":            None,
                    "escalated":       True,
                    "quick_replies":   [],
                    "user_message_id": user_msg.id,
                    "bot_message_id":  None,
                })

        # ── Build conversation history for Gemini context ──────────────────
        recent_msgs = conversation.messages.order_by("-timestamp")[:8]
        history = [
            {"sender": m.sender, "text": m.message_text}
            for m in reversed(recent_msgs)
        ]

        # ── Detect intent via Gemini ───────────────────────────────────────
        try:
            intent_result = detect_intent(user_message, conversation_history=history)
            logger.info("Intent detected: %s (confidence=%.2f) for message: %s",
                        intent_result.get("intent"), intent_result.get("confidence", 0), user_message)
        except Exception as exc:
            logger.error("Gemini detection crashed: %s", exc, exc_info=True)
            # Fallback — don't leave user with no response
            intent_result = {
                "intent": "HOTEL_INFO",
                "entities": {},
                "confidence": 0.9,
                "raw_intent_summary": "fallback",
            }

        # ── Route to appropriate handler ───────────────────────────────────
        try:
            response_data = route(
                intent_result=intent_result,
                conversation=conversation,
                user=user,
                user_message=user_message,
            )
        except Exception as exc:
            logger.error("Intent router crashed: %s", exc, exc_info=True)
            # Fallback response so user sees something
            response_data = {
                "message":       "I'm sorry, I ran into an issue. Please try again or ask something else.",
                "intent":        "UNKNOWN",
                "data":          None,
                "escalated":     False,
                "quick_replies": ["Check availability", "View prices", "Hotel information", "Talk to support"],
            }

        # ── Save bot response ──────────────────────────────────────────────
        bot_msg = Message.objects.create(
            conversation=conversation,
            sender=SenderType.BOT,
            message_text=response_data["message"],
            metadata={
                "intent":       response_data.get("intent"),
                "data":         response_data.get("data"),
                "quick_replies": response_data.get("quick_replies", []),
            },
        )

        # Update conversation timestamp
        conversation.save(update_fields=["updated_at"])

        return Response({
            "conversation_id": conversation.id,
            "message":         response_data["message"],
            "intent":          response_data.get("intent"),
            "data":            response_data.get("data"),
            "escalated":       response_data.get("escalated", False),
            "quick_replies":   response_data.get("quick_replies", []),
            "user_message_id": user_msg.id,
            "bot_message_id":  bot_msg.id,
        })


# ─── Conversation history ─────────────────────────────────────────────────────

class ConversationHistoryView(APIView):
    """
    GET /api/chat/history/<conversation_id>/

    Returns all messages in a conversation.
    Users can only access their own conversations.
    """
    permission_classes = [AllowAny]

    def get(self, request, conversation_id):
        session_key = request.query_params.get("session_key", "")
        user = request.user if request.user.is_authenticated else None

        try:
            conv = Conversation.objects.prefetch_related("messages").get(pk=conversation_id)
        except Conversation.DoesNotExist:
            return Response({"error": "Conversation not found."}, status=status.HTTP_404_NOT_FOUND)

        # Security check
        if user and conv.user and conv.user != user:
            return Response({"error": "Access denied."}, status=status.HTTP_403_FORBIDDEN)
        if not user and conv.session_key and conv.session_key != session_key:
            return Response({"error": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

        serializer = ConversationSerializer(conv)
        return Response(serializer.data)


# ─── Support ticket list (Admin/Manager) ─────────────────────────────────────

class SupportTicketListView(APIView):
    """
    GET /api/chat/support/tickets/

    Returns all open/in-progress support tickets.
    Accessible by Admin and Manager only.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_admin_or_manager(request.user):
            return Response(
                {"error": "Only Admin and Manager can view support tickets."},
                status=status.HTTP_403_FORBIDDEN,
            )

        ticket_status = request.query_params.get("status", "")
        qs = SupportTicket.objects.select_related(
            "conversation", "user", "assigned_to"
        ).order_by("-created_at")

        if ticket_status in ("open", "in_progress", "closed"):
            qs = qs.filter(status=ticket_status)
        else:
            # Default: open + in_progress
            qs = qs.filter(status__in=[TicketStatus.OPEN, TicketStatus.IN_PROGRESS])

        serializer = SupportTicketSerializer(qs, many=True)
        return Response({
            "count":   qs.count(),
            "tickets": serializer.data,
        })


# ─── Support ticket detail + conversation ─────────────────────────────────────

class SupportTicketDetailView(APIView):
    """
    GET /api/chat/support/<ticket_id>/

    Returns ticket details + full conversation history.
    Admin/Manager only.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, ticket_id):
        if not _is_admin_or_manager(request.user):
            return Response(
                {"error": "Only Admin and Manager can view support tickets."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            ticket = SupportTicket.objects.select_related(
                "conversation", "user", "assigned_to"
            ).get(pk=ticket_id)
        except SupportTicket.DoesNotExist:
            return Response({"error": "Ticket not found."}, status=status.HTTP_404_NOT_FOUND)

        ticket_data   = SupportTicketSerializer(ticket).data
        conv_data     = ConversationSerializer(ticket.conversation).data

        return Response({
            "ticket":       ticket_data,
            "conversation": conv_data,
        })


# ─── Staff reply to support conversation ─────────────────────────────────────

class SupportReplyView(APIView):
    """
    POST /api/chat/support/<ticket_id>/reply/

    Staff sends a message in a support conversation.
    Admin/Manager only.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, ticket_id):
        if not _is_admin_or_manager(request.user):
            return Response(
                {"error": "Only Admin and Manager can reply to support tickets."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            ticket = SupportTicket.objects.select_related("conversation").get(pk=ticket_id)
        except SupportTicket.DoesNotExist:
            return Response({"error": "Ticket not found."}, status=status.HTTP_404_NOT_FOUND)

        if ticket.status == TicketStatus.CLOSED:
            return Response(
                {"error": "Cannot reply to a closed ticket."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = SupportReplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        message = Message.objects.create(
            conversation=ticket.conversation,
            sender=SenderType.SUPPORT,
            sent_by_staff=request.user,
            message_text=serializer.validated_data["message"],
        )

        # Auto-assign if not yet assigned
        if not ticket.assigned_to:
            ticket.assigned_to = request.user

        # Move to in_progress
        if ticket.status == TicketStatus.OPEN:
            ticket.status = TicketStatus.IN_PROGRESS

        ticket.save(update_fields=["assigned_to", "status", "updated_at"])

        return Response({
            "message": MessageSerializer(message).data,
            "ticket":  SupportTicketSerializer(ticket).data,
        })


# ─── Close ticket ─────────────────────────────────────────────────────────────

class SupportTicketCloseView(APIView):
    """
    PATCH /api/chat/support/<ticket_id>/close/
    Admin/Manager only.
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request, ticket_id):
        if not _is_admin_or_manager(request.user):
            return Response(
                {"error": "Only Admin and Manager can close tickets."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            ticket = SupportTicket.objects.select_related("conversation").get(pk=ticket_id)
        except SupportTicket.DoesNotExist:
            return Response({"error": "Ticket not found."}, status=status.HTTP_404_NOT_FOUND)

        ticket = close_ticket(ticket, closed_by=request.user)
        return Response(SupportTicketSerializer(ticket).data)


# ─── Assign ticket ────────────────────────────────────────────────────────────

class SupportTicketAssignView(APIView):
    """
    PATCH /api/chat/support/<ticket_id>/assign/
    Body: { "assigned_to": <user_id> }
    Admin/Manager only.
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request, ticket_id):
        if not _is_admin_or_manager(request.user):
            return Response(
                {"error": "Only Admin and Manager can assign tickets."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            ticket = SupportTicket.objects.get(pk=ticket_id)
        except SupportTicket.DoesNotExist:
            return Response({"error": "Ticket not found."}, status=status.HTTP_404_NOT_FOUND)

        from django.contrib.auth import get_user_model
        User = get_user_model()

        assigned_to_id = request.data.get("assigned_to")
        if assigned_to_id:
            try:
                assignee = User.objects.get(pk=assigned_to_id, is_staff=True)
                if not _is_admin_or_manager(assignee):
                    return Response(
                        {"error": "Can only assign to Admin or Manager."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                ticket.assigned_to = assignee
            except User.DoesNotExist:
                return Response({"error": "Staff member not found."}, status=status.HTTP_404_NOT_FOUND)
        else:
            ticket.assigned_to = None

        ticket.save(update_fields=["assigned_to", "updated_at"])
        return Response(SupportTicketSerializer(ticket).data)


# ─── Poll for new messages (used by widget to receive admin replies) ──────────

class PollMessagesView(APIView):
    """
    GET /api/chat/poll/<conversation_id>/?after=<message_id>
    """
    permission_classes     = [AllowAny]
    authentication_classes = []

    def get(self, request, conversation_id):
        after_id    = request.query_params.get("after", 0)
        session_key = request.query_params.get("session_key", "")
        user        = _get_user_from_request(request)

        try:
            conv = Conversation.objects.get(pk=conversation_id)
        except Conversation.DoesNotExist:
            return Response({"messages": []})

        # Security: only the owner can poll
        if user and conv.user and conv.user != user:
            return Response({"messages": []})
        if not user and conv.session_key and conv.session_key != session_key:
            return Response({"messages": []})

        new_messages = conv.messages.filter(
            id__gt=int(after_id)
        ).order_by("timestamp")

        return Response({
            "messages":    MessageSerializer(new_messages, many=True).data,
            "is_escalated": conv.is_in_support_mode,
        })


# ─── Debug: test Gemini directly ──────────────────────────────────────────────

class DebugIntentView(APIView):
    """
    GET /api/chat/debug/?message=hi
    Tests Gemini intent detection directly so you can see what it returns.
    Admin only. Remove or disable in production.
    """
    permission_classes = [AllowAny]  # open for debugging — restrict later

    def get(self, request):
        message = request.query_params.get("message", "hi")
        try:
            result = detect_intent(message)
            return Response({"message": message, "gemini_result": result})
        except Exception as exc:
            import traceback
            return Response(
                {"error": str(exc), "traceback": traceback.format_exc()},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


def _get_user_from_request(request):
    """
    Manually extract authenticated user from JWT Bearer token.
    Returns the user if token is valid, None otherwise.
    Used by views with authentication_classes=[] so they never return 401.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header.split(" ", 1)[1].strip()
    if not token:
        return None
    try:
        from rest_framework_simplejwt.authentication import JWTAuthentication
        jwt_auth = JWTAuthentication()
        validated = jwt_auth.get_validated_token(token)
        return jwt_auth.get_user(validated)
    except Exception:
        return None


def _is_admin_or_manager(user) -> bool:
    """Check if user has Admin or Manager staff role."""
    if not user or not user.is_authenticated:
        return False
    profile = getattr(user, "staff_profile", None)
    if not profile or not profile.is_active:
        return False
    from staff.models import StaffRole
    return profile.effective_role in (StaffRole.ADMIN, StaffRole.MANAGER)