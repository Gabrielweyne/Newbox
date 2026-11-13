"""Gera o contrato de locação de box em PDF (reportlab)."""

from io import BytesIO
from pathlib import Path

from django.conf import settings
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from xml.sax.saxutils import escape

ROXO = colors.HexColor("#965ba5")
MARINHO = colors.HexColor("#23313f")
CINZA = colors.HexColor("#5b6670")
LOGO = Path(settings.BASE_DIR) / "frontend" / "src" / "assets" / "logo.png"
MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto",
         "setembro", "outubro", "novembro", "dezembro"]

estilo = {
    "titulo": ParagraphStyle("titulo", fontName="Helvetica-Bold", fontSize=14, leading=18, textColor=MARINHO,
                             alignment=TA_CENTER, spaceAfter=2),
    "sub": ParagraphStyle("sub", fontName="Helvetica", fontSize=9, textColor=CINZA, alignment=TA_CENTER),
    "secao": ParagraphStyle("secao", fontName="Helvetica-Bold", fontSize=10, textColor=ROXO,
                            spaceBefore=10, spaceAfter=4, keepWithNext=1),
    "texto": ParagraphStyle("texto", fontName="Helvetica", fontSize=9.5, leading=13.5, alignment=TA_JUSTIFY,
                            spaceAfter=6),
    "celula": ParagraphStyle("celula", fontName="Helvetica", fontSize=9, leading=12),
    "rotulo": ParagraphStyle("rotulo", fontName="Helvetica-Bold", fontSize=8, leading=11, textColor=CINZA),
    "centro": ParagraphStyle("centro", fontName="Helvetica", fontSize=9, alignment=TA_CENTER, leading=12),
    "rotulo_centro": ParagraphStyle("rotulo_centro", fontName="Helvetica-Bold", fontSize=8, leading=11,
                                    textColor=CINZA, alignment=TA_CENTER),
}


def moeda(valor):
    inteiro, centavos = f"{valor:.2f}".split(".")
    return f"R$ {int(inteiro):,}".replace(",", ".") + f",{centavos}"


def data_br(d):
    return f"{d:%d/%m/%Y}" if d else ""


def data_extenso(d):
    return f"{d.day} de {MESES[d.month - 1]} de {d.year}"


def cpf_br(cpf):
    if len(cpf or "") == 14:
        return f"{cpf[:2]}.{cpf[2:5]}.{cpf[5:8]}/{cpf[8:12]}-{cpf[12:]}"
    return f"{cpf[:3]}.{cpf[3:6]}.{cpf[6:9]}-{cpf[9:]}" if len(cpf or "") == 11 else "não informado"


def tel_br(t):
    if len(t or "") == 11:
        return f"({t[:2]}) {t[2:7]}-{t[7:]}"
    if len(t or "") == 10:
        return f"({t[:2]}) {t[2:6]}-{t[6:]}"
    return "não informado"


def tabela(linhas, larguras):
    dados = [[Paragraph(escape(r), estilo["rotulo"]), Paragraph(escape(str(v)), estilo["celula"])] for r, v in linhas]
    t = Table(dados, colWidths=larguras)
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, colors.HexColor("#ece0f0")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f6f0f8")),
        ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#d9c1e1")),
    ]))
    return t


def clausulas(contrato):
    texto = _render(contrato)
    blocos = []
    for paragrafo in [p.strip() for p in texto.split("\n\n") if p.strip()]:
        if paragrafo.startswith("##"):
            blocos.append(Paragraph(escape(paragrafo.lstrip("# ").strip()), estilo["secao"]))
        else:
            blocos.append(Paragraph(escape(" ".join(paragrafo.split())), estilo["texto"]))
    return blocos


def _render(contrato):
    from django.template import engines

    box = contrato.box
    contexto = {
        "box": box.numero or box.pk, "tamanho": contrato.tamanho, "unidade": box.sede.nome, "endereco": box.sede.endereco,
        "valor": moeda(contrato.valor), "dia_vencimento": contrato.dia_vencimento,
        "inicio": data_br(contrato.inicio), "fim": data_br(contrato.fim),
        "cidade": settings.NEWBOX_CIDADE, "empresa": settings.NEWBOX_RAZAO_SOCIAL,
    }
    template = engines["django"].from_string(
        "{% autoescape off %}" + Path(_caminho_clausulas()).read_text(encoding="utf-8") + "{% endautoescape %}"
    )
    return template.render(contexto)


def _caminho_clausulas():
    return Path(__file__).resolve().parent / "templates" / "contrato" / "clausulas.txt"


def rodape(canvas, doc, numero):
    canvas.saveState()
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(CINZA)
    canvas.drawString(20 * mm, 12 * mm, f"Contrato nº {numero} · {settings.NEWBOX_RAZAO_SOCIAL}")
    canvas.drawRightString(A4[0] - 20 * mm, 12 * mm, f"Página {doc.page}")
    canvas.setStrokeColor(ROXO)
    canvas.setLineWidth(2)
    canvas.line(0, A4[1] - 4, A4[0], A4[1] - 4)
    canvas.restoreState()


def gerar_pdf_contrato(contrato):
    from . import cobranca

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=16 * mm, bottomMargin=20 * mm,
        title=f"Contrato {contrato.numero}", author=settings.NEWBOX_RAZAO_SOCIAL,
    )
    box, cliente, sede = contrato.box, contrato.cliente, contrato.box.sede
    largura = A4[0] - 40 * mm
    partes = []

    if LOGO.exists():
        img = Image(str(LOGO))
        img.drawHeight = 14 * mm
        img.drawWidth = img.imageWidth * (14 * mm / img.imageHeight)
        partes += [img, Spacer(1, 5 * mm)]
    partes += [
        Paragraph("CONTRATO DE LOCAÇÃO DE BOX (SELF STORAGE)", estilo["titulo"]),
        Paragraph(f"Contrato nº {contrato.numero}" + ("" if contrato.ativo else " · ENCERRADO"), estilo["sub"]),
        Spacer(1, 6 * mm),
    ]

    empresa = settings.NEWBOX_RAZAO_SOCIAL + (f" · CNPJ {settings.NEWBOX_CNPJ}" if settings.NEWBOX_CNPJ else "")
    partes += [
        Paragraph("PARTES", estilo["secao"]),
        tabela([("LOCADORA", empresa), ("UNIDADE", f"{sede.nome} – {sede.endereco}")], [32 * mm, largura - 32 * mm]),
        Spacer(1, 3 * mm),
        tabela([
            ("LOCATÁRIO(A)", cliente.nome),
            ("CNPJ" if len(cliente.cpf) == 14 else "CPF", cpf_br(cliente.cpf)),
            ("ENDEREÇO", cliente.endereco or "não informado"),
            ("WHATSAPP", tel_br(cliente.telefone)),
            ("E-MAIL", cliente.email or "não informado"),
        ], [32 * mm, largura - 32 * mm]),
        Paragraph("DADOS DA LOCAÇÃO", estilo["secao"]),
        tabela([
            ("BOX", f"nº {box.numero or box.pk} – {contrato.tamanho}"),
            ("VALOR MENSAL", moeda(contrato.valor)),
            ("VENCIMENTO", f"todo dia {contrato.dia_vencimento}"),
            ("INÍCIO", data_br(contrato.inicio)),
            ("SITUAÇÃO", f"Ativo · {cobranca.duracao(contrato.inicio)} de aluguel" if contrato.ativo
             else f"Encerrado em {data_br(contrato.fim)} · {cobranca.duracao(contrato.inicio, contrato.fim)} de aluguel"),
        ], [32 * mm, largura - 32 * mm]),
        Spacer(1, 2 * mm),
    ]
    partes += clausulas(contrato)

    col = largura / 2 - 8 * mm
    assinaturas = Table(
        [["", "", ""],
         [Paragraph(escape(settings.NEWBOX_RAZAO_SOCIAL), estilo["centro"]), "",
          Paragraph(escape(cliente.nome), estilo["centro"])],
         [Paragraph("LOCADORA", estilo["rotulo_centro"]), "", Paragraph("LOCATÁRIO(A)", estilo["rotulo_centro"])]],
        colWidths=[col, 16 * mm, col], rowHeights=[16 * mm, None, None], hAlign="CENTER",
    )
    assinaturas.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (0, 0), 0.8, MARINHO),
        ("LINEBELOW", (2, 0), (2, 0), 0.8, MARINHO),
    ]))
    partes.append(KeepTogether([
        Spacer(1, 6 * mm),
        Paragraph(f"{settings.NEWBOX_CIDADE}/CE, {data_extenso(contrato.inicio)}.", estilo["texto"]),
        Spacer(1, 4 * mm),
        assinaturas,
    ]))

    doc.build(partes, onFirstPage=lambda c, d: rodape(c, d, contrato.numero),
              onLaterPages=lambda c, d: rodape(c, d, contrato.numero))
    return buffer.getvalue()
