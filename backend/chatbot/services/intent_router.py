"""
chatbot/services/intent_router.py

Routes detected intents to the appropriate backend service.
Responds in English, Tagalog, or Bisaya based on detected language.
"""

from datetime import datetime

from chatbot.services import room_service, booking_service, support_service
from chatbot.models import Conversation


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

# ─── Language-aware response strings ─────────────────────────────────────────

RESPONSES = {
    "greeting": {
        "english":  "Hello{name}! 👋 Welcome to **Cebu Mini Hotel**.\n\nI'm CMH Bot, your virtual assistant. How can I help you today?\n\nYou can ask me about room availability, prices, your bookings, or hotel information.",
        "tagalog":  "Kumusta{name}! 👋 Maligayang pagdating sa **Cebu Mini Hotel**.\n\nAko si CMH Bot, ang inyong virtual assistant. Paano kita matutulungan ngayon?\n\nMaaari kang magtanong tungkol sa availability ng kwarto, presyo, iyong booking, o impormasyon ng hotel.",
        "bisaya":   "Kumusta{name}! 👋 Maayong pag-abot sa **Cebu Mini Hotel**.\n\nAko si CMH Bot, ang imong virtual assistant. Unsaon ko ikaw matabangan karon?\n\nMakaaobserbar ka bahin sa availability sa kwarto, presyo, imong booking, o impormasyon sa hotel.",
    },
    "thanks": {
        "english":  "You're welcome! 😊 Feel free to ask if you need anything else.\n\nIs there anything else I can help you with?",
        "tagalog":  "Walang anuman! 😊 Huwag kang mahiyang magtanong kung kailangan mo pa ng tulong.\n\nMay iba pa ba akong maitutulong sa iyo?",
        "bisaya":   "Walay sapayan! 😊 Ayaw kaulaw mangutana kung naa pa kay kinahanglan.\n\nNaa pa bay lain nga mabuhat para nimo?",
    },
    "no_rooms": {
        "english":  "I'm sorry, no rooms are available{dates}. Would you like to try different dates or contact our support team?",
        "tagalog":  "Paumanhin, walang available na kwarto{dates}. Gusto mo bang subukan ang ibang petsa o makipag-ugnayan sa aming support team?",
        "bisaya":   "Pasaylo, walay available nga kwarto{dates}. Gusto mo bang mosulay og laing petsa o makig-ugnayan sa among support team?",
    },
    "rooms_found": {
        "english":  "Great news! I found **{count}** available room(s){dates}. Here's what we have:",
        "tagalog":  "Magandang balita! Nahanap ko ang **{count}** available na kwarto{dates}. Narito ang aming mga available:",
        "bisaya":   "Maayong balita! Nakit-an nako ang **{count}** available nga kwarto{dates}. Ania ang among mga available:",
    },
    "no_price": {
        "english":  "I couldn't find pricing information right now. Please contact our front desk.",
        "tagalog":  "Hindi ko mahanap ang impormasyon sa presyo ngayon. Mangyaring makipag-ugnayan sa aming front desk.",
        "bisaya":   "Dili nako makit-an ang impormasyon sa presyo karon. Palihug pakig-ugnayan sa among front desk.",
    },
    "no_bookings": {
        "english":  "You don't have any recent bookings. Would you like to browse our available rooms?",
        "tagalog":  "Wala kang mga kamakailang booking. Gusto mo bang tingnan ang aming mga available na kwarto?",
        "bisaya":   "Wala kay mga bag-ohong booking. Gusto mo bang tan-awon ang among mga available nga kwarto?",
    },
    "booking_help": {
        "english": (
            "Here's how to book a room at Cebu Mini Hotel:\n\n"
            "1. Browse available rooms and pick your dates\n"
            "2. Select your preferred room type\n"
            "3. Complete payment (GCash, Card, PayPal, or Cash)\n"
            "4. Receive your **Reference Number** and **Check-in PIN** by email\n"
            "5. Present these at reception on your check-in date\n\n"
            "Payment window: **30 minutes** after booking to complete payment."
        ),
        "tagalog": (
            "Narito kung paano mag-book ng kwarto sa Cebu Mini Hotel:\n\n"
            "1. Tingnan ang mga available na kwarto at piliin ang iyong mga petsa\n"
            "2. Piliin ang iyong gustong uri ng kwarto\n"
            "3. Kumpletuhin ang pagbabayad (GCash, Card, PayPal, o Cash)\n"
            "4. Makatanggap ng iyong **Reference Number** at **Check-in PIN** sa email\n"
            "5. Ipakita ang mga ito sa reception sa iyong araw ng check-in\n\n"
            "Oras ng pagbabayad: **30 minuto** pagkatapos mag-book."
        ),
        "bisaya": (
            "Aniay unsaon pag-book og kwarto sa Cebu Mini Hotel:\n\n"
            "1. Tan-awa ang mga available nga kwarto ug pilia ang imong mga petsa\n"
            "2. Pilia ang imong gusto nga klase sa kwarto\n"
            "3. Kumpleto ang pagbayad (GCash, Card, PayPal, o Cash)\n"
            "4. Modawat sa imong **Reference Number** ug **Check-in PIN** sa email\n"
            "5. Ipakita kini sa reception sa imong adlaw sa check-in\n\n"
            "Oras sa pagbayad: **30 minuto** human mag-book."
        ),
    },
    "voucher": {
        "english":  "We don't currently have a voucher or promo code system, but we do offer **room discounts** on selected rooms.\n\nYou can view our current discounted rates by asking me about room prices.",
        "tagalog":  "Wala pa kaming sistema ng voucher o promo code sa ngayon, ngunit nag-aalok kami ng **mga diskwento sa kwarto** sa mga piling kwarto.\n\nMaaari mong tingnan ang aming mga kasalukuyang diskwentong rate sa pamamagitan ng pagtatanong sa presyo ng kwarto.",
        "bisaya":   "Wala pa mi sistema sa voucher o promo code karon, apan nag-alagad mi og **mga diskwento sa kwarto** sa pipila ka mga kwarto.\n\nMakita nimo ang among mga karon nga diskwentong rate pinaagi sa pagpangutana mahitungod sa presyo sa kwarto.",
    },
    "unknown": {
        "english":  "I'm not sure I understood that. 😊\n\nHere's what I can help you with:\n• Check room availability\n• View room prices\n• Your booking details\n• Hotel information\n• Connect you with our support team",
        "tagalog":  "Hindi ko masigurado kung naintindihan ko iyon. 😊\n\nNarito ang mga maitutulong ko sa iyo:\n• Tingnan ang availability ng kwarto\n• Tingnan ang presyo ng kwarto\n• Mga detalye ng iyong booking\n• Impormasyon ng hotel\n• Ikonekta ka sa aming support team",
        "bisaya":   "Dili ko sigurado kung nasabtan nako kana. 😊\n\nAnia ang akong mahimo para nimo:\n• Tan-awa ang availability sa kwarto\n• Tan-awa ang presyo sa kwarto\n• Mga detalye sa imong booking\n• Impormasyon sa hotel\n• Ikonekta ka sa among support team",
    },
    "support": {
        "english":  "I've connected you with our support team. 🙋\n\nA support agent will respond to you shortly. You can keep chatting here and they'll see all your messages.\n\n**Ticket #{ticket}** has been created for your request.",
        "tagalog":  "Ikinonekta na kita sa aming support team. 🙋\n\nIsang support agent ang sasagot sa iyo sa lalong madaling panahon. Maaari kang patuloy na mag-chat dito at makikita nila ang lahat ng iyong mga mensahe.\n\n**Ticket #{ticket}** ay nagawa na para sa iyong kahilingan.",
        "bisaya":   "Gi-konekta na tika sa among support team. 🙋\n\nAng support agent motubag nimo sa labing madali. Mahimo ka magpadayon og chat dinhi ug makita nila ang tanan nimo nga mga mensahe.\n\n**Ticket #{ticket}** nahimo na para sa imong hangyo.",
    },
    "quick_replies": {
        "english":  ["Check room availability", "View room prices", "Hotel information", "Talk to support"],
        "tagalog":  ["Tingnan ang availability", "Tingnan ang presyo", "Impormasyon ng hotel", "Makipag-usap sa support"],
        "bisaya":   ["Tan-awa ang availability", "Tan-awa ang presyo", "Impormasyon sa hotel", "Makigsulti sa support"],
    },
}


def _lang(language: str) -> str:
    """Normalize language to english/tagalog/bisaya."""
    if language in ("tagalog", "filipino"):
        return "tagalog"
    if language in ("bisaya", "cebuano", "bisayal"):
        return "bisaya"
    return "english"


def _r(key: str, language: str, **kwargs) -> str:
    """Get response string for key in given language, with format kwargs."""
    lang = _lang(language)
    template = RESPONSES[key].get(lang) or RESPONSES[key]["english"]
    return template.format(**kwargs) if kwargs else template


# ─── Main router ──────────────────────────────────────────────────────────────

def route(intent_result: dict, conversation: Conversation,
          user, user_message: str = "") -> dict:
    intent     = intent_result.get("intent", "UNKNOWN")
    entities   = intent_result.get("entities", {}) or {}
    confidence = float(intent_result.get("confidence", 0.0))
    summary    = intent_result.get("raw_intent_summary", "")
    language   = intent_result.get("language", "english")
    msg_lower  = user_message.lower().strip()

    is_authenticated = bool(user and user.is_authenticated)

    # Low confidence → escalate
    if confidence < LOW_CONFIDENCE_THRESHOLD and intent != "GREETING":
        return _handle_support(conversation, user, summary, language)

    if intent == "GREETING":
        # Check actual message for thanks in any language
        thanks_words = [
            "thank", "thanks", "ty", "thx", "noted", "got it",
            "okay thanks", "ok thanks", "great thanks",
            "salamat", "maraming salamat", "daghan salamat",
            "salamat kaayo", "sige", "sige na", "ok na",
            "okie", "ayos na", "walang anuman",
        ]
        if any(w in msg_lower for w in thanks_words):
            return _handle_thanks(language)
        return _handle_greeting(user, language)

    elif intent == "CHECK_AVAILABILITY":
        return _handle_availability(entities, language)

    elif intent == "GET_PRICE":
        return _handle_price(entities, language)

    elif intent == "VIEW_BOOKING":
        if not is_authenticated:
            return {
                "message":       "To view your booking details, please log in to your account first." if _lang(language) == "english"
                                 else "Para makita ang iyong booking, mangyaring mag-login muna." if _lang(language) == "tagalog"
                                 else "Para makita ang imong booking, palihug mag-login una.",
                "intent":        intent,
                "data":          None,
                "escalated":     False,
                "quick_replies": RESPONSES["quick_replies"][_lang(language)],
            }
        return _handle_view_booking(user, language)

    elif intent == "CANCEL_BOOKING":
        return _handle_cancel_booking(user, language)
        hotel_keywords = ["book", "reserv", "room", "stay", "hotel", "check in",
                          "checkout", "payment", "pay", "confirm", "cancel",
                          "kwarto", "silid", "mag-book", "pag-book", "unsaon"]
        if any(w in summary.lower() for w in hotel_keywords):
            return _handle_booking_help(language)
        return _handle_unknown(language)

    elif intent == "HOTEL_INFO":
        return _handle_hotel_info(language)

    elif intent == "VOUCHER_QUERY":
        return _handle_voucher_query(language)

    elif intent == "SUPPORT_REQUEST":
        return _handle_support(conversation, user, summary, language)

    else:
        return _handle_unknown(language)


# ─── Handlers ─────────────────────────────────────────────────────────────────

def _handle_thanks(language: str = "english") -> dict:
    return {
        "message":       _r("thanks", language),
        "intent":        "GREETING",
        "data":          None,
        "escalated":     False,
        "quick_replies": RESPONSES["quick_replies"][_lang(language)],
    }


def _handle_greeting(user=None, language: str = "english") -> dict:
    name = ""
    is_auth = bool(user and getattr(user, "is_authenticated", False))

    if is_auth:
        first = getattr(user, "first_name", "")
        if first:
            name = f", {first}"

    lang = _lang(language)

    # Quick replies differ based on login state
    if is_auth:
        quick_replies = {
            "english": ["Check room availability", "View room prices", "My bookings", "Talk to support"],
            "tagalog": ["Tingnan ang availability", "Tingnan ang presyo", "Aking mga booking", "Makipag-usap sa support"],
            "bisaya":  ["Tan-awa ang availability", "Tan-awa ang presyo", "Akong mga booking", "Makigsulti sa support"],
        }
    else:
        quick_replies = {
            "english": ["Check room availability", "View room prices", "Hotel information", "Talk to support"],
            "tagalog": ["Tingnan ang availability", "Tingnan ang presyo", "Impormasyon ng hotel", "Makipag-usap sa support"],
            "bisaya":  ["Tan-awa ang availability", "Tan-awa ang presyo", "Impormasyon sa hotel", "Makigsulti sa support"],
        }

    return {
        "message":       _r("greeting", language, name=name),
        "intent":        "GREETING",
        "data":          {"is_authenticated": is_auth},
        "escalated":     False,
        "quick_replies": quick_replies[lang],
    }


def _handle_availability(entities: dict, language: str = "english") -> dict:
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

    dates = f" for **{check_in_str}** to **{check_out_str}**" if check_in_str else ""

    if data["available_count"] == 0:
        message = _r("no_rooms", language, dates=dates)
    else:
        message = _r("rooms_found", language,
                     count=data["available_count"], dates=dates)

    return {
        "message":       message,
        "intent":        "CHECK_AVAILABILITY",
        "data":          data,
        "escalated":     False,
        "quick_replies": RESPONSES["quick_replies"][_lang(language)],
    }


def _handle_price(entities: dict, language: str = "english") -> dict:
    room_type = entities.get("room_type")
    data = room_service.get_room_prices(room_type=room_type)

    if not data["pricing"]:
        message = _r("no_price", language)
    else:
        lang = _lang(language)
        if lang == "tagalog":
            lines = ["Narito ang aming mga kasalukuyang rate ng kwarto:\n"]
            for p in data["pricing"]:
                line = f"• **{p['room_type']}** — ₱{p['price_per_night']}/gabi"
                if float(p["discount_percentage"]) > 0:
                    line += f" _(ngayon ₱{p['discounted_price']} na may {float(p['discount_percentage']):.0f}% diskwento!)_"
                line += f" · hanggang {p['capacity']} bisita"
                lines.append(line)
        elif lang == "bisaya":
            lines = ["Ania ang among mga karon nga rate sa kwarto:\n"]
            for p in data["pricing"]:
                line = f"• **{p['room_type']}** — ₱{p['price_per_night']}/gabii"
                if float(p["discount_percentage"]) > 0:
                    line += f" _(karon ₱{p['discounted_price']} nga may {float(p['discount_percentage']):.0f}% diskwento!)_"
                line += f" · hangtod {p['capacity']} bisita"
                lines.append(line)
        else:
            lines = ["Here are our current room rates:\n"]
            for p in data["pricing"]:
                line = f"• **{p['room_type']}** — ₱{p['price_per_night']}/night"
                if float(p["discount_percentage"]) > 0:
                    line += f" _(now ₱{p['discounted_price']} with {float(p['discount_percentage']):.0f}% off!)_"
                line += f" · up to {p['capacity']} guests"
                lines.append(line)
        message = "\n".join(lines)

    return {
        "message":       message,
        "intent":        "GET_PRICE",
        "data":          data,
        "escalated":     False,
        "quick_replies": RESPONSES["quick_replies"][_lang(language)],
    }


def _handle_view_booking(user, language: str = "english") -> dict:
    data = booking_service.get_user_bookings(user)
    lang = _lang(language)

    if not data["bookings"]:
        message = _r("no_bookings", language)
    else:
        b = data["bookings"][0]
        if lang == "tagalog":
            message = (
                f"Ang iyong pinakabagong booking ay **Kwarto {b['room_number']} ({b['room_type']})**.\n"
                f"📅 Check-in: {b['check_in']} · Check-out: {b['check_out']}\n"
                f"Status: **{b['status']}**"
            )
            if b["has_credentials"]:
                message += f"\n🔑 Check-in PIN: **{b['checkin_pin']}**"
            if data["booking_count"] > 1:
                message += f"\n\nMayroon kang {data['booking_count']} booking(s) sa kabuuan."
        elif lang == "bisaya":
            message = (
                f"Ang imong pinakabag-o nga booking mao ang **Kwarto {b['room_number']} ({b['room_type']})**.\n"
                f"📅 Check-in: {b['check_in']} · Check-out: {b['check_out']}\n"
                f"Status: **{b['status']}**"
            )
            if b["has_credentials"]:
                message += f"\n🔑 Check-in PIN: **{b['checkin_pin']}**"
            if data["booking_count"] > 1:
                message += f"\n\nNaa kay {data['booking_count']} booking(s) sa tanan."
        else:
            message = (
                f"Your most recent booking is **Room {b['room_number']} ({b['room_type']})**.\n"
                f"📅 Check-in: {b['check_in']} · Check-out: {b['check_out']}\n"
                f"Status: **{b['status']}**"
            )
            if b["has_credentials"]:
                message += f"\n🔑 Check-in PIN: **{b['checkin_pin']}**"
            if data["booking_count"] > 1:
                message += f"\n\nYou have {data['booking_count']} booking(s) total."

    return {
        "message":       message,
        "intent":        "VIEW_BOOKING",
        "data":          data,
        "escalated":     False,
        "quick_replies": RESPONSES["quick_replies"][_lang(language)],
    }


def _handle_cancel_booking(user=None, language: str = "english") -> dict:
    lang = _lang(language)
    is_auth = bool(user and getattr(user, "is_authenticated", False))

    if not is_auth:
        msgs = {
            "english": "To cancel a booking, please **log in** to your account first, then go to **My Bookings** and click the Cancel button on the booking you want to cancel.",
            "tagalog":  "Para mag-cancel ng booking, mangyaring **mag-login** muna sa iyong account, pagkatapos pumunta sa **Aking mga Booking** at i-click ang Cancel button.",
            "bisaya":   "Para mag-cancel og booking, palihug **mag-login** una sa imong account, dayon adto sa **Akong mga Booking** ug i-click ang Cancel button.",
        }
        return {
            "message":       msgs[lang],
            "intent":        "CANCEL_BOOKING",
            "data":          None,
            "escalated":     False,
            "quick_replies": RESPONSES["quick_replies"][lang],
        }

    # User is logged in — get their cancellable bookings
    data = booking_service.get_user_bookings(user)
    cancellable = [
        b for b in data.get("bookings", [])
        if b.get("status_key") in ("pending_payment", "confirmed")
    ]

    if not cancellable:
        msgs = {
            "english": "You don't have any bookings that can be cancelled right now.\n\nOnly **Pending Payment** or **Confirmed** bookings can be cancelled.",
            "tagalog":  "Wala kang mga booking na maaaring i-cancel ngayon.\n\nTanging **Pending Payment** o **Confirmed** na booking lamang ang maaaring i-cancel.",
            "bisaya":   "Wala kay mga booking nga mahimong i-cancel karon.\n\nAng **Pending Payment** o **Confirmed** nga booking lamang ang mahimong i-cancel.",
        }
        return {
            "message":       msgs[lang],
            "intent":        "CANCEL_BOOKING",
            "data":          data,
            "escalated":     False,
            "quick_replies": RESPONSES["quick_replies"][lang],
        }

    # Has cancellable bookings — guide them
    msgs = {
        "english": (
            "To cancel a booking, go to **My Bookings** and click the **Cancel Booking** button "
            "on the booking you want to cancel.\n\n"
            "You have **{count}** cancellable booking(s):\n{list}\n\n"
            "**Cancellation Policy:**\n"
            "• 48+ hours before check-in → 90% refund\n"
            "• Within 48 hours → 50% refund\n"
            "• Same day / no-show → No refund"
        ),
        "tagalog": (
            "Para mag-cancel ng booking, pumunta sa **Aking mga Booking** at i-click ang "
            "**Cancel Booking** button.\n\n"
            "Mayroon kang **{count}** cancellable na booking:\n{list}\n\n"
            "**Patakaran sa Pagkansela:**\n"
            "• 48+ oras bago mag-check-in → 90% refund\n"
            "• Sa loob ng 48 oras → 50% refund\n"
            "• Parehong araw / no-show → Walang refund"
        ),
        "bisaya": (
            "Para mag-cancel og booking, adto sa **Akong mga Booking** ug i-click ang "
            "**Cancel Booking** button.\n\n"
            "Naa kay **{count}** cancellable nga booking:\n{list}\n\n"
            "**Patakaran sa Pagkansela:**\n"
            "• 48+ oras sa wala pa mag-check-in → 90% refund\n"
            "• Sa sulod sa 48 oras → 50% refund\n"
            "• Mao gihapon nga adlaw / no-show → Walay refund"
        ),
    }

    booking_list = "\n".join(
        f"• **{b['reference_number'] or f'#{b[\"id\"]}'}** — Room {b['room_number']} "
        f"({b['check_in']} → {b['check_out']}) — {b['status']}"
        for b in cancellable
    )

    return {
        "message":       msgs[lang].format(count=len(cancellable), list=booking_list),
        "intent":        "CANCEL_BOOKING",
        "data":          {"cancellable_bookings": cancellable},
        "escalated":     False,
        "quick_replies": [
            "Go to My Bookings" if lang == "english"
            else "Pumunta sa Aking mga Booking" if lang == "tagalog"
            else "Adto sa Akong mga Booking",
            "Talk to support" if lang == "english"
            else "Makipag-usap sa support" if lang == "tagalog"
            else "Makigsulti sa support",
        ],
    }


def _handle_booking_help(language: str = "english") -> dict:
    return {
        "message":       _r("booking_help", language),
        "intent":        "BOOKING_HELP",
        "data":          None,
        "escalated":     False,
        "quick_replies": RESPONSES["quick_replies"][_lang(language)],
    }


def _handle_hotel_info(language: str = "english") -> dict:
    lang = _lang(language)
    if lang == "tagalog":
        message = (
            f"**{HOTEL_INFO['name']}**\n\n"
            f"📍 {HOTEL_INFO['address']}\n"
            f"📞 {HOTEL_INFO['phone']}\n"
            f"✉️  {HOTEL_INFO['email']}\n\n"
            f"🕐 Oras ng Check-in: {HOTEL_INFO['checkin_time']}\n"
            f"🕛 Oras ng Check-out: {HOTEL_INFO['checkout_time']}\n\n"
            f"**Patakaran sa Pagkansela:**\n{HOTEL_INFO['cancellation']}"
        )
    elif lang == "bisaya":
        message = (
            f"**{HOTEL_INFO['name']}**\n\n"
            f"📍 {HOTEL_INFO['address']}\n"
            f"📞 {HOTEL_INFO['phone']}\n"
            f"✉️  {HOTEL_INFO['email']}\n\n"
            f"🕐 Oras sa Check-in: {HOTEL_INFO['checkin_time']}\n"
            f"🕛 Oras sa Check-out: {HOTEL_INFO['checkout_time']}\n\n"
            f"**Patakaran sa Pagkansela:**\n{HOTEL_INFO['cancellation']}"
        )
    else:
        message = (
            f"**{HOTEL_INFO['name']}**\n\n"
            f"📍 {HOTEL_INFO['address']}\n"
            f"📞 {HOTEL_INFO['phone']}\n"
            f"✉️  {HOTEL_INFO['email']}\n\n"
            f"🕐 Check-in: {HOTEL_INFO['checkin_time']}\n"
            f"🕛 Check-out: {HOTEL_INFO['checkout_time']}\n\n"
            f"**Cancellation Policy:**\n{HOTEL_INFO['cancellation']}"
        )
    return {
        "message":       message,
        "intent":        "HOTEL_INFO",
        "data":          HOTEL_INFO,
        "escalated":     False,
        "quick_replies": RESPONSES["quick_replies"][_lang(language)],
    }


def _handle_voucher_query(language: str = "english") -> dict:
    return {
        "message":       _r("voucher", language),
        "intent":        "VOUCHER_QUERY",
        "data":          None,
        "escalated":     False,
        "quick_replies": RESPONSES["quick_replies"][_lang(language)],
    }


def _handle_unknown(language: str = "english") -> dict:
    return {
        "message":       _r("unknown", language),
        "intent":        "UNKNOWN",
        "data":          None,
        "escalated":     False,
        "quick_replies": RESPONSES["quick_replies"][_lang(language)],
    }


def _handle_support(conversation: Conversation, user,
                    raw_summary: str = "", language: str = "english") -> dict:
    ticket = support_service.escalate_to_support(
        conversation=conversation,
        subject=raw_summary[:120] if raw_summary else "Support request via chat",
    )
    return {
        "message":       _r("support", language, ticket=ticket.pk),
        "intent":        "SUPPORT_REQUEST",
        "data":          {"ticket_id": ticket.pk, "ticket_status": ticket.status},
        "escalated":     True,
        "quick_replies": RESPONSES["quick_replies"][_lang(language)],
    }


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _parse_date(date_str):
    if not date_str:
        return None
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None