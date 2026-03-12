# rooms/views.py
from django.utils import timezone
from datetime import timedelta
from rest_framework import generics, status, filters
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework.parsers import MultiPartParser, FormParser
from .models import ReviewHelpfulness
from rooms.permissions import IsAdminRoomManager, IsAdminOrManagerRoom

from .serializers import (
    PriceCalculationRequestSerializer,
    PriceCalculationResponseSerializer,
)

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

from rest_framework.permissions import IsAuthenticated
from rooms.permissions import IsAdminRoomManager, IsAdminOrManagerRoom

class AdminRoomListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/admin/rooms/  — list all rooms (Admin or Manager)
    POST /api/admin/rooms/  — create a new room (Admin only)
    """
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

    def get_permissions(self):
        if self.request.method == "POST":
            # Only Admin can create
            return [IsAuthenticated(), IsAdminRoomManager()]
        # Admin or Manager can list
        return [IsAuthenticated(), IsAdminOrManagerRoom()]


class AdminRoomDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    /api/admin/rooms/<id>/  — room detail
    PUT    /api/admin/rooms/<id>/  — full update
    PATCH  /api/admin/rooms/<id>/  — partial update (e.g., change status)
    DELETE /api/admin/rooms/<id>/  — soft delete (sets is_active=False)
    Staff/Admin only.
    """
    permission_classes = [IsAdminRoomManager]
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
    permission_classes = [IsAdminOrManagerRoom ]

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
    permission_classes = [IsAdminRoomManager]
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
    permission_classes = [IsAdminOrManagerRoom ]
    serializer_class = RoomPriceHistorySerializer

    def get_queryset(self):
        return RoomPriceHistory.objects.filter(room_id=self.kwargs["pk"]).select_related("changed_by")


# ============================================================================
# ADD THIS TO THE END OF YOUR backend/rooms/views.py FILE
# ============================================================================

from .models import RoomReview


class RoomReviewCreateView(APIView):
    """
    POST /api/rooms/reviews/
    Allow guest to submit a review after checkout.
    """
    permission_classes = [AllowAny]  # Will check in validation

    def post(self, request):
        from .serializers import RoomReviewCreateSerializer

        serializer = RoomReviewCreateSerializer(
            data=request.data,
            context={'request': request}
        )

        if serializer.is_valid():
            review = serializer.save()
            return Response(
                {
                    "message": "Thank you for your review!",
                    "review_id": review.id
                },
                status=status.HTTP_201_CREATED
            )

        return Response(
            serializer.errors,
            status=status.HTTP_400_BAD_REQUEST
        )


class GuestPendingReviewsView(APIView):
    """
    GET /api/rooms/reviews/pending/
    Get list of completed bookings that need reviews.
    """
    permission_classes = [AllowAny]  # Will check in view

    def get(self, request):
        # Must be authenticated
        if not request.user.is_authenticated:
            return Response(
                {"detail": "Authentication required"},
                status=status.HTTP_401_UNAUTHORIZED
            )

        try:
            from bookings.models import Booking
        except ImportError:
            return Response({"detail": "Booking module not available"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        # Get checked-out bookings without reviews
        # Use exclude with hasattr-safe pattern for reverse OneToOne
        reviewed_booking_ids = RoomReview.objects.values_list('booking_id', flat=True)
        pending = Booking.objects.filter(
            user=request.user,
            status='checked_out',
        ).exclude(
            id__in=reviewed_booking_ids
        ).select_related('room').order_by('-check_out')[:5]

        data = []
        for b in pending:
            try:
                room_number = b.room.room_number
                room_type = b.room.get_room_type_display()
            except Exception:
                room_number = 'N/A'
                room_type = 'N/A'
            data.append({
                'booking_id': b.id,
                'room_number': room_number,
                'room_type': room_type,
                'check_out': str(b.check_out),
                'can_review': True
            })

        return Response(data)


class ReviewHelpfulnessVoteView(APIView):
    """
    POST /api/rooms/reviews/<review_id>/helpful/
    Allow users to vote if a review was helpful (thumbs up/down).
    """
    permission_classes = [AllowAny]

    def post(self, request, review_id):
        # Must be authenticated
        if not request.user.is_authenticated:
            return Response(
                {"detail": "You must be logged in to vote"},
                status=status.HTTP_401_UNAUTHORIZED
            )

        # Get is_helpful from request body
        is_helpful = request.data.get('is_helpful')
        if is_helpful is None:
            return Response(
                {"error": "is_helpful field is required (true or false)"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Get the review
        try:
            review = RoomReview.objects.get(id=review_id, is_visible=True)
        except RoomReview.DoesNotExist:
            return Response(
                {"error": "Review not found"},
                status=status.HTTP_404_NOT_FOUND
            )

        # Prevent voting on your own review
        if review.guest == request.user:
            return Response(
                {"error": "You cannot vote on your own review"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Create or update vote
        vote, created = ReviewHelpfulness.objects.update_or_create(
            review=review,
            user=request.user,
            defaults={'is_helpful': is_helpful}
        )

        # Get updated counts
        helpful_count = review.helpful_count
        not_helpful_count = review.not_helpful_count

        return Response({
            "success": True,
            "action": "created" if created else "updated",
            "vote": "up" if is_helpful else "down",
            "helpful_count": helpful_count,
            "not_helpful_count": not_helpful_count,
            "total_votes": helpful_count + not_helpful_count
        }, status=status.HTTP_200_OK)

    def delete(self, request, review_id):
        """
        DELETE /api/rooms/reviews/<review_id>/helpful/
        Remove user's vote on a review.
        """
        if not request.user.is_authenticated:
            return Response(
                {"detail": "Authentication required"},
                status=status.HTTP_401_UNAUTHORIZED
            )

        try:
            vote = ReviewHelpfulness.objects.get(
                review_id=review_id,
                user=request.user
            )
            vote.delete()

            # Get updated counts
            review = RoomReview.objects.get(id=review_id)

            return Response({
                "success": True,
                "action": "deleted",
                "helpful_count": review.helpful_count,
                "not_helpful_count": review.not_helpful_count,
                "total_votes": review.total_votes
            })
        except ReviewHelpfulness.DoesNotExist:
            return Response(
                {"error": "Vote not found"},
                status=status.HTTP_404_NOT_FOUND
            )


class RoomPriceCalculationView(APIView):
    """
    POST /api/rooms/<id>/calculate-price/

    Calculate total price for a room across a date range.
    Uses seasonal pricing, weekend rates, and discounts.

    Request Body:
    {
        "check_in": "2026-12-24",
        "check_out": "2026-12-26"
    }

    Response:
    {
        "total": 12000.00,
        "nights": 2,
        "base_total": 10000.00,
        "breakdown": [
            {
                "date": "2026-12-24",
                "price": 6000.00,
                "reason": "Peak Season Rate"
            },
            {
                "date": "2026-12-25",
                "price": 6000.00,
                "reason": "Peak Season Rate"
            }
        ]
    }
    """
    permission_classes = [AllowAny]

    def post(self, request, pk):
        # Validate request
        req_serializer = PriceCalculationRequestSerializer(data=request.data)
        if not req_serializer.is_valid():
            return Response(req_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        # Get room
        try:
            room = Room.objects.get(pk=pk, is_active=True)
        except Room.DoesNotExist:
            return Response(
                {"error": "Room not found or inactive"},
                status=status.HTTP_404_NOT_FOUND
            )

        # Extract dates
        check_in = req_serializer.validated_data["check_in"]
        check_out = req_serializer.validated_data["check_out"]

        # Calculate price breakdown
        breakdown = []
        current_date = check_in
        total = 0
        base_total = 0

        while current_date < check_out:
            daily_price = room.get_price_for_date(current_date)
            total += daily_price
            base_total += room.price_per_night

            # Determine reason for price
            reason = self._get_price_reason(room, current_date, daily_price)

            breakdown.append({
                "date": str(current_date),
                "price": float(daily_price),
                "reason": reason,
                "is_weekend": current_date.weekday() in [4, 5]
            })

            current_date += timedelta(days=1)

        # Prepare response
        response_data = {
            "total": float(total),
            "nights": len(breakdown),
            "base_total": float(base_total),
            "average_per_night": float(total / len(breakdown)) if breakdown else 0,
            "breakdown": breakdown
        }

        return Response(response_data, status=status.HTTP_200_OK)

    def _get_price_reason(self, room, date, price):
        """Determine why this price is being charged."""
        # Check if discounted base price
        if price == room.discounted_price and room.discount_percentage > 0:
            return f"Base Rate with {room.discount_percentage}% Discount"

        # Check if base price
        if price == room.price_per_night:
            return "Standard Rate"

        # Must be seasonal pricing
        is_weekend = date.weekday() in [4, 5]

        # Find matching seasonal price
        matching_price = room.seasonal_prices.filter(
            is_active=True,
            start_date__lte=date,
            end_date__gte=date
        ).order_by('-priority').first()

        if matching_price:
            reason = matching_price.name
            if matching_price.is_weekend_only:
                reason += " (Weekend)"
            return reason

        return "Standard Rate"


class FeaturedRoomsView(generics.ListAPIView):
    """
    GET /api/rooms/featured/

    Returns all featured rooms for homepage carousel.
    """
    serializer_class = RoomListSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        return (
            Room.objects
            .filter(is_active=True, is_featured=True, status="available")
            .prefetch_related("images", "amenity_assignments__amenity", "room_inclusions__inclusion")
            .order_by("-created_at")[:10]  # Limit to 10 featured rooms
        )


class TrendingRoomsView(generics.ListAPIView):
    """
    GET /api/rooms/trending/

    Returns trending rooms (high ratings + many reviews).
    """
    serializer_class = RoomListSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        from django.db.models import Count, Avg, Q

        return (
            Room.objects
            .filter(is_active=True, status="available")
            .annotate(
                avg_rating=Avg('reviews__rating', filter=Q(reviews__is_visible=True)),
                review_cnt=Count('reviews', filter=Q(reviews__is_visible=True))
            )
            .filter(
                review_cnt__gte=5,
                avg_rating__gte=4.5
            )
            .prefetch_related("images", "amenity_assignments__amenity", "room_inclusions__inclusion")
            .order_by("-avg_rating", "-review_cnt")[:10]  # Top 10 trending
        )


class RoomsByViewTypeView(generics.ListAPIView):
    """
    GET /api/rooms/by-view/?view_type=sea

    Returns rooms filtered by view type.
    """
    serializer_class = RoomListSerializer
    permission_classes = [AllowAny]
    filter_backends = [DjangoFilterBackend]
    filterset_class = RoomFilter

    def get_queryset(self):
        return (
            Room.objects
            .filter(is_active=True)
            .prefetch_related("images", "amenity_assignments__amenity", "room_inclusions__inclusion")
            .order_by("price_per_night")
        )