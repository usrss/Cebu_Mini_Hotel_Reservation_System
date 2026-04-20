"""
chatbot/services/classifier.py

Message classification for role-based ticket routing.

KEY FIXES:
  1. VIEW_BOOKING / CANCEL_BOOKING → always is_faq=True.
     Bot handles them (login prompt for anonymous users, self-service for
     authenticated users). Front Desk tickets are only created on explicit
     SUPPORT_REQUEST or when keywords indicate a real problem.
  2. Language detection is IGNORED for routing — intent + keywords only.
  3. SUPPORT_REQUEST is the only intent that triggers ticket creation.

Routing table:
  GREETING / HOTEL_INFO / GET_PRICE /
  CHECK_AVAILABILITY / BOOKING_HELP /
  VOUCHER_QUERY / VIEW_BOOKING /
  CANCEL_BOOKING / UNKNOWN           → is_faq=True (bot handles)

  SUPPORT_REQUEST:
    critical payment fraud/error     → admin,      critical
    security / emergency             → admin,      critical
    technical/system error           → admin,      high
    VIP / speak to manager           → manager,    high
    refund request                   → manager,    high
    room complaint                   → front_desk, normal|high
    payment inquiry (non-critical)   → front_desk, high
    cancellation process help        → front_desk, normal
    generic support                  → front_desk, normal|high
"""

import logging

logger = logging.getLogger(__name__)


# ─── Keyword banks ────────────────────────────────────────────────────────────

_CRITICAL_PAYMENT_KEYWORDS = [
    "payment failed", "double charge", "charged twice", "wrong amount",
    "unauthorized charge", "fraud", "scam", "payment error",
    "na-charge ng dalawang beses", "mali ang bayad",
    "na-charge ug duha", "sayop ang bayad",
]

_SECURITY_KEYWORDS = [
    "stolen", "theft", "robbery", "emergency", "unsafe", "danger",
    "threat", "harassment", "assault", "missing item", "lost item",
    "police", "ninakaw", "emergency", "nagtago", "gipang-agaw", "nawala",
]

_TECHNICAL_ERROR_KEYWORDS = [
    "error", "not loading", "crashed", "broken website",
    "can't login", "cannot login", "account locked",
    "app not working", "website down", "system error",
    "hindi makapag-login", "dili makapag-login",
]

_VIP_ESCALATION_KEYWORDS = [
    "vip", "upgrade", "special request", "anniversary", "honeymoon",
    "corporate booking", "group booking", "complaint", "compensation",
    "speak to manager", "talk to manager", "makausap ng manager",
    "makigsulti sa manager", "supervisor",
]

_REFUND_KEYWORDS = [
    "refund", "money back", "ibalik ang pera", "ibalik ang bayad",
    "ibalik akong kwarta", "bawiin", "ibalik",
]

_ROOM_COMPLAINT_KEYWORDS = [
    "dirty", "broken", "not working", "noise", "smell", "aircon", "ac",
    "hot water", "toilet", "leak", "cockroach", "bug", "pest", "mold",
    "marumi", "sira", "hindi gumagana", "hugaw", "dili molihok",
]

_PAYMENT_ISSUE_KEYWORDS = [
    "payment", "paid", "pay", "charge", "gcash", "credit card",
    "debit", "transaction", "receipt", "invoice", "billing",
    "bayad", "bayaran", "kard", "pag-bayad",
]

_CANCELLATION_KEYWORDS = [
    "cancel", "cancellation", "reschedule", "change dates", "modify",
    "kanselahin", "i-cancel", "kansela", "palitan ang petsa",
    "i-reschedule", "kanselahon",
]

_URGENT_WORDS = [
    "urgent", "asap", "immediately", "right now",
    "now na", "agad", "ngayon na", "karon na dayon",
]


def _matches(text: str, keywords: list) -> bool:
    t = text.lower()
    return any(k.lower() in t for k in keywords)


# ─── Intent sets ─────────────────────────────────────────────────────────────

# These intents are ALWAYS handled by the bot — no ticket ever
FAQ_INTENTS = {
    "GREETING",
    "HOTEL_INFO",
    "BOOKING_HELP",
    "VOUCHER_QUERY",
    "GET_PRICE",
    "CHECK_AVAILABILITY",
    "VIEW_BOOKING",    # bot shows booking or says "please log in"
    "CANCEL_BOOKING",  # bot gives self-service instructions
    "UNKNOWN",
}


# ─── Main classifier ──────────────────────────────────────────────────────────

def classify_message(
    message: str,
    intent: str,
    confidence: float = 1.0,
    language: str = "english",   # kept for signature compat — NOT used for routing
    user=None,
) -> dict:
    """
    Returns:
        {
          "is_faq":          bool,
          "ticket_tier":     str | None,
          "ticket_priority": str | None,
          "ticket_category": str,
          "routing_reason":  str,
        }
    """
    msg = message.lower().strip()

    # ── 1. FAQ intents — bot always handles, no ticket ────────────────────────
    if intent in FAQ_INTENTS and confidence >= 0.55:
        return _faq(f"Intent '{intent}' handled by bot (no ticket needed)")

    # ── 2. SUPPORT_REQUEST (or very low confidence) → classify by keywords ───
    if intent == "SUPPORT_REQUEST" or confidence < 0.45:

        if _matches(msg, _CRITICAL_PAYMENT_KEYWORDS):
            return _ticket("admin", "critical", "payment_issue",
                           "Critical payment fraud/error keywords")

        if _matches(msg, _SECURITY_KEYWORDS):
            return _ticket("admin", "critical", "security_concern",
                           "Security or emergency keywords")

        if _matches(msg, _TECHNICAL_ERROR_KEYWORDS):
            return _ticket("admin", "high", "technical_error",
                           "Technical/system error keywords")

        if _matches(msg, _VIP_ESCALATION_KEYWORDS):
            return _ticket("manager", "high", "vip_request",
                           "VIP / explicit escalation keywords")

        if _matches(msg, _REFUND_KEYWORDS):
            return _ticket("manager", "high", "cancellation",
                           "Refund request — Manager approval needed")

        if _matches(msg, _ROOM_COMPLAINT_KEYWORDS):
            priority = "high" if _matches(msg, _URGENT_WORDS) else "normal"
            return _ticket("front_desk", priority, "room_complaint",
                           "Room complaint — Front Desk first")

        if _matches(msg, _PAYMENT_ISSUE_KEYWORDS):
            return _ticket("front_desk", "high", "payment_issue",
                           "Payment inquiry — Front Desk first")

        if _matches(msg, _CANCELLATION_KEYWORDS):
            return _ticket("front_desk", "normal", "cancellation",
                           "Cancellation process — Front Desk first")

        priority = "high" if _matches(msg, _URGENT_WORDS) else "normal"
        return _ticket("front_desk", priority, "general_inquiry",
                       "General support request — Front Desk first")

    # ── 3. Anything else → FAQ fallback ──────────────────────────────────────
    return _faq(f"Intent '{intent}' handled by bot")


# ─── Result builders ─────────────────────────────────────────────────────────

def _faq(reason: str) -> dict:
    return {
        "is_faq":          True,
        "ticket_tier":     None,
        "ticket_priority": None,
        "ticket_category": "general_inquiry",
        "routing_reason":  reason,
    }


def _ticket(tier: str, priority: str, category: str, reason: str) -> dict:
    return {
        "is_faq":          False,
        "ticket_tier":     tier,
        "ticket_priority": priority,
        "ticket_category": category,
        "routing_reason":  reason,
    }