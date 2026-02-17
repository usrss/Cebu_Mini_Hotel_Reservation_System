from rest_framework import serializers
from django.utils import timezone
from .models import Room, RoomAmenity, RoomAmenityAssignment, RoomImage, RoomPriceHistory, RoomTemporaryLock, RoomStatus, RoomType


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
    Used in the room listing page and availability checks.
    """
    primary_image = serializers.SerializerMethodField()
    room_type_display = serializers.CharField(source="get_room_type_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    bed_type_display = serializers.CharField(source="get_bed_type_display", read_only=True)
    amenity_names = serializers.SerializerMethodField()

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
            "price_per_night",
            "status",
            "status_display",
            "size_sqm",
            "primary_image",
            "amenity_names",
        ]

    def get_primary_image(self, obj):
        image = obj.images.filter(is_primary=True).first() or obj.images.first()
        if image:
            return RoomImageSerializer(image, context=self.context).data
        return None

    def get_amenity_names(self, obj):
        return list(obj.amenity_assignments.select_related("amenity").values_list("amenity__name", flat=True))


class RoomDetailSerializer(serializers.ModelSerializer):
    """
    Full serializer for room detail page — includes all images, amenities, description.
    """
    images = RoomImageSerializer(many=True, read_only=True)
    amenities = serializers.SerializerMethodField()
    room_type_display = serializers.CharField(source="get_room_type_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    bed_type_display = serializers.CharField(source="get_bed_type_display", read_only=True)

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
            "price_per_night",
            "status",
            "status_display",
            "description",
            "size_sqm",
            "is_active",
            "created_at",
            "updated_at",
            "images",
            "amenities",
        ]

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


class RoomCreateUpdateSerializer(serializers.ModelSerializer):
    """
    Used by admin/staff to create or update rooms.
    Tracks price history on price changes.
    """
    amenity_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=RoomAmenity.objects.all(),
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
            "price_per_night",
            "status",
            "description",
            "size_sqm",
            "is_active",
            "amenity_ids",
        ]

    def validate_room_number(self, value):
        qs = Room.objects.filter(room_number=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A room with this number already exists.")
        return value

    def create(self, validated_data):
        amenity_ids = validated_data.pop("amenity_ids", [])
        room = Room.objects.create(**validated_data)
        for amenity in amenity_ids:
            RoomAmenityAssignment.objects.create(room=room, amenity=amenity)
        return room

    def update(self, instance, validated_data):
        amenity_ids = validated_data.pop("amenity_ids", None)
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

        if amenity_ids is not None:
            instance.amenity_assignments.all().delete()
            for amenity in amenity_ids:
                RoomAmenityAssignment.objects.create(room=instance, amenity=amenity)

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