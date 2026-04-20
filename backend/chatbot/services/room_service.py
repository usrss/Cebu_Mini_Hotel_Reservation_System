"""
chatbot/services/room_service.py

Queries the existing Room model for chatbot responses.
Reuses your existing rooms app logic — no new DB tables.
"""

from datetime import date, timedelta
from decimal import Decimal

from rooms.models import Room, RoomStatus, RoomType
from bookings.models import Booking, BookingStatus, BLOCKING_STATUSES


def get_available_rooms(check_in: date = None, check_out: date = None,
                        room_type: str = None, guests: int = None) -> dict:
    """
    Return available rooms for the chatbot response.
    If no dates given, returns all currently available rooms.
    """
    qs = Room.objects.filter(is_active=True).exclude(
        status=RoomStatus.MAINTENANCE
    ).prefetch_related("images")

    if room_type:
        # Fuzzy match room type
        type_map = {
            "standard":  RoomType.STANDARD,
            "deluxe":    RoomType.DELUXE,
            "suite":     RoomType.SUITE,
            "family":    RoomType.FAMILY,
            "penthouse": RoomType.PENTHOUSE,
        }
        mapped = type_map.get(room_type.lower())
        if mapped:
            qs = qs.filter(room_type=mapped)

    if guests:
        qs = qs.filter(capacity__gte=guests)

    if check_in and check_out:
        # Exclude rooms with overlapping bookings
        booked_ids = Booking.objects.filter(
            status__in=BLOCKING_STATUSES,
            check_in__lt=check_out,
            check_out__gt=check_in,
        ).values_list("room_id", flat=True)
        qs = qs.exclude(id__in=booked_ids)

    rooms = qs.order_by("price_per_night")[:6]  # cap at 6 for chat

    results = []
    for room in rooms:
        primary_img = room.images.filter(is_primary=True).first() or room.images.first()
        results.append({
            "id":            room.id,
            "room_number":   room.room_number,
            "room_type":     room.get_room_type_display(),
            "bed_type":      room.get_bed_type_display(),
            "capacity":      room.capacity,
            "price_per_night": str(room.price_per_night),
            "discounted_price": str(room.discounted_price),
            "discount_percentage": str(room.discount_percentage),
            "status":        room.get_status_display(),
            "floor":         room.floor,
            "size_sqm":      str(room.size_sqm) if room.size_sqm else None,
            "image_url":     primary_img.image.url if primary_img else None,
        })

    return {
        "available_count": len(results),
        "rooms": results,
        "check_in":  str(check_in) if check_in else None,
        "check_out": str(check_out) if check_out else None,
    }


def get_room_prices(room_type: str = None) -> dict:
    """
    Return price ranges for chatbot pricing queries.
    """
    qs = Room.objects.filter(is_active=True)

    if room_type:
        type_map = {
            "standard":  RoomType.STANDARD,
            "deluxe":    RoomType.DELUXE,
            "suite":     RoomType.SUITE,
            "family":    RoomType.FAMILY,
            "penthouse": RoomType.PENTHOUSE,
        }
        mapped = type_map.get(room_type.lower())
        if mapped:
            qs = qs.filter(room_type=mapped)

    prices = []
    seen_types = set()

    for room in qs.order_by("room_type", "price_per_night"):
        rt = room.get_room_type_display()
        if rt not in seen_types:
            seen_types.add(rt)
            prices.append({
                "room_type":         rt,
                "price_per_night":   str(room.price_per_night),
                "discounted_price":  str(room.discounted_price),
                "discount_percentage": str(room.discount_percentage),
                "capacity":          room.capacity,
            })

    return {"pricing": prices}