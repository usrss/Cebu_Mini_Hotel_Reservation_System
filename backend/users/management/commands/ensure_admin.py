"""
Idempotently create the Django admin superuser from environment variables.

Intended to run as a Render post-deploy step right after `migrate`:

    python manage.py ensure_admin

Reads:
    ADMIN_EMAIL            (required to run)
    ADMIN_PASSWORD         (required to run)
    ADMIN_FIRST_NAME       (optional)
    ADMIN_LAST_NAME        (optional)

Behavior:
    - If either ADMIN_EMAIL or ADMIN_PASSWORD is missing, the command is a
      harmless no-op, so deploys never fail just because it wasn't configured.
    - If the user does not exist, it is created with is_staff/is_superuser.
    - If the user already exists, its flags are promoted to
      is_active/is_verified/is_staff/is_superuser, but the password is NOT
      overwritten (so a password changed from the admin UI survives deploys).
"""
import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Create or promote the admin superuser from ADMIN_EMAIL / ADMIN_PASSWORD env vars."

    def handle(self, *args, **options):
        email = os.environ.get("ADMIN_EMAIL", "").strip()
        password = os.environ.get("ADMIN_PASSWORD")

        if not email or not password:
            self.stdout.write(
                "ensure_admin: ADMIN_EMAIL/ADMIN_PASSWORD not set, skipping."
            )
            return

        User = get_user_model()
        user = User.objects.filter(email__iexact=email).first()

        if user is None:
            User.objects.create_superuser(
                email=email,
                password=password,
                first_name=os.environ.get("ADMIN_FIRST_NAME", ""),
                last_name=os.environ.get("ADMIN_LAST_NAME", ""),
                is_verified=True,
            )
            self.stdout.write(
                self.style.SUCCESS(f"ensure_admin: superuser {email} created.")
            )
        else:
            # Promote flags only; never clobber an existing password.
            changed = False
            for field in ("is_active", "is_verified", "is_staff", "is_superuser"):
                if not getattr(user, field):
                    setattr(user, field, True)
                    changed = True
            if changed:
                user.save(update_fields=["is_active", "is_verified", "is_staff", "is_superuser"])
                self.stdout.write(
                    self.style.SUCCESS(f"ensure_admin: existing user {email} promoted to superuser.")
                )
            else:
                self.stdout.write(f"ensure_admin: superuser {email} already exists, nothing to do.")
