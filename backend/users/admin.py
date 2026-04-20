"""
Django admin configuration for authentication models
"""
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.utils.html import format_html
from .models import CustomUser, VerificationCode, SocialAuthToken


@admin.register(CustomUser)
class CustomUserAdmin(BaseUserAdmin):
    """Admin interface for CustomUser model"""

    list_display = [
        'email',
        'full_name_display',
        'auth_provider',
        'is_verified',
        'is_active',
        'is_staff',
        'date_joined'
    ]
    list_filter = [
        'is_active',
        'is_staff',
        'is_superuser',
        'auth_provider',
        'is_verified',
        'date_joined'
    ]
    search_fields = ['email', 'first_name', 'last_name']
    ordering = ['-date_joined']

    fieldsets = (
        (None, {
            'fields': ('email', 'password')
        }),
        ('Personal Info', {
            'fields': ('first_name', 'last_name','phone')
        }),
        ('Authentication', {
            'fields': ('auth_provider', 'social_id', 'is_verified')
        }),
        ('Permissions', {
            'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')
        }),
        ('Important Dates', {
            'fields': ('last_login', 'date_joined')
        }),
    )

    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'password1', 'password2', 'first_name', 'last_name'),
        }),
    )

    readonly_fields = ['date_joined', 'last_login']

    def full_name_display(self, obj):
        """Display full name"""
        full_name = obj.get_full_name()
        return full_name if full_name != obj.email else '-'

    full_name_display.short_description = 'Full Name'


@admin.register(VerificationCode)
class VerificationCodeAdmin(admin.ModelAdmin):
    """Admin interface for VerificationCode model"""

    list_display = [
        'email',
        'code_display',
        'purpose',
        'auth_provider',
        'attempts',
        'status_display',
        'created_at',
        'expires_at'
    ]
    list_filter = ['purpose', 'auth_provider', 'is_used', 'created_at']
    search_fields = ['email', 'code']
    readonly_fields = ['created_at', 'expires_at']
    ordering = ['-created_at']

    fieldsets = (
        ('Code Information', {
            'fields': ('email', 'code', 'purpose')
        }),
        ('Authentication Details', {
            'fields': ('auth_provider', 'social_id')
        }),
        ('User Details', {
            'fields': ('first_name', 'last_name', 'password')
        }),
        ('Status', {
            'fields': ('attempts', 'is_used', 'created_at', 'expires_at')
        }),
    )

    def code_display(self, obj):
        """Display code with formatting"""
        return format_html(
            '<code style="background: #f0f0f0; padding: 2px 6px; border-radius: 3px;">{}</code>',
            obj.code
        )

    code_display.short_description = 'Code'

    def status_display(self, obj):
        """Display status with color coding"""
        if obj.is_used:
            color = '#28a745'
            status_text = 'Used'
        elif obj.is_expired():
            color = '#dc3545'
            status_text = 'Expired'
        elif obj.attempts >= 5:
            color = '#ffc107'
            status_text = 'Max Attempts'
        else:
            color = '#007bff'
            status_text = 'Active'

        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            color,
            status_text
        )

    status_display.short_description = 'Status'


@admin.register(SocialAuthToken)
class SocialAuthTokenAdmin(admin.ModelAdmin):
    """Admin interface for SocialAuthToken model"""

    list_display = [
        'user',
        'provider',
        'token_preview',
        'token_status',
        'created_at',
        'updated_at'
    ]
    list_filter = ['provider', 'created_at']
    search_fields = ['user__email', 'provider']
    readonly_fields = ['created_at', 'updated_at']
    ordering = ['-created_at']

    fieldsets = (
        ('User & Provider', {
            'fields': ('user', 'provider')
        }),
        ('Tokens', {
            'fields': ('access_token', 'refresh_token', 'token_type')
        }),
        ('Expiration', {
            'fields': ('expires_at', 'created_at', 'updated_at')
        }),
    )

    def token_preview(self, obj):
        """Show preview of access token"""
        if len(obj.access_token) > 20:
            preview = obj.access_token[:20] + '...'
        else:
            preview = obj.access_token
        return format_html('<code>{}</code>', preview)

    token_preview.short_description = 'Token Preview'

    def token_status(self, obj):
        """Display token expiration status"""
        if obj.is_expired():
            return format_html(
                '<span style="color: #dc3545; font-weight: bold;">Expired</span>'
            )
        else:
            return format_html(
                '<span style="color: #28a745; font-weight: bold;">Valid</span>'
            )

    token_status.short_description = 'Status'
