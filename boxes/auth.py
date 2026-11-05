"""Registro, login e logout de funcionários (CPF + senha)."""

from django.contrib.auth import authenticate, get_user_model, password_validation
from django.db import transaction
from rest_framework import permissions, serializers, status
from rest_framework.authtoken.models import Token
from rest_framework.response import Response
from rest_framework.views import APIView

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


class LoginView(APIView):
    """POST cpf, senha -> token. Use o header `Authorization: Token <token>`."""

    permission_classes = [permissions.AllowAny]

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
                {"detail": "CPF ou senha incorretos."}, status=status.HTTP_400_BAD_REQUEST
            )
        token, _ = Token.objects.get_or_create(user=usuario)
        return Response({"token": token.key, **dados_do_usuario(usuario)})


class LogoutView(APIView):
    """POST com o token -> invalida o token."""

    def post(self, request):
        Token.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class EuView(APIView):
    """GET -> dados de quem está logado."""

    def get(self, request):
        return Response(dados_do_usuario(request.user))


def dados_do_usuario(usuario):
    funcionario = Funcionario.objects.select_related("sede").filter(usuario=usuario).first()
    return {
        "admin": usuario.is_staff,
        "funcionario": FuncionarioSerializer(funcionario).data if funcionario else None,
    }
