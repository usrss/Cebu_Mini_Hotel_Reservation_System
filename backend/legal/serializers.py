from rest_framework import serializers
from .models import LegalDocument, UserAgreement


class LegalDocumentSerializer(serializers.ModelSerializer):
    type_display = serializers.CharField(source="get_type_display", read_only=True)

    class Meta:
        model = LegalDocument
        fields = [
            "id",
            "type",
            "type_display",
            "title",
            "content",
            "version",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_type(self, value):
        valid_types = [choice[0] for choice in LegalDocument.DOCUMENT_TYPES]
        if value not in valid_types:
            raise serializers.ValidationError(f"Type must be one of: {', '.join(valid_types)}")
        return value

    def validate_version(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Version cannot be empty.")
        return value


class LegalDocumentCreateSerializer(LegalDocumentSerializer):
    """Used for creating new legal documents."""

    def validate(self, data):
        doc_type = data.get("type")
        version = data.get("version")
        # Check for duplicate version within same type
        qs = LegalDocument.objects.filter(type=doc_type, version=version)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                {"version": f"A {doc_type} document with version '{version}' already exists."}
            )
        return data


class UserAgreementSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserAgreement
        fields = ["id", "user", "terms_version", "privacy_version", "accepted_at"]
        read_only_fields = ["id", "user", "accepted_at"]


class AcceptLegalSerializer(serializers.Serializer):
    terms_version = serializers.CharField(max_length=50)
    privacy_version = serializers.CharField(max_length=50)

    def validate(self, data):
        terms_version = data.get("terms_version")
        privacy_version = data.get("privacy_version")

        # Validate active Terms document exists
        active_terms = LegalDocument.objects.filter(type="terms", is_active=True).first()
        if not active_terms:
            raise serializers.ValidationError("No active Terms & Conditions document exists.")
        if active_terms.version != terms_version:
            raise serializers.ValidationError(
                {"terms_version": f"Provided version '{terms_version}' does not match the active Terms version '{active_terms.version}'."}
            )

        # Validate active Privacy document exists
        active_privacy = LegalDocument.objects.filter(type="privacy", is_active=True).first()
        if not active_privacy:
            raise serializers.ValidationError("No active Privacy Policy document exists.")
        if active_privacy.version != privacy_version:
            raise serializers.ValidationError(
                {"privacy_version": f"Provided version '{privacy_version}' does not match the active Privacy version '{active_privacy.version}'."}
            )

        return data
