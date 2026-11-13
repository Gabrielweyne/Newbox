from django.db import migrations
from django.utils import timezone


def arquivar_sem_box(apps, schema_editor):
    """Só é cliente quem tem box alugado: quem não tem vira ex-cliente (histórico guardado)."""
    Cliente = apps.get_model("boxes", "Cliente")
    Cliente.objects.filter(ativo=True, boxes__isnull=True).update(ativo=False, excluido_em=timezone.now())


class Migration(migrations.Migration):
    dependencies = [("boxes", "0016_espera_email_cliente")]
    operations = [migrations.RunPython(arquivar_sem_box, migrations.RunPython.noop)]
