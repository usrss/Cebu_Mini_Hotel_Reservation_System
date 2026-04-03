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

def _keyword_detect(message: str) -> dict:
    msg = message.lower().strip()

    # GREETING — English, Tagalog, Bisaya
    greeting_patterns = [
        r'^(hi|hello|hey|howdy|yo|sup|good\s*(morning|afternoon|evening|day))[\s!.]*$',
        r'^(kumusta|kamusta|musta|kamustah)[\s!.?]*$',
        r'^(maayong\s*(buntag|hapon|gabii)|magandang\s*(umaga|hapon|gabi))[\s!.]*$',
    ]
    for pattern in greeting_patterns:
        if re.search(pattern, msg):
            return _result("GREETING", 0.99, "User is greeting")

    # THANKS — English, Tagalog, Bisaya
    thanks_words = [
        "thank", "thanks", "ty", "thx", "noted", "got it",
        "salamat", "maraming salamat", "daghan salamat", "salamat kaayo",
        "sige", "sige na", "ok na", "okie", "ayos na",
    ]
    if any(w in msg for w in thanks_words):
        return _result("GREETING", 0.99, "User is saying thanks")

    # CANCEL_BOOKING — English, Tagalog, Bisaya
    if any(w in msg for w in [
        "cancel", "cancellation", "how to cancel", "cancel my booking",
        "cancel reservation", "i want to cancel",
        "paano mag-cancel", "gusto kong i-cancel", "kanselahin",
        "unsaon pag-cancel", "gusto nako i-cancel", "kanselahon",
    ]):
        return _result("CANCEL_BOOKING", 0.90, "User wants to cancel a booking")

    # SUPPORT REQUEST
    if any(w in msg for w in [
        "problem", "issue", "complaint", "wrong", "not working", "refund problem",
        "may problema", "naa koy problema", "reklamo", "makausap ng tao", "makigsulti sa tawo",
    ]):
        return _result("SUPPORT_REQUEST", 0.90, "User needs support")

    # VOUCHER
    if any(w in msg for w in [
        "voucher", "coupon", "promo", "promotion", "discount code", "gift card",
        "may promo", "naa bay promo", "may voucher", "naa bay voucher",
        "may diskwento", "naa bay diskwento",
    ]):
        return _result("VOUCHER_QUERY", 0.90, "User asking about vouchers")

    # CHECK_AVAILABILITY — English, Tagalog, Bisaya
    if any(w in msg for w in [
        "availab", "free room", "vacant", "any room", "have room", "rooms for",
        "may kwarto", "may silid", "may available", "libre ba",
        "naa bay kwarto", "naa bay room", "naa bay available", "libre ba ang",
    ]):
        return _result("CHECK_AVAILABILITY", 0.85, "User wants to check availability")

    # GET_PRICE — English, Tagalog, Bisaya
    if any(w in msg for w in [
        "price", "cost", "rate", "how much", "fee", "charge",
        "expensive", "cheap", "afford", "cheapest", "most affordable",
        "magkano", "presyo", "halaga", "pinakamurang",
        "pila", "tag pila", "pinaka barato",
    ]):
        return _result("GET_PRICE", 0.85, "User wants to know prices")

    # VIEW_BOOKING — English, Tagalog, Bisaya
    if any(w in msg for w in [
        "my booking", "my reservation", "check-in pin", "booking status",
        "ang aking booking", "status ng booking", "aking reservation",
        "akong booking", "akong reservation", "status sa akong",
    ]):
        return _result("VIEW_BOOKING", 0.85, "User wants to view booking")

    # BOOKING_HELP — English, Tagalog, Bisaya
    if any(w in msg for w in [
        "how to book", "how do i book", "booking process", "steps to book",
        "paano mag-book", "paano mag-reserve", "proseso ng booking",
        "unsaon pag-book", "unsaon pag-reserve", "paano mo book",
    ]):
        return _result("BOOKING_HELP", 0.85, "User needs booking help")

    # HOTEL_INFO — English, Tagalog, Bisaya
    if any(w in msg for w in [
        "location", "address", "where are you", "check-in time", "checkout time",
        "amenities", "contact", "phone", "email", "policy", "cancellation",
        "saan kayo", "nasaan", "anong oras", "mga pasilidad",
        "asa mo", "asa ang hotel", "unsa'ng oras", "mga pasilidad",
    ]):
        return _result("HOTEL_INFO", 0.85, "User wants hotel info")

    # Broader greeting
    if any(w in msg for w in ["hi", "hello", "hey", "kumusta", "kamusta", "maayong", "magandang"]):
        return _result("GREETING", 0.95, "User is greeting")

    # Broader availability
    if any(w in msg for w in ["room", "kwarto", "silid", "book", "stay", "night", "available"]):
        return _result("CHECK_AVAILABILITY", 0.70, "User may want availability")

    # Broader price
    if any(w in msg for w in ["price", "cost", "pila", "magkano", "cheap", "afford"]):
        return _result("GET_PRICE", 0.70, "User may be asking about prices")

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