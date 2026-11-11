"""
Dados para a página pública (visitantes, sem login).

Mostra só o necessário: sedes, endereços, tamanhos de box e se há algum
livre. Nunca expõe clientes, valores, quantidades ou mensalidades.
"""

from collections import OrderedDict

from django.conf import settings
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .models import Box, Sede


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
        sedes = []
        for sede in Sede.objects.order_by("nome"):
            tamanhos = OrderedDict()
            for tamanho, livre in Box.objects.filter(sede=sede).values_list("tamanho", "cliente_id"):
                chave = tamanho.strip()
                tamanhos[chave] = tamanhos.get(chave, False) or livre is None
            sedes.append({
                "id": sede.id,
                "nome": sede.nome,
                "endereco": sede.endereco,
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
            },
        })
