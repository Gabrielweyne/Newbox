"""
Catálogo de tamanhos de cada unidade, conforme os PDFs "Catálogo Newbox Sede"
e "Catálogo Newbox Cocó". Também grava WhatsApp, nome público e CEP.
"""

from decimal import Decimal as D

from django.db import migrations

# (código, área m², volume m³, comprimento, largura, altura, sugestão de uso, valor)
SEDE_CAMBEBA = [
    ("P1", "2.4", "4.08", "1.2", "2", "1.7", "Documentos, malas e pequenos itens", "300"),
    ("P2", "3.6", "6.12", "2.4", "1.5", "1.7", "Caixas e arquivos (home office)", "400"),
    ("P3", "4.41", "9.26", "2.1", "2.1", "2.1", "Mudanças de estúdios ou 1 quarto", "450"),
    ("M1 SUP", "4.2", "11.34", "2", "2.1", "2.7", "Hobbies e equipamentos para prática de esporte", "400"),
    ("M2", "4.8", "12.96", "2.4", "2", "2.7", "E-commerce ou pequenos estoques", "500"),
    ("M3", "6.3", "13.86", "3", "2.1", "2.2", "Móveis de 1 a 2 quartos em obras", "650"),
    ("G1", "9.45", "18.9", "4.5", "2.1", "2", "Estoque médio ou apê de 2 quartos", "750"),
    ("G2", "14.4", "36", "6", "2.4", "2.5", "Itens de eventos ou alta temporada", "850"),
]
COCO = [
    ("P1", "2.25", "6.5", "1.5", "1.5", "2.9", "Documentos, malas e pequenos itens", "400"),
    ("P2", "3.5", "10.05", "2.3", "1.5", "2.9", "Caixas e arquivos (home office)", "450"),
    ("P3", "4", "13.3", "2", "2", "2.9", "Mudanças de estúdios ou 1 quarto", "550"),
    ("M1", "4.8", "13.9", "2.2", "2.2", "2.9", "Hobbies e equipamentos para prática de esporte", "600"),
    ("M2", "5.25", "15.22", "3.5", "1.5", "2.9", "E-commerce ou pequenos estoques", "650"),
    ("M3", "6", "19.14", "3.3", "1.8", "2.9", "Móveis de 1 a 2 quartos em obras", "800"),
    ("G1", "6.6", "19.14", "2.2", "3", "2.9", "Estoque médio ou apê de 2 quartos", "850"),
    ("G2", "7", "20.3", "3.5", "2", "2.9", "Itens de eventos ou alta temporada", "950"),
    ("G3", "9.6", "27.8", "3.2", "3", "2.9", "Mudança de casas grandes (3 quartos)", "1250"),
    ("G4", "20.5", "59.4", "5.5", "3.7", "2.9", "Grande estoque e ferramentas de construção", "1537"),
]
UNIDADES = {
    "Cambeba": {
        "nome_publico": "Newbox Sede (Cambeba)",
        "whatsapp": "5585999620414",
        "endereco": "Rua Ciro Monteiro, 368 - Cambeba, Fortaleza - CE, 60822-285 (a 500 m do Shopping Via Sul)",
        "catalogo": SEDE_CAMBEBA,
    },
    "Cocó": {
        "nome_publico": "Newbox Cocó",
        "whatsapp": "5585997500544",
        "endereco": "Av. Engenheiro Santana Júnior, 1901 - Cocó, Fortaleza - CE, 60192-205",
        "catalogo": COCO,
    },
}
ENDERECOS_ANTIGOS = {
    "Cambeba": ["Rua Ciro Monteiro, 368 - Cambeba, Fortaleza - CE (a 500 m do Shopping Via Sul)",
                "Cambeba, Fortaleza - CE (endereço completo a definir)"],
    "Cocó": ["Av. Engenheiro Santana Júnior, 1901 - Cocó, Fortaleza - CE",
             "Cocó, Fortaleza - CE (endereço completo a definir)"],
}


def carregar(apps, schema_editor):
    Sede = apps.get_model("boxes", "Sede")
    TipoBox = apps.get_model("boxes", "TipoBox")
    for nome, dados in UNIDADES.items():
        sede = Sede.objects.filter(nome=nome).first()
        if not sede:
            continue
        sede.nome_publico = sede.nome_publico or dados["nome_publico"]
        sede.whatsapp = sede.whatsapp or dados["whatsapp"]
        if sede.endereco in ENDERECOS_ANTIGOS[nome]:
            sede.endereco = dados["endereco"]
        sede.save()
        for ordem, (codigo, area, vol, c, l, a, uso, valor) in enumerate(dados["catalogo"], start=1):
            TipoBox.objects.get_or_create(
                sede=sede, codigo=codigo,
                defaults=dict(area=D(area), volume=D(vol), comprimento=D(c), largura=D(l), altura=D(a),
                              sugestao_uso=uso, valor=D(valor), ordem=ordem),
            )


def descarregar(apps, schema_editor):
    apps.get_model("boxes", "TipoBox").objects.filter(boxes__isnull=True).delete()


class Migration(migrations.Migration):
    dependencies = [("boxes", "0011_catalogo_de_tamanhos")]
    operations = [migrations.RunPython(carregar, descarregar)]
