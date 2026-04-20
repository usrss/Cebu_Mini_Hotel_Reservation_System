"""
chatbot/services/booking_service.py

Fetches booking data for authenticated users.
Returns None / empty for unauthenticated users.
"""

from bookings.models import Booking, BookingStatus


def get_user_bookings(user) -> dict:
    """
    Return the authenticated user's active and recent bookings.
    Called only when user is authenticated.
    """
    if not user or not user.is_authenticated:
        return {"authenticated": False, "bookings": []}

    bookings = (
        Booking.objects
        .filter(user=user)
        .select_related("room")
        .order_by("-created_at")[:5]
    )

    results = []
    for b in bookings:
        results.append({
            "id":               b.id,
            "reference_number": b.reference_number,
            "room_number":      b.room.room_number,
            "room_type":        b.room.get_room_type_display(),
            "check_in":         str(b.check_in),
            "check_out":        str(b.check_out),
            "nights":           b.nights,
            "status":           b.get_status_display(),
            "status_key":       b.status,
            "total_price":      str(b.total_price),
            "has_credentials":  b.has_credentials,
            "checkin_pin":      b.checkin_pin if b.has_credentials else None,
            "confirmed_at":     b.confirmed_at.isoformat() if b.confirmed_at else None,
        })

    return {
        "authenticated": True,
        "booking_count": len(results),
        "bookings":      results,
    }