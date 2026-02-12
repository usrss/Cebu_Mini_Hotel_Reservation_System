from django.urls import path
from .views import RegisterRequestView, RegisterVerifyView, CustomTokenObtainPairView
from rest_framework_simplejwt.views import TokenRefreshView

urlpatterns = [
    path('register/request/', RegisterRequestView.as_view(), name='register-request'),
    path('register/verify/', RegisterVerifyView.as_view(), name='register-verify'),
    path('login/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('login/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
]
