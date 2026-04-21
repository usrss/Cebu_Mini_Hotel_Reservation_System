# rooms/views.py
import json
from django.utils import timezone
from datetime import timedelta
from rest_framework import generics, status, filters
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
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
    serializer_class = RoomDetailSerializer
    permission_classes = [AllowAny]
    queryset = Room.objects.filter(is_active=True).prefetch_related(
        "images", "amenity_assignments__amenity"
    )


class RoomAvailabilityView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        req_serializer = RoomAvailabilityRequestSerializer(data=request.data)
        if not req_serializer.is_valid():
            return Response(req_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = req_serializer.validated_data
        check_in = data["check_in"]
        check_out = data["check_out"]
        now = timezone.now()

        try:
            from bookings.models import Booking, BookingStatus
            booked_room_ids = Booking.objects.filter(
                status__in=[
                    BookingStatus.PENDING_PAYMENT,
                    BookingStatus.CONFIRMED,
                    BookingStatus.CHECKED_IN,
                ],
                check_in__lt=check_out,
                check_out__gt=check_in,
            ).values_list("room_id", flat=True)
        except ImportError:
            booked_room_ids = []

        locked_room_ids = RoomTemporaryLock.objects.filter(
            check_in__lt=check_out,
            check_out__gt=check_in,
            released=False,
            expires_at__gt=now,
        ).values_list("room_id", flat=True)

        from datetime import datetime, time as dt_time
        tz = timezone.get_current_timezone()
        check_in_dt = datetime.combine(check_in, dt_time.min).replace(tzinfo=tz)

        try:
            from staff.models import CleaningTask, CleaningStatus
            cleaning_blocked_ids = CleaningTask.objects.filter(
                status__in=[CleaningStatus.DIRTY, CleaningStatus.CLEANING],
                cleaning_end_at__isnull=False,
                cleaning_end_at__gt=check_in_dt,
            ).values_list("room_id", flat=True)
        except Exception:
            cleaning_blocked_ids = []

        excluded_ids = (
            list(booked_room_ids)
            + list(locked_room_ids)
            + list(cleaning_blocked_ids)
        )

        queryset = Room.objects.filter(
            is_active=True,
        ).exclude(
            status=RoomStatus.MAINTENANCE,
        ).exclude(
            id__in=excluded_ids,
        ).prefetch_related("images", "amenity_assignments__amenity")

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
    GET  /api/rooms/admin/  — list all rooms (Admin or Manager)
    POST /api/rooms/admin/  — create a new room (Admin only)

    FIX: get_queryset now filters is_active=True so soft-deleted rooms
         don't reappear after reload.
    FIX: serializer context always includes request so image_url builds
         correct absolute URLs.
    FIX: seasonal_prices JSON string from multipart FormData is parsed
         before passing to the serializer.
    """
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter, filters.SearchFilter]
    filterset_class = RoomFilter
    ordering_fields = ["price_per_night", "capacity", "floor", "room_number"]
    search_fields = ["room_number", "room_type", "status"]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return RoomCreateUpdateSerializer
        return RoomDetailSerializer

    def get_queryset(self):
        # FIX: only return active rooms — soft-deleted rooms stay gone after reload
        return (
            Room.objects
            .filter(is_active=True)
            .prefetch_related(
                "images",
                "amenity_assignments__amenity",
                "room_inclusions__inclusion",
                "seasonal_prices",
            )
        )

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated(), IsAdminRoomManager()]
        return [IsAuthenticated(), IsAdminOrManagerRoom()]

    def get_serializer_context(self):
        # FIX: always pass request so RoomImageSerializer.get_image_url works
        ctx = super().get_serializer_context()
        ctx["request"] = self.request
        return ctx

    def create(self, request, *args, **kwargs):
        # FIX: when submitted as multipart/form-data, nested JSON fields
        # (seasonal_prices, inclusion_notes) arrive as strings — parse them.
        data = request.data.copy()
        data = _parse_json_fields(data)
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)


class AdminRoomDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    /api/rooms/admin/<id>/
    PUT    /api/rooms/admin/<id>/
    PATCH  /api/rooms/admin/<id>/
    DELETE /api/rooms/admin/<id>/  — soft delete (sets is_active=False)

    FIX: added IsAuthenticated alongside IsAdminRoomManager.
    FIX: queryset includes inactive rooms so an in-progress edit still resolves.
    FIX: serializer context includes request for image URLs.
    FIX: seasonal_prices JSON string parsed on update.
    """
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    # FIX: was missing IsAuthenticated — any unauthenticated request would 403
    permission_classes = [IsAuthenticated, IsAdminRoomManager]

    def get_queryset(self):
        # FIX: allow all rooms (including recently deactivated) so detail/edit works
        return Room.objects.all().prefetch_related(
            "images",
            "amenity_assignments__amenity",
            "room_inclusions__inclusion",
            "seasonal_prices",
        )

    def get_serializer_class(self):
        if self.request.method in ["PUT", "PATCH"]:
            return RoomCreateUpdateSerializer
        return RoomDetailSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["request"] = self.request
        return ctx

    def update(self, request, *args, **kwargs):
        # FIX: parse nested JSON fields from multipart payload
        data = request.data.copy()
        data = _parse_json_fields(data)
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        """
        Soft delete — sets is_active=False instead of deleting the DB row.
        FIX: returns 200 with a body so the frontend can confirm success,
             and the list view now filters is_active=True so the room stays gone.
        """
        room = self.get_object()
        room.is_active = False
        room.save(update_fields=["is_active"])
        return Response(
            {"detail": f"Room {room.room_number} has been deactivated."},
            status=status.HTTP_200_OK,
        )


class AdminRoomStatusView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrManagerRoom]

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
    POST   /api/rooms/admin/<id>/images/  — upload one or more images
    DELETE /api/rooms/admin/<id>/images/  — delete an image by image_id

    FIX: serializer context now always includes request so image_url
         returns an absolute URL instead of None.
    FIX: DELETE now properly deletes the physical file from storage.
    """
    permission_classes = [IsAuthenticated, IsAdminRoomManager]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

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

        # FIX: pass request in context so image_url is an absolute URL
        serializer = RoomImageSerializer(
            created_images, many=True, context={"request": request}
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def delete(self, request, pk):
        # FIX: support image_id sent as JSON body or form data
        image_id = request.data.get("image_id")
        if not image_id:
            return Response({"error": "image_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            image = RoomImage.objects.get(pk=image_id, room_id=pk)
            # FIX: delete the actual file from storage, not just the DB row
            if image.image:
                image.image.delete(save=False)
            image.delete()
            return Response({"deleted": True, "image_id": image_id})
        except RoomImage.DoesNotExist:
            return Response({"error": "Image not found."}, status=status.HTTP_404_NOT_FOUND)


class AdminRoomPriceHistoryView(generics.ListAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrManagerRoom]
    serializer_class = RoomPriceHistorySerializer

    def get_queryset(self):
        return RoomPriceHistory.objects.filter(room_id=self.kwargs["pk"]).select_related("changed_by")


from .models import RoomReview


class RoomReviewCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from .serializers import RoomReviewCreateSerializer
        serializer = RoomReviewCreateSerializer(
            data=request.data,
            context={"request": request},
        )
        if serializer.is_valid():
            review = serializer.save()
            return Response(
                {"message": "Thank you for your review!", "review_id": review.id},
                status=status.HTTP_201_CREATED,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class GuestPendingReviewsView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        if not request.user.is_authenticated:
            return Response(
                {"detail": "Authentication required"},
                status=status.HTTP_401_UNAUTHORIZED
            )

        try:
            from bookings.models import Booking
        except ImportError:
            return Response({"detail": "Booking module not available"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

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
    permission_classes = [AllowAny]

    def post(self, request, review_id):
        if not request.user.is_authenticated:
            return Response(
                {"detail": "You must be logged in to vote"},
                status=status.HTTP_401_UNAUTHORIZED
            )

        is_helpful = request.data.get('is_helpful')
        if is_helpful is None:
            return Response(
                {"error": "is_helpful field is required (true or false)"},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            review = RoomReview.objects.get(id=review_id, is_visible=True)
        except RoomReview.DoesNotExist:
            return Response({"error": "Review not found"}, status=status.HTTP_404_NOT_FOUND)

        if review.guest == request.user:
            return Response(
                {"error": "You cannot vote on your own review"},
                status=status.HTTP_400_BAD_REQUEST
            )

        vote, created = ReviewHelpfulness.objects.update_or_create(
            review=review,
            user=request.user,
            defaults={'is_helpful': is_helpful}
        )

        return Response({
            "success": True,
            "action": "created" if created else "updated",
            "vote": "up" if is_helpful else "down",
            "helpful_count": review.helpful_count,
            "not_helpful_count": review.not_helpful_count,
            "total_votes": review.helpful_count + review.not_helpful_count,
        }, status=status.HTTP_200_OK)

    def delete(self, request, review_id):
        if not request.user.is_authenticated:
            return Response({"detail": "Authentication required"}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            vote = ReviewHelpfulness.objects.get(review_id=review_id, user=request.user)
            vote.delete()
            review = RoomReview.objects.get(id=review_id)
            return Response({
                "success": True,
                "action": "deleted",
                "helpful_count": review.helpful_count,
                "not_helpful_count": review.not_helpful_count,
                "total_votes": review.total_votes,
            })
        except ReviewHelpfulness.DoesNotExist:
            return Response({"error": "Vote not found"}, status=status.HTTP_404_NOT_FOUND)


class RoomPriceCalculationView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, pk):
        req_serializer = PriceCalculationRequestSerializer(data=request.data)
        if not req_serializer.is_valid():
            return Response(req_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            room = Room.objects.get(pk=pk, is_active=True)
        except Room.DoesNotExist:
            return Response({"error": "Room not found or inactive"}, status=status.HTTP_404_NOT_FOUND)

        check_in = req_serializer.validated_data["check_in"]
        check_out = req_serializer.validated_data["check_out"]

        breakdown = []
        current_date = check_in
        total = 0
        base_total = 0

        while current_date < check_out:
            daily_price = room.get_price_for_date(current_date)
            total += daily_price
            base_total += room.price_per_night
            reason = self._get_price_reason(room, current_date, daily_price)
            breakdown.append({
                "date": str(current_date),
                "price": float(daily_price),
                "reason": reason,
                "is_weekend": current_date.weekday() in [4, 5],
            })
            current_date += timedelta(days=1)

        return Response({
            "total": float(total),
            "nights": len(breakdown),
            "base_total": float(base_total),
            "average_per_night": float(total / len(breakdown)) if breakdown else 0,
            "breakdown": breakdown,
        }, status=status.HTTP_200_OK)

    def _get_price_reason(self, room, date, price):
        if price == room.discounted_price and room.discount_percentage > 0:
            return f"Base Rate with {room.discount_percentage}% Discount"
        if price == room.price_per_night:
            return "Standard Rate"
        matching = room.seasonal_prices.filter(
            is_active=True, start_date__lte=date, end_date__gte=date
        ).order_by('-priority').first()
        if matching:
            r = matching.name
            if matching.is_weekend_only:
                r += " (Weekend)"
            return r
        return "Standard Rate"


class FeaturedRoomsView(generics.ListAPIView):
    serializer_class = RoomListSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        return (
            Room.objects
            .filter(is_active=True, is_featured=True, status="available")
            .prefetch_related("images", "amenity_assignments__amenity", "room_inclusions__inclusion")
            .order_by("-created_at")[:10]
        )


class TrendingRoomsView(generics.ListAPIView):
    serializer_class = RoomListSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        from django.db.models import Count, Avg, Q
        return (
            Room.objects
            .filter(is_active=True, status="available")
            .annotate(
                avg_rating=Avg('reviews__rating', filter=Q(reviews__is_visible=True)),
                review_cnt=Count('reviews', filter=Q(reviews__is_visible=True)),
            )
            .filter(review_cnt__gte=5, avg_rating__gte=4.5)
            .prefetch_related("images", "amenity_assignments__amenity", "room_inclusions__inclusion")
            .order_by("-avg_rating", "-review_cnt")[:10]
        )


class RoomsByViewTypeView(generics.ListAPIView):
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


class ReviewTokenValidateView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, token):
        from rooms.models import ReviewToken
        try:
            rt = ReviewToken.objects.select_related("booking__room").get(token=token)
        except ReviewToken.DoesNotExist:
            return Response(
                {"error": "Review link not found. It may have already been used or never existed."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if rt.is_used:
            return Response(
                {"error": "This review link has already been used."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if rt.is_expired:
            return Response(
                {"error": f"This review link expired on {rt.expires_at.strftime('%B %d, %Y')}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        booking = rt.booking
        return Response({
            "valid": True,
            "token": str(rt.token),
            "expires_at": rt.expires_at,
            "booking": {
                "id": booking.pk,
                "full_name": booking.full_name,
                "room_number": booking.room.room_number,
                "room_type": booking.room.get_room_type_display(),
                "check_in": str(booking.check_in),
                "check_out": str(booking.check_out),
                "nights": booking.nights,
            },
        })


class ReviewTokenSubmitView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, token):
        from rooms.models import ReviewToken, RoomReview
        try:
            rt = ReviewToken.objects.select_related("booking__room").get(token=token)
        except ReviewToken.DoesNotExist:
            return Response({"error": "Review link not found."}, status=status.HTTP_404_NOT_FOUND)

        if rt.is_used:
            return Response({"error": "This review link has already been used."}, status=status.HTTP_400_BAD_REQUEST)
        if rt.is_expired:
            return Response({"error": "This review link has expired."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            rating = int(request.data.get("rating", 0))
        except (TypeError, ValueError):
            return Response({"error": "rating must be an integer between 1 and 5."}, status=status.HTTP_400_BAD_REQUEST)

        if not 1 <= rating <= 5:
            return Response({"error": "rating must be between 1 and 5."}, status=status.HTTP_400_BAD_REQUEST)

        review_text = str(request.data.get("review_text", "")).strip()
        booking = rt.booking

        from bookings.models import BookingStatus
        if booking.status != BookingStatus.CHECKED_OUT:
            return Response(
                {"error": "Reviews can only be submitted after checkout is complete."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if RoomReview.objects.filter(booking=booking).exists():
            rt.mark_used()
            return Response({"error": "A review for this booking has already been submitted."}, status=status.HTTP_400_BAD_REQUEST)

        from django.db import transaction as db_transaction
        with db_transaction.atomic():
            review = RoomReview.objects.create(
                room=booking.room,
                booking=booking,
                guest=booking.user,
                guest_name=booking.full_name,
                guest_email=booking.email,
                rating=rating,
                review_text=review_text,
                is_verified=True,
                is_visible=True,
            )
            rt.mark_used()

        return Response({
            "message": "Thank you for your review!",
            "review_id": review.pk,
            "rating": review.rating,
            "room": booking.room.room_number,
            "is_verified": review.is_verified,
        }, status=status.HTTP_201_CREATED)


class ReviewTokenView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, token):
        return ReviewTokenValidateView().get(request, token)

    def post(self, request, token):
        return ReviewTokenSubmitView().post(request, token)


class HotelSettingsView(APIView):
    permission_classes = [IsAuthenticated]

    def _is_admin(self, request):
        profile = getattr(request.user, 'staff_profile', None)
        if profile:
            return profile.effective_role in ('admin', 'manager')
        return request.user.is_staff or request.user.is_superuser

    def get(self, request):
        from .models import HotelSettings
        from .serializers import HotelSettingsSerializer
        return Response(HotelSettingsSerializer(HotelSettings.get()).data)

    def patch(self, request):
        from .models import HotelSettings
        from .serializers import HotelSettingsSerializer
        if not self._is_admin(request):
            return Response({"detail": "Admin or manager only."}, status=status.HTTP_403_FORBIDDEN)
        s = HotelSettingsSerializer(HotelSettings.get(), data=request.data, partial=True)
        if s.is_valid():
            s.save()
            return Response(s.data)
        return Response(s.errors, status=status.HTTP_400_BAD_REQUEST)


# ─── Amenity & Inclusion CRUD Views ──────────────────────────────────────────

from .models import RoomAmenity, Inclusion
from .serializers import RoomAmenitySerializer, InclusionSerializer


class AmenityListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/rooms/amenities/
    POST /api/rooms/amenities/
    """
    serializer_class = RoomAmenitySerializer
    # FIX: GET (list) is open to any authenticated admin/manager;
    #      POST also requires IsAdminRoomManager but listing is allowed for managers too.
    permission_classes = [IsAuthenticated, IsAdminOrManagerRoom]
    queryset = RoomAmenity.objects.all().order_by("category", "name")

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated(), IsAdminRoomManager()]
        return [IsAuthenticated(), IsAdminOrManagerRoom()]


class AmenityDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    /api/rooms/amenities/<id>/
    PUT    /api/rooms/amenities/<id>/
    PATCH  /api/rooms/amenities/<id>/
    DELETE /api/rooms/amenities/<id>/
    """
    serializer_class = RoomAmenitySerializer
    permission_classes = [IsAuthenticated, IsAdminRoomManager]
    queryset = RoomAmenity.objects.all()


class InclusionListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/rooms/inclusions/
    POST /api/rooms/inclusions/
    """
    serializer_class = InclusionSerializer
    permission_classes = [IsAuthenticated, IsAdminOrManagerRoom]
    queryset = Inclusion.objects.all().order_by("category", "name")

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated(), IsAdminRoomManager()]
        return [IsAuthenticated(), IsAdminOrManagerRoom()]


class InclusionDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    /api/rooms/inclusions/<id>/
    PUT    /api/rooms/inclusions/<id>/
    PATCH  /api/rooms/inclusions/<id>/
    DELETE /api/rooms/inclusions/<id>/
    """
    serializer_class = InclusionSerializer
    permission_classes = [IsAuthenticated, IsAdminRoomManager]
    queryset = Inclusion.objects.all()


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _parse_json_fields(data):
    """
    When a room form is submitted as multipart/form-data the frontend
    JSON.stringifies nested fields before appending them to FormData.
    This helper parses them back to Python objects so the serializer
    receives the correct types.

    Fields handled:
      - seasonal_prices  (list of dicts)
      - inclusion_notes  (dict)
      - amenity_ids      (JSON string "[1,2,3]" → list of ints)
      - inclusion_ids    (JSON string "[1,2,3]" → list of ints)
    """
    import json
    from django.http import QueryDict

    # QueryDict is immutable — copy to a plain dict so we can mutate it
    if isinstance(data, QueryDict):
        data = data.dict()

    for field in ("seasonal_prices", "inclusion_notes"):
        val = data.get(field)
        if isinstance(val, str):
            try:
                data[field] = json.loads(val)
            except (json.JSONDecodeError, ValueError):
                pass  # leave as-is; serializer will surface the error

    # amenity_ids / inclusion_ids arrive as a JSON array string e.g. "[1,2,3]"
    # Cast each element to int so PrimaryKeyRelatedField validation passes.
    for field in ("amenity_ids", "inclusion_ids"):
        val = data.get(field)
        if isinstance(val, str):
            try:
                parsed = json.loads(val)
                if isinstance(parsed, list):
                    data[field] = [int(x) for x in parsed if x is not None]
                else:
                    data[field] = parsed
            except (json.JSONDecodeError, ValueError, TypeError):
                pass

    return data