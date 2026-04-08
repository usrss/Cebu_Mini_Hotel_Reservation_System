from django.contrib import admin
from .models import LegalDocument, UserAgreement


@admin.register(LegalDocument)
class LegalDocumentAdmin(admin.ModelAdmin):
    list_display = ("title", "type", "version", "is_active", "created_at", "updated_at")
    list_filter = ("type", "is_active")
    search_fields = ("title", "version", "content")
    readonly_fields = ("created_at", "updated_at")
    ordering = ("-created_at",)

    actions = ["activate_document"]

    def activate_document(self, request, queryset):
        for doc in queryset:
            doc.activate()
        self.message_user(request, f"{queryset.count()} document(s) activated.")
    activate_document.short_description = "Activate selected documents"


@admin.register(UserAgreement)
class UserAgreementAdmin(admin.ModelAdmin):
    list_display = ("user", "terms_version", "privacy_version", "accepted_at")
    list_filter = ("terms_version", "privacy_version")
    search_fields = ("user__username", "user__email")
    readonly_fields = ("user", "terms_version", "privacy_version", "accepted_at")
    ordering = ("-accepted_at",)
