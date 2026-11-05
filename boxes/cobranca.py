"""
Regras de cobrança mensal dos boxes.

- Cada box alugado tem um dia de vencimento (5, 10, 15, 20, 25 ou 30).
- Todo mês o box gera uma Mensalidade (competência = dia 1 do mês).
- A primeira mensalidade nasce paga, com o comprovante anexado ao alugar.
- As mensalidades dos meses seguintes são criadas automaticamente
  (garantir_mensalidades), sem precisar de tarefa agendada.
"""

import calendar
from datetime import date

from django.db import transaction
from django.utils import timezone

DIAS_VENCIMENTO = [5, 10, 15, 20, 25, 30]


def hoje():
    return timezone.localdate()


def inicio_do_mes(dia):
    return dia.replace(day=1)


def proximo_mes(competencia):
    ano, mes = (competencia.year + 1, 1) if competencia.month == 12 else (competencia.year, competencia.month + 1)
    return date(ano, mes, 1)


def data_vencimento(competencia, dia):
    """Dia 30 em fevereiro vira 28/29 (último dia do mês)."""
    ultimo = calendar.monthrange(competencia.year, competencia.month)[1]
    return competencia.replace(day=min(dia, ultimo))


def dias_de_vencimento_hoje(dia=None):
    """
    Quais "dias de vencimento" caem nesta data. Normalmente é o próprio dia
    (5, 10, ...). No último dia de um mês curto, inclui o 30.
    """
    dia = dia or hoje()
    dias = [d for d in DIAS_VENCIMENTO if data_vencimento(inicio_do_mes(dia), d) == dia]
    return dias


def garantir_mensalidades(ate=None, boxes=None):
    """
    Cria as mensalidades que faltam, do mês em que cada box foi alugado até
    o mês de `ate` (padrão: hoje). Idempotente: pode ser chamada à vontade.
    """
    from .models import Box, Mensalidade

    limite = inicio_do_mes(ate or hoje())
    boxes = (boxes if boxes is not None else Box.objects.all()).filter(cliente__isnull=False)
    boxes = list(boxes.only("id", "cliente_id", "valor", "dia_vencimento", "alugado_em"))
    if not boxes:
        return 0
    existentes = set(
        Mensalidade.objects.filter(box__in=boxes).values_list("box_id", "competencia")
    )
    novas = []
    for box in boxes:
        competencia = inicio_do_mes(box.alugado_em)
        while competencia <= limite:
            if (box.id, competencia) not in existentes:
                novas.append(
                    Mensalidade(
                        box_id=box.id,
                        cliente_id=box.cliente_id,
                        competencia=competencia,
                        vencimento=data_vencimento(competencia, box.dia_vencimento),
                        valor=box.valor,
                    )
                )
            competencia = proximo_mes(competencia)
    Mensalidade.objects.bulk_create(novas, ignore_conflicts=True)
    return len(novas)


@transaction.atomic
def iniciar_aluguel(box, usuario=None):
    """Chamado logo depois de o box receber cliente: registra o 1º mês como pago."""
    from .models import Mensalidade

    competencia = inicio_do_mes(box.alugado_em)
    Mensalidade.objects.update_or_create(
        box=box,
        competencia=competencia,
        defaults={
            "cliente_id": box.cliente_id,
            "vencimento": data_vencimento(competencia, box.dia_vencimento),
            "valor": box.valor,
            "pago_em": box.alugado_em,
            "comprovante": box.anexo_pagamento.name,
            "registrado_por": usuario,
        },
    )


@transaction.atomic
def encerrar_aluguel(box):
    """
    Libera o box. Mensalidades ainda não vencidas e não pagas são apagadas;
    as atrasadas continuam registradas (o cliente ainda deve).
    """
    box.mensalidades.filter(pago_em__isnull=True, vencimento__gte=hoje()).delete()
    box.cliente = None
    box.anexo_pagamento = None
    box.dia_vencimento = None
    box.alugado_em = None
    box.save(update_fields=["cliente", "anexo_pagamento", "dia_vencimento", "alugado_em"])
