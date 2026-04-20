from django.apps import AppConfig


class RoomsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "rooms"
    verbose_name = "Hotel Rooms"

    def ready(self):
        # Import signal handlers when app is ready
        import rooms.signals  # noqa