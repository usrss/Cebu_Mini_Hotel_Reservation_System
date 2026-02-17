from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator
from django.utils import timezone


class RoomType(models.TextChoices):
    STANDARD = "standard", "Standard"
    DELUXE = "deluxe", "Deluxe"
    SUITE = "suite", "Suite"
    FAMILY = "family", "Family"
    PENTHOUSE = "penthouse", "Penthouse"


class BedType(models.TextChoices):
    SINGLE = "single", "Single"
    DOUBLE = "double", "Double"
    QUEEN = "queen", "Queen"
    KING = "king", "King"
    TWIN = "twin", "Twin"


class RoomStatus(models.TextChoices):
    AVAILABLE = "available", "Available"
    OCCUPIED = "occupied", "Occupied"
    MAINTENANCE = "maintenance", "Under Maintenance"
    RESERVED = "reserved", "Reserved"


class Room(models.Model):
    """
    Central source of truth for all room data.
    Referenced by bookings, payments, and notifications.
    """
    room_number = models.CharField(max_length=10, unique=True)
    room_type = models.CharField(
        max_length=20,
        choices=RoomType.choices,
        default=RoomType.STANDARD,
    )
    floor = models.PositiveIntegerField(default=1)
    bed_type = models.CharField(
        max_length=20,
        choices=BedType.choices,
        default=BedType.DOUBLE,
    )
    capacity = models.PositiveIntegerField(
        default=2,
        validators=[MinValueValidator(1)],
        help_text="Maximum number of guests allowed"
    )
    price_per_night = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(0)],
    )
    status = models.CharField(
        max_length=20,
        choices=RoomStatus.choices,
        default=RoomStatus.AVAILABLE,
    )
    description = models.TextField(blank=True)
    size_sqm = models.DecimalField(
        max_digits=6, decimal_places=2, null=True, blank=True,
        help_text="Room size in square meters"
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "rooms"
        ordering = ["floor", "room_number"]
        indexes = [
            models.Index(fields=["room_type", "status"]),
            models.Index(fields=["price_per_night"]),
            models.Index(fields=["capacity"]),
        ]

    def __str__(self):
        return f"Room {self.room_number} ({self.get_room_type_display()})"

    def is_available_for_dates(self, check_in, check_out):
        """
        Check if this room is free for a given date range.
        Prevents double-booking by checking against confirmed bookings.
        Used by both online and offline booking flows.
        """
        from bookings.models import Booking, BookingStatus

        overlapping = Booking.objects.filter(
            room=self,
            status__in=[BookingStatus.CONFIRMED, BookingStatus.PENDING],
            check_in__lt=check_out,
            check_out__gt=check_in,
        ).exists()

        return not overlapping and self.status == RoomStatus.AVAILABLE


class RoomAmenity(models.Model):
    """Amenities that can be associated with rooms."""
    name = models.CharField(max_length=100, unique=True)
    icon = models.CharField(max_length=50, blank=True, help_text="Icon identifier (e.g., 'wifi', 'tv')")
    category = models.CharField(
        max_length=50,
        blank=True,
        help_text="e.g., Technology, Comfort, Bathroom"
    )

    class Meta:
        db_table = "room_amenities"
        verbose_name_plural = "Room Amenities"
        ordering = ["category", "name"]

    def __str__(self):
        return self.name


class RoomAmenityAssignment(models.Model):
    """Many-to-many link between Room and Amenity with optional notes."""
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="amenity_assignments")
    amenity = models.ForeignKey(RoomAmenity, on_delete=models.CASCADE, related_name="room_assignments")
    notes = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "room_amenity_assignments"
        unique_together = ("room", "amenity")

    def __str__(self):
        return f"{self.room} — {self.amenity}"


class RoomImage(models.Model):
    """
    Images for a room. Supports multiple images per room.
    First image (is_primary=True) is used as the cover photo.
    """
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="images")
    image = models.ImageField(upload_to="rooms/images/%Y/%m/")
    caption = models.CharField(max_length=255, blank=True)
    is_primary = models.BooleanField(default=False)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "room_images"
        ordering = ["-is_primary", "sort_order"]

    def __str__(self):
        return f"Image for {self.room} ({'Primary' if self.is_primary else 'Secondary'})"

    def save(self, *args, **kwargs):
        # Ensure only one primary image per room
        if self.is_primary:
            RoomImage.objects.filter(room=self.room, is_primary=True).exclude(pk=self.pk).update(is_primary=False)
        super().save(*args, **kwargs)


class RoomPriceHistory(models.Model):
    """
    Tracks historical price changes for a room.
    Useful for auditing and analytics.
    """
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="price_history")
    old_price = models.DecimalField(max_digits=10, decimal_places=2)
    new_price = models.DecimalField(max_digits=10, decimal_places=2)
    changed_at = models.DateTimeField(default=timezone.now)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="room_price_changes"
    )
    reason = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "room_price_history"
        ordering = ["-changed_at"]

    def __str__(self):
        return f"{self.room} price: {self.old_price} → {self.new_price}"


class RoomTemporaryLock(models.Model):
    """
    Temporarily locks a room during booking flow to prevent race conditions.
    Both online and offline bookings use this before confirming.
    Lock expires automatically after a set timeout.
    """
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="locks")
    session_key = models.CharField(max_length=100, db_index=True)
    check_in = models.DateField()
    check_out = models.DateField()
    locked_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    released = models.BooleanField(default=False)

    class Meta:
        db_table = "room_temporary_locks"
        indexes = [
            models.Index(fields=["room", "check_in", "check_out"]),
            models.Index(fields=["expires_at", "released"]),
        ]

    def __str__(self):
        return f"Lock on {self.room} ({self.check_in} → {self.check_out})"

    @property
    def is_active(self):
        return not self.released and self.expires_at > timezone.now()