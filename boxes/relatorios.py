"""
Relatórios: ocupação, adimplência e inadimplência por mês.

GET /api/relatorios/?meses=12&sede=<id>
Funcionário vê só a própria sede; o administrador escolhe (vazio = todas).
"""

from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from rest_framework.response import Response
from rest_framework.views import APIView

from . import cobranca
from .models import Box, Contrato, Mensalidade
from .permissions import sede_do_usuario


def ultimo_dia(mes):
    return cobranca.proximo_mes(mes) - timedelta(days=1)


def pct(parte, total):
    return round(float(parte) * 100 / float(total), 1) if total else None


def meses_ate_hoje(quantidade):
    mes = cobranca.inicio_do_mes(cobranca.hoje())
    lista = [mes]
    for _ in range(quantidade - 1):
        mes = cobranca.inicio_do_mes(mes - timedelta(days=1))
        lista.append(mes)
    return list(reversed(lista))


def ocupacao(meses, boxes, contratos):
    """Boxes alugados no último dia de cada mês (hoje, no mês atual)."""
    total = boxes.count()
    hoje = cobranca.hoje()
    periodos = list(contratos.values_list("box_id", "inicio", "fim"))
    linhas = []
    for mes in meses:
        dia = min(ultimo_dia(mes), hoje)
        ocupados = {b for b, ini, fim in periodos if ini <= dia and (fim is None or fim > dia)}
        linhas.append({"ocupados": len(ocupados), "total": total, "ocupacao_pct": pct(len(ocupados), total)})
    return linhas


def pagamentos(meses, mensalidades):
    """
    Por mês de competência, só o que já venceu:
    pago em dia, pago com atraso e em aberto (inadimplência).
    """
    hoje = cobranca.hoje()
    soma = defaultdict(lambda: defaultdict(Decimal))
    for comp, venc, pago, valor in mensalidades.filter(
        competencia__gte=meses[0], vencimento__lte=hoje, valor__gt=0
    ).values_list("competencia", "vencimento", "pago_em", "valor"):
        s = soma[comp]
        s["previsto"] += valor
        if pago is None:
            if venc < hoje:
                s["em_aberto"] += valor
            else:
                s["vence_hoje"] += valor
        elif pago <= venc:
            s["pago_em_dia"] += valor
        else:
            s["pago_atraso"] += valor
    linhas = []
    for mes in meses:
        s = soma[mes]
        pago = s["pago_em_dia"] + s["pago_atraso"]
        linhas.append({
            "previsto": s["previsto"], "pago_em_dia": s["pago_em_dia"], "pago_atraso": s["pago_atraso"],
            "em_aberto": s["em_aberto"], "vence_hoje": s["vence_hoje"],
            "adimplencia_pct": pct(pago, s["previsto"]),
            "inadimplencia_pct": pct(s["em_aberto"], s["previsto"]),
        })
    return linhas


def devedores(mensalidades):
    """Clientes com mensalidade vencida e não paga (de todos os meses)."""
    hoje = cobranca.hoje()
    por_cliente = {}
    abertas = mensalidades.filter(pago_em__isnull=True, vencimento__lt=hoje, valor__gt=0).select_related(
        "cliente", "box__sede"
    ).order_by("vencimento")
    for m in abertas:
        d = por_cliente.setdefault(m.cliente_id, {
            "cliente": m.cliente_id, "nome": m.cliente.nome, "telefone": m.cliente.telefone,
            "boxes": set(), "mensalidades": 0, "valor": Decimal("0"), "desde": m.vencimento,
        })
        d["boxes"].add(f"{m.box.rotulo} ({m.box.sede.nome})")
        d["mensalidades"] += 1
        d["valor"] += m.valor
    lista = sorted(por_cliente.values(), key=lambda d: (-d["valor"], d["nome"]))
    for d in lista:
        d["boxes"] = sorted(d["boxes"])
        d["dias_em_atraso"] = (hoje - d["desde"]).days
    return lista


class RelatoriosView(APIView):
    def get(self, request):
        sede = sede_do_usuario(request.user)
        if sede is None and str(request.query_params.get("sede", "")).isdigit():
            sede = int(request.query_params["sede"])
        try:
            quantidade = min(max(int(request.query_params.get("meses", 12)), 1), 36)
        except ValueError:
            quantidade = 12

        boxes = Box.objects.all()
        contratos = Contrato.objects.all()
        mensalidades = Mensalidade.objects.all()
        if sede is not None:
            boxes = boxes.filter(sede_id=sede)
            contratos = contratos.filter(box__sede_id=sede)
            mensalidades = mensalidades.filter(box__sede_id=sede)

        cobranca.garantir_mensalidades(boxes=boxes)
        meses = meses_ate_hoje(quantidade)
        linhas = [
            {"mes": f"{mes:%Y-%m}", **o, **p}
            for mes, o, p in zip(meses, ocupacao(meses, boxes, contratos), pagamentos(meses, mensalidades))
        ]
        return Response({
            "sede": sede,
            "hoje": cobranca.hoje(),
            "meses": linhas,
            "devedores": devedores(mensalidades),
        })
