from rest_framework import serializers
from .models import Hotel, Room, Reservation

class HotelSerializer(serializers.ModelSerializer):
    class Meta:
        model = Hotel
        fields = '__all__'

class RoomSerializer(serializers.ModelSerializer):
    hotel = HotelSerializer(read_only=True)  # nested hotel info

    class Meta:
        model = Room
        fields = '__all__'

class ReservationSerializer(serializers.ModelSerializer):
    room = RoomSerializer(read_only=True)  # show room info
    room_id = serializers.PrimaryKeyRelatedField(
        queryset=Room.objects.filter(is_available=True), source='room', write_only=True
    )

    class Meta:
        model = Reservation
        fields = ['id', 'room', 'room_id', 'guest_name', 'check_in', 'check_out', 'created_at']

    def create(self, validated_data):
        reservation = Reservation.objects.create(**validated_data)
        # mark room as unavailable
        reservation.room.is_available = False
        reservation.room.save()
        return reservation
