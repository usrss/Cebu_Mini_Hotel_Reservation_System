from rest_framework import generics, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView
from .serializers import RegisterRequestSerializer, RegisterVerifySerializer, UserSerializer

# Request verification code
class RegisterRequestView(generics.CreateAPIView):
    serializer_class = RegisterRequestSerializer
    permission_classes = [AllowAny]

# Verify code and create user
class RegisterVerifyView(generics.CreateAPIView):
    serializer_class = RegisterVerifySerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)

# JWT login
class CustomTokenObtainPairView(TokenObtainPairView):
    pass
