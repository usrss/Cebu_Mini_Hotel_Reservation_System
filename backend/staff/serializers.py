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
    MaintenanceRequest,
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
    user                   = StaffUserSerializer(read_only=True)
    effective_role         = serializers.CharField(read_only=True)
    effective_role_display = serializers.SerializerMethodField()
    role_display           = serializers.CharField(source="get_role_display", read_only=True)

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
    (StaffRole.ADMIN,        "Admin (Super Admin)"),
    (StaffRole.MANAGER,      "Manager"),
    (StaffRole.FRONT_DESK,   "Front Desk"),
    (StaffRole.HOUSEKEEPING, "Housekeeping"),
    (StaffRole.MAINTENANCE,  "Maintenance"),
    (StaffRole.SECURITY,     "Security"),
]

ROLE_DISPLAY = dict(STAFF_ROLE_CHOICES)


class StaffCreateSerializer(serializers.Serializer):
    """
    Create a new staff account.
    No password field — staff sets their own via activation link.
    """
    email       = serializers.EmailField()
    first_name  = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")
    last_name   = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")
    role        = serializers.ChoiceField(choices=STAFF_ROLE_CHOICES)
    employee_id = serializers.CharField(
        max_length=50, required=False, allow_blank=True, default=None, allow_null=True,
    )
    phone = serializers.CharField(max_length=30, required=False, allow_blank=True, default="")
    notes = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def validate_employee_id(self, value):
        if value and StaffProfile.objects.filter(employee_id=value).exists():
            raise serializers.ValidationError("This employee ID is already in use.")
        return value or None

    @transaction.atomic
    def create(self, validated_data):
        email       = validated_data["email"]
        first_name  = validated_data.get("first_name", "")
        last_name   = validated_data.get("last_name", "")
        role        = validated_data["role"]
        employee_id = validated_data.get("employee_id") or None
        phone       = validated_data.get("phone", "")
        notes       = validated_data.get("notes", "")

        user = User.objects.create_user(
            email=email,
            password=None,
            first_name=first_name,
            last_name=last_name,
            is_staff=True,
            is_active=False,
        )

        profile = StaffProfile.objects.create(
            user=user,
            role=role,
            is_active=False,
            employee_id=employee_id,
            phone=phone,
            notes=notes,
        )

        role_display = ROLE_DISPLAY.get(role, role)
        send_staff_activation_email(user, role_display=role_display)
        return profile

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
        if value == StaffRole.ADMIN:
            if not (request and hasattr(request.user, "staff_profile")
                    and request.user.staff_profile.effective_role == StaffRole.ADMIN):
                raise serializers.ValidationError("Only an Admin can assign the Admin role.")
        return value

    def save(self, instance: StaffProfile, **kwargs):
        instance.role = self.validated_data["role"]
        instance.save(update_fields=["role", "updated_at"])
        return instance


class StaffTempRoleSerializer(serializers.Serializer):
    """Assign a temporary role override to a staff member."""
    temp_role  = serializers.ChoiceField(choices=StaffRole.choices)
    expires_at = serializers.DateTimeField()

    def validate_expires_at(self, value):
        if value <= timezone.now():
            raise serializers.ValidationError("expires_at must be in the future.")
        return value

    def save(self, instance: StaffProfile, **kwargs):
        instance.temp_role            = self.validated_data["temp_role"]
        instance.temp_role_expires_at = self.validated_data["expires_at"]
        instance.save(update_fields=["temp_role", "temp_role_expires_at", "updated_at"])
        return instance


class StaffDeactivateSerializer(serializers.Serializer):
    """Deactivate a staff account."""
    reason = serializers.CharField(required=False, allow_blank=True)

    def save(self, instance: StaffProfile, deactivated_by, **kwargs):
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
        return str(obj.staff) if obj.staff else "Unknown"


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
    staff = serializers.PrimaryKeyRelatedField(
        queryset=StaffProfile.objects.filter(is_active=True)
    )

    class Meta(ShiftSerializer.Meta):
        read_only_fields = ["id", "staff_name", "duration_hours", "status_display", "created_at"]


# ─── CleaningTask ─────────────────────────────────────────────────────────────

class CleaningTaskSerializer(serializers.ModelSerializer):
    assigned_to_name    = serializers.SerializerMethodField()
    room_number         = serializers.SerializerMethodField()
    status_display      = serializers.CharField(source="get_status_display", read_only=True)
    cleaning_started_at = serializers.DateTimeField(read_only=True)
    cleaning_end_at     = serializers.DateTimeField(read_only=True)
    is_overdue          = serializers.BooleanField(read_only=True)

    class Meta:
        model  = CleaningTask
        fields = [
            "id", "room", "room_number",
            "assigned_to", "assigned_to_name",
            "booking", "status", "status_display",
            "priority", "notes",
            "scheduled_at", "started_at", "completed_at",
            "cleaning_started_at", "cleaning_end_at", "is_overdue",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "room_number", "assigned_to_name", "status_display",
            "started_at", "completed_at",
            "cleaning_started_at", "cleaning_end_at", "is_overdue",
            "created_at", "updated_at",
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
    """Update the status of a cleaning task with transition validation."""
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
            "reported_by",
            "booking", "title", "description",
            "status", "status_display",
            "priority", "priority_display",
            "deadline",
            "staff_notes",
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
    status_display        = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model  = IncidentLog
        fields = [
            "id", "logged_by", "logged_by_name",
            "title",
            "incident_type", "incident_type_display",
            "severity", "severity_display",
            "status", "status_display",
            "location", "description", "involved_guests",
            "resolved", "resolved_at", "resolution_notes",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "logged_by_name",
            "incident_type_display", "severity_display", "status_display",
            "resolved_at",
            "created_at", "updated_at",
        ]

    def get_logged_by_name(self, obj):
        return str(obj.logged_by) if obj.logged_by else "Unknown"

    def validate(self, data):
        # Keep resolved boolean in sync with status
        status = data.get("status", getattr(self.instance, "status", None))
        if status == IncidentLog.IncidentStatus.RESOLVED:
            data["resolved"] = True
        elif status in (
            IncidentLog.IncidentStatus.REPORTED,
            IncidentLog.IncidentStatus.UNDER_INVESTIGATION,
        ):
            data["resolved"] = False
        return data


# ─── MaintenanceRequest ───────────────────────────────────────────────────────

class MaintenanceRequestSerializer(serializers.ModelSerializer):
    """Read serializer for MaintenanceRequest. Used in list + detail views for all roles."""
    reported_by_name     = serializers.SerializerMethodField()
    room_number          = serializers.SerializerMethodField()
    status_display       = serializers.CharField(source="get_status_display", read_only=True)
    is_convertible       = serializers.BooleanField(read_only=True)
    converted_task_id    = serializers.SerializerMethodField()
    converted_task_title = serializers.SerializerMethodField()

    class Meta:
        model  = MaintenanceRequest
        fields = [
            "id",
            "reported_by", "reported_by_name",
            "room", "room_number",
            "title", "description",
            "status", "status_display",
            "review_notes",
            "is_convertible",
            "converted_task_id", "converted_task_title",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "reported_by", "reported_by_name",
            "room_number", "status_display",
            "is_convertible",
            "converted_task_id", "converted_task_title",
            "created_at", "updated_at",
        ]

    def get_reported_by_name(self, obj):
        if obj.reported_by:
            return obj.reported_by.get_full_name() or obj.reported_by.email
        return "Unknown"

    def get_room_number(self, obj):
        return obj.room.room_number if obj.room_id else None

    def get_converted_task_id(self, obj):
        return obj.converted_task_id

    def get_converted_task_title(self, obj):
        if obj.converted_task_id:
            return obj.converted_task.title
        return None


class MaintenanceRequestCreateSerializer(serializers.ModelSerializer):
    """
    Write serializer for Front Desk / Housekeeping creating a new request.
    reported_by is always set from request.user in the view.
    Status is always forced to 'pending' on creation.
    """

    class Meta:
        model  = MaintenanceRequest
        fields = ["room", "title", "description"]

    def validate_title(self, value):
        if not value.strip():
            raise serializers.ValidationError("Title cannot be blank.")
        return value.strip()

    def validate_description(self, value):
        if not value.strip():
            raise serializers.ValidationError("Description cannot be blank.")
        return value.strip()


class MaintenanceRequestReviewSerializer(serializers.Serializer):
    """Admin/Manager marks a request as reviewed and optionally adds notes."""
    review_notes = serializers.CharField(required=False, allow_blank=True)

    def save(self, instance, **kwargs):
        instance.status       = MaintenanceRequest.RequestStatus.REVIEWED
        instance.review_notes = self.validated_data.get("review_notes", instance.review_notes)
        instance.save(update_fields=["status", "review_notes", "updated_at"])
        return instance


class MaintenanceRequestConvertSerializer(serializers.Serializer):
    """
    Admin/Manager converts a MaintenanceRequest into a MaintenanceTask.
    POST /api/staff/maintenance-requests/<pk>/convert/

    FIX: default=2 instead of MaintenanceTask.Priority.MEDIUM to avoid
    AttributeError at class definition time on older model state.
    """
    title       = serializers.CharField(max_length=200)
    description = serializers.CharField()
    priority    = serializers.ChoiceField(
        choices=MaintenanceTask.Priority.choices,
        default=2,   # 2 = MEDIUM
    )
    deadline    = serializers.DateTimeField(required=False, allow_null=True)
    assigned_to = serializers.IntegerField(required=False, allow_null=True)

    def validate_assigned_to(self, value):
        if value is None:
            return None
        try:
            profile = StaffProfile.objects.get(pk=value, is_active=True)
        except StaffProfile.DoesNotExist:
            raise serializers.ValidationError("Staff profile not found or inactive.")
        if profile.effective_role != StaffRole.MAINTENANCE:
            raise serializers.ValidationError(
                "Only Maintenance staff can be assigned to maintenance tasks."
            )
        return profile

    def save(self, request_obj, created_by=None):
        data = self.validated_data

        task = MaintenanceTask.objects.create(
            room        = request_obj.room,
            title       = data["title"],
            description = data["description"],
            priority    = data.get("priority", 2),
            deadline    = data.get("deadline"),
            assigned_to = data.get("assigned_to"),
            created_by  = created_by,
            reported_by = created_by,
        )

        request_obj.status         = MaintenanceRequest.RequestStatus.CONVERTED_TO_TASK
        request_obj.converted_task = task
        request_obj.save(update_fields=["status", "converted_task", "updated_at"])

        return task