r"""
Cria (ou atualiza) um administrador. Pergunta nome, CPF, e-mail e senha.

    .venv\Scripts\python manage.py criar_admin

O administrador entra no site com o CPF e a senha. Se o CPF já existir,
vira administrador e recebe a senha nova.
"""

from getpass import getpass

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.core.validators import validate_email

from boxes.validators import somente_digitos, validar_cpf


class Command(BaseCommand):
    help = "Cria um administrador do sistema (entra com CPF e senha)."

    def perguntar(self, texto, validar):
        while True:
            valor = input(texto).strip()
            try:
                return validar(valor)
            except ValidationError as e:
                self.stdout.write(self.style.ERROR("  " + " ".join(e.messages)))

    def handle(self, **_):
        User = get_user_model()
        try:
            nome = self.perguntar("Nome: ", lambda v: v if v else (_ for _ in ()).throw(ValidationError("Informe o nome.")))

            def cpf_ok(v):
                validar_cpf(v)
                return somente_digitos(v)

            cpf = self.perguntar("CPF: ", cpf_ok)

            def email_ok(v):
                validate_email(v)
                return v.lower()

            email = self.perguntar("E-mail: ", email_ok)
            usuario = User.objects.filter(username=cpf).first() or User(username=cpf)
            while True:
                senha = getpass("Senha (não aparece enquanto digita): ")
                if senha != getpass("Repita a senha: "):
                    self.stdout.write(self.style.ERROR("  As senhas não são iguais."))
                    continue
                try:
                    validate_password(senha, usuario)
                    break
                except ValidationError as e:
                    self.stdout.write(self.style.ERROR("  " + " ".join(e.messages)))
        except (KeyboardInterrupt, EOFError):
            raise CommandError("Cancelado.")

        novo = usuario.pk is None
        usuario.first_name, usuario.email = nome, email
        usuario.is_staff = usuario.is_superuser = usuario.is_active = True
        usuario.set_password(senha)
        usuario.save()
        self.stdout.write(self.style.SUCCESS(
            f"\n{'Administrador criado' if novo else 'Administrador atualizado'}! "
            f"Entre no site com o CPF {cpf[:3]}.{cpf[3:6]}.{cpf[6:9]}-{cpf[9:]} e a senha que você escolheu."
        ))
