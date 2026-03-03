# Generated migration for adding 360° panorama support

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('rooms', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='room',
            name='panorama_image',
            field=models.ImageField(
                blank=True,
                help_text='360° panoramic image (equirectangular projection, 2:1 ratio)',
                null=True,
                upload_to='rooms/panoramas/'
            ),
        ),
    ]