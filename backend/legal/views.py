from rest_framework import status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from .models import LegalDocument, UserAgreement
from .permissions import IsAdminOrManager
from .serializers import (
    AcceptLegalSerializer,
    LegalDocumentCreateSerializer,
    LegalDocumentSerializer,
    UserAgreementSerializer,
)


# ─────────────────────────────────────────────
# Public Views
# ─────────────────────────────────────────────

class ActiveTermsView(APIView):
    """GET /api/legal/terms/active/ — returns the currently active Terms & Conditions."""
    permission_classes = [AllowAny]

    def get(self, request):
        doc = LegalDocument.objects.filter(type="terms", is_active=True).first()
        if not doc:
            return Response(
                {"detail": "No active Terms & Conditions found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(LegalDocumentSerializer(doc).data)


class ActivePrivacyView(APIView):
    """GET /api/legal/privacy/active/ — returns the currently active Privacy Policy."""
    permission_classes = [AllowAny]

    def get(self, request):
        doc = LegalDocument.objects.filter(type="privacy", is_active=True).first()
        if not doc:
            return Response(
                {"detail": "No active Privacy Policy found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(LegalDocumentSerializer(doc).data)


# ─────────────────────────────────────────────
# Admin ViewSet
# ─────────────────────────────────────────────

class LegalDocumentViewSet(ModelViewSet):
    """
    Admin-only CRUD for legal documents, plus an activate action.

    GET    /api/legal/          → list all documents
    POST   /api/legal/          → create document
    GET    /api/legal/{id}/     → retrieve single document
    PUT    /api/legal/{id}/     → full update
    PATCH  /api/legal/{id}/     → partial update
    DELETE /api/legal/{id}/     → delete
    PATCH  /api/legal/{id}/activate/ → set document as active
    """
    queryset = LegalDocument.objects.all().order_by("-created_at")
    permission_classes = [IsAdminOrManager]

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return LegalDocumentCreateSerializer
        return LegalDocumentSerializer

    def perform_create(self, serializer):
        serializer.save()

    @action(detail=True, methods=["patch"], url_path="activate")
    def activate(self, request, pk=None):
        """PATCH /api/legal/{id}/activate/ — make this document the active one."""
        doc = self.get_object()
        doc.activate()
        return Response(
            {
                "detail": f"{doc.get_type_display()} v{doc.version} is now the active document.",
                "document": LegalDocumentSerializer(doc).data,
            }
        )

    def list(self, request, *args, **kwargs):
        """Support optional ?type= filter and return grouped summary."""
        doc_type = request.query_params.get("type")
        qs = self.get_queryset()
        if doc_type:
            qs = qs.filter(type=doc_type)
        serializer = LegalDocumentSerializer(qs, many=True)
        return Response(serializer.data)


# ─────────────────────────────────────────────
# User Agreement
# ─────────────────────────────────────────────

class AcceptLegalView(APIView):
    """POST /api/legal/accept/ — store user's acceptance of active legal documents."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = AcceptLegalSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        agreement = UserAgreement.objects.create(
            user=request.user,
            terms_version=serializer.validated_data["terms_version"],
            privacy_version=serializer.validated_data["privacy_version"],
        )
        return Response(
            {
                "detail": "Legal agreements recorded successfully.",
                "agreement": UserAgreementSerializer(agreement).data,
            },
            status=status.HTTP_201_CREATED,
        )


class UserAgreementHistoryView(APIView):
    """GET /api/legal/my-agreements/ — view current user's agreement history."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        agreements = UserAgreement.objects.filter(user=request.user)
        serializer = UserAgreementSerializer(agreements, many=True)
        return Response(serializer.data)
