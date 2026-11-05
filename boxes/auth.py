"""
Autenticação de funcionários com JWT (CPF + senha).

Fluxo:
  1. POST /api/auth/login/    {cpf, senha}  -> {access, refresh, sede, funcionario}
  2. Chamadas à API com o header  Authorization: Bearer <access>
  3. Quando o access expirar: POST /api/auth/token/refresh/ {refresh} -> novo par
  4. POST /api/auth/logout/   {refresh}     -> o refresh é invalidado (blacklist)
"""

from django.contrib.auth import authenticate, get_user_model, password_validation
from django.db import transaction
from rest_framework import permissions, serializers, status
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Funcionario
from .serializers import FuncionarioSerializer
from .validators import somente_digitos

User = get_user_model()


class RegistroSerializer(FuncionarioSerializer):
    senha = serializers.CharField(write_only=True, style={"input_type": "password"})
    confirmar_senha = serializers.CharField(write_only=True, style={"input_type": "password"})

    class Meta(FuncionarioSerializer.Meta):
        fields = FuncionarioSerializer.Meta.fields + ["senha", "confirmar_senha"]

    def validate_cpf(self, valor):
        cpf = super().validate_cpf(valor)
        if User.objects.filter(username=cpf).exists():
            raise serializers.ValidationError("Já existe funcionário com este CPF.")
        return cpf

    def validate(self, attrs):
        if attrs["senha"] != attrs["confirmar_senha"]:
            raise serializers.ValidationError({"confirmar_senha": "As senhas não conferem."})
        usuario_provisorio = User(username=attrs["cpf"], first_name=attrs["nome"])
        try:
            password_validation.validate_password(attrs["senha"], usuario_provisorio)
        except Exception as erro:  # django.core.exceptions.ValidationError
            raise serializers.ValidationError({"senha": list(erro.messages)})
        return attrs

    @transaction.atomic
    def create(self, dados):
        senha = dados.pop("senha")
        dados.pop("confirmar_senha")
        usuario = User.objects.create_user(
            username=dados["cpf"], password=senha,
            first_name=dados["nome"][:150], is_active=False,
        )
        return Funcionario.objects.create(usuario=usuario, **dados)


class RegistroView(APIView):
    """POST nome, cpf, sede, senha, confirmar_senha. A conta fica aguardando aprovação."""

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = RegistroSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            {**serializer.data,
             "detail": "Cadastro recebido. Aguarde a aprovação do administrador para entrar."},
            status=status.HTTP_201_CREATED,
        )


def gerar_tokens(usuario):
    """
    Gera o par de tokens JWT. As claims extras (nome, sede) são só informativas
    para o front-end: as permissões sempre consultam a sede no banco.
    """
    refresh = RefreshToken.for_user(usuario)
    funcionario = getattr(usuario, "funcionario", None)
    refresh["cpf"] = usuario.username
    refresh["admin"] = usuario.is_staff
    if funcionario:
        refresh["nome"] = funcionario.nome
        refresh["sede_id"] = funcionario.sede_id
        refresh["sede_nome"] = funcionario.sede.nome
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


class LoginView(APIView):
    """
    POST cpf, senha -> tokens JWT + sede do funcionário.
    Limitado a 10 tentativas por minuto por IP (proteção contra força bruta).
    """

    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        cpf = somente_digitos(request.data.get("cpf"))
        senha = request.data.get("senha") or ""
        usuario = authenticate(request, username=cpf, password=senha)
        if usuario is None:
            # Senha certa mas conta inativa: avisa que falta aprovação
            pendente = User.objects.filter(username=cpf, is_active=False).first()
            if pendente and pendente.check_password(senha):
                return Response(
                    {"detail": "Cadastro aguardando aprovação do administrador."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            return Response(
                {"detail": "CPF ou senha incorretos."}, status=status.HTTP_401_UNAUTHORIZED
            )
        dados = dados_do_usuario(usuario)
        if not dados["admin"] and dados["funcionario"] is None:
            return Response(
                {"detail": "Usuário sem vínculo com uma sede."}, status=status.HTTP_403_FORBIDDEN
            )
        return Response({**gerar_tokens(usuario), **dados})


class LogoutView(APIView):
    """POST {refresh} -> invalida o refresh token (o access expira sozinho em minutos)."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        try:
            RefreshToken(request.data.get("refresh") or "").blacklist()
        except TokenError:
            return Response(
                {"refresh": "Token inválido ou já expirado."}, status=status.HTTP_400_BAD_REQUEST
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class EuView(APIView):
    """GET -> dados de quem está logado (inclui a sede)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(dados_do_usuario(request.user))


def dados_do_usuario(usuario):
    funcionario = Funcionario.objects.select_related("sede").filter(usuario=usuario).first()
    sede = funcionario.sede if funcionario else None
    return {
        "admin": usuario.is_staff,
        # Sede para onde o funcionário é direcionado (None = admin, acessa todas)
        "sede": {"id": sede.id, "nome": sede.nome} if sede else None,
        "funcionario": FuncionarioSerializer(funcionario).data if funcionario else None,
    }
