from django.db import migrations

# Endereço da Cambeba, conforme o rodapé de newboxbrasil.com.br.
# Só substitui o endereço provisório; não mexe se já foi editado.
PROVISORIO = "Cambeba, Fortaleza - CE (endereço completo a definir)"
NOVO = "Rua Ciro Monteiro, 368 - Cambeba, Fortaleza - CE (a 500 m do Shopping Via Sul)"


def atualizar(apps, schema_editor):
    apps.get_model("boxes", "Sede").objects.filter(nome="Cambeba", endereco=PROVISORIO).update(endereco=NOVO)


def desfazer(apps, schema_editor):
    apps.get_model("boxes", "Sede").objects.filter(nome="Cambeba", endereco=NOVO).update(endereco=PROVISORIO)


class Migration(migrations.Migration):
    dependencies = [("boxes", "0005_mensalidades")]
    operations = [migrations.RunPython(atualizar, desfazer)]
