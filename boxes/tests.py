from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, transaction
from django.test import override_settings
from rest_framework.test import APITestCase

from .models import Box, Cliente, Funcionario, Sede


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
        self.assertEqual(self.client.get("/api/boxes/").status_code, 401)


class FuncionarioTests(APITestCase):
    CPF_VALIDO = "529.982.247-25"
    SENHA = "Caixa#Forte2026"

    def setUp(self):
        # Criadas pela migration 0003
        self.coco = Sede.objects.get(nome="Cocó")
        self.cambeba = Sede.objects.get(nome="Cambeba")

    def registrar(self, **extra):
        dados = {"nome": "Ana Lima", "cpf": self.CPF_VALIDO, "sede": self.coco.id,
                 "senha": self.SENHA, "confirmar_senha": self.SENHA, **extra}
        return self.client.post("/api/auth/registro/", dados)

    def login(self, senha=None):
        return self.client.post("/api/auth/login/",
                                {"cpf": self.CPF_VALIDO, "senha": senha or self.SENHA})

    def aprovar(self):
        User.objects.filter(username="52998224725").update(is_active=True)

    def test_sedes_disponiveis_sem_login(self):
        r = self.client.get("/api/funcionarios/sedes/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(sorted(s["nome"] for s in r.data), ["Cambeba", "Cocó"])

    def test_registro_cria_conta_pendente(self):
        r = self.registrar()
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data["cpf"], "52998224725")
        self.assertEqual(r.data["sede_nome"], "Cocó")
        self.assertFalse(r.data["aprovado"])
        self.assertNotIn("senha", r.data)
        usuario = User.objects.get(username="52998224725")
        self.assertTrue(usuario.check_password(self.SENHA))
        self.assertFalse(usuario.is_active)

    def test_campos_obrigatorios(self):
        r = self.client.post("/api/auth/registro/", {})
        self.assertEqual(set(r.data), {"nome", "cpf", "sede", "senha", "confirmar_senha"})

    def test_cpf_invalido(self):
        for cpf in ("123.456.789-00", "111.111.111-11", "123"):
            r = self.registrar(cpf=cpf)
            self.assertEqual(r.status_code, 400, cpf)
            self.assertIn("cpf", r.data)

    def test_cpf_duplicado(self):
        self.registrar()
        r = self.registrar(sede=self.cambeba.id)
        self.assertEqual(r.status_code, 400)
        self.assertIn("cpf", r.data)

    def test_senhas_diferentes_ou_fracas(self):
        self.assertIn("confirmar_senha", self.registrar(confirmar_senha="outra").data)
        self.assertIn("senha", self.registrar(senha="123", confirmar_senha="123").data)
        self.assertFalse(Funcionario.objects.exists())

    def test_login_antes_da_aprovacao(self):
        self.registrar()
        r = self.login()
        self.assertEqual(r.status_code, 403)
        self.assertIn("aprovação", r.data["detail"])

    def test_login_logout_apos_aprovacao(self):
        self.registrar()
        self.aprovar()
        self.assertEqual(self.login(senha="errada").status_code, 400)
        r = self.login()
        self.assertEqual(r.status_code, 200, r.data)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {r.data['token']}")
        eu = self.client.get("/api/auth/eu/")
        self.assertEqual(eu.data["funcionario"]["nome"], "Ana Lima")
        self.assertEqual(self.client.get("/api/boxes/").status_code, 200)
        self.assertEqual(self.client.post("/api/auth/logout/").status_code, 204)
        self.assertEqual(self.client.get("/api/boxes/").status_code, 401)

    def test_listar_exige_login(self):
        self.assertEqual(self.client.get("/api/funcionarios/").status_code, 401)
        self.registrar()
        self.client.force_authenticate(User.objects.create_user("gerente"))
        r = self.client.get("/api/funcionarios/")
        self.assertEqual(r.data["count"], 1)
