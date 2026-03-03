from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator,MaxValueValidator
from django.utils import timezone
from django.db.models import Avg
from bookings.models import Booking, BookingStatus
from django.core.exceptions import ValidationError
from datetime import timedelta



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

# ============================================================================
#  VIEW TYPE ENUM (Add this near the top with other enums)
# ============================================================================

class RoomViewType(models.TextChoices):
    NONE = "none", "No Specific View"
    CITY = "city", "City View"
    SEA = "sea", "Sea View"
    OCEAN = "ocean", "Ocean View"
    POOL = "pool", "Pool View"
    GARDEN = "garden", "Garden View"
    MOUNTAIN = "mountain", "Mountain View"
    COURTYARD = "courtyard", "Courtyard View"


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
    panorama_image = models.ImageField(
        upload_to='rooms/panoramas/',
        null=True,
        blank=True,
        help_text="360° panoramic image (equirectangular projection, 2:1 ratio)"
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    is_featured = models.BooleanField(
        default=False,
        help_text="Display in homepage carousel"
    )

    #  View Type
    view_type = models.CharField(
        max_length=20,
        choices=RoomViewType.choices,
        default=RoomViewType.NONE,
    )

    #  Adult & Child Capacity
    max_adults = models.PositiveIntegerField(
        default=2,
        validators=[MinValueValidator(1)],
        help_text="Maximum number of adults"
    )
    max_children = models.PositiveIntegerField(
        default=0,
        help_text="Maximum number of children"
    )

    # Discount System
    discount_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text="Percentage discount on base price"
    )

    #  Policies
    cancellation_policy = models.TextField(
        blank=True,
        help_text="Cancellation terms and conditions"
    )
    checkin_time = models.TimeField(
        null=True,
        blank=True,
        help_text="Standard check-in time (e.g., 14:00)"
    )
    checkout_time = models.TimeField(
        null=True,
        blank=True,
        help_text="Standard check-out time (e.g., 11:00)"
    )

    class Meta:
        db_table = "rooms"
        ordering = ["floor", "room_number"]
        indexes = [
            models.Index(fields=["room_type", "status"]),
            models.Index(fields=["price_per_night"]),
            models.Index(fields=["capacity"]),
            models.Index(fields=["is_featured"]),  # NEW
            models.Index(fields=["view_type"]),  # NEW
            models.Index(fields=["-discount_percentage"]),  # NEW for filtering discounted rooms
        ]

    def __str__(self):
        return f"Room {self.room_number} ({self.get_room_type_display()})"

    def is_available_for_dates(self, check_in, check_out):
        """
        Check if this room is free for a given date range.
        Prevents double-booking by checking against confirmed bookings.
        Used by both online and offline booking flows.
        """


        overlapping = Booking.objects.filter(
            room=self,
            status__in=[BookingStatus.CONFIRMED, BookingStatus.PENDING],
            check_in__lt=check_out,
            check_out__gt=check_in,
        ).exists()

        return not overlapping and self.status == RoomStatus.AVAILABLE

    @property
    def average_rating(self):
        """Calculate average star rating from visible reviews."""
        reviews = self.reviews.filter(is_visible=True)
        if not reviews.exists():
            return None
        return reviews.aggregate(avg=Avg('rating'))['avg']

    @property
    def review_count(self):
        """Count of visible reviews."""
        return self.reviews.filter(is_visible=True).count()

    @property
    def rating_breakdown(self):
        """Return count of each star rating (5★, 4★, etc.)."""
        reviews = self.reviews.filter(is_visible=True)
        return {
            5: reviews.filter(rating=5).count(),
            4: reviews.filter(rating=4).count(),
            3: reviews.filter(rating=3).count(),
            2: reviews.filter(rating=2).count(),
            1: reviews.filter(rating=1).count(),
        }

    @property
    def discounted_price(self):
        '''Calculate price after discount applied to base price.'''
        if self.discount_percentage > 0:
            discount_amount = self.price_per_night * (self.discount_percentage / 100)
            return self.price_per_night - discount_amount
        return self.price_per_night

    @property
    def is_trending(self):
        '''Check if room is trending based on ratings.'''
        return self.review_count >= 5 and (self.average_rating or 0) >= 4.5

    @property
    def total_capacity(self):
        '''Total guest capacity (adults + children).'''
        return self.max_adults + self.max_children

    def get_price_for_date(self, date):
        '''
        Get the effective price for a specific date.
        Checks seasonal pricing rules with priority.

        Logic:
        1. Find all active seasonal prices covering this date
        2. Sort by priority (highest first)
        3. If weekend, prefer weekend-specific rules
        4. Return highest priority match
        5. Fallback to base price (or discounted price if applicable)
        '''
        from datetime import datetime

        # Check if date is weekend (Friday=4, Saturday=5)
        is_weekend = date.weekday() in [4, 5]

        # Get all active seasonal prices covering this date
        applicable_prices = self.seasonal_prices.filter(
            is_active=True,
            start_date__lte=date,
            end_date__gte=date
        ).order_by('-priority', '-id')

        # Try to find best match
        for price_rule in applicable_prices:
            # If it's weekend-only rule, only apply on weekends
            if price_rule.is_weekend_only and not is_weekend:
                continue
            # If it's not weekend-only, apply anytime
            # If it IS weekend and rule is weekend-only, apply
            return price_rule.price_per_night

        # No seasonal price found, return discounted price or base price
        return self.discounted_price

    def calculate_total_price(self, check_in, check_out):
        '''
        Calculate total price for a date range.
        Uses get_price_for_date for each night.
        '''
        from datetime import timedelta

        total = 0
        current_date = check_in

        while current_date < check_out:
            total += self.get_price_for_date(current_date)
            current_date += timedelta(days=1)

        return total

    def clean(self):
        '''Model validation.'''
        super().clean()

        # Validate capacity logic
        if hasattr(self, 'max_adults') and hasattr(self, 'max_children'):
            if self.max_adults + self.max_children > self.capacity:
                raise ValidationError(
                    f"Total capacity (adults + children) cannot exceed room capacity of {self.capacity}."
                )

        # Validate discount
        if hasattr(self, 'discount_percentage'):
            if self.discount_percentage < 0 or self.discount_percentage > 100:
                raise ValidationError("Discount percentage must be between 0 and 100.")


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


# ============================================================================
# ADD THIS TO THE END OF YOUR backend/rooms/models.py FILE
# ============================================================================

class RoomReview(models.Model):
    """
    Guest reviews and ratings for rooms.
    Created after checkout, displayed on room detail page.
    """
    room = models.ForeignKey(
        Room,
        on_delete=models.CASCADE,
        related_name="reviews"
    )
    booking = models.OneToOneField(
        'bookings.Booking',
        on_delete=models.CASCADE,
        related_name="review",
        help_text="One review per booking"
    )
    guest = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="room_reviews"
    )

    # Rating (required)
    rating = models.PositiveIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)],
        help_text="Star rating from 1 to 5"
    )

    # Written review (optional)
    review_text = models.TextField(
        blank=True,
        help_text="Optional written review"
    )

    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_verified = models.BooleanField(
        default=True,
        help_text="Only verified bookings can leave reviews"
    )
    is_visible = models.BooleanField(
        default=True,
        help_text="Admin can hide inappropriate reviews"
    )

    class Meta:
        db_table = "room_reviews"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["room", "-created_at"]),
            models.Index(fields=["rating"]),
        ]
        # Ensure one review per booking
        constraints = [
            models.UniqueConstraint(
                fields=['booking'],
                name='unique_review_per_booking'
            )
        ]

    def __str__(self):
        return f"Review by {self.guest.email} for Room {self.room.room_number} - {self.rating}★"

    @property
    def guest_name(self):
        """Return guest's display name."""
        if self.guest.first_name:
            return f"{self.guest.first_name} {self.guest.last_name[0]}." if self.guest.last_name else self.guest.first_name
        return self.guest.email.split('@')[0]

    @property
    def star_display(self):
        """Return star rating as string (e.g., '★★★★☆')."""
        filled = "★" * self.rating
        empty = "☆" * (5 - self.rating)
        return filled + empty

    @property
    def helpful_count(self):
        """Count of thumbs up votes."""
        return self.helpfulness_votes.filter(is_helpful=True).count()

    @property
    def not_helpful_count(self):
        """Count of thumbs down votes."""
        return self.helpfulness_votes.filter(is_helpful=False).count()

    @property
    def total_votes(self):
        """Total number of votes (helpful + not helpful)."""
        return self.helpfulness_votes.count()

    def get_user_vote(self, user):
        """
        Check if user has voted on this review.
        Returns: True (thumbs up), False (thumbs down), or None (no vote)
        """
        try:
            vote = self.helpfulness_votes.get(user=user)
            return vote.is_helpful
        except ReviewHelpfulness.DoesNotExist:
            return None


class ReviewHelpfulness(models.Model):
    """
    Tracks whether guests found a review helpful (thumbs up) or not helpful (thumbs down).
    One vote per user per review.
    """
    review = models.ForeignKey(
        RoomReview,
        on_delete=models.CASCADE,
        related_name="helpfulness_votes"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="review_votes"
    )
    is_helpful = models.BooleanField(
        help_text="True = thumbs up, False = thumbs down"
    )
    voted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "review_helpfulness"
        unique_together = ("review", "user")
        ordering = ["-voted_at"]

    def __str__(self):
        vote_type = "👍" if self.is_helpful else "👎"
        return f"{vote_type} by {self.user.email} on review #{self.review.id}"


# ============================================================================
# ADD THESE NEW MODELS TO THE END OF YOUR backend/rooms/models.py FILE
# AFTER ReviewHelpfulness MODEL
# ============================================================================

# ============================================================================
# 1️⃣ ROOM INCLUSIONS SYSTEM
# ============================================================================

class Inclusion(models.Model):
    """
    Reusable benefits included in room booking.
    Examples: Free Breakfast, Late Checkout, Pool Access, etc.
    """
    name = models.CharField(max_length=100, unique=True)
    icon = models.CharField(
        max_length=50,
        blank=True,
        help_text="Icon identifier (e.g., 'coffee', 'pool', 'parking')"
    )
    category = models.CharField(
        max_length=50,
        blank=True,
        help_text="e.g., Food & Beverage, Facilities, Services"
    )
    description = models.CharField(max_length=255, blank=True)
    is_highlighted = models.BooleanField(
        default=False,
        help_text="Display with special prominence in UI"
    )

    class Meta:
        db_table = "room_inclusions_master"
        ordering = ["category", "name"]
        verbose_name = "Inclusion"
        verbose_name_plural = "Inclusions"

    def __str__(self):
        return self.name


class RoomInclusion(models.Model):
    """Link between Room and Inclusion."""
    room = models.ForeignKey(
        Room,
        on_delete=models.CASCADE,
        related_name="room_inclusions"
    )
    inclusion = models.ForeignKey(
        Inclusion,
        on_delete=models.CASCADE,
        related_name="room_assignments"
    )
    notes = models.CharField(
        max_length=255,
        blank=True,
        help_text="Optional specific details for this room"
    )

    class Meta:
        db_table = "room_inclusion_assignments"
        unique_together = ("room", "inclusion")
        ordering = ["inclusion__category", "inclusion__name"]

    def __str__(self):
        return f"{self.room} — {self.inclusion}"





# ============================================================================
# 5️⃣ SEASONAL PRICING SYSTEM
# ============================================================================

class SeasonalPrice(models.Model):
    """
    Dynamic pricing for rooms based on date ranges.
    Supports weekend rates, peak season, holidays, etc.
    """

    PRIORITY_CHOICES = [
        (1, "Low Priority"),
        (2, "Normal Priority"),
        (3, "High Priority"),
        (4, "Peak Priority"),
    ]

    room = models.ForeignKey(
        Room,
        on_delete=models.CASCADE,
        related_name="seasonal_prices"
    )
    name = models.CharField(
        max_length=100,
        help_text="e.g., 'Christmas Week', 'Summer Peak', 'Weekend Rate'"
    )
    start_date = models.DateField()
    end_date = models.DateField()
    price_per_night = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(0)]
    )
    priority = models.IntegerField(
        choices=PRIORITY_CHOICES,
        default=2,
        help_text="Higher priority overrides lower when dates overlap"
    )
    is_weekend_only = models.BooleanField(
        default=False,
        help_text="Apply only on Friday/Saturday nights"
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "room_seasonal_prices"
        ordering = ["-priority", "start_date"]
        indexes = [
            models.Index(fields=["room", "start_date", "end_date"]),
            models.Index(fields=["priority", "is_active"]),
        ]

    def __str__(self):
        return f"{self.room} - {self.name} ({self.start_date} to {self.end_date})"

    def clean(self):
        """Validate date ranges."""
        from django.core.exceptions import ValidationError

        if self.end_date < self.start_date:
            raise ValidationError("End date must be on or after start date.")

        # Check for overlapping same-priority active rules
        if self.is_active:
            overlapping = SeasonalPrice.objects.filter(
                room=self.room,
                priority=self.priority,
                is_active=True,
                start_date__lte=self.end_date,
                end_date__gte=self.start_date
            ).exclude(pk=self.pk)

            if overlapping.exists():
                raise ValidationError(
                    f"Overlapping seasonal price with same priority already exists for this room."
                )

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

