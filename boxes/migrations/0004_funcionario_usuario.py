import django.db.models.deletion
from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.db import migrations, models


def criar_usuarios(apps, schema_editor):
    """Funcionários cadastrados antes do login ganham conta inativa, sem senha."""
    User = apps.get_model(*settings.AUTH_USER_MODEL.split("."))
    Funcionario = apps.get_model("boxes", "Funcionario")
    for f in Funcionario.objects.filter(usuario__isnull=True):
        f.usuario = User.objects.create(
            username=f.cpf, first_name=f.nome[:150], is_active=False,
            password=make_password(None),
        )
        f.save(update_fields=["usuario"])


class Migration(migrations.Migration):
    dependencies = [
        ("boxes", "0003_sedes_coco_cambeba"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="funcionario",
            name="usuario",
            field=models.OneToOneField(
                null=True, on_delete=django.db.models.deletion.CASCADE,
                related_name="funcionario", to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.RunPython(criar_usuarios, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="funcionario",
            name="usuario",
            field=models.OneToOneField(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="funcionario", to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
