"""
chatbot/services/intent_router.py

Routes detected intents to the appropriate backend service.
Gemini only detects intent — all business logic lives here.
"""

from datetime import datetime

from chatbot.services import room_service, booking_service, support_service
from chatbot.models import Conversation


# ─── Hotel static info ────────────────────────────────────────────────────────

HOTEL_INFO = {
    "name":          "Cebu Mini Hotel",
    "address":       "123 Colon St., Cebu City, 6000",
    "phone":         "+63 32 123 4567",
    "email":         "support@cebuMinihotel.com",
    "checkin_time":  "2:00 PM",
    "checkout_time": "12:00 PM (noon)",
    "cancellation":  (
        "Free cancellation 48+ hours before check-in (90% refund). "
        "50% refund within 48 hours. No refund for same-day cancellations."
    ),
}

LOW_CONFIDENCE_THRESHOLD = 0.45


# ─── Main router ──────────────────────────────────────────────────────────────

def route(intent_result: dict, conversation: Conversation, user) -> dict:
    """
    Route the detected intent to the correct handler.
    Every branch is explicit — no argument mismatch possible.
    """
    intent     = intent_result.get("intent", "UNKNOWN")
    entities   = intent_result.get("entities", {}) or {}
    confidence = float(intent_result.get("confidence", 0.0))
    summary    = intent_result.get("raw_intent_summary", "")

    is_authenticated = bool(user and user.is_authenticated)

    # ── Low confidence on any non-greeting → escalate to support ─────────────
    if confidence < LOW_CONFIDENCE_THRESHOLD and intent != "GREETING":
        return _handle_support(conversation, user, summary)

    # ── Explicit dispatch — no dict-of-functions tricks ───────────────────────
    if intent == "GREETING":
        return _handle_greeting(user)

    elif intent == "CHECK_AVAILABILITY":
        return _handle_availability(entities)

    elif intent == "GET_PRICE":
        return _handle_price(entities)

    elif intent == "VIEW_BOOKING":
        if not is_authenticated:
            return {
                "message":       "To view your booking details, please log in to your account first.",
                "intent":        intent,
                "data":          None,
                "escalated":     False,
                "quick_replies": ["Check room availability", "View prices", "Hotel information"],
            }
        return _handle_view_booking(user)

    elif intent == "BOOKING_HELP":
        return _handle_booking_help()

    elif intent == "HOTEL_INFO":
        return _handle_hotel_info()

    elif intent == "SUPPORT_REQUEST":
        return _handle_support(conversation, user, summary)

    else:
        # UNKNOWN or anything unrecognised → escalate
        return _handle_support(conversation, user, summary)


# ─── Handlers ─────────────────────────────────────────────────────────────────

def _handle_greeting(user=None) -> dict:
    name = getattr(user, "first_name", None) if user and getattr(user, "is_authenticated", False) else None
    greeting = f"Hello{f', {name}' if name else ''}! 👋"
    return {
        "message": (
            f"{greeting} Welcome to **Cebu Mini Hotel**.\n\n"
            "I'm CMH Bot, your virtual assistant. How can I help you today?\n\n"
            "You can ask me about room availability, prices, your bookings, or hotel information."
        ),
        "intent":        "GREETING",
        "data":          None,
        "escalated":     False,
        "quick_replies": [
            "Check room availability",
            "View room prices",
            "My bookings" if (user and getattr(user, "is_authenticated", False)) else "Hotel information",
            "Talk to support",
        ],
    }


def _handle_availability(entities: dict) -> dict:
    check_in_str  = entities.get("check_in")
    check_out_str = entities.get("check_out")
    room_type     = entities.get("room_type")
    guests_raw    = entities.get("guests")

    check_in  = _parse_date(check_in_str)
    check_out = _parse_date(check_out_str)
    guests    = int(guests_raw) if guests_raw else None

    data = room_service.get_available_rooms(
        check_in=check_in,
        check_out=check_out,
        room_type=room_type,
        guests=guests,
    )

    if data["available_count"] == 0:
        message = (
            "I'm sorry, no rooms are available"
            + (f" for **{check_in_str}** to **{check_out_str}**" if check_in_str else "")
            + ". Would you like to try different dates or contact our support team?"
        )
    else:
        date_info = f" for **{check_in_str}** to **{check_out_str}**" if check_in_str else ""
        message = (
            f"Great news! I found **{data['available_count']}** available room(s){date_info}. "
            "Here's what we have:"
        )

    return {
        "message":       message,
        "intent":        "CHECK_AVAILABILITY",
        "data":          data,
        "escalated":     False,
        "quick_replies": ["Book a room", "View prices", "Talk to support"],
    }


def _handle_price(entities: dict) -> dict:
    room_type = entities.get("room_type")
    data = room_service.get_room_prices(room_type=room_type)

    if not data["pricing"]:
        message = "I couldn't find pricing information right now. Please contact our front desk."
    else:
        lines = ["Here are our current room rates:\n"]
        for p in data["pricing"]:
            price_line = f"• **{p['room_type']}** — ₱{p['price_per_night']}/night"
            if float(p["discount_percentage"]) > 0:
                price_line += f" _(now ₱{p['discounted_price']} with {p['discount_percentage']}% off!)_"
            price_line += f" · up to {p['capacity']} guests"
            lines.append(price_line)
        message = "\n".join(lines)

    return {
        "message":       message,
        "intent":        "GET_PRICE",
        "data":          data,
        "escalated":     False,
        "quick_replies": ["Check availability", "Book a room", "Talk to support"],
    }


def _handle_view_booking(user) -> dict:
    data = booking_service.get_user_bookings(user)

    if not data["bookings"]:
        message = "You don't have any recent bookings. Would you like to browse our available rooms?"
    else:
        b = data["bookings"][0]
        message = (
            f"Your most recent booking is **Room {b['room_number']} ({b['room_type']})**.\n"
            f"📅 Check-in: {b['check_in']} · Check-out: {b['check_out']}\n"
            f"Status: **{b['status']}**"
        )
        if b["has_credentials"]:
            message += f"\n🔑 Check-in PIN: **{b['checkin_pin']}**"
        if data["booking_count"] > 1:
            message += f"\n\nYou have {data['booking_count']} booking(s) total. View all in My Bookings."

    return {
        "message":       message,
        "intent":        "VIEW_BOOKING",
        "data":          data,
        "escalated":     False,
        "quick_replies": ["View all bookings", "Check availability", "Talk to support"],
    }


def _handle_booking_help() -> dict:
    return {
        "message": (
            "Here's how to book a room at Cebu Mini Hotel:\n\n"
            "1. Browse available rooms and pick your dates\n"
            "2. Select your preferred room type\n"
            "3. Complete payment (GCash, Card, PayPal, or Cash)\n"
            "4. Receive your **Reference Number** and **Check-in PIN** by email\n"
            "5. Present these at reception on your check-in date\n\n"
            "Payment window: **30 minutes** after booking to complete payment.\n"
            "Need more help? Our support team is ready."
        ),
        "intent":        "BOOKING_HELP",
        "data":          None,
        "escalated":     False,
        "quick_replies": ["Check availability", "View prices", "Talk to support"],
    }


def _handle_hotel_info() -> dict:
    return {
        "message": (
            f"**{HOTEL_INFO['name']}**\n\n"
            f"📍 {HOTEL_INFO['address']}\n"
            f"📞 {HOTEL_INFO['phone']}\n"
            f"✉️  {HOTEL_INFO['email']}\n\n"
            f"🕐 Check-in: {HOTEL_INFO['checkin_time']}\n"
            f"🕛 Check-out: {HOTEL_INFO['checkout_time']}\n\n"
            f"**Cancellation Policy:**\n{HOTEL_INFO['cancellation']}"
        ),
        "intent":        "HOTEL_INFO",
        "data":          HOTEL_INFO,
        "escalated":     False,
        "quick_replies": ["Check availability", "View prices", "Talk to support"],
    }


def _handle_support(conversation: Conversation, user, raw_summary: str = "") -> dict:
    """Escalate to human support — creates a SupportTicket."""
    ticket = support_service.escalate_to_support(
        conversation=conversation,
        subject=raw_summary[:120] if raw_summary else "Support request via chat",
    )
    return {
        "message": (
            "I've connected you with our support team. 🙋\n\n"
            "A support agent (Admin or Manager) will respond to you shortly. "
            "You can keep chatting here and they'll see all your messages.\n\n"
            f"**Ticket #{ticket.pk}** has been created for your request."
        ),
        "intent":        "SUPPORT_REQUEST",
        "data":          {"ticket_id": ticket.pk, "ticket_status": ticket.status},
        "escalated":     True,
        "quick_replies": ["Hotel information", "Check availability", "View prices"],
    }


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _parse_date(date_str):
    if not date_str:
        return None
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None