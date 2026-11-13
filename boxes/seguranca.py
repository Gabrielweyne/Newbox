"""
Área de segurança (só administrador):

GET  /api/alteracoes/                 histórico (filtros: ?usuario=<nome>, ?tipo=, ?acao=, ?busca=)
GET  /api/alteracoes/quem/            nomes de quem já fez alterações (para o filtro)
POST /api/alteracoes/<id>/desfazer/   volta o registro ao estado de antes
GET  /api/backups/                    backups guardados
POST /api/backups/                    faz um backup agora
GET  /api/backups/<nome>/             baixa um backup
"""

from django.http import FileResponse, Http404
from rest_framework import mixins, permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from . import auditoria, backup
from .models import Alteracao


class AlteracaoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Alteracao
        fields = ["id", "quando", "usuario", "usuario_nome", "acao", "modelo", "tipo", "objeto_id", "objeto",
                  "mudancas", "desfeita_em", "desfeita_por"]
        read_only_fields = fields


class AlteracaoViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = AlteracaoSerializer
    permission_classes = [permissions.IsAdminUser]

    def get_queryset(self):
        qs = Alteracao.objects.all()
        p = self.request.query_params
        if v := p.get("usuario"):
            qs = qs.filter(usuario_nome=v)
        if v := p.get("tipo"):
            qs = qs.filter(tipo=v)
        if v := p.get("acao"):
            qs = qs.filter(acao=v)
        if v := p.get("busca", "").strip():
            qs = qs.filter(objeto__icontains=v)
        return qs

    @action(detail=False, methods=["get"])
    def quem(self, request):
        nomes = Alteracao.objects.order_by("usuario_nome").values_list("usuario_nome", flat=True).distinct()
        tipos = Alteracao.objects.order_by("tipo").values_list("tipo", flat=True).distinct()
        return Response({"usuarios": list(nomes), "tipos": list(tipos)})

    @action(detail=True, methods=["post"])
    def desfazer(self, request, pk=None):
        alteracao = Alteracao.objects.get(pk=pk)
        try:
            auditoria.desfazer(alteracao, request.user)
        except auditoria.NaoDaParaDesfazer as e:
            return Response({"detail": str(e)}, status=status.HTTP_409_CONFLICT)
        return Response(AlteracaoSerializer(alteracao).data)


class BackupsView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        return Response({"backups": backup.listar(), "copia_externa": bool(backup.settings.NEWBOX_BACKUP_COPIA)})

    def post(self, request):
        caminho = backup.fazer_backup()
        return Response({"nome": caminho.name}, status=status.HTTP_201_CREATED)


class BaixarBackupView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def get(self, request, nome):
        if not backup.NOME.match(nome):
            raise Http404
        caminho = backup.pasta() / nome
        if not caminho.exists():
            raise Http404
        return FileResponse(open(caminho, "rb"), as_attachment=True, filename=nome, content_type="application/zip")
