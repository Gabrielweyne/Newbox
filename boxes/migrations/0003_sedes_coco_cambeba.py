from django.db import migrations

# As duas sedes da Newbox. O endereço é provisório: atualize pelo /admin/.
SEDES = [
    ("Cocó", "Cocó, Fortaleza - CE (endereço completo a definir)"),
    ("Cambeba", "Cambeba, Fortaleza - CE (endereço completo a definir)"),
]


def criar_sedes(apps, schema_editor):
    Sede = apps.get_model("boxes", "Sede")
    for nome, endereco in SEDES:
        Sede.objects.get_or_create(nome=nome, defaults={"endereco": endereco})


def remover_sedes(apps, schema_editor):
    Sede = apps.get_model("boxes", "Sede")
    Sede.objects.filter(nome__in=[nome for nome, _ in SEDES]).delete()


class Migration(migrations.Migration):
    dependencies = [("boxes", "0002_funcionario")]

    operations = [migrations.RunPython(criar_sedes, remover_sedes)]
