from django.db.models import Count, ProtectedError, Q
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Box, Cliente, Funcionario, Sede
from .permissions import EhAdminOuFuncionario, SomenteAdminAltera, sede_do_usuario
from .serializers import (
    BoxSerializer,
    ClienteSerializer,
    FuncionarioSerializer,
    SedeOpcaoSerializer,
    SedeSerializer,
)


class FiltraPorSedeMixin:
    """Funcionário só enxerga registros da própria sede (admin vê todos)."""

    campo_sede = "sede_id"

    def filtrar_por_sede(self, qs):
        sede = sede_do_usuario(self.request.user)
        return qs if sede is None else qs.filter(**{self.campo_sede: sede})


class ProtegidoContraExclusaoMixin:
    """Responde 409 em vez de erro 500 ao apagar registro que ainda tem boxes."""

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {"detail": "Não é possível excluir: existem boxes vinculados."},
                status=status.HTTP_409_CONFLICT,
            )


class SedeViewSet(FiltraPorSedeMixin, ProtegidoContraExclusaoMixin, viewsets.ModelViewSet):
    """Funcionário vê só a própria sede; só administrador cria/edita/exclui."""

    serializer_class = SedeSerializer
    permission_classes = [EhAdminOuFuncionario, SomenteAdminAltera]
    campo_sede = "id"

    def get_queryset(self):
        return self.filtrar_por_sede(Sede.objects.all()).annotate(
            numero_de_box=Count("boxes"),
            alugados=Count("boxes", filter=Q(boxes__cliente__isnull=False)),
            nao_alugados=Count("boxes", filter=Q(boxes__cliente__isnull=True)),
        ).order_by("nome")


class ClienteViewSet(ProtegidoContraExclusaoMixin, viewsets.ModelViewSet):
    """Clientes são compartilhados entre as sedes (um cliente pode alugar nas duas)."""

    serializer_class = ClienteSerializer

    def get_queryset(self):
        qs = Cliente.objects.annotate(total_boxes=Count("boxes"))
        if busca := self.request.query_params.get("busca", "").strip():
            qs = qs.filter(nome__icontains=busca)
        return qs.order_by("nome")


class BoxViewSet(FiltraPorSedeMixin, viewsets.ModelViewSet):
    """
    Funcionário só vê e altera boxes da própria sede.
    Filtros opcionais: ?sede=<id>, ?cliente=<id>, ?alugado=true|false

    POST /api/boxes/<id>/liberar/ -> encerra o aluguel (remove cliente e comprovante)
    """

    serializer_class = BoxSerializer

    def get_queryset(self):
        qs = self.filtrar_por_sede(Box.objects.select_related("sede", "cliente"))
        params = self.request.query_params
        if sede := params.get("sede"):
            qs = qs.filter(sede_id=sede)
        if cliente := params.get("cliente"):
            qs = qs.filter(cliente_id=cliente)
        if (alugado := params.get("alugado")) in ("true", "false"):
            qs = qs.filter(cliente__isnull=(alugado == "false"))
        return qs

    @action(detail=True, methods=["post"])
    def liberar(self, request, pk=None):
        box = self.get_object()
        box.cliente = None
        box.anexo_pagamento = None
        box.save(update_fields=["cliente", "anexo_pagamento"])
        return Response(self.get_serializer(box).data)


class FuncionarioViewSet(FiltraPorSedeMixin, viewsets.ReadOnlyModelViewSet):
    """
    Consulta de funcionários (funcionário vê só os colegas da própria sede).
    Filtros opcionais: ?sede=<id>, ?aprovado=true|false
    O cadastro é feito em /api/auth/registro/.

    GET  /api/funcionarios/sedes/          -> aberto: sedes para o formulário de cadastro
    POST /api/funcionarios/<id>/aprovar/   -> só admin: libera o acesso
    POST /api/funcionarios/<id>/bloquear/  -> só admin: bloqueia o acesso
    """

    serializer_class = FuncionarioSerializer

    def get_permissions(self):
        if self.action == "sedes":
            return [permissions.AllowAny()]
        return super().get_permissions()

    def get_queryset(self):
        qs = self.filtrar_por_sede(Funcionario.objects.select_related("sede", "usuario"))
        if sede := self.request.query_params.get("sede"):
            qs = qs.filter(sede_id=sede)
        if (aprovado := self.request.query_params.get("aprovado")) in ("true", "false"):
            qs = qs.filter(usuario__is_active=(aprovado == "true"))
        return qs

    @action(detail=False, methods=["get"])
    def sedes(self, request):
        return Response(SedeOpcaoSerializer(Sede.objects.all(), many=True).data)

    def _definir_acesso(self, ativo):
        funcionario = self.get_object()
        funcionario.usuario.is_active = ativo
        funcionario.usuario.save(update_fields=["is_active"])
        return Response(self.get_serializer(funcionario).data)

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAdminUser])
    def aprovar(self, request, pk=None):
        return self._definir_acesso(True)

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAdminUser])
    def bloquear(self, request, pk=None):
        if self.get_object().usuario_id == request.user.id:
            return Response({"detail": "Você não pode bloquear a si mesmo."}, status=400)
        return self._definir_acesso(False)
