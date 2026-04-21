from django.urls import path, include
from rest_framework.routers import SimpleRouter          # ← change this

from .views import (
    ActiveTermsView,
    ActivePrivacyView,
    LegalDocumentViewSet,
    AcceptLegalView,
    UserAgreementHistoryView,
)

router = SimpleRouter()                                  # ← and this
router.register(r"", LegalDocumentViewSet, basename="legal")

urlpatterns = [
    path("terms/active/",   ActiveTermsView.as_view(),         name="legal-active-terms"),
    path("privacy/active/", ActivePrivacyView.as_view(),       name="legal-active-privacy"),
    path("accept/",         AcceptLegalView.as_view(),         name="legal-accept"),
    path("my-agreements/",  UserAgreementHistoryView.as_view(),name="legal-my-agreements"),

    path("", include(router.urls)),
]