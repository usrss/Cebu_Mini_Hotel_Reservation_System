from django.db import models
from django.contrib.auth import get_user_model
from django.db import transaction

User = get_user_model()


class LegalDocument(models.Model):
    DOCUMENT_TYPES = [
        ("terms", "Terms & Conditions"),
        ("privacy", "Privacy Policy"),
    ]

    type = models.CharField(max_length=20, choices=DOCUMENT_TYPES)
    title = models.CharField(max_length=255)
    content = models.TextField()
    version = models.CharField(max_length=50)
    is_active = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Legal Document"
        verbose_name_plural = "Legal Documents"

    def __str__(self):
        return f"{self.get_type_display()} v{self.version} ({'Active' if self.is_active else 'Inactive'})"

    def activate(self):
        """
        Set this document as the active one for its type.
        Deactivates all other documents of the same type atomically.
        """
        with transaction.atomic():
            LegalDocument.objects.filter(type=self.type, is_active=True).exclude(pk=self.pk).update(is_active=False)
            self.is_active = True
            self.save(update_fields=["is_active", "updated_at"])

    def save(self, *args, **kwargs):
        """
        If this document is saved with is_active=True,
        deactivate all other documents of the same type.
        """
        if self.is_active and self.pk:
            LegalDocument.objects.filter(type=self.type, is_active=True).exclude(pk=self.pk).update(is_active=False)
        elif self.is_active and not self.pk:
            # New document being created as active
            LegalDocument.objects.filter(type=self.type, is_active=True).update(is_active=False)
        super().save(*args, **kwargs)


class UserAgreement(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="legal_agreements")
    terms_version = models.CharField(max_length=50)
    privacy_version = models.CharField(max_length=50)
    accepted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-accepted_at"]
        verbose_name = "User Agreement"
        verbose_name_plural = "User Agreements"

    def __str__(self):
        return f"{self.user} agreed to Terms v{self.terms_version} & Privacy v{self.privacy_version}"
