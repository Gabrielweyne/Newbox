from django.apps import AppConfig


class BoxesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "boxes"

    def ready(self):
        from . import auditoria

        auditoria.conectar()
