"""
Dados para a página pública (visitantes, sem login).

Mostra só o necessário: unidades, endereços, WhatsApp, o catálogo de
tamanhos (com o preço de tabela, como no catálogo impresso) e se há algum
box livre de cada tamanho. Nunca expõe clientes, quantidades, valores
negociados ou mensalidades.
"""

from collections import OrderedDict

from django.conf import settings
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .models import Box, Sede, TipoBox


def _ordem_tamanho(tamanho):
    """Ordena '1x2 m' < '2x2 m' < '3x3 m' pela área; o resto vai para o fim."""
    import re

    m = re.match(r"\s*(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)", tamanho)
    if not m:
        return (1, 0, tamanho)
    a, b = (float(x.replace(",", ".")) for x in m.groups())
    return (0, a * b, tamanho)


class PublicoView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "publico"

    def get(self, request):
        from .espera import normalizar_tamanho

        livres = list(Box.objects.filter(cliente__isnull=True).values_list("sede_id", "tipo_id", "tamanho"))
        sedes = []
        for sede in Sede.objects.order_by("nome"):
            tipos = []
            for t in TipoBox.objects.filter(sede=sede).order_by("ordem", "id"):
                disponivel = any(
                    s_id == sede.id and (tipo_id == t.id or (tipo_id is None and normalizar_tamanho(tam) == normalizar_tamanho(t.codigo)))
                    for s_id, tipo_id, tam in livres
                )
                tipos.append({
                    "codigo": t.codigo, "area": t.area, "volume": t.volume,
                    "comprimento": t.comprimento, "largura": t.largura, "altura": t.altura,
                    "sugestao_uso": t.sugestao_uso, "valor": t.valor, "disponivel": disponivel,
                })
            # Unidade ainda sem catálogo: mostra os tamanhos cadastrados nos boxes
            tamanhos = OrderedDict()
            if not tipos:
                for tamanho, livre in Box.objects.filter(sede=sede).values_list("tamanho", "cliente_id"):
                    chave = tamanho.strip()
                    tamanhos[chave] = tamanhos.get(chave, False) or livre is None
            sedes.append({
                "id": sede.id,
                "nome": sede.nome,
                "nome_publico": sede.nome_publico or sede.nome,
                "endereco": sede.endereco,
                "whatsapp": sede.whatsapp or settings.NEWBOX_WHATSAPP,
                "tipos": tipos,
                "tamanhos": [
                    {"tamanho": t, "disponivel": d}
                    for t, d in sorted(tamanhos.items(), key=lambda i: _ordem_tamanho(i[0]))
                ],
            })
        return Response({
            "sedes": sedes,
            "contato": {
                "whatsapp": settings.NEWBOX_WHATSAPP,
                "telefone": settings.NEWBOX_TELEFONE,
                "email": settings.NEWBOX_EMAIL,
                "instagram": settings.NEWBOX_INSTAGRAM,
                "horario": settings.NEWBOX_HORARIO,
            },
        })
