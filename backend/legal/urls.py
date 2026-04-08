from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    ActiveTermsView,
    ActivePrivacyView,
    LegalDocumentViewSet,
    AcceptLegalView,
    UserAgreementHistoryView,
)

router = DefaultRouter()
router.register(r"", LegalDocumentViewSet, basename="legal")

urlpatterns = [
    # ── Public endpoints ──────────────────────────
    path("terms/active/", ActiveTermsView.as_view(), name="legal-active-terms"),
    path("privacy/active/", ActivePrivacyView.as_view(), name="legal-active-privacy"),

    # ── User action endpoints ─────────────────────
    path("accept/", AcceptLegalView.as_view(), name="legal-accept"),
    path("my-agreements/", UserAgreementHistoryView.as_view(), name="legal-my-agreements"),

    # ── Admin CRUD (router) ───────────────────────
    # Must come LAST so static paths above are matched first
    path("", include(router.urls)),
]
