"""
Lista de espera e disponibilidade entre sedes.

Um interessado "combina" com um box livre quando:
  - a sede do interessado está vazia (qualquer uma) ou é a do box; e
  - o tamanho está vazio (qualquer um) ou é igual ao do box
    (ignorando maiúsculas e espaços: "3x3 m" == "3X3m").
"""

from .models import Box, Interessado, Sede


def normalizar_tamanho(tamanho):
    return "".join((tamanho or "").lower().split())


def boxes_livres(sede_id=None):
    qs = Box.objects.filter(cliente__isnull=True).select_related("sede").order_by("sede__nome", "valor", "id")
    if sede_id is not None:
        qs = qs.filter(sede_id=sede_id)
    return list(qs)


def combina(interessado, box):
    if interessado.sede_id and interessado.sede_id != box.sede_id:
        return False
    if interessado.tamanho and normalizar_tamanho(interessado.tamanho) != normalizar_tamanho(box.tamanho):
        return False
    return True


def vagas_para(interessado, livres):
    return [b for b in livres if combina(interessado, b)]


def oportunidades(sede_id=None):
    """
    Interessados aguardando que têm vaga agora. Com sede_id, considera só os
    boxes livres daquela sede (é o aviso para os funcionários dela).
    """
    livres = boxes_livres(sede_id)
    resultado = []
    for i in Interessado.objects.filter(situacao=Interessado.AGUARDANDO).select_related("sede"):
        vagas = vagas_para(i, livres)
        if vagas:
            resultado.append((i, vagas))
    return resultado


def disponibilidade():
    """Por sede e tamanho: quantos livres, total e menor valor entre os livres."""
    dados = {s.id: {"id": s.id, "nome": s.nome, "tamanhos": {}} for s in Sede.objects.order_by("nome")}
    for box in Box.objects.only("sede_id", "tamanho", "valor", "cliente_id"):
        chave = normalizar_tamanho(box.tamanho)
        t = dados[box.sede_id]["tamanhos"].setdefault(
            chave, {"tamanho": box.tamanho.strip(), "livres": 0, "total": 0, "valor_a_partir": None}
        )
        t["total"] += 1
        if box.cliente_id is None:
            t["livres"] += 1
            if t["valor_a_partir"] is None or box.valor < t["valor_a_partir"]:
                t["valor_a_partir"] = box.valor
    from .publico import _ordem_tamanho

    return [
        {**s, "tamanhos": sorted(s["tamanhos"].values(), key=lambda t: _ordem_tamanho(t["tamanho"]))}
        for s in dados.values()
    ]


def tamanhos_cadastrados():
    """Códigos do catálogo (na ordem P, M, G) e depois tamanhos avulsos dos boxes."""
    from .models import TipoBox
    from .publico import _ordem_tamanho

    vistos = {}
    for codigo in TipoBox.objects.order_by("ordem", "sede_id").values_list("codigo", flat=True):
        vistos.setdefault(normalizar_tamanho(codigo), codigo)
    avulsos = {}
    for t in Box.objects.values_list("tamanho", flat=True):
        chave = normalizar_tamanho(t)
        if chave not in vistos:
            avulsos.setdefault(chave, t.strip())
    return list(vistos.values()) + sorted(avulsos.values(), key=_ordem_tamanho)
