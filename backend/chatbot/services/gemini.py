"""
chatbot/services/gemini.py

Gemini AI integration — intent detection and entity extraction ONLY.
Gemini never touches the database or business logic.
"""

import json
import logging

import google.generativeai as genai
from django.conf import settings

logger = logging.getLogger(__name__)


def _get_model():
    genai.configure(api_key=settings.GEMINI_API_KEY)
    return genai.GenerativeModel("gemini-1.5-flash")


SYSTEM_PROMPT = """
You are an intent detection engine for a hotel booking chatbot called "CMH Bot" for Cebu Mini Hotel.
Your ONLY job is to analyze the user's message and return a JSON object.
You do NOT make booking decisions, you do NOT access databases, you do NOT make up hotel data.

Always respond with ONLY valid JSON. No markdown, no explanation, no extra text.

JSON format:
{
  "intent": "<INTENT>",
  "entities": {
    "check_in": "<YYYY-MM-DD or null>",
    "check_out": "<YYYY-MM-DD or null>",
    "room_type": "<standard|deluxe|suite|family|penthouse or null>",
    "guests": "<integer or null>",
    "booking_reference": "<string or null>"
  },
  "confidence": <float 0.0 to 1.0>,
  "raw_intent_summary": "<one sentence describing what user wants>"
}

Valid intents and examples:
- CHECK_AVAILABILITY: "any rooms available?", "rooms for march 25", "available this weekend", "do you have rooms"
- GET_PRICE: "how much", "price", "rates", "cost", "how expensive", "what is the rate"
- VIEW_BOOKING: "my booking", "reservation", "check-in PIN", "my reservation", "booking reference"
- BOOKING_HELP: "how to book", "booking process", "how do I reserve", "steps to book"
- HOTEL_INFO: "where are you", "location", "address", "check-in time", "checkout time", "amenities", "policies", "contact", "phone"
- SUPPORT_REQUEST: "problem", "complaint", "issue", "wrong", "help me", "talk to someone", "human", "agent", "refund problem"
- GREETING: "hi", "hello", "hey", "good morning", "good afternoon", "howdy"
- UNKNOWN: only use this if you truly cannot map to any of the above

IMPORTANT RULES:
- Default confidence to 0.85 for clear messages.
- Use 0.70 for slightly vague but still mappable messages.
- Only go below 0.60 for truly ambiguous messages with no clear intent.
- Never default to 0.5 — always try to find the best matching intent first.
- For SUPPORT_REQUEST always set confidence >= 0.90.
- When in doubt between UNKNOWN and any other intent, pick the other intent.
"""


def detect_intent(message: str, conversation_history: list = None) -> dict:
    try:
        model = _get_model()

        context_block = ""
        if conversation_history:
            recent = conversation_history[-6:]
            lines = []
            for msg in recent:
                role = "User" if msg["sender"] == "user" else "Bot"
                lines.append(f"{role}: {msg['text']}")
            context_block = "\n".join(lines)

        full_prompt = f"""{SYSTEM_PROMPT}

{"Recent conversation context:" + chr(10) + context_block if context_block else ""}

User message to analyze: "{message}"

Respond with JSON only:"""

        response = model.generate_content(full_prompt)
        raw = response.text.strip()

        # Strip markdown code fences if Gemini wraps response
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        result = json.loads(raw)

        intent = result.get("intent", "UNKNOWN").upper()
        valid_intents = {
            "CHECK_AVAILABILITY", "GET_PRICE", "VIEW_BOOKING",
            "BOOKING_HELP", "HOTEL_INFO", "SUPPORT_REQUEST",
            "GREETING", "UNKNOWN",
        }
        if intent not in valid_intents:
            intent = "UNKNOWN"

        confidence = float(result.get("confidence", 0.85))

        return {
            "intent":             intent,
            "entities":           result.get("entities", {}),
            "confidence":         confidence,
            "raw_intent_summary": result.get("raw_intent_summary", ""),
        }

    except json.JSONDecodeError as exc:
        logger.error("Gemini returned invalid JSON: %s", exc)
        return _fallback()
    except Exception as exc:
        logger.error("Gemini intent detection failed: %s", exc)
        return _fallback()


def _fallback() -> dict:
    return {
        "intent":             "UNKNOWN",
        "entities":           {},
        "confidence":         0.0,
        "raw_intent_summary": "Could not determine intent.",
    }