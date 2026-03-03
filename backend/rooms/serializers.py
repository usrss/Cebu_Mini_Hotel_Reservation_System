from django.db import models
from rest_framework import serializers
from django.utils import timezone
from .models import Room, RoomAmenity, RoomAmenityAssignment, RoomImage, RoomPriceHistory, RoomTemporaryLock, RoomStatus, RoomType
from .models import RoomReview
from django.db.models import Avg
from .models import ReviewHelpfulness
from .models import (
Inclusion,
RoomInclusion,
SeasonalPrice
)

class RoomAmenitySerializer(serializers.ModelSerializer):
    class Meta:
        model = RoomAmenity
        fields = ["id", "name", "icon", "category"]

class RoomImageSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = RoomImage
        fields = ["id", "image_url", "caption", "is_primary", "sort_order"]

    def get_image_url(self, obj):
        request = self.context.get("request")
        if obj.image and request:
            return request.build_absolute_uri(obj.image.url)
        return None


class RoomListSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for room listings and search results.
    NOW INCLUDES: featured status, trending, discounts, view type, inclusions
    """
    primary_image = serializers.SerializerMethodField()
    room_type_display = serializers.CharField(source="get_room_type_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    bed_type_display = serializers.CharField(source="get_bed_type_display", read_only=True)
    view_type_display = serializers.CharField(source="get_view_type_display", read_only=True)  # NEW

    amenity_names = serializers.SerializerMethodField()
    panorama_image_url = serializers.SerializerMethodField()

    # Review fields
    average_rating = serializers.ReadOnlyField()
    review_count = serializers.ReadOnlyField()

    # NEW FIELDS
    discounted_price = serializers.ReadOnlyField()
    is_trending = serializers.ReadOnlyField()
    total_capacity = serializers.ReadOnlyField()

    # Inclusion names (lightweight)
    inclusion_names = serializers.SerializerMethodField()

    class Meta:
        model = Room
        fields = [
            "id",
            "room_number",
            "room_type",
            "room_type_display",
            "floor",
            "bed_type",
            "bed_type_display",
            "capacity",
            "max_adults",  # NEW
            "max_children",  # NEW
            "total_capacity",  # NEW
            "price_per_night",
            "discounted_price",  # NEW
            "discount_percentage",  # NEW
            "status",
            "status_display",
            "size_sqm",
            "primary_image",
            "amenity_names",
            "inclusion_names",  # NEW
            "panorama_image_url",
            "average_rating",
            "review_count",
            "is_featured",  # NEW
            "is_trending",  # NEW
            "view_type",  # NEW
            "view_type_display",  # NEW
        ]

    def get_primary_image(self, obj):
        image = obj.images.filter(is_primary=True).first() or obj.images.first()
        if image:
            return RoomImageSerializer(image, context=self.context).data
        return None

    def get_amenity_names(self, obj):
        return list(obj.amenity_assignments.select_related("amenity").values_list("amenity__name", flat=True))

    def get_inclusion_names(self, obj):
        """Return list of inclusion names for this room."""
        return list(
            obj.room_inclusions
            .select_related("inclusion")
            .values_list("inclusion__name", flat=True)
        )

    def get_panorama_image_url(self, obj):
        """Return absolute URL for 360° panorama if it exists."""
        request = self.context.get("request")
        if obj.panorama_image and request:
            return request.build_absolute_uri(obj.panorama_image.url)
        return None


class RoomDetailSerializer(serializers.ModelSerializer):
    """
    Full serializer for room detail page.
    NOW INCLUDES: All inclusions, seasonal pricing info, policies, trending status
    """
    images = RoomImageSerializer(many=True, read_only=True)
    amenities = serializers.SerializerMethodField()
    inclusions = serializers.SerializerMethodField()  # NEW - Full inclusion details

    panorama_image_url = serializers.SerializerMethodField()
    room_type_display = serializers.CharField(source="get_room_type_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    bed_type_display = serializers.CharField(source="get_bed_type_display", read_only=True)
    view_type_display = serializers.CharField(source="get_view_type_display", read_only=True)  # NEW

    # Review fields
    reviews = serializers.SerializerMethodField()
    average_rating = serializers.ReadOnlyField()
    review_count = serializers.ReadOnlyField()
    rating_breakdown = serializers.ReadOnlyField()

    # NEW CALCULATED FIELDS
    discounted_price = serializers.ReadOnlyField()
    is_trending = serializers.ReadOnlyField()
    total_capacity = serializers.ReadOnlyField()

    # NEW POLICY FIELDS
    checkin_time = serializers.TimeField(format="%H:%M", allow_null=True)
    checkout_time = serializers.TimeField(format="%H:%M", allow_null=True)

    class Meta:
        model = Room
        fields = [
            "id",
            "room_number",
            "room_type",
            "room_type_display",
            "floor",
            "bed_type",
            "bed_type_display",
            "capacity",
            "max_adults",  # NEW
            "max_children",  # NEW
            "total_capacity",  # NEW
            "price_per_night",
            "discounted_price",  # NEW
            "discount_percentage",  # NEW
            "status",
            "status_display",
            "description",
            "size_sqm",
            "is_active",
            "is_featured",  # NEW
            "is_trending",  # NEW
            "view_type",  # NEW
            "view_type_display",  # NEW
            "cancellation_policy",  # NEW
            "checkin_time",  # NEW
            "checkout_time",  # NEW
            "created_at",
            "updated_at",
            "images",
            "amenities",
            "inclusions",  # NEW
            "panorama_image_url",
            "reviews",
            "average_rating",
            "review_count",
            "rating_breakdown",
        ]

    def get_panorama_image_url(self, obj):
        """Return absolute URL for 360° panorama image if it exists."""
        request = self.context.get("request")
        if obj.panorama_image and request:
            return request.build_absolute_uri(obj.panorama_image.url)
        return None

    def get_amenities(self, obj):
        assignments = obj.amenity_assignments.select_related("amenity").all()
        return [
            {
                "id": a.amenity.id,
                "name": a.amenity.name,
                "icon": a.amenity.icon,
                "category": a.amenity.category,
                "notes": a.notes,
            }
            for a in assignments
        ]

    def get_inclusions(self, obj):
        """Return full inclusion details with categories."""
        assignments = obj.room_inclusions.select_related("inclusion").all()
        return [
            {
                "id": ri.inclusion.id,
                "name": ri.inclusion.name,
                "icon": ri.inclusion.icon,
                "category": ri.inclusion.category,
                "description": ri.inclusion.description,
                "is_highlighted": ri.inclusion.is_highlighted,
                "notes": ri.notes,
            }
            for ri in assignments
        ]

    def get_reviews(self, obj):
        """Return latest 10 visible reviews."""
        reviews = obj.reviews.filter(is_visible=True)[:10]
        return RoomReviewSerializer(reviews, many=True, context=self.context).data

class RoomCreateUpdateSerializer(serializers.ModelSerializer):
    """
    Used by admin/staff to create or update rooms.
    NOW INCLUDES: inclusions, featured, view type, capacity split, policies
    """
amenity_ids = serializers.PrimaryKeyRelatedField(
    many=True,
    queryset=RoomAmenity.objects.all(),
    write_only=True,
    required=False,
)
inclusion_ids = serializers.PrimaryKeyRelatedField(  # NEW
    many=True,
    queryset=Inclusion.objects.all(),
    write_only=True,
    required=False,
)


class Meta:
    model = Room
    fields = [
        "id",
        "room_number",
        "room_type",
        "floor",
        "bed_type",
        "capacity",
        "max_adults",  # NEW
        "max_children",  # NEW
        "price_per_night",
        "discount_percentage",  # NEW
        "status",
        "description",
        "size_sqm",
        "is_active",
        "is_featured",  # NEW
        "view_type",  # NEW
        "cancellation_policy",  # NEW
        "checkin_time",  # NEW
        "checkout_time",  # NEW
        "amenity_ids",
        "inclusion_ids",  # NEW
    ]


def validate_room_number(self, value):
    qs = Room.objects.filter(room_number=value)
    if self.instance:
        qs = qs.exclude(pk=self.instance.pk)
    if qs.exists():
        raise serializers.ValidationError("A room with this number already exists.")
    return value


def validate(self, data):
    """Cross-field validation."""
    # Validate capacity
    max_adults = data.get('max_adults', self.instance.max_adults if self.instance else 2)
    max_children = data.get('max_children', self.instance.max_children if self.instance else 0)
    capacity = data.get('capacity', self.instance.capacity if self.instance else 2)

    if max_adults + max_children > capacity:
        raise serializers.ValidationError(
            "Total capacity (max_adults + max_children) cannot exceed room capacity."
        )

    return data


def create(self, validated_data):
    amenity_ids = validated_data.pop("amenity_ids", [])
    inclusion_ids = validated_data.pop("inclusion_ids", [])  # NEW

    room = Room.objects.create(**validated_data)

    # Assign amenities
    for amenity in amenity_ids:
        RoomAmenityAssignment.objects.create(room=room, amenity=amenity)

    # Assign inclusions (NEW)
    for inclusion in inclusion_ids:
        RoomInclusion.objects.create(room=room, inclusion=inclusion)

    return room


def update(self, instance, validated_data):
    amenity_ids = validated_data.pop("amenity_ids", None)
    inclusion_ids = validated_data.pop("inclusion_ids", None)  # NEW
    new_price = validated_data.get("price_per_night")

    # Track price history if price changed
    if new_price and new_price != instance.price_per_night:
        request = self.context.get("request")
        RoomPriceHistory.objects.create(
            room=instance,
            old_price=instance.price_per_night,
            new_price=new_price,
            changed_by=request.user if request and request.user.is_authenticated else None,
        )

    for attr, value in validated_data.items():
        setattr(instance, attr, value)
    instance.save()

    # Update amenities if provided
    if amenity_ids is not None:
        instance.amenity_assignments.all().delete()
        for amenity in amenity_ids:
            RoomAmenityAssignment.objects.create(room=instance, amenity=amenity)

    # Update inclusions if provided (NEW)
    if inclusion_ids is not None:
        instance.room_inclusions.all().delete()
        for inclusion in inclusion_ids:
            RoomInclusion.objects.create(room=instance, inclusion=inclusion)

    return instance


class RoomAvailabilityRequestSerializer(serializers.Serializer):
    """Validates incoming availability check requests."""
    check_in = serializers.DateField()
    check_out = serializers.DateField()
    room_type = serializers.ChoiceField(
        choices=[("", "Any")] + [(v, l) for v, l in RoomType.choices],
        required=False,
        allow_blank=True,
    )
    capacity = serializers.IntegerField(min_value=1, required=False)
    max_price = serializers.DecimalField(max_digits=10, decimal_places=2, required=False)

    def validate(self, data):
        check_in = data["check_in"]
        check_out = data["check_out"]
        today = timezone.now().date()

        if check_in < today:
            raise serializers.ValidationError({"check_in": "Check-in date cannot be in the past."})
        if check_out <= check_in:
            raise serializers.ValidationError({"check_out": "Check-out must be after check-in."})
        if (check_out - check_in).days > 90:
            raise serializers.ValidationError("Booking duration cannot exceed 90 nights.")
        return data


class RoomLockSerializer(serializers.Serializer):
    """Request body for temporarily locking a room."""
    room_id = serializers.IntegerField()
    check_in = serializers.DateField()
    check_out = serializers.DateField()
    session_key = serializers.CharField(max_length=100)


class RoomPriceHistorySerializer(serializers.ModelSerializer):
    changed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = RoomPriceHistory
        fields = ["id", "old_price", "new_price", "changed_at", "changed_by_name", "reason"]

    def get_changed_by_name(self, obj):
        if obj.changed_by:
            # CustomUser.get_full_name() returns full_name or falls back to email
            return obj.changed_by.get_full_name() or obj.changed_by.email
        return "System"


class RoomReviewSerializer(serializers.ModelSerializer):
    """Serializer for displaying reviews on room detail page."""
    guest_name = serializers.ReadOnlyField()
    star_display = serializers.ReadOnlyField()
    helpful_count = serializers.ReadOnlyField()
    not_helpful_count = serializers.ReadOnlyField()
    total_votes = serializers.ReadOnlyField()
    user_vote = serializers.SerializerMethodField()

    class Meta:
        model = RoomReview
        fields = [
            'id',
            'rating',
            'review_text',
            'guest_name',
            'star_display',
            'created_at',
            'is_verified',
            'helpful_count',
            'not_helpful_count',
            'total_votes',
            'user_vote',
        ]
        read_only_fields = ['id', 'created_at', 'is_verified']

    def get_user_vote(self, obj):
        """
        Return current user's vote on this review.
        Returns: 'up', 'down', or None
        """
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return None

        user_vote = obj.get_user_vote(request.user)
        if user_vote is True:
            return 'up'
        elif user_vote is False:
            return 'down'
        return None


class ReviewHelpfulnessSerializer(serializers.Serializer):
    """Serializer for submitting helpful/not helpful votes."""
    review_id = serializers.IntegerField()
    is_helpful = serializers.BooleanField()

    def validate_review_id(self, value):
        """Ensure review exists and is visible."""
        try:
            review = RoomReview.objects.get(id=value, is_visible=True)
        except RoomReview.DoesNotExist:
            raise serializers.ValidationError("Review not found or not visible.")
        return value


class RoomReviewCreateSerializer(serializers.ModelSerializer):
    """Serializer for guests to create reviews after checkout."""

    class Meta:
        model = RoomReview
        fields = ['booking', 'rating', 'review_text']

    def validate(self, data):
        request = self.context.get('request')

        # Check authentication
        if not request or not request.user.is_authenticated:
            raise serializers.ValidationError("You must be logged in to submit a review.")

        booking = data.get('booking')

        # Check if booking belongs to user
        if booking.guest != request.user:
            raise serializers.ValidationError("You can only review your own bookings.")

        # Check if booking is completed
        if booking.status != 'completed':
            raise serializers.ValidationError("You can only review completed bookings.")

        # Check if review already exists
        if hasattr(booking, 'review'):
            raise serializers.ValidationError("You have already reviewed this booking.")

        return data

    def create(self, validated_data):
        """Create review and link to booking's room."""
        booking = validated_data['booking']
        validated_data['room'] = booking.room
        validated_data['guest'] = self.context['request'].user
        validated_data['is_verified'] = True
        return super().create(validated_data)


class InclusionSerializer(serializers.ModelSerializer):
    """Serializer for room inclusions/benefits."""

    class Meta:
        model = Inclusion
        fields = ["id", "name", "icon", "category", "description", "is_highlighted"]


class RoomInclusionSerializer(serializers.ModelSerializer):
    """Serializer for room-specific inclusion assignments."""
    inclusion = InclusionSerializer(read_only=True)

    class Meta:
        model = RoomInclusion
        fields = ["id", "inclusion", "notes"]


class SeasonalPriceSerializer(serializers.ModelSerializer):
    """Serializer for seasonal pricing rules."""
    priority_display = serializers.CharField(source="get_priority_display", read_only=True)

    class Meta:
        model = SeasonalPrice
        fields = [
            "id", "name", "start_date", "end_date",
            "price_per_night", "priority", "priority_display",
            "is_weekend_only", "is_active"
        ]


class PriceCalculationRequestSerializer(serializers.Serializer):
    """Request body for calculating total price for date range."""
    check_in = serializers.DateField()
    check_out = serializers.DateField()

    def validate(self, data):
        check_in = data["check_in"]
        check_out = data["check_out"]
        today = timezone.now().date()

        if check_in < today:
            raise serializers.ValidationError({"check_in": "Check-in date cannot be in the past."})
        if check_out <= check_in:
            raise serializers.ValidationError({"check_out": "Check-out must be after check-in."})
        if (check_out - check_in).days > 90:
            raise serializers.ValidationError("Booking duration cannot exceed 90 nights.")

        return data


class PriceCalculationResponseSerializer(serializers.Serializer):
    """Response for price calculation with daily breakdown."""
    total = serializers.DecimalField(max_digits=10, decimal_places=2)
    nights = serializers.IntegerField()
    base_total = serializers.DecimalField(max_digits=10, decimal_places=2)
    breakdown = serializers.ListField(
        child=serializers.DictField()
    )

