from django.db import migrations

# Endereço do Cocó informado pela Newbox. Só troca o provisório.
PROVISORIOS = ["Cocó, Fortaleza - CE (endereço completo a definir)", "Cocó, Fortaleza - CE"]
NOVO = "Av. Engenheiro Santana Júnior, 1901 - Cocó, Fortaleza - CE"


def atualizar(apps, schema_editor):
    apps.get_model("boxes", "Sede").objects.filter(nome="Cocó", endereco__in=PROVISORIOS).update(endereco=NOVO)


def desfazer(apps, schema_editor):
    apps.get_model("boxes", "Sede").objects.filter(nome="Cocó", endereco=NOVO).update(endereco=PROVISORIOS[0])


class Migration(migrations.Migration):
    dependencies = [("boxes", "0008_contato_cliente")]
    operations = [migrations.RunPython(atualizar, desfazer)]
