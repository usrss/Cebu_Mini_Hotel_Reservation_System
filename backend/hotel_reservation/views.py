from rest_framework import viewsets
from .models import Hotel, Room, Reservation
from .serializers import HotelSerializer, RoomSerializer, ReservationSerializer
from rest_framework.permissions import IsAuthenticated

class HotelViewSet(viewsets.ModelViewSet):
    queryset = Hotel.objects.all()  # add queryset
    serializer_class = HotelSerializer

class RoomViewSet(viewsets.ModelViewSet):
    queryset = Room.objects.all()  # add queryset
    serializer_class = RoomSerializer

    def get_queryset(self):
        hotel_id = self.request.query_params.get('hotel_id')
        if hotel_id:
            return Room.objects.filter(hotel_id=hotel_id, is_available=True)
        return Room.objects.filter(is_available=True)

class ReservationViewSet(viewsets.ModelViewSet):
    queryset = Reservation.objects.all()  # ✅ add queryset
    serializer_class = ReservationSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        reservation = serializer.save()
        reservation.room.is_available = False
        reservation.room.save()
