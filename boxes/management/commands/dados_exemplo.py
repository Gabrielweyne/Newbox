"""
Cria dados de exemplo para testar o sistema no computador.

    python manage.py dados_exemplo            # só roda com o banco vazio
    python manage.py dados_exemplo --apagar   # APAGA tudo e recria

Usuários criados (senha de todos: Newbox#2026):
    Administrador ........ CPF 111.444.777-35
    Ana Lima (Cocó) ...... CPF 529.982.247-25
    Bruno Melo (Cambeba) . CPF 390.533.447-05
    Carla Dias (Cocó) .... CPF 153.509.460-56  (aguardando aprovação)
"""

from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from boxes import cobranca
from boxes.models import Box, Cliente, Funcionario, Interessado, Mensalidade, Sede

User = get_user_model()
SENHA = "Newbox#2026"

PDF = (
    b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
    b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
    b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 120]/Contents 4 0 R"
    b"/Resources<</Font<</F1 5 0 R>>>>>>endobj\n"
    b"4 0 obj<</Length 58>>stream\nBT /F1 14 Tf 20 60 Td (Comprovante de exemplo) Tj ET\nendstream endobj\n"
    b"5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n"
    b"trailer<</Root 1 0 R>>\n%%EOF\n"
)


def comprovante():
    return ContentFile(PDF, name="comprovante-exemplo.pdf")


class Command(BaseCommand):
    help = "Cria sedes, funcionários, clientes, boxes e mensalidades de exemplo."

    def add_arguments(self, parser):
        parser.add_argument("--apagar", action="store_true", help="Apaga os dados atuais antes.")

    @transaction.atomic
    def handle(self, *args, apagar=False, **opts):
        if not settings.DEBUG:
            raise CommandError("Por segurança, este comando só roda com DJANGO_DEBUG=1.")
        if apagar:
            Interessado.objects.all().delete()
            Mensalidade.objects.all().delete()
            Box.objects.all().delete()
            Funcionario.objects.all().delete()
            Cliente.objects.all().delete()
            User.objects.all().delete()
        elif Box.objects.exists() or User.objects.exists():
            raise CommandError("O banco já tem dados. Use --apagar para recriar do zero.")

        hoje = cobranca.hoje()
        coco, _ = Sede.objects.get_or_create(nome="Cocó", defaults={"endereco": "Cocó, Fortaleza - CE"})
        cambeba, _ = Sede.objects.get_or_create(
            nome="Cambeba", defaults={"endereco": "Rua Ciro Monteiro, 368 - Cambeba, Fortaleza - CE (a 500 m do Shopping Via Sul)"}
        )

        User.objects.create_superuser("11144477735", "admin@exemplo.com", SENHA, first_name="Administrador")
        for nome, cpf, sede, ativo in [
            ("Ana Lima", "52998224725", coco, True),
            ("Bruno Melo", "39053344705", cambeba, True),
            ("Carla Dias", "15350946056", coco, False),
        ]:
            u = User.objects.create_user(
                cpf, password=SENHA, email=f"{nome.split()[0].lower()}@exemplo.com",
                first_name=nome.split()[0], is_active=ativo,
            )
            Funcionario.objects.create(usuario=u, nome=nome, cpf=cpf, sede=sede)

        clientes = {
            n: Cliente.objects.create(nome=n)
            for n in ["Carlos Souza", "Mariana Alves", "Pedro Rocha", "Juliana Castro",
                      "Rafael Lima", "Fernanda Costa", "Lucas Martins"]
        }

        # (sede, tamanho, valor, cliente, dia de vencimento, meses alugado)
        boxes = [
            (coco, "2x2 m", 250, "Carlos Souza", 5, 3),
            (coco, "2x2 m", 250, "Mariana Alves", 10, 2),
            (coco, "3x3 m", 420, "Pedro Rocha", 15, 4),
            (coco, "3x3 m", 420, "Fernanda Costa", 25, 1),
            (coco, "4x4 m", 650, None, None, 0),
            (coco, "1x2 m", 180, None, None, 0),
            (coco, "2x3 m", 320, None, None, 0),
            (cambeba, "2x2 m", 250, "Juliana Castro", 20, 2),
            (cambeba, "3x3 m", 420, "Rafael Lima", 30, 3),
            (cambeba, "4x4 m", 650, "Lucas Martins", 10, 1),
            (cambeba, "5x5 m", 900, None, None, 0),
            (cambeba, "1x2 m", 180, None, None, 0),
        ]
        for sede, tamanho, valor, cliente, dia, meses in boxes:
            box = Box(sede=sede, tamanho=tamanho, valor=valor)
            if cliente:
                box.cliente = clientes[cliente]
                box.dia_vencimento = dia
                box.alugado_em = hoje - timedelta(days=30 * meses + 3)
                box.anexo_pagamento = comprovante()
            box.save()
            if box.alugado:
                cobranca.iniciar_aluguel(box)

        cobranca.garantir_mensalidades(ate=hoje)
        # Quase todo mundo paga em dia; deixamos alguns em aberto para ver os avisos.
        devedores = {"Carlos Souza", "Rafael Lima"}
        for m in Mensalidade.objects.filter(pago_em__isnull=True, vencimento__lt=hoje).select_related("cliente"):
            if m.cliente.nome in devedores and m.vencimento >= hoje - timedelta(days=45):
                continue
            m.pago_em = m.vencimento - timedelta(days=1)
            m.comprovante = comprovante()
            m.save()

        # Lista de espera: Rui espera um 3x3 no Cocó (libere o box do Pedro para ver o aviso);
        # Paula aceita qualquer unidade e já tem vaga de 5x5 na Cambeba.
        Interessado.objects.create(nome="Rui Barbosa", telefone="85988887777", sede=coco, tamanho="3x3 m")
        Interessado.objects.create(nome="Paula Souza", telefone="85998765432", tamanho="5x5 m",
                                   observacao="mudança em dezembro")

        self.stdout.write(self.style.SUCCESS("Dados de exemplo criados!"))
        self.stdout.write(
            f"\nSenha de todos: {SENHA}\n"
            "  Administrador ........ CPF 111.444.777-35\n"
            "  Ana Lima (Cocó) ...... CPF 529.982.247-25\n"
            "  Bruno Melo (Cambeba) . CPF 390.533.447-05\n"
            "  Carla Dias (Cocó) .... CPF 153.509.460-56 (aguardando aprovação)\n"
        )
