"""
Importa a planilha de acompanhamento (boxes, clientes e aluguéis) para o banco.

Uso:
    py manage.py importar_planilha dados_iniciais/boxes_e_clientes.csv            (só mostra o que faria)
    py manage.py importar_planilha dados_iniciais/boxes_e_clientes.csv --confirmar (grava no banco)

O arquivo é um CSV separado por ";" (o Excel abre e salva assim), com as colunas:
    sede;box;tamanho;valor;cliente;cpf_cnpj;whatsapp;email;endereco;inicio;vencimento;observacao

Regras:
- Toda linha vira um box (identificado por sede + número). Linha com cliente vira aluguel.
- Nada da planilha se perde: anotações e o que precisa ser conferido vão para a
  observação do box (aparece na tela de Boxes).
- Tamanho vazio: estimado pelo valor, comparando com o catálogo da unidade.
- Vencimento vazio: estimado pelo dia da data de início.
- As mensalidades só passam a ser geradas a partir do próximo vencimento (o que
  já venceu ficou controlado na planilha).
- Pode rodar de novo: atualiza o que já existe em vez de duplicar.
"""

import csv
import re
import unicodedata
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand, CommandError
from django.core.validators import validate_email
from django.db import transaction

from boxes import cobranca
from boxes.models import (
    DIAS_VENCIMENTO, Box, Cliente, Comunicado, Contrato, EnvioComunicado, Interessado, Mensalidade, Sede, TipoBox,
)
from boxes.validators import somente_digitos, validar_documento

COLUNAS = [
    "sede", "box", "tamanho", "valor", "cliente", "cpf_cnpj", "whatsapp", "email",
    "endereco", "inicio", "vencimento", "observacao",
]
COMPROVANTE = "comprovantes/importacao/planilha-de-acompanhamento.pdf"
MINUSCULAS = {"de", "da", "do", "das", "dos", "e", "em"}
SIGLAS = {"ME", "S/A", "S/A.", "SA", "IFP", "RPG", "KR4", "EIRELI", "EPP"}


def sem_acento(texto):
    return "".join(c for c in unicodedata.normalize("NFD", texto or "") if unicodedata.category(c) != "Mn").lower()


def nome_bonito(nome):
    """'ANA DE SOUZA LTDA' -> 'Ana de Souza Ltda'. Nomes já em maiúsc./minúsc. ficam como estão."""
    nome = " ".join((nome or "").split())
    if not nome or nome != nome.upper():
        return nome
    palavras = []
    for i, p in enumerate(nome.split(" ")):
        if p in SIGLAS or any(c.isdigit() for c in p):
            palavras.append(p)
        elif i and p.lower() in MINUSCULAS:
            palavras.append(p.lower())
        else:
            palavras.append(re.sub(r"[^\W\d_]+", lambda m: m.group(0).capitalize(), p.lower(), count=1))
    return " ".join(palavras)


def ler_valor(texto):
    texto = (texto or "").replace("R$", "").replace(" ", "").replace("\xa0", "")
    if not texto:
        return None
    if "," in texto:
        texto = texto.replace(".", "").replace(",", ".")
    try:
        return Decimal(texto).quantize(Decimal("0.01"))
    except InvalidOperation:
        return None


def ler_data(texto):
    texto = re.sub(r"\s", "", texto or "")
    for formato in ("%d/%m/%Y", "%d/%m/%y", "%Y-%m-%d"):
        try:
            return datetime.strptime(texto, formato).date()
        except ValueError:
            pass
    return None


def dia_permitido(dia):
    """Primeiro dia de vencimento do sistema (5, 10, ..., 30) igual ou depois do dia informado."""
    return next((d for d in DIAS_VENCIMENTO if d >= dia), DIAS_VENCIMENTO[-1])


def telefone_br(texto):
    """Primeiro número brasileiro (DDD + número). Devolve (número, aviso)."""
    texto = (texto or "").strip()
    if not texto:
        return "", None
    if "+" in texto and "+55" not in texto:
        return "", f"Telefone do exterior: {texto}"
    primeiro = re.split(r"/| - |;", texto)[0]
    digitos = somente_digitos(primeiro)
    if len(digitos) in (12, 13) and digitos.startswith("55"):
        digitos = digitos[2:]
    if len(digitos) in (10, 11) and digitos[0] != "0":
        return digitos, None
    return "", f"Telefone da planilha incompleto ou inválido: {texto}"


def email_valido(texto):
    primeiro = re.split(r"[,;/ ]+", (texto or "").strip())[0].lower()
    if not primeiro:
        return "", None
    try:
        validate_email(primeiro)
        return primeiro, None
    except ValidationError:
        return "", f"E-mail da planilha inválido: {primeiro}"


def documento(texto):
    digitos = somente_digitos(texto)
    if not (texto or "").strip():
        return "", None
    try:
        validar_documento(digitos)
        return digitos, None
    except ValidationError:
        return "", f"CPF/CNPJ da planilha inválido: {texto.strip()}"


def estimar_tipo(tipos, valor):
    """
    Tamanho do catálogo pelo valor. Devolve (tipo, certeza): certeza quando o valor é o do
    catálogo ou ele com 10% de desconto; senão, o menor tamanho que custa pelo menos isso
    (contratos antigos têm preço abaixo da tabela atual).
    """
    if not valor:
        return None, False
    for t in tipos:
        if valor in (t.valor, (t.valor * Decimal("0.9")).quantize(Decimal("0.01"))):
            return t, True
    maiores = [t for t in tipos if t.valor >= valor]
    tipo = min(maiores, key=lambda t: t.valor) if maiores else max(tipos, key=lambda t: t.valor, default=None)
    return tipo, False


def primeiro_mes_cobrado(dia, inicio):
    """Mês da 1ª mensalidade gerada pelo sistema: o próximo vencimento a partir de hoje."""
    hoje = cobranca.hoje()
    mes = cobranca.inicio_do_mes(hoje)
    if cobranca.data_vencimento(mes, dia) < hoje:
        mes = cobranca.proximo_mes(mes)
    return max(mes, cobranca.inicio_do_mes(inicio))


def comprovante_da_planilha():
    """PDF único usado como 'comprovante' dos aluguéis que vieram da planilha."""
    if not default_storage.exists(COMPROVANTE):
        from io import BytesIO

        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas

        buffer = BytesIO()
        c = canvas.Canvas(buffer, pagesize=A4)
        c.setFont("Helvetica-Bold", 14)
        c.drawString(60, 780, "Newbox - Aluguel importado da planilha de acompanhamento")
        c.setFont("Helvetica", 11)
        c.drawString(60, 755, f"Registrado no sistema em {date.today():%d/%m/%Y}.")
        c.drawString(60, 737, "O comprovante do 1º pagamento não foi digitalizado; o controle era feito na planilha.")
        c.save()
        default_storage.save(COMPROVANTE, ContentFile(buffer.getvalue()))
    return COMPROVANTE


class Command(BaseCommand):
    help = "Importa boxes, clientes e aluguéis da planilha de acompanhamento (CSV separado por ';')."

    def add_arguments(self, parser):
        parser.add_argument("arquivo", help="Caminho do CSV (ex.: dados_iniciais/boxes_e_clientes.csv)")
        parser.add_argument("--confirmar", action="store_true", help="Grava no banco (sem isso, só mostra o resultado)")
        parser.add_argument(
            "--apagar-dados-de-exemplo", action="store_true",
            help="Antes de importar, apaga TODOS os boxes, clientes, contratos, mensalidades, lista de espera "
                 "e comunicados (use quando o banco só tem os dados de teste).",
        )

    def handle(self, arquivo, confirmar, apagar_dados_de_exemplo, **_):
        caminho = Path(arquivo)
        if not caminho.exists():
            raise CommandError(f"Arquivo não encontrado: {caminho}")
        linhas = self.ler_csv(caminho)

        if Box.objects.filter(numero="").exists() and not apagar_dados_de_exemplo:
            raise CommandError(
                "O banco tem boxes sem número (dados de exemplo). Rode de novo com --apagar-dados-de-exemplo "
                "para começar só com os dados da planilha."
            )

        try:
            with transaction.atomic():
                if apagar_dados_de_exemplo:
                    self.apagar_tudo()
                resumo = self.importar(linhas)
                if not confirmar:
                    raise _Simulacao(resumo)
        except _Simulacao as s:
            resumo = s.resumo
            self.mostrar(resumo)
            self.stdout.write(self.style.WARNING(
                "\nSIMULAÇÃO: nada foi gravado. Confira acima e rode de novo com --confirmar para gravar."
            ))
            return
        self.mostrar(resumo)
        self.stdout.write(self.style.SUCCESS("\nPronto! Dados gravados no banco."))

    # ---------- leitura ----------

    def ler_csv(self, caminho):
        bruto = caminho.read_bytes()
        try:
            texto = bruto.decode("utf-8-sig")
        except UnicodeDecodeError:
            texto = bruto.decode("cp1252")  # CSV salvo pelo Excel no Windows
        leitor = csv.DictReader(texto.splitlines(), delimiter=";")
        cabecalho = [sem_acento(c).strip() for c in (leitor.fieldnames or [])]
        faltando = [c for c in COLUNAS if c not in cabecalho]
        if faltando:
            raise CommandError(f"Colunas faltando no CSV: {', '.join(faltando)}")
        linhas = []
        for numero, linha in enumerate(leitor, start=2):
            linha = {sem_acento(k).strip(): (v or "").strip() for k, v in linha.items() if k}
            if any(linha.values()):
                linhas.append((numero, linha))
        return linhas

    # ---------- gravação ----------

    def apagar_tudo(self):
        EnvioComunicado.objects.all().delete()
        Comunicado.objects.all().delete()
        Interessado.objects.all().delete()
        Mensalidade.objects.all().delete()
        Contrato.objects.all().delete()
        Box.objects.all().delete()
        Cliente.objects.all().delete()

    def importar(self, linhas):
        sedes = {sem_acento(s.nome): s for s in Sede.objects.all()}
        catalogo = {s.id: list(TipoBox.objects.filter(sede=s)) for s in sedes.values()}
        resumo = {"boxes": 0, "alugados": 0, "livres": 0, "clientes": set(), "conferir": [], "erros": []}
        clientes_por_doc, clientes_por_nome = {}, {}
        comprovante = comprovante_da_planilha()

        for n, l in linhas:
            sede = sedes.get(sem_acento(l["sede"]).replace("sede", "").strip()) or sedes.get(sem_acento(l["sede"]))
            numero = " ".join(l["box"].split())
            if not sede or not numero:
                resumo["erros"].append(f"Linha {n}: sede ou número do box não reconhecido ({l['sede']!r}, {l['box']!r}).")
                continue
            avisos = []

            # Tamanho e valor
            valor = ler_valor(l["valor"])
            tipos = catalogo[sede.id]
            tipo = next((t for t in tipos if sem_acento(t.codigo) == sem_acento(l["tamanho"])), None)
            tamanho = tipo.codigo if tipo else l["tamanho"]
            if not tamanho:
                tipo, certeza = estimar_tipo(tipos, valor)
                if tipo:
                    tamanho = tipo.codigo
                    if not certeza:
                        avisos.append(f"Tamanho {tipo.codigo} estimado pelo valor (conferir)")
                else:
                    tamanho = "A definir"
                    avisos.append("Tamanho a definir")
            if valor is None:
                valor = tipo.valor if tipo else Decimal("0")
                avisos.append(f"Valor do catálogo ({tipo.codigo})" if tipo else "Valor a definir")

            box = Box.objects.filter(sede=sede, numero=numero).first() or Box(sede=sede, numero=numero)
            box.tipo, box.tamanho, box.valor = tipo, tamanho, valor

            cliente = None
            if l["cliente"]:
                cliente, inicio, dia = self.dados_do_aluguel(l, avisos, clientes_por_doc, clientes_por_nome)
                if box.pk and box.cliente_id and box.cliente_id != cliente.pk:
                    resumo["erros"].append(
                        f"{sede.nome} box {numero}: já está alugado para {box.cliente} no sistema; linha ignorada."
                    )
                    continue

            box.observacao = "; ".join(filter(None, [l["observacao"], *avisos]))
            if cliente:
                novo_aluguel = box.cliente_id != cliente.pk
                box.cliente, box.dia_vencimento, box.alugado_em = cliente, dia, inicio
                box.anexo_pagamento = box.anexo_pagamento.name or comprovante
                if novo_aluguel or not box.cobranca_desde:
                    box.cobranca_desde = primeiro_mes_cobrado(dia, inicio)
                box.save()
                contrato = box.contratos.filter(fim__isnull=True).first() or Contrato(box=box)
                contrato.cliente, contrato.tamanho, contrato.valor = cliente, box.tamanho, box.valor
                contrato.dia_vencimento, contrato.inicio = dia, inicio
                contrato.save()
                resumo["alugados"] += 1
                resumo["clientes"].add(cliente.pk)
            else:
                box.save()
                resumo["livres"] += 1
            resumo["boxes"] += 1
            if avisos or l["observacao"].upper().startswith("PENDENTE"):
                resumo["conferir"].append(f"{sede.nome} box {numero}: {box.observacao}")
        return resumo

    def dados_do_aluguel(self, l, avisos, por_doc, por_nome):
        nome = nome_bonito(l["cliente"])
        doc, aviso_doc = documento(l["cpf_cnpj"])
        telefone, aviso_tel = telefone_br(l["whatsapp"])
        email, aviso_email = email_valido(l["email"])
        avisos += [a for a in (aviso_doc, aviso_tel, aviso_email) if a]

        inicio = ler_data(l["inicio"])
        if not inicio:
            inicio = cobranca.hoje()
            avisos.append("Data de início não informada (usada a data da importação)")
        dia = int(l["vencimento"]) if l["vencimento"].isdigit() else None
        if dia not in DIAS_VENCIMENTO:
            estimado = dia_permitido(dia or inicio.day)
            avisos.append(
                f"Vencimento estimado: dia {estimado}" if dia is None
                else f"Vencimento dia {dia} da planilha virou dia {estimado}"
            )
            dia = estimado

        chave_nome = sem_acento(nome)
        cliente = (por_doc.get(doc) if doc else None) or por_nome.get(chave_nome)
        if not cliente:
            cliente = (Cliente.objects.filter(cpf=doc).first() if doc else None) or \
                Cliente.objects.filter(nome__iexact=nome, cpf="").first() or Cliente()
        cliente.nome = nome
        cliente.cpf = doc or cliente.cpf
        cliente.telefone = telefone or cliente.telefone
        cliente.email = email or cliente.email
        cliente.endereco = " ".join(l["endereco"].split()) or cliente.endereco
        cliente.ativo, cliente.excluido_em = True, None
        cliente.save()
        if doc:
            por_doc[doc] = cliente
        por_nome[chave_nome] = cliente
        return cliente, inicio, dia

    # ---------- relatório ----------

    def mostrar(self, r):
        self.stdout.write(self.style.MIGRATE_HEADING("\nResultado da importação"))
        self.stdout.write(f"  Boxes: {r['boxes']} ({r['alugados']} alugados, {r['livres']} livres)")
        self.stdout.write(f"  Clientes: {len(r['clientes'])}")
        if r["erros"]:
            self.stdout.write(self.style.ERROR(f"\nNão importados ({len(r['erros'])}):"))
            for e in r["erros"]:
                self.stdout.write(f"  - {e}")
        if r["conferir"]:
            self.stdout.write(self.style.WARNING(
                f"\nPara conferir no sistema ({len(r['conferir'])}) - aparece na observação de cada box:"
            ))
            for c in r["conferir"]:
                self.stdout.write(f"  - {c}")


class _Simulacao(Exception):
    """Usada para desfazer tudo no modo simulação (sem --confirmar)."""

    def __init__(self, resumo):
        self.resumo = resumo
