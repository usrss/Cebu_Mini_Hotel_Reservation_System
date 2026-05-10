"""
chatbot/views.py

API views for the chatbot system with role-based ticket routing.

Endpoints:
  POST /api/chat/                              — send message, get bot response
  GET  /api/chat/history/<conversation_id>/   — conversation history
  GET  /api/chat/poll/<conversation_id>/      — poll for new messages
  GET  /api/chat/debug/                       — test Gemini/Groq directly
  GET  /api/chat/support/tickets/             — list tickets (role-scoped)
  GET  /api/chat/support/<ticket_id>/         — ticket detail + conversation
  POST /api/chat/support/<ticket_id>/reply/   — staff reply
  PATCH /api/chat/support/<ticket_id>/close/  — close ticket
  PATCH /api/chat/support/<ticket_id>/assign/ — assign ticket
  POST /api/chat/support/<ticket_id>/escalate/ — escalate to next tier

Routing rules:
  - SUPPORT_REQUEST / CANCEL_BOOKING / critical keywords → classifier decides tier
  - FAQ intents (GREETING, HOTEL_INFO, etc.) → bot handles, no ticket
  - Normal issues → FRONT_DESK tier
  - VIP / refund / complex → MANAGER tier
  - Payment errors / security → ADMIN tier (CRITICAL priority)

Access scoping:
  - Admin: sees all tiers
  - Manager: sees MANAGER + ADMIN tier tickets
  - Front Desk / Receptionist: sees FRONT_DESK tier only
"""

import logging

from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    Conversation, Message, SupportTicket,
    SenderType, ConversationStatus,
    TicketStatus, TicketTier, TicketPriority, TicketCategory,
)
from .serializers import (
    ChatInputSerializer, ConversationSerializer,
    MessageSerializer, SupportTicketSerializer,
    SupportReplySerializer, EscalateTicketSerializer,
)

from .services.gemini import detect_intent
from .services.intent_router import route
from .services.classifier import classify_message, FAQ_INTENTS
from .services.support_service import (
    escalate_to_support, escalate_ticket, close_ticket, get_tickets_for_user,
)

logger = logging.getLogger(__name__)


# ─── Helper: get or create conversation ──────────────────────────────────────

def _get_or_create_conversation(user, conversation_id, session_key):
    """
    Get an existing conversation or create a new one.
    Silently creates a new one if the ID belongs to a different session.
    """
    is_auth = bool(user and user.is_authenticated)

    if conversation_id:
        try:
            conv = Conversation.objects.get(pk=conversation_id)

            if is_auth:
                if conv.user is None or conv.user == user:
                    if conv.user is None:
                        conv.user        = user
                        conv.session_key = ""
                        conv.save(update_fields=["user", "session_key", "updated_at"])
                    return conv, False
            else:
                if not conv.session_key or conv.session_key == session_key:
                    return conv, False

        except Conversation.DoesNotExist:
            pass

    conv = Conversation.objects.create(
        user        = user if is_auth else None,
        session_key = "" if is_auth else (session_key or ""),
    )
    return conv, True


# ─── Permission helpers ───────────────────────────────────────────────────────

def _get_staff_role(user) -> str | None:
    if not user or not user.is_authenticated:
        return None
    profile = getattr(user, "staff_profile", None)
    if not profile or not profile.is_active:
        return None
    return profile.effective_role


def _is_admin_or_manager(user) -> bool:
    role = _get_staff_role(user)
    return role in ("admin", "manager")


def _is_front_desk_or_above(user) -> bool:
    role = _get_staff_role(user)
    return role in ("admin", "manager", "front_desk", "receptionist")


def _can_view_ticket(user, ticket: SupportTicket) -> bool:
    """Enforce tier-based ticket visibility."""
    role = _get_staff_role(user)
    if not role:
        return False
    if role == "admin":
        return True
    if role == "manager":
        return ticket.tier in (TicketTier.MANAGER, TicketTier.ADMIN)
    if role in ("front_desk", "receptionist"):
        return ticket.tier == TicketTier.FRONT_DESK
    return False


def _can_reply_to_ticket(user, ticket: SupportTicket) -> bool:
    """Staff can only reply to tickets in their tier or below."""
    return _can_view_ticket(user, ticket)


# ─── Chat endpoint ────────────────────────────────────────────────────────────

class ChatView(APIView):
    """
    POST /api/chat/

    Message flow:
      1. Detect intent via Groq/Gemini.
      2. Classify: FAQ → bot responds, no ticket.
                   Support → classify tier/priority, escalate_to_support().
      3. Route intent to appropriate handler.
      4. Save user + bot messages to DB.
      5. Return structured response to widget.
    """
    permission_classes     = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = ChatInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user_message    = serializer.validated_data["message"].strip()
        conversation_id = serializer.validated_data.get("conversation_id")
        session_key     = serializer.validated_data.get("session_key", "")

        # ── Resolve user from JWT ──────────────────────────────────────────
        user = _get_user_from_request(request)

        # ── Staff redirect ─────────────────────────────────────────────────
        if user and getattr(user, "is_staff", False):
            profile = getattr(user, "staff_profile", None)
            role    = profile.effective_role if profile else "staff"
            return Response({
                "conversation_id": None,
                "message": (
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
        conversation, _ = _get_or_create_conversation(user, conversation_id, session_key)

        # ── Save user message ──────────────────────────────────────────────
        user_msg = Message.objects.create(
            conversation = conversation,
            sender       = SenderType.USER,
            message_text = user_message,
        )

        # ── Closed conversation — reject new messages entirely ────────────
        # close_ticket() sets conversation.status = ConversationStatus.CLOSED.
        # Without this check the message would fall through to the bot pipeline
        # and generate a new reply as if nothing happened.
        if conversation.status == ConversationStatus.CLOSED:
            return Response({
                "conversation_id": conversation.id,
                "message":         "This conversation has been resolved and closed. Please start a new chat if you need further assistance.",
                "intent":          "CLOSED",
                "data":            None,
                "escalated":       False,
                "closed":          True,
                "quick_replies":   [],
                "user_message_id": user_msg.id,
                "bot_message_id":  None,
            }, status=status.HTTP_200_OK)

        # ── Already in support mode — accept message, no bot spam ──────────
        if conversation.is_in_support_mode:
            already_notified = conversation.messages.filter(
                sender       = SenderType.BOT,
                message_text__icontains = "support team",
            ).exists()

            if not already_notified:
                bot_text = (
                    "Your message has been sent to our support team. \n"
                    "A staff member will respond shortly. "
                    "Thank you for your patience!"
                )
                bot_msg = Message.objects.create(
                    conversation = conversation,
                    sender       = SenderType.BOT,
                    message_text = bot_text,
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

        # ── Build context for intent detection ─────────────────────────────
        recent_msgs = conversation.messages.order_by("-timestamp")[:8]
        history = [
            {"sender": m.sender, "text": m.message_text}
            for m in reversed(recent_msgs)
        ]

        # ── Detect intent ──────────────────────────────────────────────────
        try:
            intent_result = detect_intent(user_message, conversation_history=history)
            logger.info(
                "Intent: %s (confidence=%.2f) for: %s",
                intent_result.get("intent"), intent_result.get("confidence", 0), user_message,
            )
        except Exception as exc:
            logger.error("Intent detection crashed: %s", exc, exc_info=True)
            intent_result = {
                "intent":             "HOTEL_INFO",
                "entities":           {},
                "confidence":         0.9,
                "raw_intent_summary": "fallback",
                "language":           "english",
            }

        intent     = intent_result.get("intent", "UNKNOWN")
        confidence = float(intent_result.get("confidence", 0.85))
        language   = intent_result.get("language", "english")
        summary    = intent_result.get("raw_intent_summary", "")

        # ── Classify: FAQ vs support ticket ───────────────────────────────
        classification = classify_message(
            message    = user_message,
            intent     = intent,
            confidence = confidence,
            language   = language,
            user       = user,
        )

        logger.info(
            "Classification: is_faq=%s tier=%s priority=%s category=%s | %s",
            classification["is_faq"],
            classification["ticket_tier"],
            classification["ticket_priority"],
            classification["ticket_category"],
            classification["routing_reason"],
        )

        # ── Route to intent handler ────────────────────────────────────────
        try:
            response_data = route(
                intent_result = intent_result,
                conversation  = conversation,
                user          = user,
                user_message  = user_message,
            )
        except Exception as exc:
            logger.error("Intent router crashed: %s", exc, exc_info=True)
            response_data = {
                "message":       "I'm sorry, I ran into an issue. Please try again or ask something else.",
                "intent":        "UNKNOWN",
                "data":          None,
                "escalated":     False,
                "quick_replies": ["Check availability", "View prices", "Hotel information", "Talk to support"],
            }

        # ── If classifier says this needs a ticket — escalate ─────────────
        escalated  = False
        ticket_id  = None
        ticket_status_val = None

        if not classification["is_faq"] and not response_data.get("escalated"):
            try:
                ticket = escalate_to_support(
                    conversation = conversation,
                    subject      = summary[:120] or user_message[:120],
                    tier         = classification["ticket_tier"],
                    priority     = classification["ticket_priority"],
                    category     = classification["ticket_category"],
                )
                escalated         = True
                ticket_id         = ticket.pk
                ticket_status_val = ticket.status

                # Inject ticket context into response message
                tier_label = {
                    TicketTier.FRONT_DESK: "Front Desk",
                    TicketTier.MANAGER:    "Manager",
                    TicketTier.ADMIN:      "Admin Team",
                }.get(ticket.tier, "Support Team")

                if ticket.priority in (TicketPriority.HIGH, TicketPriority.CRITICAL):
                    priority_note = " This has been marked as **priority** and will be handled urgently."
                else:
                    priority_note = ""

                response_data["message"] = (
                    f"{response_data['message']}\n\n"
                    f"---\n"
                    f"📋 **Support Ticket #{ticket.pk}** has been created and routed to our **{tier_label}**."
                    f"{priority_note}"
                )
                response_data["escalated"]    = True
                response_data["quick_replies"] = []

            except Exception as exc:
                logger.error("escalate_to_support failed: %s", exc, exc_info=True)

        elif response_data.get("escalated"):
            # Router itself triggered escalation (SUPPORT_REQUEST intent via _handle_support)
            try:
                existing_ticket = getattr(conversation, "support_ticket", None)
                if existing_ticket:
                    ticket_id         = existing_ticket.pk
                    ticket_status_val = existing_ticket.status
            except Exception:
                pass
            escalated = True

        # ── Save bot response ──────────────────────────────────────────────
        bot_msg = Message.objects.create(
            conversation = conversation,
            sender       = SenderType.BOT,
            message_text = response_data["message"],
            metadata     = {
                "intent":        response_data.get("intent"),
                "data":          response_data.get("data"),
                "quick_replies": response_data.get("quick_replies", []),
                "ticket_id":     ticket_id,
                "ticket_tier":   classification.get("ticket_tier"),
            },
        )

        conversation.save(update_fields=["updated_at"])

        return Response({
            "conversation_id": conversation.id,
            "message":         response_data["message"],
            "intent":          response_data.get("intent"),
            "data":            response_data.get("data"),
            "escalated":       escalated,
            "quick_replies":   response_data.get("quick_replies", []),
            "user_message_id": user_msg.id,
            "bot_message_id":  bot_msg.id,
            # Extra ticket context for frontend
            "ticket": {
                "id":       ticket_id,
                "status":   ticket_status_val,
                "tier":     classification.get("ticket_tier"),
                "priority": classification.get("ticket_priority"),
                "category": classification.get("ticket_category"),
            } if ticket_id else None,
        })


# ─── Conversation history ─────────────────────────────────────────────────────

class ConversationHistoryView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, conversation_id):
        session_key = request.query_params.get("session_key", "")
        user        = request.user if request.user.is_authenticated else None

        try:
            conv = Conversation.objects.prefetch_related("messages").get(pk=conversation_id)
        except Conversation.DoesNotExist:
            return Response({"error": "Conversation not found."}, status=status.HTTP_404_NOT_FOUND)

        if user and conv.user and conv.user != user:
            return Response({"error": "Access denied."}, status=status.HTTP_403_FORBIDDEN)
        if not user and conv.session_key and conv.session_key != session_key:
            return Response({"error": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

        return Response(ConversationSerializer(conv).data)


# ─── Support ticket list — role-scoped ───────────────────────────────────────

class SupportTicketListView(APIView):
    """
    GET /api/chat/support/tickets/?status=&tier=&priority=&category=

    Role-based scoping:
      Admin       → all tickets
      Manager     → MANAGER + ADMIN tier tickets
      Front Desk  → FRONT_DESK tier tickets only
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_front_desk_or_above(request.user):
            return Response(
                {"error": "Only hotel staff can view support tickets."},
                status=status.HTTP_403_FORBIDDEN,
            )

        role = _get_staff_role(request.user)

        # Build role-scoped queryset
        qs = SupportTicket.objects.select_related(
            "conversation", "user", "assigned_to", "escalated_by"
        ).order_by("-created_at")

        if role == "admin":
            pass  # all tickets
        elif role == "manager":
            qs = qs.filter(tier__in=[TicketTier.MANAGER, TicketTier.ADMIN])
        else:  # front_desk / receptionist
            qs = qs.filter(tier=TicketTier.FRONT_DESK)

        # Optional filters from query params
        filter_status   = request.query_params.get("status", "")
        filter_tier     = request.query_params.get("tier", "")
        filter_priority = request.query_params.get("priority", "")
        filter_category = request.query_params.get("category", "")

        if filter_status in ("open", "in_progress", "escalated", "closed"):
            qs = qs.filter(status=filter_status)
        else:
            # Default: exclude closed
            qs = qs.filter(
                status__in=[TicketStatus.OPEN, TicketStatus.IN_PROGRESS, TicketStatus.ESCALATED]
            )

        if filter_tier in (TicketTier.FRONT_DESK, TicketTier.MANAGER, TicketTier.ADMIN):
            qs = qs.filter(tier=filter_tier)

        if filter_priority in (TicketPriority.LOW, TicketPriority.NORMAL,
                               TicketPriority.HIGH, TicketPriority.CRITICAL):
            qs = qs.filter(priority=filter_priority)

        if filter_category:
            qs = qs.filter(category=filter_category)

        serializer = SupportTicketSerializer(qs, many=True)
        return Response({
            "count":        qs.count(),
            "viewer_role":  role,
            "tickets":      serializer.data,
        })


# ─── Support ticket detail ────────────────────────────────────────────────────

class SupportTicketDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, ticket_id):
        if not _is_front_desk_or_above(request.user):
            return Response({"error": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

        try:
            ticket = SupportTicket.objects.select_related(
                "conversation", "user", "assigned_to", "escalated_by"
            ).get(pk=ticket_id)
        except SupportTicket.DoesNotExist:
            return Response({"error": "Ticket not found."}, status=status.HTTP_404_NOT_FOUND)

        if not _can_view_ticket(request.user, ticket):
            return Response(
                {"error": "You do not have permission to view this ticket."},
                status=status.HTTP_403_FORBIDDEN,
            )

        return Response({
            "ticket":       SupportTicketSerializer(ticket).data,
            "conversation": ConversationSerializer(ticket.conversation).data,
        })


# ─── Staff reply ──────────────────────────────────────────────────────────────

class SupportReplyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, ticket_id):
        if not _is_front_desk_or_above(request.user):
            return Response({"error": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

        try:
            ticket = SupportTicket.objects.select_related("conversation").get(pk=ticket_id)
        except SupportTicket.DoesNotExist:
            return Response({"error": "Ticket not found."}, status=status.HTTP_404_NOT_FOUND)

        if not _can_reply_to_ticket(request.user, ticket):
            return Response(
                {"error": "You can only reply to tickets in your tier."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if ticket.status == TicketStatus.CLOSED:
            return Response(
                {"error": "Cannot reply to a closed ticket."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = SupportReplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        message = Message.objects.create(
            conversation  = ticket.conversation,
            sender        = SenderType.SUPPORT,
            sent_by_staff = request.user,
            message_text  = serializer.validated_data["message"],
        )

        # Auto-assign + move to in_progress
        if not ticket.assigned_to:
            ticket.assigned_to = request.user
        if ticket.status in (TicketStatus.OPEN, TicketStatus.ESCALATED):
            ticket.status = TicketStatus.IN_PROGRESS
        ticket.save(update_fields=["assigned_to", "status", "updated_at"])

        return Response({
            "message": MessageSerializer(message).data,
            "ticket":  SupportTicketSerializer(ticket).data,
        })


# ─── Close ticket ─────────────────────────────────────────────────────────────

class SupportTicketCloseView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, ticket_id):
        if not _is_front_desk_or_above(request.user):
            return Response({"error": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

        try:
            ticket = SupportTicket.objects.select_related("conversation").get(pk=ticket_id)
        except SupportTicket.DoesNotExist:
            return Response({"error": "Ticket not found."}, status=status.HTTP_404_NOT_FOUND)

        if not _can_view_ticket(request.user, ticket):
            return Response({"error": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

        ticket = close_ticket(ticket, closed_by=request.user)
        return Response(SupportTicketSerializer(ticket).data)


# ─── Assign ticket ────────────────────────────────────────────────────────────

class SupportTicketAssignView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, ticket_id):
        if not _is_admin_or_manager(request.user):
            return Response(
                {"error": "Only Admin or Manager can assign tickets."},
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
                if not _is_front_desk_or_above(assignee):
                    return Response(
                        {"error": "Can only assign to hotel staff members."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                ticket.assigned_to = assignee
            except User.DoesNotExist:
                return Response({"error": "Staff member not found."}, status=status.HTTP_404_NOT_FOUND)
        else:
            ticket.assigned_to = None

        ticket.save(update_fields=["assigned_to", "updated_at"])
        return Response(SupportTicketSerializer(ticket).data)


# ─── Escalate ticket to next tier ────────────────────────────────────────────

class SupportTicketEscalateView(APIView):
    """
    POST /api/chat/support/<ticket_id>/escalate/
    Body: { "reason": "..." }

    Moves ticket up the routing chain:
      FRONT_DESK → MANAGER → ADMIN

    Permission: Front Desk can escalate to Manager.
                Manager can escalate to Admin.
                Admin cannot escalate further.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, ticket_id):
        if not _is_front_desk_or_above(request.user):
            return Response({"error": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

        try:
            ticket = SupportTicket.objects.select_related("conversation").get(pk=ticket_id)
        except SupportTicket.DoesNotExist:
            return Response({"error": "Ticket not found."}, status=status.HTTP_404_NOT_FOUND)

        if not _can_view_ticket(request.user, ticket):
            return Response(
                {"error": "You do not have permission to escalate this ticket."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = EscalateTicketSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data.get("reason", "")

        try:
            updated_ticket = escalate_ticket(
                ticket       = ticket,
                escalated_by = request.user,
                reason       = reason,
            )
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            "ticket":  SupportTicketSerializer(updated_ticket).data,
            "message": (
                f"Ticket #{updated_ticket.pk} escalated to "
                f"{updated_ticket.get_tier_display()} tier."
            ),
        })


# ─── Poll for new messages ────────────────────────────────────────────────────

# ─── Poll for new messages ────────────────────────────────────────────────────

class PollMessagesView(APIView):
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

        if user and conv.user and conv.user != user:
            return Response({"messages": []})
        if not user and conv.session_key and conv.session_key != session_key:
            return Response({"messages": []})

        new_messages = conv.messages.filter(
            id__gt=int(after_id)
        ).order_by("timestamp")

        # FIX: always include ticket info regardless of is_in_support_mode.
        # Previously this was gated on `conv.is_in_support_mode`, which is
        # False once a ticket is closed — so the frontend never received
        # status="closed" and the guest had to send a message to find out.
        ticket_info = None
        try:
            t = conv.support_ticket
            ticket_info = {
                "id":       t.pk,
                "tier":     t.tier,
                "priority": t.priority,
                "status":   t.status,
            }
        except Exception:
            pass

        return Response({
            "messages":     MessageSerializer(new_messages, many=True).data,
            "is_escalated": conv.is_in_support_mode,
            "ticket":       ticket_info,
        })

# ─── Debug ────────────────────────────────────────────────────────────────────

class DebugIntentView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        message = request.query_params.get("message", "hi")
        try:
            result = detect_intent(message)
            classification = classify_message(
                message    = message,
                intent     = result.get("intent", "UNKNOWN"),
                confidence = result.get("confidence", 0.85),
                language   = result.get("language", "english"),
            )
            return Response({
                "message":        message,
                "gemini_result":  result,
                "classification": classification,
            })
        except Exception as exc:
            import traceback
            return Response(
                {"error": str(exc), "traceback": traceback.format_exc()},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _get_user_from_request(request):
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header.split(" ", 1)[1].strip()
    if not token:
        return None
    try:
        from rest_framework_simplejwt.authentication import JWTAuthentication
        jwt_auth  = JWTAuthentication()
        validated = jwt_auth.get_validated_token(token)
        return jwt_auth.get_user(validated)
    except Exception:
        return None