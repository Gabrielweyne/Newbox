from django.db.models import Count, ProtectedError, Q
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Box, Cliente, Funcionario, Sede
from .serializers import (
    BoxSerializer,
    ClienteSerializer,
    FuncionarioSerializer,
    SedeOpcaoSerializer,
    SedeSerializer,
)


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


class SedeViewSet(ProtegidoContraExclusaoMixin, viewsets.ModelViewSet):
    serializer_class = SedeSerializer

    def get_queryset(self):
        return Sede.objects.annotate(
            numero_de_box=Count("boxes"),
            alugados=Count("boxes", filter=Q(boxes__cliente__isnull=False)),
            nao_alugados=Count("boxes", filter=Q(boxes__cliente__isnull=True)),
        )


class ClienteViewSet(ProtegidoContraExclusaoMixin, viewsets.ModelViewSet):
    queryset = Cliente.objects.all()
    serializer_class = ClienteSerializer


class BoxViewSet(viewsets.ModelViewSet):
    """
    Filtros opcionais: ?sede=<id>, ?cliente=<id>, ?alugado=true|false
    """

    serializer_class = BoxSerializer

    def get_queryset(self):
        qs = Box.objects.select_related("sede", "cliente")
        params = self.request.query_params
        if sede := params.get("sede"):
            qs = qs.filter(sede_id=sede)
        if cliente := params.get("cliente"):
            qs = qs.filter(cliente_id=cliente)
        if (alugado := params.get("alugado")) in ("true", "false"):
            qs = qs.filter(cliente__isnull=(alugado == "false"))
        return qs


class FuncionarioViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Consulta de funcionários (exige login). Filtro opcional: ?sede=<id>
    O cadastro é feito em /api/auth/registro/.

    GET /api/funcionarios/sedes/ -> aberto: sedes para o formulário de cadastro
    """

    serializer_class = FuncionarioSerializer

    def get_permissions(self):
        if self.action == "sedes":
            return [permissions.AllowAny()]
        return super().get_permissions()

    def get_queryset(self):
        qs = Funcionario.objects.select_related("sede", "usuario")
        if sede := self.request.query_params.get("sede"):
            qs = qs.filter(sede_id=sede)
        return qs

    @action(detail=False, methods=["get"])
    def sedes(self, request):
        return Response(SedeOpcaoSerializer(Sede.objects.all(), many=True).data)
