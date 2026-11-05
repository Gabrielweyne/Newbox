from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, transaction
from django.test import override_settings
from rest_framework.test import APITestCase

from .models import Box, Cliente, Sede


@override_settings(MEDIA_ROOT="/tmp/newbox-test-media")
class NewboxApiTests(APITestCase):
    def setUp(self):
        self.client.force_authenticate(User.objects.create_user("admin"))
        self.sede = Sede.objects.create(nome="Newbox Centro", endereco="Rua A, 100")
        self.maria = Cliente.objects.create(nome="Maria")

    def comprovante(self):
        return SimpleUploadedFile("comp.pdf", b"%PDF-1.4", content_type="application/pdf")

    def test_resumo_da_sede(self):
        Box.objects.create(sede=self.sede, tamanho="2x2", valor=250,
                           cliente=self.maria, anexo_pagamento="comprovantes/x.pdf")
        Box.objects.create(sede=self.sede, tamanho="3x3", valor=400)
        r = self.client.get(f"/api/sedes/{self.sede.id}/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(
            (r.data["numero_de_box"], r.data["alugados"], r.data["nao_alugados"]), (2, 1, 1)
        )

    def test_campos_obrigatorios(self):
        self.assertEqual(self.client.post("/api/sedes/", {"nome": "X"}).status_code, 400)
        self.assertEqual(self.client.post("/api/clientes/", {"nome": "  "}).status_code, 400)
        r = self.client.post("/api/boxes/", {"sede": self.sede.id, "valor": "10"})
        self.assertIn("tamanho", r.data)

    def test_box_alugado_exige_comprovante(self):
        r = self.client.post("/api/boxes/", {
            "sede": self.sede.id, "tamanho": "P", "valor": "10", "cliente": self.maria.id,
        })
        self.assertEqual(r.status_code, 400)
        self.assertIn("anexo_pagamento", r.data)

    def test_alugar_box_com_upload(self):
        r = self.client.post("/api/boxes/", {
            "sede": self.sede.id, "tamanho": "P", "valor": "10",
            "cliente": self.maria.id, "anexo_pagamento": self.comprovante(),
        }, format="multipart")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertTrue(r.data["alugado"])
        r = self.client.get(f"/api/boxes/?cliente={self.maria.id}")
        self.assertEqual(r.data["count"], 1)

    def test_banco_bloqueia_aluguel_incompleto(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Box.objects.create(sede=self.sede, tamanho="P", valor=10, cliente=self.maria)

    def test_nao_apaga_sede_com_boxes(self):
        Box.objects.create(sede=self.sede, tamanho="P", valor=10)
        self.assertEqual(self.client.delete(f"/api/sedes/{self.sede.id}/").status_code, 409)

    def test_exige_login(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/api/boxes/").status_code, 403)
