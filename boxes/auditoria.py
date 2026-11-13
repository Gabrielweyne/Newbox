"""
Histórico de alterações (auditoria).

Toda vez que um registro importante é criado, alterado ou excluído pelo site,
o sistema guarda quem fez, quando e o que mudou (valor antes e depois), para o
administrador conferir e, se precisar, desfazer.

Observações:
- O usuário vem do login (JWT) da requisição em andamento.
- Mudanças feitas "em lote" pelo sistema (ex.: gerar mensalidades do mês) não
  entram no histórico; o backup diário cobre esses casos.
"""

import contextvars
from datetime import date, datetime
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import models, transaction
from django.db.models.signals import post_delete, post_save, pre_save
from django.utils import timezone

# Campos que não interessam no histórico (mudam sozinhos ou são internos)
IGNORAR = {"criado_em", "last_login", "date_joined"}
# Do usuário só interessa o acesso; a senha aparece só como "alterada"
CAMPOS_USUARIO = {"is_active", "is_staff", "email", "first_name", "password"}
SEGREDOS = {"password"}

# Requisição em andamento. O DRF, ao identificar o login (JWT), grava o usuário
# também na requisição do Django; por isso basta ler request.user na hora de registrar.
requisicao_atual = contextvars.ContextVar("requisicao_atual", default=None)


class UsuarioDaRequisicao:
    """Middleware: guarda a requisição atual para o histórico saber quem fez a alteração."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        token = requisicao_atual.set(request)
        try:
            return self.get_response(request)
        finally:
            requisicao_atual.reset(token)


def usuario_da_requisicao():
    request = requisicao_atual.get()
    usuario = getattr(request, "user", None) if request is not None else None
    return usuario if usuario is not None and usuario.is_authenticated else None


def nome_do_usuario(usuario):
    if usuario is None:
        return "Sistema"
    funcionario = getattr(usuario, "funcionario", None)
    if funcionario:
        return funcionario.nome
    return usuario.get_full_name() or ("Administrador" if usuario.is_staff else usuario.get_username())


# ---------- fotografia dos campos ----------

def campos(modelo):
    lista = [f for f in modelo._meta.concrete_fields if not f.primary_key and f.name not in IGNORAR]
    if modelo is get_user_model():
        lista = [f for f in lista if f.name in CAMPOS_USUARIO]
    return lista


def _normalizado(obj, campo):
    """Valor do campo já no tipo certo (ex.: data mesmo que tenha sido atribuída como texto)."""
    valor = campo.value_from_object(obj)
    if valor is None or campo.is_relation or isinstance(campo, (models.FileField, models.JSONField)):
        return valor
    try:
        return campo.to_python(valor)
    except Exception:  # noqa: BLE001
        return valor


def valor_bruto(obj, campo):
    valor = _normalizado(obj, campo)
    if valor is None:
        return None
    if isinstance(campo, models.FileField):
        return valor.name or ""
    if isinstance(valor, (date, datetime)):
        return valor.isoformat()
    if isinstance(valor, Decimal):
        return str(valor)
    if isinstance(valor, (bool, int, float, str, list, dict)):
        return valor
    return str(valor)


def valor_texto(obj, campo):
    if campo.name in SEGREDOS:
        return "••••"
    valor = _normalizado(obj, campo)
    if valor in (None, ""):
        return "—"
    if campo.is_relation:
        relacionado = getattr(obj, campo.name, None)
        return str(relacionado) if relacionado is not None else str(valor)
    if campo.choices:
        return str(dict(campo.flatchoices).get(valor, valor))
    if isinstance(campo, models.BooleanField):
        return "Sim" if valor else "Não"
    if isinstance(valor, datetime):
        return (timezone.localtime(valor) if timezone.is_aware(valor) else valor).strftime("%d/%m/%Y %H:%M")
    if isinstance(valor, date):
        return valor.strftime("%d/%m/%Y")
    if isinstance(valor, Decimal):
        return f"{valor:.2f}".replace(".", ",")
    if isinstance(campo, models.FileField):
        return valor.name.rsplit("/", 1)[-1]
    return str(valor)


def fotografia(obj):
    return {
        c.name: {"rotulo": str(c.verbose_name), "valor": valor_bruto(obj, c), "texto": valor_texto(obj, c)}
        for c in campos(type(obj))
    }


# ---------- gravação ----------

def registrar(acao, obj, mudancas):
    from .models import Alteracao

    usuario = usuario_da_requisicao()
    Alteracao.objects.create(
        usuario=usuario if usuario is not None and usuario.pk else None,
        usuario_nome=nome_do_usuario(usuario),
        acao=acao,
        modelo=obj._meta.label_lower,
        tipo=str(obj._meta.verbose_name),
        objeto_id=str(obj.pk),
        objeto=str(obj)[:200],
        mudancas=mudancas,
    )


def antes_de_salvar(sender, instance, raw=False, **kwargs):
    if raw or not instance.pk:
        return
    antigo = sender._default_manager.filter(pk=instance.pk).first()
    instance._auditoria_antes = fotografia(antigo) if antigo else None


def depois_de_salvar(sender, instance, created, raw=False, **kwargs):
    if raw:
        return
    from .models import Alteracao

    depois = fotografia(instance)
    antes = getattr(instance, "_auditoria_antes", None)
    instance._auditoria_antes = None
    if created or antes is None:
        mudancas = {
            k: {"rotulo": v["rotulo"], "antes": None, "depois": v["valor"], "antes_txt": "—", "depois_txt": v["texto"]}
            for k, v in depois.items() if v["valor"] not in (None, "")
        }
        acao = Alteracao.CRIOU
    else:
        mudancas = {
            k: {"rotulo": v["rotulo"], "antes": antes[k]["valor"], "depois": v["valor"],
                "antes_txt": antes[k]["texto"], "depois_txt": v["texto"]}
            for k, v in depois.items() if k in antes and antes[k]["valor"] != v["valor"]
        }
        if not mudancas:
            return
        acao = Alteracao.ALTEROU
    registrar(acao, instance, mudancas)


def depois_de_excluir(sender, instance, **kwargs):
    from .models import Alteracao

    antes = fotografia(instance)
    mudancas = {
        k: {"rotulo": v["rotulo"], "antes": v["valor"], "depois": None, "antes_txt": v["texto"], "depois_txt": "—"}
        for k, v in antes.items()
    }
    registrar(Alteracao.EXCLUIU, instance, mudancas)


def modelos_auditados():
    from . import models as m

    return [m.Sede, m.TipoBox, m.Cliente, m.Box, m.Mensalidade, m.Funcionario, m.Interessado,
            m.Contrato, m.Comunicado, get_user_model()]


def conectar():
    for modelo in modelos_auditados():
        uid = f"auditoria-{modelo._meta.label_lower}"
        pre_save.connect(antes_de_salvar, sender=modelo, dispatch_uid=uid + "-pre")
        post_save.connect(depois_de_salvar, sender=modelo, dispatch_uid=uid + "-post")
        post_delete.connect(depois_de_excluir, sender=modelo, dispatch_uid=uid + "-del")


# ---------- desfazer ----------

class NaoDaParaDesfazer(Exception):
    pass


def desfazer(alteracao, usuario):
    """Volta o registro ao estado de antes desta alteração."""
    from django.apps import apps
    from django.db import IntegrityError
    from django.db.models import ProtectedError

    from .models import Alteracao

    if alteracao.desfeita_em:
        raise NaoDaParaDesfazer("Esta alteração já foi desfeita.")
    modelo = apps.get_model(alteracao.modelo)
    por_nome = {c.name: c for c in campos(modelo)}

    def aplicar(obj, chave):
        for nome, m in alteracao.mudancas.items():
            campo = por_nome.get(nome)
            if campo is None or nome in SEGREDOS:
                continue
            valor = m[chave]
            setattr(obj, campo.attname, None if valor is None else campo.to_python(valor))

    try:
        with transaction.atomic():
            if alteracao.acao == Alteracao.CRIOU:
                obj = modelo._default_manager.filter(pk=alteracao.objeto_id).first()
                if obj is None:
                    raise NaoDaParaDesfazer("Este registro já não existe.")
                obj.delete()
            elif alteracao.acao == Alteracao.ALTEROU:
                obj = modelo._default_manager.filter(pk=alteracao.objeto_id).first()
                if obj is None:
                    raise NaoDaParaDesfazer("Este registro foi excluído depois. Desfaça a exclusão primeiro.")
                aplicar(obj, "antes")
                obj.save()
            else:  # excluiu: recria com o mesmo número
                if modelo._default_manager.filter(pk=alteracao.objeto_id).exists():
                    raise NaoDaParaDesfazer("Este registro já existe de novo.")
                obj = modelo(pk=modelo._meta.pk.to_python(alteracao.objeto_id))
                aplicar(obj, "antes")
                obj.save(force_insert=True)
            alteracao.desfeita_em = timezone.now()
            alteracao.desfeita_por = nome_do_usuario(usuario)
            alteracao.save(update_fields=["desfeita_em", "desfeita_por"])
    except ProtectedError:
        raise NaoDaParaDesfazer("Não dá para desfazer: há contratos ou mensalidades ligados a este registro.")
    except IntegrityError:
        raise NaoDaParaDesfazer(
            "Não dá para desfazer: o resultado ficaria inconsistente com outros dados (ex.: o box já foi alugado de novo)."
        )
