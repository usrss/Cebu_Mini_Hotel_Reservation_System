"""
payments/services.py

Provider integration layer.
All API calls go through these service classes — views never call provider APIs directly.

Setup (add to your .env):
    PAYMONGO_SECRET_KEY=sk_test_...
    PAYMONGO_PUBLIC_KEY=pk_test_...
    PAYMONGO_WEBHOOK_SECRET=whsec_...
    PAYPAL_CLIENT_ID=...
    PAYPAL_CLIENT_SECRET=...
    PAYPAL_MODE=sandbox   # or 'live'
    FRONTEND_URL=http://localhost:5173
"""

import base64
import logging
import requests
from decimal import Decimal

from django.conf import settings

logger = logging.getLogger(__name__)

PAYMONGO_BASE = "https://api.paymongo.com/v1"
PAYPAL_SANDBOX_BASE = "https://api-m.sandbox.paypal.com"
PAYPAL_LIVE_BASE    = "https://api-m.paypal.com"

# ── PayMongo method map ────────────────────────────────────────────────────────
PAYMONGO_METHOD_MAP = {
    "card":          "card",
    "gcash":         "gcash",
    "bank_transfer": "dob",   # Direct Online Banking
}


def _paymongo_headers():
    secret = getattr(settings, "PAYMONGO_SECRET_KEY", "")
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

        PayMongo amounts are in CENTS (PHP × 100).
        """
        amount_cents = int(payment.amount * 100)
        method_type  = PAYMONGO_METHOD_MAP.get(payment.payment_method, "card")

        payload = {
            "data": {
                "attributes": {
                    "amount":        amount_cents,
                    "currency":      "PHP",
                    "description":   f"Booking {booking.reference_number} — Room #{booking.room.room_number}",
                    "payment_method_types": [method_type],
                    "success_url":   success_url,
                    "cancel_url":    cancel_url,
                    "metadata": {
                        "payment_id":        str(payment.pk),
                        "booking_reference": booking.reference_number,
                    },
                }
            }
        }

        resp = requests.post(
            f"{PAYMONGO_BASE}/checkout_sessions",
            json=payload,
            headers=_paymongo_headers(),
            timeout=20,
        )
        resp.raise_for_status()
        data = resp.json()["data"]
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
        resp.raise_for_status()
        return {"refund_id": resp.json()["data"]["id"]}


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
        """
        payload = {
            "intent": "CAPTURE",
            "purchase_units": [
                {
                    "amount": {
                        "currency_code": "PHP",
                        "value":         str(payment.amount),
                    },
                    "description": f"Booking {booking.reference_number} — Room #{booking.room.room_number}",
                    "custom_id":   str(payment.pk),
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
        resp.raise_for_status()
        data = resp.json()

        # Find the approval link
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
        resp.raise_for_status()
        return {"refund_id": resp.json()["id"]}