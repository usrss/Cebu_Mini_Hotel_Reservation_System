"""
chatbot/services/gemini(groq).py

AI intent detection using Groq API (llama-3.1-8b-instant).
Understands English, Tagalog, and Bisaya/Cebuano.
Falls back to keyword matching if Groq is unavailable.
"""

import json
import re
import logging

from django.conf import settings

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """
You are an intent detection engine for a hotel booking chatbot called "CMH Bot" for Cebu Mini Hotel located in Cebu City, Philippines.
Your ONLY job is to analyze the user's message and return a JSON object.
You do NOT make booking decisions, you do NOT access databases, you do NOT make up hotel data.

Always respond with ONLY valid JSON. No markdown, no explanation, no extra text.

LANGUAGE DETECTION: The user may write in English, Tagalog, or Bisaya/Cebuano. Detect the language and include it in your response.

JSON format:
{
  "intent": "<INTENT>",
  "language": "<english|tagalog|bisaya|mixed>",
  "entities": {
    "check_in": "<YYYY-MM-DD or null>",
    "check_out": "<YYYY-MM-DD or null>",
    "room_type": "<standard|deluxe|suite|family|penthouse or null>",
    "guests": "<integer or null>",
    "booking_reference": "<string or null>"
  },
  "confidence": <float 0.0 to 1.0>,
  "raw_intent_summary": "<one sentence describing what user wants in English>"
}

Valid intents with English, Tagalog, and Bisaya examples:

CHECK_AVAILABILITY:
  English: "any rooms available?", "rooms for march 25", "do you have rooms"
  Tagalog: "may kwarto ba kayo?", "may available ba?", "may silid ba para sa dalawa?", "libre ba ang kwarto?"
  Bisaya: "naa bay kwarto?", "naa bay available?", "naa bay room para sa duha?", "libre ba ang room?"

GET_PRICE:
  English: "how much", "price", "rates", "most affordable", "cheapest"
  Tagalog: "magkano", "magkano ang kwarto", "presyo", "pinakamurang kwarto", "anong halaga"
  Bisaya: "pila", "pila ang kwarto", "pila ang presyo", "pinaka barato", "tag pila"

VIEW_BOOKING:
  English: "my booking", "reservation", "check-in PIN", "show my booking", "booking status"
  Tagalog: "ang aking booking", "aking reservation", "ang aking PIN", "status ng booking ko"
  Bisaya: "akong booking", "akong reservation", "ang akong PIN", "status sa akong booking"

CANCEL_BOOKING:
  English: "cancel my booking", "how to cancel", "cancel reservation", "i want to cancel", "cancel it", "cancel"
  Tagalog: "paano mag-cancel", "gusto kong i-cancel", "kanselahin ang booking ko", "paano ko ika-cancel"
  Bisaya: "unsaon pag-cancel", "gusto nako i-cancel", "kanselahon ang akong booking", "i-cancel nako"

BOOKING_HELP:
  English: "how to book", "booking process", "how do I reserve"
  Tagalog: "paano mag-book", "paano mag-reserve", "proseso ng booking", "paano bumilanggo ng kwarto"
  Bisaya: "unsaon pag-book", "unsaon pag-reserve", "paano mo book", "unsa ang proseso"

HOTEL_INFO:
  English: "where are you", "location", "check-in time", "amenities"
  Tagalog: "saan kayo", "nasaan ang hotel", "anong oras ng check-in", "mga pasilidad"
  Bisaya: "asa mo", "asa ang hotel", "unsa'ng oras ang check-in", "mga pasilidad"

VOUCHER_QUERY:
  English: "voucher", "promo code", "discount", "coupon"
  Tagalog: "mayroon bang voucher", "may promo ba", "may diskwento ba", "may kupon ba"
  Bisaya: "naa bay voucher", "naa bay promo", "naa bay diskwento", "naa bay kupon"

SUPPORT_REQUEST:
  English: "problem", "complaint", "talk to someone", "human agent"
  Tagalog: "may problema ako", "reklamo", "makausap ng tao", "may issue ako"
  Bisaya: "naa koy problema", "reklamo", "makigsulti sa tawo", "naa koy issue"

GREETING:
  English: "hi", "hello", "hey", "good morning"
  Tagalog: "kamusta", "kumusta", "magandang umaga", "magandang hapon", "magandang gabi", "musta"
  Bisaya: "kumusta", "maayong buntag", "maayong hapon", "maayong gabii", "hoy", "uy"

THANKS (map to GREETING intent):
  English: "thank you", "thanks", "okay thanks"
  Tagalog: "salamat", "maraming salamat", "sige", "ok na", "ayos na"
  Bisaya: "salamat", "daghan salamat", "salamat kaayo", "sige na"

UNKNOWN: only if you truly cannot map to any of the above (e.g. "how to code python")

IMPORTANT RULES:
- Default confidence to 0.85 for clear messages.
- Use 0.70 for slightly vague messages.
- Only go below 0.60 for truly ambiguous messages.
- Never use 0.5 as default.
- Greetings and thanks are always GREETING with confidence 0.99.
- For SUPPORT_REQUEST always set confidence >= 0.90.
- When in doubt between UNKNOWN and any other intent, pick the other intent.
- "kumusta", "kamusta", "musta" are GREETING.
- "salamat", "daghan salamat", "maraming salamat" are GREETING (thanks).
- "pila", "magkano" always map to GET_PRICE.
- "naa bay", "may ba" questions about rooms map to CHECK_AVAILABILITY.
"""

VALID_INTENTS = {
    "CHECK_AVAILABILITY", "GET_PRICE", "VIEW_BOOKING", "CANCEL_BOOKING",
    "BOOKING_HELP", "HOTEL_INFO", "SUPPORT_REQUEST",
    "GREETING", "VOUCHER_QUERY", "UNKNOWN",
}


# ─── Keyword fallback ─────────────────────────────────────────────────────────
#
# Used whenever Groq is unavailable (rate limit, network error, bad JSON).
#
# DESIGN RULES:
#   1. All matching uses \b word-boundary regex — never bare substring `in`.
#      This prevents "room" matching "bedroom", "book" matching "Facebook", etc.
#   2. Rules are ordered from most-specific to least-specific.
#      More-specific multi-word phrases are checked before single words.
#   3. Each intent block has a PRIMARY set (high-confidence, unambiguous phrases)
#      and an optional BROAD set (lower-confidence, single words).
#   4. language is always returned as "english" from the fallback — the
#      _validate_language() in intent_router handles language gating separately.

def _wb(word: str) -> re.Pattern:
    """Compile a case-insensitive whole-word regex pattern."""
    return re.compile(r'\b' + re.escape(word) + r'\b', re.IGNORECASE)


# Pre-compiled pattern groups — (pattern, intent, confidence, summary)
# Order matters: checked top-to-bottom, first match wins.
_FALLBACK_RULES: list[tuple] = [

    # ── GREETING (exact-message patterns first) ────────────────────────────────
    (re.compile(
        r'^(hi|hello|hey|howdy|good\s*(morning|afternoon|evening|day)|'
        r'kumusta|kamusta|musta|maayong\s*(buntag|hapon|gabii)|'
        r'magandang\s*(umaga|hapon|gabi))[\s!.?]*$',
        re.IGNORECASE,
    ), "GREETING", 0.99, "Pure greeting message"),

    # ── THANKS (maps to GREETING) ──────────────────────────────────────────────
    (re.compile(
        r'\b(thank\s*you|thanks|salamat|maraming\s*salamat|daghan\s*salamat|'
        r'salamat\s*kaayo|noted|got\s*it)\b',
        re.IGNORECASE,
    ), "GREETING", 0.99, "User expressing thanks"),

    # ── SUPPORT_REQUEST — specific complaint phrases ───────────────────────────
    (re.compile(
        r'\b(talk\s*to\s*(someone|support|agent|human|staff|person)|'
        r'speak\s*to\s*(someone|support|agent|human|staff)|'
        r'human\s*agent|live\s*agent|real\s*person|'
        r'may\s*problema|naa\s*koy\s*problema|makausap\s*ng\s*tao|'
        r'makigsulti\s*sa\s*tawo|reklamo|complaint)\b',
        re.IGNORECASE,
    ), "SUPPORT_REQUEST", 0.92, "User requesting human support"),

    (re.compile(
        r'\b(problem|issue|not\s*working|broken|wrong|error|failed|'
        r'refund\s*problem|double\s*charge|charged\s*twice)\b',
        re.IGNORECASE,
    ), "SUPPORT_REQUEST", 0.88, "User reporting a problem"),

    # ── CANCEL_BOOKING ─────────────────────────────────────────────────────────
    # MUST come before VIEW_BOOKING because "cancel my booking" contains
    # "my booking" which would otherwise fire VIEW_BOOKING first.
    (re.compile(
        r'\b(cancel|cancellation|how\s*to\s*cancel|i\s*want\s*to\s*cancel|'
        r'cancel\s*my\s*booking|cancel\s*reservation|'
        r'kanselahin|i-cancel|kansela|kanselahon|'
        r'unsaon\s*pag.?cancel|gusto\s*(ko|nako)\s*i.?cancel)\b',
        re.IGNORECASE,
    ), "CANCEL_BOOKING", 0.90, "User wants to cancel a booking"),

    # ── VIEW_BOOKING ───────────────────────────────────────────────────────────
    # After CANCEL so "cancel my booking" doesn't match here.
    # Includes bare \bpin\b for "when do I get my PIN".
    (re.compile(
        r'\b(my\s*booking|my\s*reservation|booking\s*status|check.?in\s*pin|'
        r'\bpin\b|reference\s*number|booking\s*reference|show\s*my\s*booking|'
        r'aking\s*booking|akong\s*booking|status\s*ng\s*booking|'
        r'ang\s*aking\s*reservation|akong\s*reservation)\b',
        re.IGNORECASE,
    ), "VIEW_BOOKING", 0.88, "User wants to view their booking"),

    # ── VOUCHER_QUERY ─────────────────────────────────────────────────────────
    # "promo codes" (plural) added.
    (re.compile(
        r'\b(voucher|coupon|promo\s*codes?|discount\s*code|gift\s*card|'
        r'may\s*promo|naa\s*bay\s*promo|may\s*diskwento|naa\s*bay\s*diskwento)\b',
        re.IGNORECASE,
    ), "VOUCHER_QUERY", 0.90, "User asking about vouchers or promos"),

    # ── BOOKING_HELP ──────────────────────────────────────────────────────────
    # Before CHECK_AVAILABILITY so "how to book" doesn't hit the "book" broad rule.
    (re.compile(
        r'\b(how\s*to\s*book|how\s*do\s*i\s*(book|reserve)|booking\s*process|'
        r'steps?\s*to\s*book|how\s*to\s*reserve|paano\s*mag.?book|'
        r'paano\s*mag.?reserve|unsaon\s*pag.?book|unsaon\s*pag.?reserve|'
        r'proseso\s*ng\s*booking)\b',
        re.IGNORECASE,
    ), "BOOKING_HELP", 0.88, "User needs booking instructions"),

    # ── HOTEL_INFO ────────────────────────────────────────────────────────────
    # Added: "hotel" alone, "what time", "check in" / "check out" without hyphen,
    # "rates" (plural handled by GET_PRICE), "wifi", "pets".
    (re.compile(
        r'\b(location|address|where\s*are\s*you|'
        r'check.?in\s*time|check.?out\s*time|'
        r'what\s*time\s*(is|does|do)|'
        r'amenities|contact\s*(us|number)|phone\s*number|email\s*address|'
        r'cancellation\s*policy|hotel\s*policy|'
        r'pool|parking|breakfast|wifi|pets?|'
        r'\bhotel\b|'
        r'saan\s*kayo|nasaan\s*ang\s*hotel|anong\s*oras\s*ng\s*check|'
        r'asa\s*(mo|ang\s*hotel)|mga\s*pasilidad|unsa.?ng\s*oras)\b',
        re.IGNORECASE,
    ), "HOTEL_INFO", 0.88, "User wants hotel information"),

    # ── GET_PRICE ─────────────────────────────────────────────────────────────
    # Before CHECK_AVAILABILITY: "cheapest room" should be GET_PRICE not CHECK_AVAILABILITY.
    (re.compile(
        r'\b(how\s*much|price|rates?|cost|fee|cheapest|most\s*affordable|'
        r'per\s*night|nightly\s*rate|'
        r'magkano|presyo|halaga|pila(\s*ang)?|tag\s*pila|pinaka\s*barato|'
        r'pinakamurang)\b',
        re.IGNORECASE,
    ), "GET_PRICE", 0.88, "User asking about prices"),

    # ── CHECK_AVAILABILITY ────────────────────────────────────────────────────
    (re.compile(
        r'\b(available\s*room|room\s*available|any\s*room|rooms?\s*for|'
        r'do\s*you\s*have\s*(a\s*)?room|vacant|free\s*room|'
        r'may\s*(kwarto|silid|available|room)|libre\s*ba(\s*ang)?|'
        r'naa\s*bay\s*(kwarto|room|available))\b',
        re.IGNORECASE,
    ), "CHECK_AVAILABILITY", 0.88, "User checking room availability"),

    # ── Broader GREETING (single words, anchored) ─────────────────────────────
    (re.compile(
        r'^(hi|hello|hey|kumusta|kamusta|maayong|magandang)[\s!.?]*$',
        re.IGNORECASE,
    ), "GREETING", 0.92, "Short greeting"),

    # ── Broader CHECK_AVAILABILITY ────────────────────────────────────────────
    (re.compile(
        r'\b(room|kwarto|silid|available|stay)\b',
        re.IGNORECASE,
    ), "CHECK_AVAILABILITY", 0.65, "Possible availability inquiry"),

    # ── Broader GET_PRICE ─────────────────────────────────────────────────────
    (re.compile(
        r'\b(cheap|afford|expensive|discount|promo)\b',
        re.IGNORECASE,
    ), "GET_PRICE", 0.65, "Possible price inquiry"),
]


def _keyword_detect(message: str) -> dict:
    """
    Word-boundary keyword fallback used when Groq is unavailable.
    Returns the first matching rule result, or UNKNOWN.
    """
    msg = message.strip()

    for pattern, intent, confidence, summary in _FALLBACK_RULES:
        if pattern.search(msg):
            return _result(intent, confidence, summary)

    return _result("UNKNOWN", 0.30, "Could not determine intent")


def _result(intent: str, confidence: float, summary: str) -> dict:
    return {
        "intent":             intent,
        "entities":           {},
        "confidence":         confidence,
        "raw_intent_summary": summary,
        "language":           "unknown",
    }


# ─── Main detect function ─────────────────────────────────────────────────────

def detect_intent(message: str, conversation_history: list = None) -> dict:
    groq_result = _try_groq(message, conversation_history)
    if groq_result is not None:
        return groq_result
    logger.warning("Groq unavailable — using keyword fallback for: %s", message)
    return _keyword_detect(message)


# ─── Groq API call ────────────────────────────────────────────────────────────

def _try_groq(message: str, conversation_history: list = None) -> dict | None:
    try:
        from groq import Groq

        client = Groq(api_key=settings.GROQ_API_KEY)

        context_block = ""
        if conversation_history:
            recent = conversation_history[-6:]
            lines = []
            for msg in recent:
                role = "User" if msg["sender"] == "user" else "Bot"
                lines.append(f"{role}: {msg['text']}")
            context_block = "\n".join(lines)

        user_content = (
            (f"Recent conversation context:\n{context_block}\n\n" if context_block else "")
            + f'User message to analyze: "{message}"\n\nRespond with JSON only:'
        )

        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user",   "content": user_content},
            ],
            temperature=0.1,
            max_tokens=256,
        )

        raw = response.choices[0].message.content.strip()

        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        result = json.loads(raw)

        intent = result.get("intent", "UNKNOWN").upper()
        if intent not in VALID_INTENTS:
            intent = "UNKNOWN"

        confidence = float(result.get("confidence", 0.85))
        language   = result.get("language", "english").lower()

        logger.info("Groq intent: %s (%.2f) lang: %s for: %s",
                    intent, confidence, language, message)

        return {
            "intent":             intent,
            "entities":           result.get("entities", {}),
            "confidence":         confidence,
            "raw_intent_summary": result.get("raw_intent_summary", ""),
            "language":           language,
        }

    except json.JSONDecodeError as exc:
        logger.error("Groq returned invalid JSON: %s", exc)
        return None
    except ImportError:
        logger.error("groq package not installed. Run: pip install groq")
        return None
    except Exception as exc:
        err_str = str(exc)
        if "429" in err_str or "rate" in err_str.lower():
            logger.warning("Groq rate limit hit, using keyword fallback")
        elif "401" in err_str or "invalid" in err_str.lower():
            logger.error("Groq API key invalid. Check GROQ_API_KEY in .env")
        else:
            logger.error("Groq failed: %s", exc)
        return None