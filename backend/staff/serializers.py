"""
staff/serializers.py

DRF serializers for all Staff Management models.
Includes validation for role assignments, status transitions, and temp roles.
"""

from django.utils import timezone
from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import serializers
from .emails import send_staff_activation_email


from .models import (
    StaffProfile,
    StaffRole,
    StaffOnlineStatus,
    StaffActivityLog,
    StaffSession,
    Shift,
    CleaningTask,
    CleaningStatus,
    MaintenanceTask,
    MaintenanceStatus,
    IncidentLog,
)

User = get_user_model()


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _role_display(role: str) -> str:
    return dict(StaffRole.choices).get(role, role)


# ─── User (nested, read-only) ─────────────────────────────────────────────────

class StaffUserSerializer(serializers.ModelSerializer):
    """Lightweight user representation embedded in staff serializers."""
    full_name = serializers.SerializerMethodField()

    class Meta:
        model  = User
        fields = ["id", "email", "full_name", "is_active"]

    def get_full_name(self, obj):
        return obj.get_full_name() or obj.email


# ─── StaffProfile ─────────────────────────────────────────────────────────────

class StaffProfileListSerializer(serializers.ModelSerializer):
    """Used in list views — lightweight, no nested shifts or logs."""
    user          = StaffUserSerializer(read_only=True)
    effective_role        = serializers.CharField(read_only=True)
    effective_role_display = serializers.SerializerMethodField()
    role_display  = serializers.CharField(source="get_role_display", read_only=True)

    class Meta:
        model  = StaffProfile
        fields = [
            "id", "user", "role", "role_display",
            "effective_role", "effective_role_display",
            "temp_role", "temp_role_expires_at",
            "online_status", "last_seen_at",
            "current_task", "is_active", "employee_id", "phone",
            "created_at",
        ]

    def get_effective_role_display(self, obj):
        # effective_role is a @property, not a DB field — Django does not auto-generate
        # get_effective_role_display() for it. Resolve the label manually.
        return dict(StaffRole.choices).get(obj.effective_role, obj.effective_role)


class StaffProfileDetailSerializer(StaffProfileListSerializer):
    """Full detail — includes shift list and recent activity."""
    recent_activity = serializers.SerializerMethodField()
    shifts          = serializers.SerializerMethodField()

    class Meta(StaffProfileListSerializer.Meta):
        fields = StaffProfileListSerializer.Meta.fields + [
            "notes", "deactivated_at", "updated_at",
            "recent_activity", "shifts",
        ]

    def get_recent_activity(self, obj):
        logs = obj.activity_logs.all()[:10]
        return StaffActivityLogSerializer(logs, many=True).data

    def get_shifts(self, obj):
        shifts = obj.shifts.order_by("-start_time")[:5]
        return ShiftSerializer(shifts, many=True).data





# Role choices — receptionist excluded per spec
STAFF_ROLE_CHOICES = [
    (StaffRole.ADMIN, "Admin (Super Admin)"),
    (StaffRole.MANAGER, "Manager"),
    (StaffRole.FRONT_DESK, "Front Desk"),
    (StaffRole.HOUSEKEEPING, "Housekeeping"),
    (StaffRole.MAINTENANCE, "Maintenance"),
    (StaffRole.SECURITY, "Security"),
]

ROLE_DISPLAY = dict(STAFF_ROLE_CHOICES)


class StaffCreateSerializer(serializers.Serializer):
    """
    Create a new staff account.

    - No password field: the staff member sets their own password via activation link.
    - Creates user with is_active=False and an unusable password.
    - Sends activation email automatically on save.
    - Receptionist role excluded.
    """

    # User fields
    email = serializers.EmailField()
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")

    # Staff profile fields
    role = serializers.ChoiceField(choices=STAFF_ROLE_CHOICES)
    employee_id = serializers.CharField(
        max_length=50, required=False, allow_blank=True, default=None,
        allow_null=True,
    )
    phone = serializers.CharField(max_length=30, required=False, allow_blank=True, default="")
    notes = serializers.CharField(required=False, allow_blank=True, default="")

    # ── Validation ─────────────────────────────────────────────────────────────

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def validate_employee_id(self, value):
        if value and StaffProfile.objects.filter(employee_id=value).exists():
            raise serializers.ValidationError("This employee ID is already in use.")
        return value or None

    # ── Create ─────────────────────────────────────────────────────────────────

    @transaction.atomic
    def create(self, validated_data):
        email = validated_data["email"]
        first_name = validated_data.get("first_name", "")
        last_name = validated_data.get("last_name", "")
        role = validated_data["role"]
        employee_id = validated_data.get("employee_id") or None
        phone = validated_data.get("phone", "")
        notes = validated_data.get("notes", "")

        # 1. Create the user — inactive, no usable password
        user = User.objects.create_user(
            email=email,
            password=None,  # sets an unusable password
            first_name=first_name,
            last_name=last_name,
            is_staff=True,
            is_active=False,  # ← inactive until email activation
        )

        # 2. Create the staff profile — also inactive until activation
        profile = StaffProfile.objects.create(
            user=user,
            role=role,
            is_active=False,  # ← inactive until email activation
            employee_id=employee_id,
            phone=phone,
            notes=notes,
        )

        # 3. Send activation email (non-blocking — failure is logged, not raised)
        role_display = ROLE_DISPLAY.get(role, role)
        send_staff_activation_email(user, role_display=role_display)

        return profile

    # save() delegates to create() for Serializer (not ModelSerializer)
    def save(self, **kwargs):
        return self.create(self.validated_data)


class StaffUpdateSerializer(serializers.ModelSerializer):
    """Admin updates an existing staff profile (not role promotion)."""
    first_name = serializers.CharField(source="user.first_name", required=False)
    last_name  = serializers.CharField(source="user.last_name",  required=False)

    class Meta:
        model  = StaffProfile
        fields = ["first_name", "last_name", "phone", "employee_id", "notes"]

    def update(self, instance, validated_data):
        user_data = validated_data.pop("user", {})
        for attr, val in user_data.items():
            setattr(instance.user, attr, val)
        instance.user.save(update_fields=list(user_data.keys()))

        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.save()
        return instance


class StaffRoleChangeSerializer(serializers.Serializer):
    """Promote or demote a staff member's primary role."""
    role = serializers.ChoiceField(choices=StaffRole.choices)
    note = serializers.CharField(required=False, allow_blank=True)

    def validate_role(self, value):
        request = self.context.get("request")
        # Only Admin may assign the Admin role
        if value == StaffRole.ADMIN:
            if not (request and hasattr(request.user, "staff_profile")
                    and request.user.staff_profile.effective_role == StaffRole.ADMIN):
                raise serializers.ValidationError(
                    "Only an Admin can assign the Admin role."
                )
        return value

    def save(self, instance: StaffProfile, **kwargs):
        instance.role = self.validated_data["role"]
        instance.save(update_fields=["role", "updated_at"])
        return instance


class StaffTempRoleSerializer(serializers.Serializer):
    """Assign a temporary role override to a staff member."""
    temp_role        = serializers.ChoiceField(choices=StaffRole.choices)
    expires_at       = serializers.DateTimeField()

    def validate_expires_at(self, value):
        if value <= timezone.now():
            raise serializers.ValidationError("expires_at must be in the future.")
        return value

    def save(self, instance: StaffProfile, **kwargs):
        instance.temp_role          = self.validated_data["temp_role"]
        instance.temp_role_expires_at = self.validated_data["expires_at"]
        instance.save(update_fields=["temp_role", "temp_role_expires_at", "updated_at"])
        return instance


class StaffDeactivateSerializer(serializers.Serializer):
    """Deactivate a staff account."""
    reason = serializers.CharField(required=False, allow_blank=True)

    def save(self, instance: StaffProfile, deactivated_by, **kwargs):
        from django.db import transaction
        with transaction.atomic():
            instance.is_active      = False
            instance.deactivated_at = timezone.now()
            instance.deactivated_by = deactivated_by
            instance.online_status  = StaffOnlineStatus.OFFLINE
            instance.save(update_fields=[
                "is_active", "deactivated_at", "deactivated_by", "online_status", "updated_at"
            ])
            instance.user.is_active = False
            instance.user.save(update_fields=["is_active"])
        return instance


# ─── StaffActivityLog ─────────────────────────────────────────────────────────

class StaffActivityLogSerializer(serializers.ModelSerializer):
    staff_name = serializers.SerializerMethodField()

    class Meta:
        model  = StaffActivityLog
        fields = [
            "id", "staff", "staff_name", "action_type", "description",
            "ip_address", "booking_id", "room_id", "target_user_id",
            "metadata", "created_at",
        ]
        read_only_fields = fields

    def get_staff_name(self, obj):
        if obj.staff:
            return str(obj.staff)
        return "Unknown"


# ─── StaffSession ─────────────────────────────────────────────────────────────

class StaffSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model  = StaffSession
        fields = [
            "id", "session_key", "ip_address", "user_agent",
            "logged_in_at", "last_activity", "logged_out_at", "is_active",
        ]
        read_only_fields = fields


# ─── Shift ────────────────────────────────────────────────────────────────────

class ShiftSerializer(serializers.ModelSerializer):
    staff_name     = serializers.SerializerMethodField()
    duration_hours = serializers.ReadOnlyField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model  = Shift
        fields = [
            "id", "staff", "staff_name", "label",
            "start_time", "end_time", "duration_hours",
            "status", "status_display", "notes", "created_at",
        ]
        read_only_fields = ["id", "staff_name", "duration_hours", "status_display", "created_at"]

    def get_staff_name(self, obj):
        return str(obj.staff)

    def validate(self, data):
        start = data.get("start_time", getattr(self.instance, "start_time", None))
        end   = data.get("end_time",   getattr(self.instance, "end_time",   None))
        if start and end and end <= start:
            raise serializers.ValidationError("end_time must be after start_time.")
        return data


class ShiftCreateSerializer(ShiftSerializer):
    staff = serializers.PrimaryKeyRelatedField(queryset=StaffProfile.objects.filter(is_active=True))

    class Meta(ShiftSerializer.Meta):
        read_only_fields = ["id", "staff_name", "duration_hours", "status_display", "created_at"]


# ─── CleaningTask ─────────────────────────────────────────────────────────────

class CleaningTaskSerializer(serializers.ModelSerializer):
    assigned_to_name = serializers.SerializerMethodField()
    room_number      = serializers.SerializerMethodField()
    status_display   = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model  = CleaningTask
        fields = [
            "id", "room", "room_number",
            "assigned_to", "assigned_to_name",
            "booking", "status", "status_display",
            "priority", "notes",
            "scheduled_at", "started_at", "completed_at",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "room_number", "assigned_to_name", "status_display",
            "started_at", "completed_at", "created_at", "updated_at",
        ]

    def get_assigned_to_name(self, obj):
        return str(obj.assigned_to) if obj.assigned_to else None

    def get_room_number(self, obj):
        return obj.room.room_number if obj.room_id else None

    def validate_assigned_to(self, value):
        if value and value.effective_role != StaffRole.HOUSEKEEPING:
            raise serializers.ValidationError(
                "Only Housekeeping staff can be assigned to cleaning tasks."
            )
        return value


class CleaningTaskStatusSerializer(serializers.Serializer):
    """Update the status of a cleaning task (with transition validation)."""
    status = serializers.ChoiceField(choices=CleaningStatus.choices)

    def validate(self, data):
        task       = self.context["task"]
        new_status = data["status"]
        if not task.can_transition_to(new_status):
            raise serializers.ValidationError(
                f"Cannot transition from '{task.status}' to '{new_status}'."
            )
        return data

    def save(self, task: CleaningTask, actor=None):
        task.transition_to(self.validated_data["status"], actor=actor)
        return task


# ─── MaintenanceTask ──────────────────────────────────────────────────────────

class MaintenanceTaskSerializer(serializers.ModelSerializer):
    assigned_to_name = serializers.SerializerMethodField()
    room_number      = serializers.SerializerMethodField()
    status_display   = serializers.CharField(source="get_status_display", read_only=True)
    priority_display = serializers.CharField(source="get_priority_display", read_only=True)

    class Meta:
        model  = MaintenanceTask
        fields = [
            "id", "room", "room_number",
            "assigned_to", "assigned_to_name",
            "booking", "title", "description",
            "status", "status_display",
            "priority", "priority_display",
            "completion_notes",
            "started_at", "completed_at",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "room_number", "assigned_to_name",
            "status_display", "priority_display",
            "started_at", "completed_at", "created_at", "updated_at",
        ]

    def get_assigned_to_name(self, obj):
        return str(obj.assigned_to) if obj.assigned_to else None

    def get_room_number(self, obj):
        return obj.room.room_number if obj.room_id else None

    def validate_assigned_to(self, value):
        if value and value.effective_role != StaffRole.MAINTENANCE:
            raise serializers.ValidationError(
                "Only Maintenance staff can be assigned to maintenance tasks."
            )
        return value


class MaintenanceTaskStatusSerializer(serializers.Serializer):
    """Update the status of a maintenance task (with transition validation)."""
    status           = serializers.ChoiceField(choices=MaintenanceStatus.choices)
    completion_notes = serializers.CharField(required=False, allow_blank=True)

    def validate(self, data):
        task       = self.context["task"]
        new_status = data["status"]
        if not task.can_transition_to(new_status):
            raise serializers.ValidationError(
                f"Cannot transition from '{task.status}' to '{new_status}'."
            )
        return data

    def save(self, task: MaintenanceTask, actor=None):
        task.transition_to(
            self.validated_data["status"],
            completion_notes=self.validated_data.get("completion_notes", ""),
            actor=actor,
        )
        return task


# ─── IncidentLog ──────────────────────────────────────────────────────────────

class IncidentLogSerializer(serializers.ModelSerializer):
    logged_by_name        = serializers.SerializerMethodField()
    incident_type_display = serializers.CharField(source="get_incident_type_display", read_only=True)
    severity_display      = serializers.CharField(source="get_severity_display", read_only=True)

    class Meta:
        model  = IncidentLog
        fields = [
            "id", "logged_by", "logged_by_name",
            "incident_type", "incident_type_display",
            "severity", "severity_display",
            "location", "description", "involved_guests",
            "resolved", "resolved_at", "resolution_notes",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "logged_by_name", "incident_type_display",
                            "severity_display", "created_at", "updated_at"]

    def get_logged_by_name(self, obj):
        return str(obj.logged_by) if obj.logged_by else "Unknown"