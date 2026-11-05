"""
Recuperação de senha por e-mail.

  1. POST /api/auth/senha/esqueci/    {cpf}
     -> se houver funcionário ativo com esse CPF, envia e-mail com link
        {FRONTEND_URL}/redefinir-senha?uid=<uid>&token=<token>
     A resposta é sempre a mesma, para não revelar quais CPFs existem.

  2. POST /api/auth/senha/redefinir/  {uid, token, senha, confirmar_senha}
     -> troca a senha. O link vale PASSWORD_RESET_TIMEOUT segundos, só pode
        ser usado uma vez, e a troca derruba os JWT já emitidos.
"""

import logging

from django.conf import settings
from django.contrib.auth import get_user_model, password_validation
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .validators import somente_digitos

User = get_user_model()
logger = logging.getLogger(__name__)

MENSAGEM_ENVIO = (
    "Se o CPF estiver cadastrado e com acesso aprovado, enviaremos um e-mail "
    "com as instruções para criar uma nova senha."
)


def enviar_email_redefinicao(usuario):
    uid = urlsafe_base64_encode(force_bytes(usuario.pk))
    token = default_token_generator.make_token(usuario)
    contexto = {
        "nome": getattr(getattr(usuario, "funcionario", None), "nome", "") or usuario.first_name,
        "link": f"{settings.FRONTEND_URL.rstrip('/')}/redefinir-senha?uid={uid}&token={token}",
        "validade_horas": settings.PASSWORD_RESET_TIMEOUT // 3600,
    }
    send_mail(
        subject="Newbox - Redefinição de senha",
        message=render_to_string("emails/redefinir_senha.txt", contexto),
        html_message=render_to_string("emails/redefinir_senha.html", contexto),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[usuario.email],
    )


class EsqueciSenhaView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "senha"

    def post(self, request):
        cpf = somente_digitos(request.data.get("cpf"))
        if len(cpf) != 11:
            return Response({"cpf": ["Informe um CPF válido."]}, status=status.HTTP_400_BAD_REQUEST)

        usuario = (
            User.objects.filter(username=cpf, is_active=True)
            .exclude(email="")
            .select_related("funcionario")
            .first()
        )
        if usuario:
            try:
                enviar_email_redefinicao(usuario)
            except Exception:  # falha no SMTP não deve revelar nada a quem pediu
                logger.exception("Falha ao enviar e-mail de redefinição de senha")
        return Response({"detail": MENSAGEM_ENVIO})


class RedefinirSenhaSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    senha = serializers.CharField(style={"input_type": "password"})
    confirmar_senha = serializers.CharField(style={"input_type": "password"})

    def validate(self, attrs):
        try:
            usuario = User.objects.get(pk=force_str(urlsafe_base64_decode(attrs["uid"])), is_active=True)
        except (User.DoesNotExist, ValueError, TypeError, OverflowError, ValidationError):
            usuario = None
        if usuario is None or not default_token_generator.check_token(usuario, attrs["token"]):
            raise serializers.ValidationError(
                {"token": "Link inválido ou expirado. Peça uma nova redefinição de senha."}
            )
        if attrs["senha"] != attrs["confirmar_senha"]:
            raise serializers.ValidationError({"confirmar_senha": "As senhas não conferem."})
        try:
            password_validation.validate_password(attrs["senha"], usuario)
        except ValidationError as erro:
            raise serializers.ValidationError({"senha": list(erro.messages)})
        attrs["usuario"] = usuario
        return attrs


class RedefinirSenhaView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "senha"

    def post(self, request):
        serializer = RedefinirSenhaSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        usuario = serializer.validated_data["usuario"]
        usuario.set_password(serializer.validated_data["senha"])
        usuario.save(update_fields=["password"])
        return Response({"detail": "Senha alterada. Faça login com a nova senha."})
