"""
staff/models.py

Admin & Staff Management module for Cebu Mini Hotel System.
Integrates with existing: users (AUTH_USER_MODEL), bookings.Booking, rooms.Room.

Models:
  - StaffProfile        : Extends AUTH_USER_MODEL with role, status, shift, temp-role.
  - StaffActivityLog    : Immutable audit trail for every staff action.
  - StaffSession        : Tracks online/offline/idle presence per device.
  - Shift               : Planned work period for a staff member.
  - CleaningTask        : Housekeeping task assigned to a room.
  - MaintenanceTask     : Maintenance/repair task assigned to a room.
  - IncidentLog         : Security incident record (optional Security role).
  - MaintenanceRequest  : Reporting layer for FD/HK to submit maintenance issues.
"""

from django.db import models
from django.conf import settings
from django.utils import timezone


# ─── Role Choices ─────────────────────────────────────────────────────────────

class StaffRole(models.TextChoices):
    ADMIN        = "admin",        "Admin (Super Admin)"
    MANAGER      = "manager",      "Manager"
    RECEPTIONIST = "receptionist", "Receptionist"
    FRONT_DESK   = "front_desk",   "Front Desk"
    HOUSEKEEPING = "housekeeping", "Housekeeping"
    MAINTENANCE  = "maintenance",  "Maintenance"
    SECURITY     = "security",     "Security"


# ─── Status Choices ───────────────────────────────────────────────────────────

class StaffOnlineStatus(models.TextChoices):
    ONLINE  = "online",  "Online"
    OFFLINE = "offline", "Offline"
    IDLE    = "idle",    "Idle"


class CleaningStatus(models.TextChoices):
    DIRTY    = "dirty",    "Dirty"
    CLEANING = "cleaning", "Cleaning"
    CLEAN    = "clean",    "Clean / Ready"


class MaintenanceStatus(models.TextChoices):
    PENDING     = "pending",     "Pending"
    IN_PROGRESS = "in_progress", "In Progress"
    COMPLETED   = "completed",   "Completed"
    CANCELLED   = "cancelled",   "Cancelled"


# ─── StaffProfile ─────────────────────────────────────────────────────────────

class StaffProfile(models.Model):
    """
    One-to-one extension of AUTH_USER_MODEL.
    Stores hotel-specific staff attributes: role, status, shift, temp role.

    The linked user's `is_staff` flag is set to True on creation.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="staff_profile",
        help_text="The Django user this profile belongs to.",
    )

    # Primary role — determines base permissions
    role = models.CharField(
        max_length=20,
        choices=StaffRole.choices,
        default=StaffRole.RECEPTIONIST,
        db_index=True,
    )

    # Optional temporary role — overrides `role` while active
    temp_role = models.CharField(
        max_length=20,
        choices=StaffRole.choices,
        null=True,
        blank=True,
    )
    temp_role_expires_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When set, temp_role is active until this datetime.",
    )

    # Real-time presence — updated by StaffSession signals
    online_status = models.CharField(
        max_length=10,
        choices=StaffOnlineStatus.choices,
        default=StaffOnlineStatus.OFFLINE,
        db_index=True,
    )
    last_seen_at = models.DateTimeField(null=True, blank=True)

    # Free-form description of the task currently being worked on
    current_task = models.CharField(
        max_length=255,
        blank=True,
        help_text="Short description of what this staff member is currently doing.",
    )

    # Account state
    is_active = models.BooleanField(
        default=True,
        help_text="Deactivated staff cannot log in.",
    )
    deactivated_at = models.DateTimeField(null=True, blank=True)
    deactivated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="deactivated_staff",
    )

    # Metadata
    employee_id = models.CharField(max_length=50, blank=True, unique=True, null=True)
    phone       = models.CharField(max_length=30, blank=True)
    notes       = models.TextField(blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "staff_profiles"
        ordering = ["user__email"]
        indexes  = [
            models.Index(fields=["role"]),
            models.Index(fields=["online_status"]),
            models.Index(fields=["is_active"]),
        ]

    def __str__(self):
        return f"{self.user.get_full_name() or self.user.email} [{self.get_role_display()}]"

    # ── Helpers ───────────────────────────────────────────────────────────────

    @property
    def effective_role(self) -> str:
        """
        Returns temp_role if it is currently active, otherwise falls back to role.
        """
        if (
            self.temp_role
            and self.temp_role_expires_at
            and timezone.now() < self.temp_role_expires_at
        ):
            return self.temp_role
        return self.role

    def clear_expired_temp_role(self):
        """Clears temp_role if it has expired. Saves the instance."""
        if (
            self.temp_role
            and self.temp_role_expires_at
            and timezone.now() >= self.temp_role_expires_at
        ):
            self.temp_role            = None
            self.temp_role_expires_at = None
            self.save(update_fields=["temp_role", "temp_role_expires_at", "updated_at"])

    def mark_online(self):
        self.online_status = StaffOnlineStatus.ONLINE
        self.last_seen_at  = timezone.now()
        self.save(update_fields=["online_status", "last_seen_at", "updated_at"])

    def mark_offline(self):
        self.online_status = StaffOnlineStatus.OFFLINE
        self.last_seen_at  = timezone.now()
        self.save(update_fields=["online_status", "last_seen_at", "updated_at"])

    def mark_idle(self):
        self.online_status = StaffOnlineStatus.IDLE
        self.last_seen_at  = timezone.now()
        self.save(update_fields=["online_status", "last_seen_at", "updated_at"])


# ─── StaffSession ─────────────────────────────────────────────────────────────

class StaffSession(models.Model):
    """
    Tracks an active login session for a staff member.
    Created on login, closed on logout or timeout.
    Drives the online/offline/idle presence logic.
    """

    staff       = models.ForeignKey(
        StaffProfile,
        on_delete=models.CASCADE,
        related_name="sessions",
    )
    session_key = models.CharField(max_length=100, db_index=True)
    ip_address  = models.GenericIPAddressField(null=True, blank=True)
    user_agent  = models.TextField(blank=True)

    logged_in_at  = models.DateTimeField(auto_now_add=True)
    last_activity = models.DateTimeField(auto_now=True)
    logged_out_at = models.DateTimeField(null=True, blank=True)
    is_active     = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "staff_sessions"
        ordering = ["-logged_in_at"]

    def __str__(self):
        return f"Session [{self.staff}] — {'active' if self.is_active else 'closed'}"

    def close(self):
        self.logged_out_at = timezone.now()
        self.is_active     = False
        self.save(update_fields=["logged_out_at", "is_active"])
        if not self.staff.sessions.filter(is_active=True).exists():
            self.staff.mark_offline()


# ─── Shift ────────────────────────────────────────────────────────────────────

class Shift(models.Model):
    """
    Planned work period for a staff member.
    Managed by Admin/Manager. One staff can have many shifts.
    """

    class ShiftStatus(models.TextChoices):
        SCHEDULED = "scheduled", "Scheduled"
        IN_SHIFT  = "in_shift",  "In Shift"
        COMPLETED = "completed", "Completed"
        MISSED    = "missed",    "Missed"
        CANCELLED = "cancelled", "Cancelled"

    staff      = models.ForeignKey(
        StaffProfile,
        on_delete=models.CASCADE,
        related_name="shifts",
    )
    label      = models.CharField(max_length=100, blank=True, help_text="e.g. 'Morning Shift'")
    start_time = models.DateTimeField()
    end_time   = models.DateTimeField()
    status     = models.CharField(
        max_length=15,
        choices=ShiftStatus.choices,
        default=ShiftStatus.SCHEDULED,
        db_index=True,
    )
    notes      = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="created_shifts",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "staff_shifts"
        ordering = ["-start_time"]

    def __str__(self):
        return f"{self.label or 'Shift'} — {self.staff} ({self.start_time:%Y-%m-%d %H:%M})"

    @property
    def duration_hours(self) -> float:
        delta = self.end_time - self.start_time
        return round(delta.total_seconds() / 3600, 2)


# ─── StaffActivityLog ─────────────────────────────────────────────────────────

class StaffActivityLog(models.Model):
    """
    Immutable audit trail. One row per significant staff action.
    Never updated — only appended.
    """

    staff       = models.ForeignKey(
        StaffProfile,
        on_delete=models.SET_NULL,
        null=True,
        related_name="activity_logs",
    )
    action_type = models.CharField(max_length=60, db_index=True)
    description = models.TextField()
    ip_address  = models.GenericIPAddressField(null=True, blank=True)

    booking_id     = models.IntegerField(null=True, blank=True, db_index=True)
    room_id        = models.IntegerField(null=True, blank=True, db_index=True)
    target_user_id = models.IntegerField(
        null=True, blank=True,
        help_text="If the action involves another user (e.g. promoting staff).",
    )

    metadata   = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "staff_activity_logs"
        ordering = ["-created_at"]
        indexes  = [
            models.Index(fields=["action_type", "created_at"]),
            models.Index(fields=["staff", "created_at"]),
        ]

    def __str__(self):
        name = str(self.staff) if self.staff else "Unknown"
        return f"[{self.created_at:%Y-%m-%d %H:%M}] {name} — {self.action_type}"


# ─── CleaningTask ─────────────────────────────────────────────────────────────

class CleaningTask(models.Model):
    """
    Housekeeping task for a specific room.
    Status flow: dirty → cleaning → clean
    """

    room = models.ForeignKey(
        "rooms.Room",
        on_delete=models.CASCADE,
        related_name="cleaning_tasks",
    )
    assigned_to = models.ForeignKey(
        StaffProfile,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="cleaning_tasks",
        limit_choices_to={"role": StaffRole.HOUSEKEEPING},
    )
    booking = models.ForeignKey(
        "bookings.Booking",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="cleaning_tasks",
        help_text="The checkout booking that triggered this task.",
    )

    status = models.CharField(
        max_length=15,
        choices=CleaningStatus.choices,
        default=CleaningStatus.DIRTY,
        db_index=True,
    )
    priority = models.PositiveSmallIntegerField(
        default=2,
        help_text="1=High, 2=Normal, 3=Low",
    )
    notes        = models.TextField(blank=True)
    scheduled_at = models.DateTimeField(null=True, blank=True)
    started_at   = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    cleaning_started_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Set automatically when room enters CLEANING status on checkout.",
    )
    cleaning_end_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Set automatically to cleaning_started_at + 2 hours.",
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="created_cleaning_tasks",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "cleaning_tasks"
        ordering = ["priority", "-created_at"]
        indexes  = [
            models.Index(fields=["status"]),
            models.Index(fields=["room", "status"]),
            models.Index(fields=["cleaning_end_at"]),
        ]

    def __str__(self):
        return f"CleaningTask Room {self.room_id} [{self.get_status_display()}]"

    @property
    def is_overdue(self) -> bool:
        if self.status == CleaningStatus.CLEAN:
            return False
        if not self.cleaning_end_at:
            return False
        return timezone.now() > self.cleaning_end_at

    @property
    def cleaning_window_end(self):
        return self.cleaning_end_at

    ALLOWED_TRANSITIONS = {
        CleaningStatus.DIRTY:    [CleaningStatus.CLEANING],
        CleaningStatus.CLEANING: [CleaningStatus.CLEAN, CleaningStatus.DIRTY],
        CleaningStatus.CLEAN:    [],
    }

    def can_transition_to(self, new_status: str) -> bool:
        return new_status in self.ALLOWED_TRANSITIONS.get(self.status, [])

    def transition_to(self, new_status: str, actor=None):
        if not self.can_transition_to(new_status):
            raise ValueError(
                f"Cannot transition CleaningTask from '{self.status}' to '{new_status}'."
            )
        now = timezone.now()
        self.status = new_status

        if new_status == CleaningStatus.CLEANING:
            self.started_at = now
        elif new_status == CleaningStatus.CLEAN:
            self.completed_at = now

        self.save(update_fields=["status", "started_at", "completed_at", "updated_at"])

        from rooms.models import Room, RoomStatus
        if new_status == CleaningStatus.CLEANING:
            Room.objects.filter(pk=self.room_id).update(status=RoomStatus.CLEANING)
        elif new_status == CleaningStatus.CLEAN:
            Room.objects.filter(pk=self.room_id).update(status=RoomStatus.AVAILABLE)
        elif new_status == CleaningStatus.DIRTY:
            Room.objects.filter(pk=self.room_id).update(status=RoomStatus.CLEANING)

        return self


# ─── MaintenanceTask ──────────────────────────────────────────────────────────

class MaintenanceTask(models.Model):
    """
    Maintenance / repair task assigned to a room.
    Status flow: pending → in_progress → completed

    Priority uses MEDIUM (not NORMAL) to align with the
    MaintenanceRequestConvertSerializer and the frontend priority labels.
    """

    class Priority(models.IntegerChoices):
        HIGH   = 1, "High"
        MEDIUM = 2, "Medium"   # NOTE: was NORMAL — renamed for consistency
        LOW    = 3, "Low"

    room = models.ForeignKey(
        "rooms.Room",
        on_delete=models.CASCADE,
        related_name="maintenance_tasks",
    )
    assigned_to = models.ForeignKey(
        StaffProfile,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="maintenance_tasks",
        limit_choices_to={"role": StaffRole.MAINTENANCE},
    )
    booking = models.ForeignKey(
        "bookings.Booking",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="maintenance_tasks",
        help_text="Booking linked to this request (if guest-reported).",
    )

    # Who originally reported this issue (set on creation via request or convert)
    reported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="reported_maintenance_tasks",
        help_text="Staff member who originally reported/created this task.",
    )

    title       = models.CharField(max_length=200)
    description = models.TextField()
    status      = models.CharField(
        max_length=15,
        choices=MaintenanceStatus.choices,
        default=MaintenanceStatus.PENDING,
        db_index=True,
    )
    priority = models.IntegerField(
        choices=Priority.choices,
        default=Priority.MEDIUM,
        db_index=True,
    )

    # Optional deadline for overdue detection
    deadline = models.DateTimeField(
        null=True,
        blank=True,
        db_index=True,
        help_text="Expected completion deadline. Used for overdue alerts.",
    )

    completion_notes = models.TextField(blank=True)
    staff_notes = models.TextField(blank=True, help_text="Progress notes added by maintenance staff.")
    started_at       = models.DateTimeField(null=True, blank=True)
    completed_at     = models.DateTimeField(null=True, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="created_maintenance_tasks",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "maintenance_tasks"
        ordering = ["priority", "-created_at"]
        indexes  = [
            models.Index(fields=["status"]),
            models.Index(fields=["room", "status"]),
            models.Index(fields=["deadline"]),
        ]

    def __str__(self):
        return f"MaintenanceTask '{self.title}' — Room {self.room_id} [{self.get_status_display()}]"

    @property
    def is_overdue(self) -> bool:
        """True if deadline has passed and task is not yet completed/cancelled."""
        if self.status in (MaintenanceStatus.COMPLETED, MaintenanceStatus.CANCELLED):
            return False
        if not self.deadline:
            return False
        return timezone.now() > self.deadline

    ALLOWED_TRANSITIONS = {
        MaintenanceStatus.PENDING:     [MaintenanceStatus.IN_PROGRESS, MaintenanceStatus.CANCELLED],
        MaintenanceStatus.IN_PROGRESS: [MaintenanceStatus.COMPLETED,   MaintenanceStatus.CANCELLED],
        MaintenanceStatus.COMPLETED:   [],
        MaintenanceStatus.CANCELLED:   [],
    }

    def can_transition_to(self, new_status: str) -> bool:
        return new_status in self.ALLOWED_TRANSITIONS.get(self.status, [])

    def transition_to(self, new_status: str, completion_notes: str = "", actor=None):
        if not self.can_transition_to(new_status):
            raise ValueError(
                f"Cannot transition MaintenanceTask from '{self.status}' to '{new_status}'."
            )
        now = timezone.now()
        self.status = new_status
        if new_status == MaintenanceStatus.IN_PROGRESS:
            self.started_at = now
            from rooms.models import Room, RoomStatus
            Room.objects.filter(pk=self.room_id).update(status=RoomStatus.MAINTENANCE)
        elif new_status == MaintenanceStatus.COMPLETED:
            self.completed_at     = now
            self.completion_notes = completion_notes or self.completion_notes
            from rooms.models import Room, RoomStatus
            Room.objects.filter(pk=self.room_id).update(status=RoomStatus.AVAILABLE)
        self.save(update_fields=[
            "status", "started_at", "completed_at", "completion_notes", "updated_at"
        ])
        return self


# ─── IncidentLog ──────────────────────────────────────────────────────────────

class IncidentLog(models.Model):
    """
    Security incident record.
    Can now be created by Security, Front Desk, and Housekeeping.

    Changes from original:
      - title field added
      - severity now includes CRITICAL
      - status workflow added (reported → under_investigation → resolved)
      - resolved boolean kept for backward compatibility
    """

    class IncidentType(models.TextChoices):
        LOST_ITEM   = "lost_item",   "Lost Item"
        DISTURBANCE = "disturbance", "Disturbance"
        TRESPASSING = "trespassing", "Trespassing"
        MEDICAL     = "medical",     "Medical Emergency"
        THEFT       = "theft",       "Theft"
        OTHER       = "other",       "Other"

    class Severity(models.TextChoices):
        LOW      = "low",      "Low"
        MEDIUM   = "medium",   "Medium"
        HIGH     = "high",     "High"
        CRITICAL = "critical", "Critical"

    class IncidentStatus(models.TextChoices):
        REPORTED            = "reported",            "Reported"
        UNDER_INVESTIGATION = "under_investigation", "Under Investigation"
        RESOLVED            = "resolved",            "Resolved"

    logged_by = models.ForeignKey(
        StaffProfile,
        on_delete=models.SET_NULL,
        null=True,
        related_name="incident_logs",
    )

    # Short descriptive title (new)
    title = models.CharField(
        max_length=200,
        blank=True,
        help_text="Short descriptive title, e.g. 'Broken door lock Room 205'.",
    )

    incident_type = models.CharField(
        max_length=20,
        choices=IncidentType.choices,
        default=IncidentType.OTHER,
        db_index=True,
    )
    severity = models.CharField(
        max_length=10,
        choices=Severity.choices,
        default=Severity.LOW,
    )

    # Workflow status replacing the boolean resolved field
    status = models.CharField(
        max_length=25,
        choices=IncidentStatus.choices,
        default=IncidentStatus.REPORTED,
        db_index=True,
    )

    location = models.CharField(
        max_length=200,
        blank=True,
        help_text="e.g. 'Room 205', 'Lobby', 'Parking'",
    )
    description     = models.TextField()
    involved_guests = models.TextField(
        blank=True,
        help_text="Names / booking references of involved guests.",
    )

    # Legacy boolean — kept for backward compatibility.
    # Automatically synced with status in the serializer and view.
    resolved         = models.BooleanField(default=False)
    resolved_at      = models.DateTimeField(null=True, blank=True)
    resolution_notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "incident_logs"
        ordering = ["-created_at"]
        indexes  = [
            models.Index(fields=["status"]),
            models.Index(fields=["severity"]),
        ]

    def __str__(self):
        return (
            f"Incident [{self.get_incident_type_display()}] "
            f"— {self.title or self.description[:40]} "
            f"({self.created_at:%Y-%m-%d %H:%M})"
        )

    def resolve(self, notes: str = ""):
        """Convenience method to mark incident resolved."""
        self.status           = self.IncidentStatus.RESOLVED
        self.resolved         = True
        self.resolved_at      = timezone.now()
        self.resolution_notes = notes or self.resolution_notes
        self.save(update_fields=[
            "status", "resolved", "resolved_at", "resolution_notes", "updated_at"
        ])


# ─── MaintenanceRequest ───────────────────────────────────────────────────────

class MaintenanceRequest(models.Model):
    """
    Staging layer for maintenance issues reported by Front Desk or Housekeeping.

    Flow:
      1. Front Desk / Housekeeping submits a request  → status = pending
      2. Admin / Manager reviews                       → status = reviewed
      3. Admin / Manager converts to MaintenanceTask   → status = converted_to_task

    Rules:
      - Maintenance staff NEVER see this model — they only see MaintenanceTask.
      - Only Admin/Manager can change status or convert to task.
      - reported_by is set automatically from request.user on creation.
      - converted_task FK is set when status → converted_to_task.
    """

    class RequestStatus(models.TextChoices):
        PENDING           = "pending",           "Pending"
        REVIEWED          = "reviewed",          "Reviewed"
        CONVERTED_TO_TASK = "converted_to_task", "Converted to Task"

    reported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="maintenance_requests",
        help_text="Front Desk or Housekeeping staff who submitted this request.",
    )
    room = models.ForeignKey(
        "rooms.Room",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="maintenance_requests",
        help_text="Room this issue was observed in (optional).",
    )

    title       = models.CharField(max_length=200)
    description = models.TextField()

    status = models.CharField(
        max_length=20,
        choices=RequestStatus.choices,
        default=RequestStatus.PENDING,
        db_index=True,
    )

    converted_task = models.OneToOneField(
        "MaintenanceTask",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="source_request",
        help_text="The MaintenanceTask created from this request (if converted).",
    )
    review_notes = models.TextField(
        blank=True,
        help_text="Notes added by Admin/Manager during review.",
    )

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "maintenance_requests"
        ordering = ["-created_at"]
        indexes  = [
            models.Index(fields=["status"]),
            models.Index(fields=["reported_by", "created_at"]),
        ]

    def __str__(self):
        return f"MaintenanceRequest '{self.title}' [{self.get_status_display()}]"

    @property
    def is_convertible(self) -> bool:
        """True when the request can still be converted to a task."""
        return self.status != self.RequestStatus.CONVERTED_TO_TASK