# ═══════════════════════════════════════════════════════════════════════════════
# rooms/management/commands/migrate_images_to_cloudinary.py
#
# One-time command to upload all existing local room images to Cloudinary
# and update the DB references so they point to the new Cloudinary paths.
#
# USAGE (run locally before deploying):
#   python manage.py migrate_images_to_cloudinary
#
# HOW TO CREATE THE FILE:
#   1. Create these directories if they don't exist:
#      rooms/management/__init__.py
#      rooms/management/commands/__init__.py
#   2. Save THIS file as:
#      rooms/management/commands/migrate_images_to_cloudinary.py
# ═══════════════════════════════════════════════════════════════════════════════

import os
import cloudinary
import cloudinary.uploader
from django.core.management.base import BaseCommand
from django.conf import settings
from rooms.models import RoomImage, Room


class Command(BaseCommand):
    help = 'Migrate existing local room images to Cloudinary'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Print what would be migrated without actually doing it',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        media_root = settings.MEDIA_ROOT

        images = RoomImage.objects.all().select_related('room')
        total = images.count()
        self.stdout.write(f'Found {total} room image(s) to process.')

        migrated = 0
        skipped  = 0
        failed   = 0

        for img in images:
            field_name = str(img.image)  # e.g. "rooms/images/2024/01/photo.jpg"

            # Already a Cloudinary path (contains no local path separator pattern)
            # Cloudinary paths don't start with "rooms/" in a local-file way —
            # but the safest check is: does the local file actually exist?
            local_path = os.path.join(media_root, field_name)

            if not os.path.exists(local_path):
                self.stdout.write(
                    self.style.WARNING(
                        f'  SKIP  [{img.id}] {field_name} — local file not found (may already be on Cloudinary)'
                    )
                )
                skipped += 1
                continue

            if dry_run:
                self.stdout.write(f'  DRY   [{img.id}] would upload {local_path}')
                migrated += 1
                continue

            try:
                # Upload to Cloudinary preserving the folder structure
                public_id = field_name.rsplit('.', 1)[0]  # strip extension; Cloudinary adds it back
                result = cloudinary.uploader.upload(
                    local_path,
                    public_id=public_id,
                    overwrite=True,
                    resource_type='image',
                )
                # Save the Cloudinary public_id back to the image field.
                # django-cloudinary-storage stores the public_id in the field,
                # not the full URL, and builds the URL on the fly.
                img.image = result['public_id']
                img.save(update_fields=['image'])
                self.stdout.write(
                    self.style.SUCCESS(f'  OK    [{img.id}] → {result["secure_url"]}')
                )
                migrated += 1
            except Exception as exc:
                self.stdout.write(
                    self.style.ERROR(f'  FAIL  [{img.id}] {field_name} — {exc}')
                )
                failed += 1

        # Panorama images on Room model
        self.stdout.write('\nProcessing panorama images...')
        for room in Room.objects.exclude(panorama_image='').exclude(panorama_image=None):
            field_name = str(room.panorama_image)
            local_path = os.path.join(media_root, field_name)

            if not os.path.exists(local_path):
                self.stdout.write(
                    self.style.WARNING(f'  SKIP  Room {room.room_number} panorama — file not found')
                )
                continue

            if dry_run:
                self.stdout.write(f'  DRY   Room {room.room_number} panorama would upload {local_path}')
                continue

            try:
                public_id = field_name.rsplit('.', 1)[0]
                result = cloudinary.uploader.upload(
                    local_path,
                    public_id=public_id,
                    overwrite=True,
                    resource_type='image',
                )
                room.panorama_image = result['public_id']
                room.save(update_fields=['panorama_image'])
                self.stdout.write(
                    self.style.SUCCESS(f'  OK    Room {room.room_number} panorama → {result["secure_url"]}')
                )
            except Exception as exc:
                self.stdout.write(
                    self.style.ERROR(f'  FAIL  Room {room.room_number} panorama — {exc}')
                )

        self.stdout.write(
            f'\nDone. Migrated: {migrated}, Skipped: {skipped}, Failed: {failed}'
        )
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes were made.'))