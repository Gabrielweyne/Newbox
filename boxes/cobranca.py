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
    # Box com valor zero (ex.: cobrado junto com outro box do mesmo cliente) não gera mensalidade
    boxes = (boxes if boxes is not None else Box.objects.all()).filter(cliente__isnull=False, valor__gt=0)
    boxes = list(boxes.only("id", "cliente_id", "valor", "dia_vencimento", "alugado_em", "cobranca_desde"))
    if not boxes:
        return 0
    existentes = set(
        Mensalidade.objects.filter(box__in=boxes).values_list("box_id", "competencia")
    )
    novas = []
    for box in boxes:
        competencia = inicio_do_mes(max(box.alugado_em, box.cobranca_desde or box.alugado_em))
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


def duracao(inicio, fim=None):
    """Tempo de aluguel por extenso: "1 ano e 3 meses", "2 meses e 10 dias", "15 dias"."""
    fim = fim or hoje()
    meses = (fim.year - inicio.year) * 12 + (fim.month - inicio.month)
    if fim.day < inicio.day:
        meses -= 1
    # dias que sobram depois dos meses cheios
    ano, mes = divmod(inicio.month - 1 + meses, 12)
    base = date(inicio.year + ano, mes + 1, min(inicio.day, calendar.monthrange(inicio.year + ano, mes + 1)[1]))
    dias = (fim - base).days
    anos, meses = divmod(meses, 12)

    def plural(n, um, varios):
        return f"{n} {um if n == 1 else varios}"

    partes = []
    if anos:
        partes.append(plural(anos, "ano", "anos"))
    if meses:
        partes.append(plural(meses, "mês", "meses"))
    if dias and not anos:
        partes.append(plural(dias, "dia", "dias"))
    if not partes:
        return "menos de 1 dia" if fim == inicio else "1 dia"
    return " e ".join([", ".join(partes[:-1]), partes[-1]] if len(partes) > 1 else partes)


@transaction.atomic
def iniciar_aluguel(box, usuario=None):
    """
    Chamado logo depois de o box receber cliente: abre o contrato e registra
    o 1º mês como pago.
    """
    from .models import Contrato, Mensalidade

    if not Contrato.objects.filter(box=box, fim__isnull=True).exists():
        Contrato.objects.create(
            box=box, cliente_id=box.cliente_id, tamanho=box.tamanho, valor=box.valor,
            dia_vencimento=box.dia_vencimento, inicio=box.alugado_em, criado_por=usuario,
        )

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
def encerrar_aluguel(box, usuario=None):
    """
    Libera o box e encerra o contrato (fica no histórico). Mensalidades ainda
    não vencidas e não pagas são apagadas; as atrasadas continuam registradas
    (o cliente ainda deve).

    Só é cliente quem tem box alugado: se era o último box do cliente, ele vira
    ex-cliente (sai da lista, com todo o histórico guardado). Devolve True nesse caso.
    """
    cliente = box.cliente
    box.contratos.filter(fim__isnull=True).update(fim=max(hoje(), box.alugado_em or hoje()), encerrado_por=usuario)
    box.mensalidades.filter(pago_em__isnull=True, vencimento__gte=hoje()).delete()
    box.cliente = None
    box.anexo_pagamento = None
    box.dia_vencimento = None
    box.alugado_em = None
    box.cobranca_desde = None
    box.save(update_fields=["cliente", "anexo_pagamento", "dia_vencimento", "alugado_em", "cobranca_desde"])
    if cliente and cliente.ativo and not cliente.boxes.exists():
        from django.utils import timezone

        cliente.ativo = False
        cliente.excluido_em = timezone.now()
        cliente.save(update_fields=["ativo", "excluido_em"])
        return True
    return False
