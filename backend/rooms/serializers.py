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
    primary_image     = serializers.SerializerMethodField()
    room_type_display = serializers.CharField(source="get_room_type_display", read_only=True)
    status_display    = serializers.CharField(source="get_status_display",    read_only=True)
    bed_type_display  = serializers.CharField(source="get_bed_type_display",  read_only=True)
    view_type_display = serializers.CharField(source="get_view_type_display", read_only=True)
    amenity_names     = serializers.SerializerMethodField()
    panorama_image_url = serializers.SerializerMethodField()
    average_rating    = serializers.ReadOnlyField()
    review_count      = serializers.ReadOnlyField()
    discounted_price  = serializers.ReadOnlyField()
    is_trending       = serializers.ReadOnlyField()
    total_capacity    = serializers.ReadOnlyField()
    inclusion_names   = serializers.SerializerMethodField()

    class Meta:
        model = Room
        fields = [
            "id", "room_number", "room_type", "room_type_display",
            "floor", "bed_type", "bed_type_display",
            "capacity", "max_adults", "max_children", "total_capacity",
            "price_per_night", "discounted_price", "discount_percentage",
            "status", "status_display", "size_sqm",
            "primary_image", "amenity_names", "inclusion_names",
            "panorama_image_url", "average_rating", "review_count",
            "is_featured", "is_trending", "view_type", "view_type_display",
        ]

    def get_primary_image(self, obj):
        image = obj.images.filter(is_primary=True).first() or obj.images.first()
        if image:
            return RoomImageSerializer(image, context=self.context).data
        return None

    def get_amenity_names(self, obj):
        return list(obj.amenity_assignments.select_related("amenity").values_list("amenity__name", flat=True))

    def get_inclusion_names(self, obj):
        return list(
            obj.room_inclusions
            .select_related("inclusion")
            .values_list("inclusion__name", flat=True)
        )

    def get_panorama_image_url(self, obj):
        request = self.context.get("request")
        if obj.panorama_image and request:
            return request.build_absolute_uri(obj.panorama_image.url)
        return None


class RoomDetailSerializer(serializers.ModelSerializer):
    images            = RoomImageSerializer(many=True, read_only=True)
    amenities         = serializers.SerializerMethodField()
    inclusions        = serializers.SerializerMethodField()
    panorama_image_url = serializers.SerializerMethodField()
    room_type_display = serializers.CharField(source="get_room_type_display", read_only=True)
    status_display    = serializers.CharField(source="get_status_display",    read_only=True)
    bed_type_display  = serializers.CharField(source="get_bed_type_display",  read_only=True)
    view_type_display = serializers.CharField(source="get_view_type_display", read_only=True)
    reviews           = serializers.SerializerMethodField()
    average_rating    = serializers.ReadOnlyField()
    review_count      = serializers.ReadOnlyField()
    rating_breakdown  = serializers.ReadOnlyField()
    discounted_price  = serializers.ReadOnlyField()
    is_trending       = serializers.ReadOnlyField()
    total_capacity    = serializers.ReadOnlyField()
    checkin_time      = serializers.TimeField(format="%H:%M", allow_null=True)
    checkout_time     = serializers.TimeField(format="%H:%M", allow_null=True)

    class Meta:
        model = Room
        fields = [
            "id", "room_number", "room_type", "room_type_display",
            "floor", "bed_type", "bed_type_display",
            "capacity", "max_adults", "max_children", "total_capacity",
            "price_per_night", "discounted_price", "discount_percentage",
            "status", "status_display", "description", "size_sqm",
            "is_active", "is_featured", "is_trending",
            "view_type", "view_type_display",
            "cancellation_policy", "checkin_time", "checkout_time",
            "created_at", "updated_at",
            "images", "amenities", "inclusions",
            "panorama_image_url", "reviews",
            "average_rating", "review_count", "rating_breakdown",
        ]

    def get_panorama_image_url(self, obj):
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
        reviews = obj.reviews.filter(is_visible=True)[:10]
        return RoomReviewSerializer(reviews, many=True, context=self.context).data


class RoomCreateUpdateSerializer(serializers.ModelSerializer):
    """Used by admin/staff to create or update rooms."""

    amenity_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=RoomAmenity.objects.all(),
        write_only=True,
        required=False,
    )
    inclusion_ids = serializers.PrimaryKeyRelatedField(
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
            "max_adults",
            "max_children",
            "price_per_night",
            "discount_percentage",
            "status",
            "description",
            "size_sqm",
            "is_active",
            "is_featured",
            "view_type",
            "cancellation_policy",
            "checkin_time",
            "checkout_time",
            "panorama_image",
            "amenity_ids",
            "inclusion_ids",
        ]

    def validate_room_number(self, value):
        qs = Room.objects.filter(room_number=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A room with this number already exists.")
        return value

    def validate(self, data):
        max_adults   = data.get('max_adults',   getattr(self.instance, 'max_adults',   2) if self.instance else 2)
        max_children = data.get('max_children', getattr(self.instance, 'max_children', 0) if self.instance else 0)
        capacity     = data.get('capacity',     getattr(self.instance, 'capacity',     2) if self.instance else 2)

        if max_adults + max_children > capacity:
            raise serializers.ValidationError(
                "Total capacity (max_adults + max_children) cannot exceed room capacity."
            )
        return data

    def create(self, validated_data):
        amenity_ids   = validated_data.pop("amenity_ids",   [])
        inclusion_ids = validated_data.pop("inclusion_ids", [])

        room = Room.objects.create(**validated_data)

        for amenity in amenity_ids:
            RoomAmenityAssignment.objects.create(room=room, amenity=amenity)

        for inclusion in inclusion_ids:
            RoomInclusion.objects.create(room=room, inclusion=inclusion)

        return room

    def update(self, instance, validated_data):
        amenity_ids   = validated_data.pop("amenity_ids",   None)
        inclusion_ids = validated_data.pop("inclusion_ids", None)
        new_price     = validated_data.get("price_per_night")

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

        if amenity_ids is not None:
            instance.amenity_assignments.all().delete()
            for amenity in amenity_ids:
                RoomAmenityAssignment.objects.create(room=instance, amenity=amenity)

        if inclusion_ids is not None:
            instance.room_inclusions.all().delete()
            for inclusion in inclusion_ids:
                RoomInclusion.objects.create(room=instance, inclusion=inclusion)

        return instance


class RoomAvailabilityRequestSerializer(serializers.Serializer):
    check_in  = serializers.DateField()
    check_out = serializers.DateField()
    room_type = serializers.ChoiceField(
        choices=[("", "Any")] + [(v, l) for v, l in RoomType.choices],
        required=False,
        allow_blank=True,
    )
    capacity  = serializers.IntegerField(min_value=1, required=False)
    max_price = serializers.DecimalField(max_digits=10, decimal_places=2, required=False)

    def validate(self, data):
        check_in  = data["check_in"]
        check_out = data["check_out"]
        today     = timezone.now().date()

        if check_in < today:
            raise serializers.ValidationError({"check_in": "Check-in date cannot be in the past."})
        if check_out <= check_in:
            raise serializers.ValidationError({"check_out": "Check-out must be after check-in."})
        if (check_out - check_in).days > 90:
            raise serializers.ValidationError("Booking duration cannot exceed 90 nights.")
        return data


class RoomLockSerializer(serializers.Serializer):
    room_id     = serializers.IntegerField()
    check_in    = serializers.DateField()
    check_out   = serializers.DateField()
    session_key = serializers.CharField(max_length=100)


class RoomPriceHistorySerializer(serializers.ModelSerializer):
    changed_by_name = serializers.SerializerMethodField()

    class Meta:
        model  = RoomPriceHistory
        fields = ["id", "old_price", "new_price", "changed_at", "changed_by_name", "reason"]

    def get_changed_by_name(self, obj):
        if obj.changed_by:
            return obj.changed_by.get_full_name() or obj.changed_by.email
        return "System"


class RoomReviewSerializer(serializers.ModelSerializer):
    guest_name        = serializers.ReadOnlyField()
    star_display      = serializers.ReadOnlyField()
    helpful_count     = serializers.ReadOnlyField()
    not_helpful_count = serializers.ReadOnlyField()
    total_votes       = serializers.ReadOnlyField()
    user_vote         = serializers.SerializerMethodField()

    class Meta:
        model  = RoomReview
        fields = [
            'id', 'rating', 'review_text', 'guest_name', 'star_display',
            'created_at', 'is_verified',
            'helpful_count', 'not_helpful_count', 'total_votes', 'user_vote',
        ]
        read_only_fields = ['id', 'created_at', 'is_verified']

    def get_user_vote(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return None
        user_vote = obj.get_user_vote(request.user)
        if user_vote is True:  return 'up'
        if user_vote is False: return 'down'
        return None


class ReviewHelpfulnessSerializer(serializers.Serializer):
    review_id  = serializers.IntegerField()
    is_helpful = serializers.BooleanField()

    def validate_review_id(self, value):
        try:
            RoomReview.objects.get(id=value, is_visible=True)
        except RoomReview.DoesNotExist:
            raise serializers.ValidationError("Review not found or not visible.")
        return value


class RoomReviewCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = RoomReview
        fields = ['booking', 'rating', 'review_text']

    def validate(self, data):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            raise serializers.ValidationError("You must be logged in to submit a review.")

        booking = data.get('booking')
        if booking.user != request.user:
            raise serializers.ValidationError("You can only review your own bookings.")
        if booking.status != 'checked_out':
            raise serializers.ValidationError("You can only review completed bookings.")
        if hasattr(booking, 'review'):
            raise serializers.ValidationError("You have already reviewed this booking.")
        return data

    def create(self, validated_data):
        booking = validated_data['booking']
        validated_data['room']        = booking.room
        validated_data['guest']       = self.context['request'].user
        validated_data['is_verified'] = True
        return super().create(validated_data)


class InclusionSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Inclusion
        fields = ["id", "name", "icon", "category", "description", "is_highlighted"]


class RoomInclusionSerializer(serializers.ModelSerializer):
    inclusion = InclusionSerializer(read_only=True)

    class Meta:
        model  = RoomInclusion
        fields = ["id", "inclusion", "notes"]


class SeasonalPriceSerializer(serializers.ModelSerializer):
    priority_display = serializers.CharField(source="get_priority_display", read_only=True)

    class Meta:
        model  = SeasonalPrice
        fields = [
            "id", "name", "start_date", "end_date",
            "price_per_night", "priority", "priority_display",
            "is_weekend_only", "is_active",
        ]


class PriceCalculationRequestSerializer(serializers.Serializer):
    check_in  = serializers.DateField()
    check_out = serializers.DateField()

    def validate(self, data):
        check_in  = data["check_in"]
        check_out = data["check_out"]
        today     = timezone.now().date()

        if check_in < today:
            raise serializers.ValidationError({"check_in": "Check-in date cannot be in the past."})
        if check_out <= check_in:
            raise serializers.ValidationError({"check_out": "Check-out must be after check-in."})
        if (check_out - check_in).days > 90:
            raise serializers.ValidationError("Booking duration cannot exceed 90 nights.")
        return data


class PriceCalculationResponseSerializer(serializers.Serializer):
    total      = serializers.DecimalField(max_digits=10, decimal_places=2)
    nights     = serializers.IntegerField()
    base_total = serializers.DecimalField(max_digits=10, decimal_places=2)
    breakdown  = serializers.ListField(child=serializers.DictField())



class HotelSettingsSerializer(serializers.ModelSerializer):
    checkin_time  = serializers.TimeField(format="%H:%M", input_formats=["%H:%M"])
    checkout_time = serializers.TimeField(format="%H:%M", input_formats=["%H:%M"])

    class Meta:
        from .models import HotelSettings
        model  = HotelSettings
        fields = [
            "checkin_time",
            "checkout_time",
            "hotel_name",
            "hotel_address",
            "hotel_phone",
            "hotel_email",
            "hotel_description",
            "cancellation_tiers",
            "terms_url",
            "privacy_url",
            "updated_at",
        ]
        read_only_fields = ["updated_at"]