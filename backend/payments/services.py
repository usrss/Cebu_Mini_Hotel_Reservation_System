"""
payments/services.py

Provider integration layer.
All API calls go through these service classes — views never call provider APIs directly.
"""

import base64
import logging
import requests
from decimal import Decimal

from django.conf import settings

logger = logging.getLogger(__name__)

PAYMONGO_BASE       = "https://api.paymongo.com/v1"
PAYPAL_SANDBOX_BASE = "https://api-m.sandbox.paypal.com"
PAYPAL_LIVE_BASE    = "https://api-m.paypal.com"

# ── All PayMongo payment methods — used as fallback when method is unrecognised ─
PAYMONGO_ALL_METHODS = [
    "card",              # Visa / Mastercard / JCB
    "gcash",             # GCash e-wallet
    "paymaya",           # Maya (PayMaya) e-wallet
    "dob",               # Direct Online Banking (BPI, UnionBank, etc.)
    "dob_ubp",           # UnionBank Online
    "brankas_bdo",       # BDO
    "brankas_landbank",  # Landbank
    "brankas_metrobank", # Metrobank
]

# ── Method map — maps our internal method names to PayMongo method type lists ──
# Using lists so bank_transfer can show multiple bank options at once.
PAYMONGO_METHOD_MAP = {
    "card":          ["card"],
    "gcash":         ["gcash"],
    "bank_transfer": ["dob", "dob_ubp", "brankas_bdo", "brankas_landbank", "brankas_metrobank"],
    "paymaya":       ["paymaya"],
}


def _paymongo_headers():
    secret  = getattr(settings, "PAYMONGO_SECRET_KEY", "")
    encoded = base64.b64encode(f"{secret}:".encode()).decode()
    return {
        "Authorization": f"Basic {encoded}",
        "Content-Type":  "application/json",
        "Accept":        "application/json",
    }


def _paypal_base():
    mode = getattr(settings, "PAYPAL_MODE", "sandbox")
    return PAYPAL_SANDBOX_BASE if mode == "sandbox" else PAYPAL_LIVE_BASE


def _paypal_access_token():
    client_id     = getattr(settings, "PAYPAL_CLIENT_ID", "")
    client_secret = getattr(settings, "PAYPAL_CLIENT_SECRET", "")
    resp = requests.post(
        f"{_paypal_base()}/v1/oauth2/token",
        headers={"Accept": "application/json"},
        auth=(client_id, client_secret),
        data={"grant_type": "client_credentials"},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


# ── PayMongo ──────────────────────────────────────────────────────────────────

class PayMongoService:

    @staticmethod
    def create_checkout_session(payment, booking, success_url: str, cancel_url: str) -> dict:
        """
        Creates a PayMongo Checkout Session and returns:
            { "checkout_url": str, "session_id": str }

        Uses the specific payment method the guest selected on the frontend.
        This prevents the guest from having to select a method twice.

        Falls back to ALL methods if the payment method is unrecognised.

        PayMongo amounts are in CENTS (PHP x 100).
        Minimum amount is PHP 100.00 (10000 cents).
        """
        amount_cents = int(payment.amount * 100)

        # PayMongo minimum is PHP 100
        if amount_cents < 10000:
            raise ValueError(
                f"Amount too small: PHP {payment.amount}. "
                f"PayMongo minimum is PHP 100.00 (got {amount_cents} cents)."
            )

        # Use the specific method the guest picked — fall back to all methods
        # if the payment method is not in our map (e.g. paypal goes to PayPal directly)
        payment_method_types = PAYMONGO_METHOD_MAP.get(
            payment.payment_method, PAYMONGO_ALL_METHODS
        )

        payload = {
            "data": {
                "attributes": {
                    "amount":               amount_cents,
                    "currency":             "PHP",
                    "description":          (
                        f"Booking {booking.reference_number or f'#{booking.pk}'} "
                        f"— Room {booking.room.room_number}"
                    ),
                    "payment_method_types": payment_method_types,
                    "success_url":          success_url,
                    "cancel_url":           cancel_url,
                    "send_email_receipt":   False,
                    "show_description":     True,
                    "show_line_items":      True,
                    "line_items": [
                        {
                            "currency": "PHP",
                            "amount":   amount_cents,
                            "name":     (
                                f"Room {booking.room.room_number} — "
                                f"{booking.room.get_room_type_display()}"
                            ),
                            "quantity": 1,
                        }
                    ],
                    "metadata": {
                        "payment_id":        str(payment.pk),
                        "booking_reference": booking.reference_number or str(booking.pk),
                        "booking_id":        str(booking.pk),
                    },
                }
            }
        }

        logger.info(
            "PayMongo checkout_sessions request — payment_id=%s amount_cents=%s methods=%s",
            payment.pk, amount_cents, payment_method_types,
        )

        resp = requests.post(
            f"{PAYMONGO_BASE}/checkout_sessions",
            json=payload,
            headers=_paymongo_headers(),
            timeout=20,
        )

        # Log full response on error
        if not resp.ok:
            logger.error(
                "PayMongo checkout_sessions FAILED %s — response: %s",
                resp.status_code, resp.text,
            )
            resp.raise_for_status()

        data = resp.json()["data"]
        logger.info(
            "PayMongo checkout_sessions SUCCESS — session_id=%s url=%s",
            data["id"], data["attributes"]["checkout_url"],
        )
        return {
            "session_id":   data["id"],
            "checkout_url": data["attributes"]["checkout_url"],
        }

    @staticmethod
    def get_session_status(session_id: str) -> str:
        """
        Returns the PayMongo checkout session status string:
        'active', 'paid', 'expired', 'cancelled'
        """
        resp = requests.get(
            f"{PAYMONGO_BASE}/checkout_sessions/{session_id}",
            headers=_paymongo_headers(),
            timeout=15,
        )

        if not resp.ok:
            logger.error(
                "PayMongo get_session_status FAILED %s — session_id=%s response: %s",
                resp.status_code, session_id, resp.text,
            )
            resp.raise_for_status()

        return resp.json()["data"]["attributes"]["status"]

    @staticmethod
    def create_refund(payment, amount: Decimal, reason: str = "") -> dict:
        """
        Creates a PayMongo Refund against the payment's transaction.
        Returns { "refund_id": str }
        """
        amount_cents = int(amount * 100)
        payload = {
            "data": {
                "attributes": {
                    "amount":     amount_cents,
                    "payment_id": payment.transaction_id,
                    "reason":     reason or "others",
                    "notes":      reason,
                }
            }
        }

        resp = requests.post(
            f"{PAYMONGO_BASE}/refunds",
            json=payload,
            headers=_paymongo_headers(),
            timeout=20,
        )

        if not resp.ok:
            logger.error(
                "PayMongo create_refund FAILED %s — payment_id=%s response: %s",
                resp.status_code, payment.pk, resp.text,
            )
            resp.raise_for_status()

        return {"refund_id": resp.json()["data"]["id"]}

    @staticmethod
    def get_full_session(session_id: str) -> dict:
        """
        Returns full checkout session data including payments list.
        Used by verify endpoint to poll payment status directly from PayMongo.

        Returns dict with:
          - status:   'active' or 'expired'
          - payments: list of payment objects (each has attributes.status = 'paid'/'unpaid')
        """
        resp = requests.get(
            f"{PAYMONGO_BASE}/checkout_sessions/{session_id}",
            headers=_paymongo_headers(),
            timeout=15,
        )
        if not resp.ok:
            logger.error(
                "PayMongo get_full_session FAILED %s — session_id=%s response: %s",
                resp.status_code, session_id, resp.text,
            )
            resp.raise_for_status()

        attrs = resp.json()["data"]["attributes"]
        return {
            "status":   attrs.get("status"),    # 'active' or 'expired'
            "payments": attrs.get("payments", []),
        }


# ── PayPal ────────────────────────────────────────────────────────────────────

class PayPalService:

    @staticmethod
    def _headers():
        token = _paypal_access_token()
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type":  "application/json",
        }

    @staticmethod
    def create_order(payment, booking, return_url: str, cancel_url: str) -> dict:
        """
        Creates a PayPal Order and returns:
            { "order_id": str, "checkout_url": str }

        PayPal handles its own payment method selection (PayPal balance,
        linked card, bank account) on their own checkout page — no method
        map needed on our side.
        """
        payload = {
            "intent": "CAPTURE",
            "purchase_units": [
                {
                    "amount": {
                        "currency_code": "PHP",
                        "value":         str(payment.amount),
                    },
                    "description": (
                        f"Booking {booking.reference_number or f'#{booking.pk}'} "
                        f"— Room {booking.room.room_number}"
                    ),
                    "custom_id": str(payment.pk),
                }
            ],
            "application_context": {
                "return_url": return_url,
                "cancel_url": cancel_url,
                "brand_name": getattr(settings, "HOTEL_NAME", "CMH Hotel"),
                "user_action": "PAY_NOW",
            },
        }

        resp = requests.post(
            f"{_paypal_base()}/v2/checkout/orders",
            json=payload,
            headers=PayPalService._headers(),
            timeout=20,
        )

        if not resp.ok:
            logger.error(
                "PayPal create_order FAILED %s — payment_id=%s response: %s",
                resp.status_code, payment.pk, resp.text,
            )
            resp.raise_for_status()

        data = resp.json()

        checkout_url = next(
            (link["href"] for link in data.get("links", []) if link["rel"] == "approve"),
            None,
        )
        return {"order_id": data["id"], "checkout_url": checkout_url}

    @staticmethod
    def get_order_status(order_id: str) -> str:
        """Returns the PayPal order status: CREATED, APPROVED, COMPLETED, etc."""
        resp = requests.get(
            f"{_paypal_base()}/v2/checkout/orders/{order_id}",
            headers=PayPalService._headers(),
            timeout=15,
        )

        if not resp.ok:
            logger.error(
                "PayPal get_order_status FAILED %s — order_id=%s response: %s",
                resp.status_code, order_id, resp.text,
            )
            resp.raise_for_status()

        return resp.json().get("status", "")

    @staticmethod
    def capture_order(order_id: str) -> dict:
        """Captures an approved PayPal order. Returns the capture response."""
        resp = requests.post(
            f"{_paypal_base()}/v2/checkout/orders/{order_id}/capture",
            headers=PayPalService._headers(),
            json={},
            timeout=20,
        )

        if not resp.ok:
            logger.error(
                "PayPal capture_order FAILED %s — order_id=%s response: %s",
                resp.status_code, order_id, resp.text,
            )
            resp.raise_for_status()

        return resp.json()

    @staticmethod
    def create_refund(payment, amount: Decimal, reason: str = "") -> dict:
        """
        Refunds a PayPal capture. Requires the capture_id stored as transaction_id.
        Returns { "refund_id": str }
        """
        payload = {
            "amount": {
                "currency_code": "PHP",
                "value":         str(amount),
            },
            "note_to_payer": reason or "Refund issued by hotel.",
        }

        resp = requests.post(
            f"{_paypal_base()}/v2/payments/captures/{payment.transaction_id}/refund",
            json=payload,
            headers=PayPalService._headers(),
            timeout=20,
        )

        if not resp.ok:
            logger.error(
                "PayPal create_refund FAILED %s — payment_id=%s response: %s",
                resp.status_code, payment.pk, resp.text,
            )
            resp.raise_for_status()

        return {"refund_id": resp.json()["id"]}