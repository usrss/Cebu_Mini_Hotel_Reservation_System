from django.utils import timezone
from datetime import timedelta

from rest_framework import generics, status, filters
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework.parsers import MultiPartParser, FormParser

from django_filters.rest_framework import DjangoFilterBackend

from .models import Room, RoomImage, RoomTemporaryLock, RoomPriceHistory, RoomStatus
from .serializers import (
    RoomListSerializer,
    RoomDetailSerializer,
    RoomCreateUpdateSerializer,
    RoomAvailabilityRequestSerializer,
    RoomLockSerializer,
    RoomPriceHistorySerializer,
    RoomImageSerializer,
)
from .filters import RoomFilter
from .permissions import IsStaffOrAdmin


LOCK_DURATION_MINUTES = 10


class RoomListView(generics.ListAPIView):
    """
    GET /api/rooms/
    Public endpoint — returns all active, available rooms.
    Supports filtering by type, capacity, price, and date range.
    Used for: room listings page, public search.
    """
    serializer_class = RoomListSerializer
    permission_classes = [AllowAny]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter, filters.SearchFilter]
    filterset_class = RoomFilter
    ordering_fields = ["price_per_night", "capacity", "floor"]
    ordering = ["price_per_night"]
    search_fields = ["room_number", "description", "room_type"]

    def get_queryset(self):
        return (
            Room.objects
            .filter(is_active=True)
            .prefetch_related("images", "amenity_assignments__amenity")
            .select_related()
        )


class RoomDetailView(generics.RetrieveAPIView):
    """
    GET /api/rooms/<id>/
    Public endpoint — returns full room details including images and amenities.
    Used for: room detail page with booking button.
    """
    serializer_class = RoomDetailSerializer
    permission_classes = [AllowAny]
    queryset = Room.objects.filter(is_active=True).prefetch_related(
        "images", "amenity_assignments__amenity"
    )


class RoomAvailabilityView(APIView):
    """
    POST /api/rooms/availability/
    Checks which rooms are available for a given date range.
    Used by BOTH online booking flow and staff offline booking.
    Server-side check prevents double-booking.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        req_serializer = RoomAvailabilityRequestSerializer(data=request.data)
        if not req_serializer.is_valid():
            return Response(req_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = req_serializer.validated_data
        check_in = data["check_in"]
        check_out = data["check_out"]

        # Import here to avoid circular dependency with bookings app
        try:
            from bookings.models import Booking, BookingStatus
            booked_room_ids = Booking.objects.filter(
                status__in=[BookingStatus.CONFIRMED, BookingStatus.PENDING],
                check_in__lt=check_out,
                check_out__gt=check_in,
            ).values_list("room_id", flat=True)
        except ImportError:
            booked_room_ids = []

        # Also exclude rooms locked temporarily by active booking sessions
        now = timezone.now()
        locked_room_ids = RoomTemporaryLock.objects.filter(
            check_in__lt=check_out,
            check_out__gt=check_in,
            released=False,
            expires_at__gt=now,
        ).values_list("room_id", flat=True)

        queryset = Room.objects.filter(
            is_active=True,
            status=RoomStatus.AVAILABLE,
        ).exclude(
            id__in=list(booked_room_ids) + list(locked_room_ids)
        ).prefetch_related("images", "amenity_assignments__amenity")

        # Apply optional filters
        if data.get("room_type"):
            queryset = queryset.filter(room_type=data["room_type"])
        if data.get("capacity"):
            queryset = queryset.filter(capacity__gte=data["capacity"])
        if data.get("max_price"):
            queryset = queryset.filter(price_per_night__lte=data["max_price"])

        serializer = RoomListSerializer(queryset, many=True, context={"request": request})
        return Response({
            "check_in": check_in,
            "check_out": check_out,
            "nights": (check_out - check_in).days,
            "available_rooms": serializer.data,
            "total_found": queryset.count(),
        })


class RoomLockView(APIView):
    """
    POST /api/rooms/lock/
    Temporarily locks a room for a session during booking process.
    Prevents race conditions when two users try to book the same room.
    Lock expires after LOCK_DURATION_MINUTES if not confirmed.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RoomLockSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        room_id = data["room_id"]
        check_in = data["check_in"]
        check_out = data["check_out"]
        session_key = data["session_key"]
        now = timezone.now()

        try:
            room = Room.objects.get(id=room_id, is_active=True, status=RoomStatus.AVAILABLE)
        except Room.DoesNotExist:
            return Response({"error": "Room not found or unavailable."}, status=status.HTTP_404_NOT_FOUND)

        # Check for active conflicting locks (not from this session)
        conflict = RoomTemporaryLock.objects.filter(
            room=room,
            check_in__lt=check_out,
            check_out__gt=check_in,
            released=False,
            expires_at__gt=now,
        ).exclude(session_key=session_key).exists()

        if conflict:
            return Response(
                {"error": "Room is currently being booked by another session. Please try again shortly."},
                status=status.HTTP_409_CONFLICT
            )

        # Upsert lock for this session
        lock, created = RoomTemporaryLock.objects.update_or_create(
            room=room,
            session_key=session_key,
            check_in=check_in,
            check_out=check_out,
            defaults={
                "expires_at": now + timedelta(minutes=LOCK_DURATION_MINUTES),
                "released": False,
            },
        )

        return Response({
            "locked": True,
            "room_id": room.id,
            "room_number": room.room_number,
            "expires_at": lock.expires_at,
            "lock_duration_minutes": LOCK_DURATION_MINUTES,
        }, status=status.HTTP_200_OK)


class RoomLockReleaseView(APIView):
    """
    POST /api/rooms/lock/release/
    Releases a temporary room lock (called when user cancels booking flow).
    """
    permission_classes = [AllowAny]

    def post(self, request):
        session_key = request.data.get("session_key")
        room_id = request.data.get("room_id")

        if not session_key or not room_id:
            return Response({"error": "session_key and room_id are required."}, status=status.HTTP_400_BAD_REQUEST)

        released = RoomTemporaryLock.objects.filter(
            room_id=room_id,
            session_key=session_key,
            released=False,
        ).update(released=True)

        return Response({"released": released > 0})


# ─── Admin / Staff Views ──────────────────────────────────────────────────────

class AdminRoomListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/admin/rooms/         — list all rooms (including inactive)
    POST /api/admin/rooms/         — create a new room
    Staff/Admin only.
    """
    permission_classes = [IsStaffOrAdmin]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter, filters.SearchFilter]
    filterset_class = RoomFilter
    ordering_fields = ["price_per_night", "capacity", "floor", "room_number"]
    search_fields = ["room_number", "room_type", "status"]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return RoomCreateUpdateSerializer
        return RoomDetailSerializer

    def get_queryset(self):
        return Room.objects.all().prefetch_related("images", "amenity_assignments__amenity")


class AdminRoomDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    /api/admin/rooms/<id>/  — room detail
    PUT    /api/admin/rooms/<id>/  — full update
    PATCH  /api/admin/rooms/<id>/  — partial update (e.g., change status)
    DELETE /api/admin/rooms/<id>/  — soft delete (sets is_active=False)
    Staff/Admin only.
    """
    permission_classes = [IsStaffOrAdmin]
    queryset = Room.objects.all().prefetch_related("images", "amenity_assignments__amenity")

    def get_serializer_class(self):
        if self.request.method in ["PUT", "PATCH"]:
            return RoomCreateUpdateSerializer
        return RoomDetailSerializer

    def destroy(self, request, *args, **kwargs):
        """Soft delete — deactivate rather than permanently delete."""
        room = self.get_object()
        room.is_active = False
        room.save(update_fields=["is_active"])
        return Response(
            {"detail": f"Room {room.room_number} has been deactivated."},
            status=status.HTTP_200_OK
        )


class AdminRoomStatusView(APIView):
    """
    PATCH /api/admin/rooms/<id>/status/
    Quick endpoint to update room status (available, maintenance, etc.).
    """
    permission_classes = [IsStaffOrAdmin]

    def patch(self, request, pk):
        try:
            room = Room.objects.get(pk=pk)
        except Room.DoesNotExist:
            return Response({"error": "Room not found."}, status=status.HTTP_404_NOT_FOUND)

        new_status = request.data.get("status")
        if new_status not in RoomStatus.values:
            return Response(
                {"error": f"Invalid status. Choose from: {', '.join(RoomStatus.values)}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        room.status = new_status
        room.save(update_fields=["status"])
        return Response({
            "room_number": room.room_number,
            "status": room.status,
            "status_display": room.get_status_display(),
        })


class AdminRoomImageUploadView(APIView):
    """
    POST /api/admin/rooms/<id>/images/
    Upload one or more images for a room.
    """
    permission_classes = [IsStaffOrAdmin]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk):
        try:
            room = Room.objects.get(pk=pk)
        except Room.DoesNotExist:
            return Response({"error": "Room not found."}, status=status.HTTP_404_NOT_FOUND)

        images = request.FILES.getlist("images")
        if not images:
            return Response({"error": "No images provided."}, status=status.HTTP_400_BAD_REQUEST)

        has_primary = room.images.filter(is_primary=True).exists()
        created_images = []
        for idx, image_file in enumerate(images):
            img = RoomImage.objects.create(
                room=room,
                image=image_file,
                caption=request.data.get(f"caption_{idx}", ""),
                is_primary=(not has_primary and idx == 0),
                sort_order=room.images.count() + idx,
            )
            created_images.append(img)

        serializer = RoomImageSerializer(created_images, many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def delete(self, request, pk):
        image_id = request.data.get("image_id")
        try:
            image = RoomImage.objects.get(pk=image_id, room_id=pk)
            image.image.delete(save=False)
            image.delete()
            return Response({"deleted": True})
        except RoomImage.DoesNotExist:
            return Response({"error": "Image not found."}, status=status.HTTP_404_NOT_FOUND)


class AdminRoomPriceHistoryView(generics.ListAPIView):
    """
    GET /api/admin/rooms/<id>/price-history/
    Returns historical price changes for a specific room.
    """
    permission_classes = [IsStaffOrAdmin]
    serializer_class = RoomPriceHistorySerializer

    def get_queryset(self):
        return RoomPriceHistory.objects.filter(room_id=self.kwargs["pk"]).select_related("changed_by")