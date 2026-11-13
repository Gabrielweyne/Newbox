from django.contrib.auth.models import User
from django.core import mail
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, transaction
from django.test import override_settings
from rest_framework.test import APITestCase

from .models import Box, Cliente, Funcionario, Sede


@override_settings(MEDIA_ROOT="/tmp/newbox-test-media")
class NewboxApiTests(APITestCase):
    def setUp(self):
        self.client.force_authenticate(User.objects.create_user("admin", is_staff=True))
        self.sede = Sede.objects.create(nome="Newbox Centro", endereco="Rua A, 100")
        self.maria = Cliente.objects.create(nome="Maria")

    def comprovante(self):
        return SimpleUploadedFile("comp.pdf", b"%PDF-1.4", content_type="application/pdf")

    def test_resumo_da_sede(self):
        Box.objects.create(sede=self.sede, tamanho="2x2", valor=250,
                           cliente=self.maria, anexo_pagamento="comprovantes/x.pdf",
                           dia_vencimento=10, alugado_em="2026-11-01")
        Box.objects.create(sede=self.sede, tamanho="3x3", valor=400)
        r = self.client.get(f"/api/sedes/{self.sede.id}/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(
            (r.data["numero_de_box"], r.data["alugados"], r.data["nao_alugados"]), (2, 1, 1)
        )

    def test_campos_obrigatorios(self):
        self.assertEqual(self.client.post("/api/sedes/", {"nome": "X"}).status_code, 400)
        box = Box.objects.create(sede=self.sede, tamanho="P", valor=10)
        self.assertIn("nome", self.client.post(f"/api/boxes/{box.id}/alugar/", {"nome": "  "}).data)
        self.assertIn("tamanho", self.client.patch(f"/api/boxes/{box.id}/", {"tamanho": " "}).data)

    def test_box_alugado_exige_comprovante(self):
        box = Box.objects.create(sede=self.sede, tamanho="P", valor=10)
        r = self.client.patch(f"/api/boxes/{box.id}/", {"cliente": self.maria.id, "dia_vencimento": 10})
        self.assertEqual(r.status_code, 400)
        self.assertIn("anexo_pagamento", r.data)

    def test_alugar_box_com_upload(self):
        box = Box.objects.create(sede=self.sede, tamanho="P", valor=10)
        r = self.client.patch(f"/api/boxes/{box.id}/", {
            "cliente": self.maria.id, "anexo_pagamento": self.comprovante(), "dia_vencimento": 15,
        }, format="multipart")
        self.assertEqual(r.status_code, 200, r.data)
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
                 "email": "Ana@Exemplo.com", "senha": self.SENHA, "confirmar_senha": self.SENHA, **extra}
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
        self.assertEqual(r.data["email"], "ana@exemplo.com")
        usuario = User.objects.get(username="52998224725")
        self.assertEqual(usuario.email, "ana@exemplo.com")
        self.assertTrue(usuario.check_password(self.SENHA))
        self.assertFalse(usuario.is_active)

    def test_campos_obrigatorios(self):
        r = self.client.post("/api/auth/registro/", {})
        self.assertEqual(set(r.data), {"nome", "cpf", "email", "sede", "senha", "confirmar_senha"})

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

    def test_email_invalido_ou_duplicado(self):
        self.assertIn("email", self.registrar(email="nao-e-email").data)
        self.registrar()
        r = self.registrar(cpf="111.444.777-35", email="ANA@exemplo.com")
        self.assertEqual(r.status_code, 400)
        self.assertIn("email", r.data)

    def test_senhas_diferentes_ou_fracas(self):
        self.assertIn("confirmar_senha", self.registrar(confirmar_senha="outra").data)
        self.assertIn("senha", self.registrar(senha="123", confirmar_senha="123").data)
        self.assertFalse(Funcionario.objects.exists())

    def test_listar_exige_login(self):
        self.assertEqual(self.client.get("/api/funcionarios/").status_code, 401)
        self.registrar()
        self.client.force_authenticate(User.objects.create_user("gerente", is_staff=True))
        r = self.client.get("/api/funcionarios/")
        self.assertEqual(r.data["count"], 1)


@override_settings(MEDIA_ROOT="/tmp/newbox-test-media")
class AcessoPorSedeTests(APITestCase):
    """Cada funcionário só mexe na própria sede; o admin mexe em todas."""

    def setUp(self):
        self.coco = Sede.objects.get(nome="Cocó")
        self.cambeba = Sede.objects.get(nome="Cambeba")
        self.ana = self.funcionario("Ana", "52998224725", self.coco)
        self.beto = self.funcionario("Beto", "11144477735", self.cambeba)
        self.cliente_x = Cliente.objects.create(nome="Cliente X")
        self.box_coco = Box.objects.create(sede=self.coco, tamanho="P", valor=100)
        self.box_cambeba = Box.objects.create(sede=self.cambeba, tamanho="G", valor=300)

    def funcionario(self, nome, cpf, sede):
        usuario = User.objects.create_user(cpf, password="x")
        Funcionario.objects.create(usuario=usuario, nome=nome, cpf=cpf, sede=sede)
        return usuario

    def ids(self, url):
        return sorted(item["id"] for item in self.client.get(url).data["results"])

    def test_funcionario_ve_so_a_propria_sede(self):
        self.client.force_authenticate(self.ana)
        self.assertEqual(self.ids("/api/boxes/"), [self.box_coco.id])
        self.assertEqual(self.ids("/api/sedes/"), [self.coco.id])
        self.assertEqual([f["nome"] for f in self.client.get("/api/funcionarios/").data["results"]], ["Ana"])
        # Mesmo pedindo a outra sede pelo filtro, não vem nada
        self.assertEqual(self.ids(f"/api/boxes/?sede={self.cambeba.id}"), [])

    def test_funcionario_nao_acessa_box_de_outra_sede(self):
        self.client.force_authenticate(self.ana)
        url = f"/api/boxes/{self.box_cambeba.id}/"
        self.assertEqual(self.client.get(url).status_code, 404)
        self.assertEqual(self.client.patch(url, {"valor": "1"}).status_code, 404)
        self.assertEqual(self.client.delete(url).status_code, 405)  # ninguém exclui box
        self.assertEqual(self.client.get(f"/api/sedes/{self.cambeba.id}/").status_code, 404)

    def test_ninguem_cria_box_pelo_site(self):
        # Boxes já existem; são cadastrados direto no banco, não pelo site
        for usuario in (self.ana, User.objects.create_user("chefe2", is_staff=True)):
            self.client.force_authenticate(usuario)
            r = self.client.post("/api/boxes/", {"sede": self.coco.id, "tamanho": "M", "valor": "200"})
            self.assertEqual(r.status_code, 405)
        self.assertEqual(Box.objects.count(), 2)

    def test_funcionario_nao_move_box_para_outra_sede(self):
        self.client.force_authenticate(self.ana)
        r = self.client.patch(f"/api/boxes/{self.box_coco.id}/", {"sede": self.cambeba.id})
        self.assertEqual(r.status_code, 400)
        self.box_coco.refresh_from_db()
        self.assertEqual(self.box_coco.sede, self.coco)

    def test_funcionario_aluga_box_da_sede(self):
        self.client.force_authenticate(self.ana)
        r = self.client.patch(f"/api/boxes/{self.box_coco.id}/", {
            "cliente": self.cliente_x.id, "dia_vencimento": 20,
            "anexo_pagamento": SimpleUploadedFile("c.pdf", b"%PDF", content_type="application/pdf"),
        }, format="multipart")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertTrue(r.data["alugado"])

    def test_funcionario_nao_altera_cadastro_de_sede(self):
        self.client.force_authenticate(self.ana)
        r = self.client.patch(f"/api/sedes/{self.coco.id}/", {"endereco": "Outro"})
        self.assertEqual(r.status_code, 403)
        self.assertEqual(self.client.post("/api/sedes/", {"nome": "Nova", "endereco": "X"}).status_code, 403)

    def test_clientes_sao_compartilhados(self):
        self.client.force_authenticate(self.beto)
        self.assertEqual(self.client.get(f"/api/clientes/{self.cliente_x.id}/").status_code, 200)

    def test_admin_ve_tudo(self):
        self.client.force_authenticate(User.objects.create_user("chefe", is_staff=True))
        self.assertEqual(self.ids("/api/boxes/"), sorted([self.box_coco.id, self.box_cambeba.id]))
        self.assertEqual(len(self.ids("/api/sedes/")), 2)

    def test_usuario_sem_vinculo_nao_acessa(self):
        self.client.force_authenticate(User.objects.create_user("qualquer"))
        self.assertEqual(self.client.get("/api/boxes/").status_code, 403)
        self.assertEqual(self.client.get("/api/clientes/").status_code, 403)


class AutenticacaoJWTTests(APITestCase):
    CPF = "529.982.247-25"
    SENHA = "Caixa#Forte2026"

    def setUp(self):
        cache.clear()  # zera o limite de tentativas de login
        self.cambeba = Sede.objects.get(nome="Cambeba")
        self.usuario = User.objects.create_user("52998224725", password=self.SENHA)
        Funcionario.objects.create(
            usuario=self.usuario, nome="Ana Lima", cpf="52998224725", sede=self.cambeba
        )
        Box.objects.create(sede=self.cambeba, tamanho="P", valor=10)

    def login(self, cpf=None, senha=None):
        return self.client.post("/api/auth/login/", {"cpf": cpf or self.CPF, "senha": senha or self.SENHA})

    def usar(self, access):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    def test_login_devolve_tokens_e_sede(self):
        r = self.login()
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(set(r.data) >= {"access", "refresh", "sede", "funcionario"}, True)
        self.assertEqual(r.data["sede"], {"id": self.cambeba.id, "nome": "Cambeba"})
        self.usar(r.data["access"])
        boxes = self.client.get("/api/boxes/").data["results"]
        self.assertEqual({b["sede"] for b in boxes}, {self.cambeba.id})

    def test_token_tem_dados_da_sede(self):
        from rest_framework_simplejwt.tokens import AccessToken
        token = AccessToken(self.login().data["access"])
        self.assertEqual(token["sede_nome"], "Cambeba")
        self.assertEqual(token["cpf"], "52998224725")

    def test_credenciais_erradas(self):
        self.assertEqual(self.login(senha="errada").status_code, 401)
        self.assertEqual(self.login(cpf="111.444.777-35").status_code, 401)

    def test_conta_pendente(self):
        self.usuario.is_active = False
        self.usuario.save()
        r = self.login()
        self.assertEqual(r.status_code, 403)
        self.assertIn("aprovação", r.data["detail"])

    def test_sem_token_ou_token_invalido(self):
        self.assertEqual(self.client.get("/api/boxes/").status_code, 401)
        self.usar("lixo")
        self.assertEqual(self.client.get("/api/boxes/").status_code, 401)

    def test_refresh_rotaciona_e_invalida_o_antigo(self):
        refresh = self.login().data["refresh"]
        r = self.client.post("/api/auth/token/refresh/", {"refresh": refresh})
        self.assertEqual(r.status_code, 200)
        self.assertIn("access", r.data)
        self.assertNotEqual(r.data["refresh"], refresh)
        again = self.client.post("/api/auth/token/refresh/", {"refresh": refresh})
        self.assertEqual(again.status_code, 401)

    def test_logout_invalida_refresh(self):
        tokens = self.login().data
        self.usar(tokens["access"])
        self.assertEqual(self.client.post("/api/auth/logout/", {"refresh": tokens["refresh"]}).status_code, 204)
        r = self.client.post("/api/auth/token/refresh/", {"refresh": tokens["refresh"]})
        self.assertEqual(r.status_code, 401)

    def test_bloqueado_perde_acesso(self):
        tokens = self.login().data
        self.usuario.is_active = False
        self.usuario.save()
        self.usar(tokens["access"])
        self.assertEqual(self.client.get("/api/boxes/").status_code, 401)
        self.client.credentials()
        r = self.client.post("/api/auth/token/refresh/", {"refresh": tokens["refresh"]})
        self.assertEqual(r.status_code, 401)

    def test_trocar_senha_invalida_tokens(self):
        tokens = self.login().data
        self.usuario.set_password("Nova#Senha2026")
        self.usuario.save()
        self.usar(tokens["access"])
        self.assertEqual(self.client.get("/api/boxes/").status_code, 401)

    def test_limite_de_tentativas(self):
        for _ in range(10):
            self.login(senha="errada")
        self.assertEqual(self.login().status_code, 429)

    def test_eu(self):
        self.usar(self.login().data["access"])
        r = self.client.get("/api/auth/eu/")
        self.assertEqual(r.data["sede"]["nome"], "Cambeba")
        self.assertFalse(r.data["admin"])


@override_settings(FRONTEND_URL="https://site.newbox.test", PASSWORD_RESET_TIMEOUT=3600)
class EsqueciSenhaTests(APITestCase):
    CPF = "529.982.247-25"
    NOVA = "Nova#Senha2026"

    def setUp(self):
        cache.clear()
        self.usuario = User.objects.create_user(
            "52998224725", password="Antiga#Senha2026", email="ana@exemplo.com"
        )
        Funcionario.objects.create(
            usuario=self.usuario, nome="Ana Lima", cpf="52998224725",
            sede=Sede.objects.get(nome="Cocó"),
        )

    def pedir(self, cpf=None):
        return self.client.post("/api/auth/senha/esqueci/", {"cpf": cpf or self.CPF})

    def link(self):
        import re
        from urllib.parse import parse_qs, urlparse
        url = re.search(r"https://\S+", mail.outbox[-1].body).group(0)
        q = parse_qs(urlparse(url).query)
        return url, q["uid"][0], q["token"][0]

    def redefinir(self, uid, token, senha=None, confirmar=None):
        senha = senha or self.NOVA
        return self.client.post("/api/auth/senha/redefinir/", {
            "uid": uid, "token": token, "senha": senha, "confirmar_senha": confirmar or senha,
        })

    def test_envia_email_com_link(self):
        r = self.pedir()
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        email = mail.outbox[0]
        self.assertEqual(email.to, ["ana@exemplo.com"])
        self.assertIn("Ana Lima", email.body)
        url, _, _ = self.link()
        self.assertTrue(url.startswith("https://site.newbox.test/redefinir-senha?uid="))
        self.assertIn(url.replace("&", "&amp;"), email.alternatives[0][0])  # versão HTML

    def test_resposta_igual_para_cpf_inexistente(self):
        existente = self.pedir().data
        inexistente = self.pedir(cpf="111.444.777-35").data
        self.assertEqual(existente, inexistente)
        self.assertEqual(len(mail.outbox), 1)

    def test_nao_envia_para_conta_pendente(self):
        self.usuario.is_active = False
        self.usuario.save()
        self.assertEqual(self.pedir().status_code, 200)
        self.assertEqual(len(mail.outbox), 0)

    def test_redefine_senha_e_link_so_vale_uma_vez(self):
        self.pedir()
        _, uid, token = self.link()
        r = self.redefinir(uid, token)
        self.assertEqual(r.status_code, 200, r.data)
        r = self.client.post("/api/auth/login/", {"cpf": self.CPF, "senha": self.NOVA})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.redefinir(uid, token, "Outra#Senha2026").status_code, 400)

    def test_redefinir_derruba_tokens_antigos(self):
        access = self.client.post(
            "/api/auth/login/", {"cpf": self.CPF, "senha": "Antiga#Senha2026"}
        ).data["access"]
        self.pedir()
        _, uid, token = self.link()
        self.redefinir(uid, token)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        self.assertEqual(self.client.get("/api/boxes/").status_code, 401)

    def test_token_invalido_ou_senha_fraca(self):
        self.pedir()
        _, uid, token = self.link()
        self.assertIn("token", self.redefinir(uid, "abc-123").data)
        self.assertIn("token", self.redefinir("lixo", token).data)
        self.assertIn("senha", self.redefinir(uid, token, "123", "123").data)
        self.assertIn("confirmar_senha", self.redefinir(uid, token, self.NOVA, "outra").data)

    def test_link_expira(self):
        self.pedir()
        _, uid, token = self.link()
        with override_settings(PASSWORD_RESET_TIMEOUT=-1):
            self.assertIn("token", self.redefinir(uid, token).data)

    def test_limite_de_pedidos(self):
        for _ in range(5):
            self.pedir()
        self.assertEqual(self.pedir().status_code, 429)

    def test_admin_edita_email(self):
        admin_user = User.objects.create_superuser("chefe", password="x")
        self.client.force_login(admin_user)
        url = f"/admin/boxes/funcionario/{self.usuario.funcionario.pk}/change/"
        self.assertEqual(self.client.get(url).status_code, 200)
        r = self.client.post(url, {"nome": "Ana Lima", "email": "nova@exemplo.com",
                                   "sede": self.usuario.funcionario.sede_id})
        self.assertEqual(r.status_code, 302)
        self.usuario.refresh_from_db()
        self.assertEqual(self.usuario.email, "nova@exemplo.com")


@override_settings(MEDIA_ROOT="/tmp/newbox-test-media")
class RecursosDoSiteTests(APITestCase):
    def setUp(self):
        self.coco = Sede.objects.get(nome="Cocó")
        self.admin = User.objects.create_user("chefe", is_staff=True)
        self.cliente_x = Cliente.objects.create(nome="Carlos Souza")
        Cliente.objects.create(nome="Maria")
        self.box = Box.objects.create(sede=self.coco, tamanho="P", valor=10,
                                      cliente=self.cliente_x, anexo_pagamento="c/x.pdf",
                                      dia_vencimento=5, alugado_em="2026-11-01")
        usuario = User.objects.create_user("52998224725", is_active=False)
        self.pendente = Funcionario.objects.create(
            usuario=usuario, nome="Ana", cpf="52998224725", sede=self.coco)
        self.client.force_authenticate(self.admin)

    def test_liberar_box(self):
        r = self.client.post(f"/api/boxes/{self.box.id}/liberar/")
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.data["alugado"])
        self.assertIsNone(r.data["anexo_pagamento"])

    def test_box_traz_nomes(self):
        r = self.client.get(f"/api/boxes/{self.box.id}/")
        self.assertEqual((r.data["sede_nome"], r.data["cliente_nome"]), ("Cocó", "Carlos Souza"))

    def test_busca_de_clientes(self):
        r = self.client.get("/api/clientes/?busca=souza")
        self.assertEqual([c["nome"] for c in r.data["results"]], ["Carlos Souza"])
        self.assertEqual(r.data["results"][0]["total_boxes"], 1)

    def test_admin_aprova_e_bloqueia(self):
        r = self.client.get("/api/funcionarios/?aprovado=false")
        self.assertEqual([f["nome"] for f in r.data["results"]], ["Ana"])
        r = self.client.post(f"/api/funcionarios/{self.pendente.id}/aprovar/")
        self.assertTrue(r.data["aprovado"])
        r = self.client.post(f"/api/funcionarios/{self.pendente.id}/bloquear/")
        self.assertFalse(r.data["aprovado"])

    def test_funcionario_nao_aprova(self):
        colega = User.objects.create_user("11144477735")
        Funcionario.objects.create(usuario=colega, nome="Beto", cpf="11144477735", sede=self.coco)
        self.client.force_authenticate(colega)
        r = self.client.post(f"/api/funcionarios/{self.pendente.id}/aprovar/")
        self.assertEqual(r.status_code, 403)

    def test_page_size(self):
        for i in range(60):
            Box.objects.create(sede=self.coco, tamanho="P", valor=1)
        self.assertEqual(len(self.client.get("/api/boxes/").data["results"]), 50)
        self.assertEqual(len(self.client.get("/api/boxes/?page_size=500").data["results"]), 61)


from datetime import date  # noqa: E402
from io import StringIO  # noqa: E402
from unittest import mock  # noqa: E402

from django.core.management import call_command  # noqa: E402

from . import cobranca  # noqa: E402
from .models import Mensalidade  # noqa: E402


def no_dia(dia):
    """Faz o sistema achar que hoje é `dia`."""
    return mock.patch("boxes.cobranca.hoje", return_value=dia)


class DatasDeVencimentoTests(APITestCase):
    def test_dia_30_em_fevereiro(self):
        self.assertEqual(cobranca.data_vencimento(date(2027, 2, 1), 30), date(2027, 2, 28))
        self.assertEqual(cobranca.data_vencimento(date(2028, 2, 1), 30), date(2028, 2, 29))
        self.assertEqual(cobranca.data_vencimento(date(2026, 11, 1), 30), date(2026, 11, 30))

    def test_dias_de_vencimento(self):
        self.assertEqual(cobranca.dias_de_vencimento_hoje(date(2026, 11, 5)), [5])
        self.assertEqual(cobranca.dias_de_vencimento_hoje(date(2026, 11, 6)), [])
        self.assertEqual(cobranca.dias_de_vencimento_hoje(date(2027, 2, 28)), [30])
        self.assertEqual(cobranca.dias_de_vencimento_hoje(date(2026, 12, 31)), [])


@override_settings(MEDIA_ROOT="/tmp/newbox-test-media", FRONTEND_URL="https://site.test")
class MensalidadesTests(APITestCase):
    def setUp(self):
        self.coco = Sede.objects.get(nome="Cocó")
        self.cambeba = Sede.objects.get(nome="Cambeba")
        self.ana = User.objects.create_user("52998224725", email="ana@exemplo.com")
        Funcionario.objects.create(usuario=self.ana, nome="Ana", cpf="52998224725", sede=self.coco)
        self.beto = User.objects.create_user("11144477735", email="beto@exemplo.com")
        Funcionario.objects.create(usuario=self.beto, nome="Beto", cpf="11144477735", sede=self.cambeba)
        self.carlos = Cliente.objects.create(nome="Carlos")
        self.box = Box.objects.create(sede=self.coco, tamanho="P", valor=200)
        self.client.force_authenticate(self.ana)

    def arquivo(self, nome="c.pdf"):
        return SimpleUploadedFile(nome, b"%PDF", content_type="application/pdf")

    def alugar(self, dia=10, quando=date(2026, 11, 4)):
        with no_dia(quando):
            return self.client.patch(f"/api/boxes/{self.box.id}/", {
                "cliente": self.carlos.id, "anexo_pagamento": self.arquivo(), "dia_vencimento": dia,
            }, format="multipart")

    def listar(self, quando, url="/api/mensalidades/"):
        with no_dia(quando):
            return self.client.get(url)

    def test_alugar_exige_dia_valido(self):
        with no_dia(date(2026, 11, 4)):
            r = self.client.patch(f"/api/boxes/{self.box.id}/", {
                "cliente": self.carlos.id, "anexo_pagamento": self.arquivo(),
            }, format="multipart")
        self.assertIn("dia_vencimento", r.data)
        r = self.alugar(dia=7)
        self.assertIn("dia_vencimento", r.data)

    def test_primeira_mensalidade_nasce_paga(self):
        r = self.alugar()
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["alugado_em"], "2026-11-04")
        m = Mensalidade.objects.get()
        self.assertEqual((m.competencia, m.vencimento, m.pago_em), (date(2026, 11, 1), date(2026, 11, 10), date(2026, 11, 4)))
        self.assertTrue(m.comprovante.name)
        self.assertEqual(m.registrado_por, self.ana)

    def test_gera_meses_seguintes(self):
        self.alugar(dia=30)
        r = self.listar(date(2027, 2, 20))
        itens = {i["competencia"]: i for i in r.data["results"]}
        self.assertEqual(list(itens), ["2026-11-01", "2026-12-01", "2027-01-01", "2027-02-01"])
        self.assertEqual(itens["2026-11-01"]["situacao"], "paga")
        self.assertEqual(itens["2026-12-01"]["situacao"], "atrasada")
        self.assertEqual(itens["2027-02-01"]["vencimento"], "2027-02-28")
        self.assertEqual(itens["2027-02-01"]["situacao"], "a_vencer")
        # chamar de novo não duplica
        self.listar(date(2027, 2, 20))
        self.assertEqual(Mensalidade.objects.count(), 4)

    def test_avisos_no_dia_de_vencimento(self):
        self.alugar(dia=10)
        r = self.listar(date(2026, 12, 10), "/api/mensalidades/avisos/")
        self.assertTrue(r.data["dia_de_vencimento"])
        self.assertEqual([m["cliente_nome"] for m in r.data["vencem_hoje"]], ["Carlos"])
        self.assertEqual(r.data["vencem_hoje"][0]["situacao"], "vence_hoje")
        self.assertEqual(r.data["pendencias"], 1)
        r = self.listar(date(2026, 12, 11), "/api/mensalidades/avisos/")
        self.assertFalse(r.data["dia_de_vencimento"])
        self.assertEqual(len(r.data["atrasadas"]), 1)

    def test_registrar_pagamento(self):
        self.alugar()
        self.listar(date(2026, 12, 12))
        dezembro = Mensalidade.objects.get(competencia=date(2026, 12, 1))
        url = f"/api/mensalidades/{dezembro.id}/pagar/"
        with no_dia(date(2026, 12, 12)):
            self.assertIn("comprovante", self.client.post(url, {}, format="multipart").data)
            r = self.client.post(url, {"comprovante": self.arquivo(), "pago_em": "2026-12-30"}, format="multipart")
            self.assertIn("pago_em", r.data)
            r = self.client.post(url, {"comprovante": self.arquivo()}, format="multipart")
            self.assertEqual(r.status_code, 200, r.data)
            self.assertEqual((r.data["situacao"], r.data["pago_em"]), ("paga", "2026-12-12"))
            self.assertEqual(r.data["registrado_por_nome"], "Ana")
            self.assertEqual(self.client.post(url, {"comprovante": self.arquivo()}, format="multipart").status_code, 400)
            r = self.client.post(f"/api/mensalidades/{dezembro.id}/desfazer/")
            self.assertEqual(r.data["situacao"], "atrasada")

    def test_filtros(self):
        self.alugar()
        r = self.listar(date(2027, 1, 20), "/api/mensalidades/?situacao=atrasada")
        self.assertEqual([m["competencia"] for m in r.data["results"]], ["2026-12-01", "2027-01-01"])
        r = self.listar(date(2027, 1, 20), "/api/mensalidades/?competencia=2026-11")
        self.assertEqual(len(r.data["results"]), 1)
        r = self.listar(date(2027, 1, 20), "/api/boxes/")
        self.assertTrue(r.data["results"][0]["em_atraso"])

    def test_outra_sede_nao_ve(self):
        self.alugar()
        self.client.force_authenticate(self.beto)
        r = self.listar(date(2027, 1, 20))
        self.assertEqual(r.data["count"], 0)
        m = Mensalidade.objects.first()
        with no_dia(date(2027, 1, 20)):
            r = self.client.post(f"/api/mensalidades/{m.id}/pagar/", {"comprovante": self.arquivo()}, format="multipart")
        self.assertEqual(r.status_code, 404)

    def test_liberar_mantem_atrasadas_e_apaga_futuras(self):
        self.alugar(dia=25)
        with no_dia(date(2027, 1, 10)):
            self.client.get("/api/mensalidades/")
            r = self.client.post(f"/api/boxes/{self.box.id}/liberar/")
        self.assertFalse(r.data["alugado"])
        self.assertIsNone(r.data["dia_vencimento"])
        restantes = sorted(Mensalidade.objects.values_list("competencia", flat=True))
        # nov (paga) e dez (atrasada) ficam; jan (vence dia 25, ainda não venceu) sai
        self.assertEqual(restantes, [date(2026, 11, 1), date(2026, 12, 1)])

    def test_mudar_valor_e_dia_atualiza_futuras(self):
        self.alugar(dia=10)
        self.listar(date(2026, 12, 2))
        with no_dia(date(2026, 12, 2)):
            self.client.patch(f"/api/boxes/{self.box.id}/", {"valor": "250", "dia_vencimento": 20})
        dez = Mensalidade.objects.get(competencia=date(2026, 12, 1))
        nov = Mensalidade.objects.get(competencia=date(2026, 11, 1))
        self.assertEqual((dez.valor, dez.vencimento), (250, date(2026, 12, 20)))
        self.assertEqual(nov.valor, 200)  # já paga, não muda

    def test_nao_troca_cliente_sem_liberar(self):
        self.alugar()
        outro = Cliente.objects.create(nome="Outro")
        r = self.client.patch(f"/api/boxes/{self.box.id}/", {"cliente": outro.id})
        self.assertIn("cliente", r.data)

    def test_email_de_vencimentos(self):
        self.alugar(dia=10)
        Box.objects.create(sede=self.cambeba, tamanho="G", valor=500)  # sem aluguel
        User.objects.create_user("chefe", email="chefe@exemplo.com", is_staff=True)
        saida = StringIO()
        call_command("avisar_vencimentos", data=date(2026, 12, 9), stdout=saida)
        self.assertIn("não é dia de vencimento", saida.getvalue())
        self.assertEqual(len(mail.outbox), 0)

        call_command("avisar_vencimentos", data=date(2026, 12, 10), stdout=StringIO())
        destinos = sorted(e.to[0] for e in mail.outbox)
        self.assertEqual(destinos, ["ana@exemplo.com", "chefe@exemplo.com"])  # Beto (Cambeba) não
        email = next(e for e in mail.outbox if e.to == ["ana@exemplo.com"])
        self.assertIn("NÃO PAGARAM (1)", email.body)
        self.assertIn("Carlos", email.body)
        self.assertIn("(1 pendente)", email.subject)
        self.assertIn("https://site.test/mensalidades", email.body)


@override_settings(DEBUG=True, MEDIA_ROOT="/tmp/newbox-test-media")
class DadosExemploTests(APITestCase):
    def test_cria_e_recria(self):
        call_command("dados_exemplo", stdout=StringIO())
        self.assertEqual(Box.objects.count(), 13)
        self.assertFalse(Box.objects.filter(tipo__isnull=True).exists())
        self.assertEqual(Funcionario.objects.filter(usuario__is_active=False).count(), 1)
        self.assertTrue(Mensalidade.objects.filter(pago_em__isnull=True, vencimento__lt=cobranca.hoje()).exists())
        r = self.client.post("/api/auth/login/", {"cpf": "529.982.247-25", "senha": "Newbox#2026"})
        self.assertEqual(r.status_code, 200)
        with self.assertRaises(Exception):
            call_command("dados_exemplo", stdout=StringIO())
        call_command("dados_exemplo", apagar=True, stdout=StringIO())
        self.assertEqual(Box.objects.count(), 13)

    @override_settings(DEBUG=False)
    def test_nao_roda_em_producao(self):
        with self.assertRaises(Exception):
            call_command("dados_exemplo", stdout=StringIO())


class PaginaPublicaTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.coco = Sede.objects.get(nome="Cocó")
        self.p3 = self.coco.tipos.get(codigo="P3")
        self.m1 = self.coco.tipos.get(codigo="M1")
        cliente = Cliente.objects.create(nome="Segredo da Silva")
        Box.objects.create(sede=self.coco, tipo=self.p3, tamanho="P3", valor=480, cliente=cliente,
                           anexo_pagamento="c/x.pdf", dia_vencimento=5, alugado_em="2026-11-01")
        Box.objects.create(sede=self.coco, tipo=self.m1, tamanho="M1", valor=600)
        Box.objects.create(sede=self.coco, tamanho="m1 ", valor=600)  # antigo, sem tipo

    def test_catalogo_e_disponibilidade_sem_dados_sensiveis(self):
        r = self.client.get("/api/publico/")
        self.assertEqual(r.status_code, 200)
        coco = next(s for s in r.data["sedes"] if s["nome"] == "Cocó")
        self.assertEqual(coco["nome_publico"], "Newbox Cocó")
        self.assertEqual(coco["whatsapp"], "5585997500544")
        tipos = {t["codigo"]: t for t in coco["tipos"]}
        self.assertEqual(list(tipos), ["P1", "P2", "P3", "M1", "M2", "M3", "G1", "G2", "G3", "G4"])
        self.assertFalse(tipos["P3"]["disponivel"])
        self.assertTrue(tipos["M1"]["disponivel"])
        self.assertFalse(tipos["G4"]["disponivel"])  # nenhum box cadastrado
        self.assertEqual(str(tipos["G4"]["valor"]), "1537.00")
        self.assertEqual(tipos["P1"]["sugestao_uso"], "Documentos, malas e pequenos itens")
        texto = str(r.content)
        self.assertNotIn("Segredo", texto)
        self.assertNotIn("480", texto)  # valor negociado do box não aparece
        self.assertEqual(r.data["contato"]["whatsapp"], "5585999620414")
        self.assertEqual(r.data["contato"]["instagram"], "newboxbrasil")

    def test_sede_cambeba(self):
        camb = Sede.objects.get(nome="Cambeba")
        self.assertEqual(camb.nome_publico, "Newbox Sede (Cambeba)")
        self.assertIn("60822-285", camb.endereco)
        self.assertEqual(list(camb.tipos.values_list("codigo", flat=True))[:4], ["P1", "P2", "P3", "M1 SUP"])


from .models import Interessado  # noqa: E402


@override_settings(MEDIA_ROOT="/tmp/newbox-test-media")
class ListaDeEsperaTests(APITestCase):
    def setUp(self):
        self.coco = Sede.objects.get(nome="Cocó")
        self.cambeba = Sede.objects.get(nome="Cambeba")
        self.ana = User.objects.create_user("52998224725")
        Funcionario.objects.create(usuario=self.ana, nome="Ana Lima", cpf="52998224725", sede=self.coco)
        self.beto = User.objects.create_user("11144477735")
        Funcionario.objects.create(usuario=self.beto, nome="Beto", cpf="11144477735", sede=self.cambeba)
        self.dono = Cliente.objects.create(nome="Dono Atual")
        self.box_coco = Box.objects.create(
            sede=self.coco, tamanho="3x3 m", valor=420, cliente=self.dono,
            anexo_pagamento="c/x.pdf", dia_vencimento=5, alugado_em="2026-11-01",
        )
        self.client.force_authenticate(self.ana)

    def anotar(self, **extra):
        dados = {
            "nome": "Paula", "telefone": "(85) 99876-5432", "email": " Paula@Exemplo.com ",
            "sede": self.coco.id, "tamanho": "3x3 m", **extra,
        }
        return self.client.post("/api/interessados/", dados)

    def test_anotar_e_validar_telefone(self):
        r = self.anotar()
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data["telefone"], "85998765432")
        self.assertEqual(r.data["criado_por_nome"], "Ana Lima")
        self.assertEqual(r.data["vagas"], [])
        self.assertIn("telefone", self.anotar(telefone="123").data)
        self.assertEqual(self.anotar(telefone="+55 85 99876-5432").data["telefone"], "85998765432")

    def test_aviso_quando_box_libera(self):
        self.anotar()
        self.assertEqual(self.client.get("/api/interessados/oportunidades/").data, [])
        self.client.post(f"/api/boxes/{self.box_coco.id}/liberar/")
        r = self.client.get("/api/interessados/oportunidades/")
        self.assertEqual([i["nome"] for i in r.data], ["Paula"])
        self.assertEqual(r.data[0]["vagas"][0]["id"], self.box_coco.id)
        # Beto (Cambeba) não recebe aviso de vaga do Cocó
        self.client.force_authenticate(self.beto)
        self.assertEqual(self.client.get("/api/interessados/oportunidades/").data, [])

    def test_box_novo_tamanho_parecido_e_qualquer_sede(self):
        self.anotar(sede="", tamanho="4X4m")
        self.client.force_authenticate(self.beto)
        Box.objects.create(sede=self.cambeba, tamanho="4x4 m", valor=650)
        r = self.client.get("/api/interessados/oportunidades/")
        self.assertEqual([i["nome"] for i in r.data], ["Paula"])
        self.assertEqual(r.data[0]["vagas"][0]["sede_nome"], "Cambeba")

    def test_contatado_sai_do_aviso(self):
        self.anotar()
        self.client.post(f"/api/boxes/{self.box_coco.id}/liberar/")
        i = Interessado.objects.get()
        r = self.client.patch(f"/api/interessados/{i.id}/", {"situacao": "contatado"})
        self.assertIsNotNone(r.data["contatado_em"])
        self.assertEqual(self.client.get("/api/interessados/oportunidades/").data, [])
        r = self.client.patch(f"/api/interessados/{i.id}/", {"situacao": "alugou"})
        self.assertEqual(r.data["vagas"], [])

    def test_lista_compartilhada_entre_sedes(self):
        self.anotar()
        self.client.force_authenticate(self.beto)
        self.assertEqual(self.client.get("/api/interessados/").data["count"], 1)

    def test_disponibilidade_nas_duas_sedes(self):
        Box.objects.create(sede=self.cambeba, tamanho="3x3 m ", valor=400)
        Box.objects.create(sede=self.cambeba, tamanho="3X3 m", valor=380)
        r = self.client.get("/api/disponibilidade/")
        por_sede = {s["nome"]: s["tamanhos"] for s in r.data}
        self.assertEqual(por_sede["Cocó"], [{"tamanho": "3x3 m", "livres": 0, "total": 1, "valor_a_partir": None}])
        camb = por_sede["Cambeba"][0]
        self.assertEqual((camb["livres"], camb["total"], str(camb["valor_a_partir"])), (2, 2, "380.00"))
        self.assertNotIn("Dono", str(r.data))
        tamanhos = self.client.get("/api/interessados/tamanhos/").data
        self.assertEqual(tamanhos[:3], ["P1", "P2", "P3"])
        self.assertEqual(tamanhos[-1], "3x3 m")

    def test_email_obrigatorio(self):
        r = self.anotar(email="")
        self.assertEqual(r.status_code, 400)
        self.assertIn("e-mail", str(r.data["email"]))
        self.assertEqual(self.anotar().data["email"], "paula@exemplo.com")
        # Anotação antiga sem e-mail ainda pode mudar de situação
        velho = Interessado.objects.create(nome="Velho", telefone="85911112222")
        r = self.client.patch(f"/api/interessados/{velho.id}/", {"situacao": "desistiu"})
        self.assertEqual(r.status_code, 200, r.data)

    def test_alugar_pela_lista_vira_cliente(self):
        iid = self.anotar().data["id"]
        self.client.post(f"/api/boxes/{self.box_coco.id}/liberar/")
        arquivo = SimpleUploadedFile("pix.pdf", b"%PDF-1.4", content_type="application/pdf")
        r = self.client.post(f"/api/boxes/{self.box_coco.id}/alugar/", {
            "nome": "Paula", "telefone": "85998765432", "email": "paula@exemplo.com",
            "anexo_pagamento": arquivo, "dia_vencimento": 10, "interessado": iid,
        }, format="multipart")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertNotIn("interessado", r.data)
        cid = r.data["cliente"]
        self.assertEqual(Cliente.objects.get(pk=cid).email, "paula@exemplo.com")
        i = Interessado.objects.get(pk=iid)
        self.assertEqual((i.situacao, i.cliente_id), ("alugou", cid))
        self.assertIsNotNone(i.contatado_em)
        self.assertEqual(Contrato.objects.get(box=self.box_coco, fim__isnull=True).cliente_id, cid)
        self.assertEqual(self.client.get("/api/interessados/oportunidades/").data, [])

    def test_interessado_so_ao_alugar_box_livre(self):
        iid = self.anotar().data["id"]
        r = self.client.patch(f"/api/boxes/{self.box_coco.id}/", {"interessado": iid, "valor": "430"})
        self.assertEqual(r.status_code, 400)
        self.assertIn("interessado", r.data)
        self.assertEqual(Interessado.objects.get(pk=iid).situacao, "aguardando")

    def test_precisa_login(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/api/interessados/").status_code, 401)
        self.assertEqual(self.client.get("/api/disponibilidade/").status_code, 401)


@override_settings(MEDIA_ROOT="/tmp/newbox-test-media")
class ContatoClienteTests(APITestCase):
    def setUp(self):
        self.coco = Sede.objects.get(nome="Cocó")
        self.cambeba = Sede.objects.get(nome="Cambeba")
        self.ana = User.objects.create_user("52998224725")
        Funcionario.objects.create(usuario=self.ana, nome="Ana", cpf="52998224725", sede=self.coco)
        self.client.force_authenticate(self.ana)

    def alugar(self, **dados):
        box = Box.objects.create(sede=self.coco, tamanho="P1", valor=100)
        arquivo = SimpleUploadedFile("c.pdf", b"%PDF", content_type="application/pdf")
        return self.client.post(f"/api/boxes/{box.id}/alugar/",
                                {"dia_vencimento": 10, "anexo_pagamento": arquivo, **dados}, format="multipart")

    def test_whatsapp_obrigatorio_e_cpf_validado(self):
        r = self.alugar(nome="Sem Zap")
        self.assertIn("telefone", r.data)
        self.assertEqual(r.data["email"], ["Informe o e-mail do cliente."])
        r = self.alugar(nome="Zé", telefone="(85) 99876-5432", cpf="529.982.247-25", email="ze@exemplo.com")
        self.assertEqual(r.status_code, 200, r.data)
        ze = Cliente.objects.get(pk=r.data["cliente"])
        self.assertEqual((ze.telefone, ze.cpf), ("85998765432", "52998224725"))
        r = self.alugar(nome="Outro", telefone="85911112222", cpf="529.982.247-25", email="o@exemplo.com")
        self.assertIn("cpf", r.data)
        r = self.alugar(nome="Outro", telefone="85911112222", cpf="123.456.789-00", email="o@exemplo.com")
        self.assertIn("cpf", r.data)
        self.assertEqual(Cliente.objects.count(), 1)

    def test_nao_cria_cliente_sem_box(self):
        r = self.client.post("/api/clientes/", {"nome": "Zé", "telefone": "85998765432", "email": "ze@exemplo.com"})
        self.assertEqual(r.status_code, 405)
        # erro no aluguel (sem comprovante) não deixa cliente solto
        box = Box.objects.create(sede=self.coco, tamanho="P1", valor=100)
        r = self.client.post(f"/api/boxes/{box.id}/alugar/", {
            "nome": "Zé", "telefone": "85998765432", "email": "ze@exemplo.com", "dia_vencimento": 10,
        }, format="multipart")
        self.assertIn("anexo_pagamento", r.data)
        self.assertFalse(Cliente.objects.exists())

    def test_nao_aluga_box_ja_alugado(self):
        r = self.alugar(nome="Zé", telefone="85998765432", email="ze@exemplo.com")
        box_id = r.data["id"]
        arquivo = SimpleUploadedFile("c.pdf", b"%PDF", content_type="application/pdf")
        r = self.client.post(f"/api/boxes/{box_id}/alugar/", {
            "cliente": r.data["cliente"], "dia_vencimento": 10, "anexo_pagamento": arquivo,
        }, format="multipart")
        self.assertEqual(r.status_code, 400)
        self.assertIn("já está alugado", r.data["detail"])

    def test_cliente_antigo_sem_telefone_pode_ser_editado(self):
        c = Cliente.objects.create(nome="Antigo")
        r = self.client.patch(f"/api/clientes/{c.id}/", {"nome": "Antigo Silva"})
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["telefone"], "")

    def test_busca_por_telefone(self):
        Cliente.objects.create(nome="Zé", telefone="85998765432")
        r = self.client.get("/api/clientes/?busca=99876")
        self.assertEqual([c["nome"] for c in r.data["results"]], ["Zé"])

    def test_ficha_e_atrasadas_por_sede(self):
        c = Cliente.objects.create(nome="Carlos", telefone="85998765432")
        with no_dia(date(2026, 9, 1)):
            for sede in (self.coco, self.cambeba):
                b = Box.objects.create(sede=sede, tamanho="P", valor=100, cliente=c, anexo_pagamento="c/x.pdf",
                                       dia_vencimento=5, alugado_em=date(2026, 9, 1))
                cobranca.iniciar_aluguel(b)
        with no_dia(date(2026, 11, 20)):
            r = self.client.get(f"/api/clientes/{c.id}/ficha/")
            self.assertEqual(len(r.data["boxes"]), 1)  # só o do Cocó
            self.assertTrue(r.data["outras_sedes"])
            self.assertEqual({m["sede_nome"] for m in r.data["mensalidades"]}, {"Cocó"})
            self.assertEqual(r.data["cliente"]["atrasadas"], 2)  # out e nov do Cocó
            m = self.client.get("/api/mensalidades/?situacao=atrasada").data["results"][0]
            self.assertEqual(m["cliente_telefone"], "85998765432")

    def test_endereco_coco(self):
        self.assertIn("Santana Júnior, 1901", Sede.objects.get(nome="Cocó").endereco)
        self.assertIn("60192-205", Sede.objects.get(nome="Cocó").endereco)


from .models import Contrato  # noqa: E402


@override_settings(MEDIA_ROOT="/tmp/newbox-test-media")
class ContratosTests(APITestCase):
    def setUp(self):
        self.coco = Sede.objects.get(nome="Cocó")
        self.cambeba = Sede.objects.get(nome="Cambeba")
        self.ana = User.objects.create_user("52998224725")
        Funcionario.objects.create(usuario=self.ana, nome="Ana Lima", cpf="52998224725", sede=self.coco)
        self.cliente = Cliente.objects.create(nome="Carlos Souza", telefone="85998765432", cpf="24681357928")
        self.box = Box.objects.create(sede=self.coco, tamanho="3x3 m", valor=420)
        self.client.force_authenticate(self.ana)

    def alugar(self, quando):
        with no_dia(quando):
            return self.client.patch(f"/api/boxes/{self.box.id}/", {
                "cliente": self.cliente.id, "dia_vencimento": 10,
                "anexo_pagamento": SimpleUploadedFile("c.pdf", b"%PDF", content_type="application/pdf"),
            }, format="multipart")

    def liberar(self, quando):
        with no_dia(quando):
            return self.client.post(f"/api/boxes/{self.box.id}/liberar/")

    def test_duracao(self):
        d = cobranca.duracao
        self.assertEqual(d(date(2026, 1, 10), date(2026, 1, 10)), "menos de 1 dia")
        self.assertEqual(d(date(2026, 1, 10), date(2026, 1, 25)), "15 dias")
        self.assertEqual(d(date(2026, 1, 10), date(2026, 3, 20)), "2 meses e 10 dias")
        self.assertEqual(d(date(2025, 1, 10), date(2026, 4, 10)), "1 ano e 3 meses")
        self.assertEqual(d(date(2024, 1, 31), date(2024, 2, 29)), "29 dias")
        self.assertEqual(d(date(2023, 5, 1), date(2026, 5, 1)), "3 anos")

    def test_aluguel_abre_e_liberar_encerra(self):
        self.alugar(date(2026, 1, 10))
        c = Contrato.objects.get()
        self.assertEqual((c.inicio, c.fim, c.valor, c.criado_por), (date(2026, 1, 10), None, 420, self.ana))
        self.liberar(date(2026, 4, 15))
        c.refresh_from_db()
        self.assertEqual((c.fim, c.encerrado_por), (date(2026, 4, 15), self.ana))
        # Novo aluguel do mesmo box = novo contrato; o antigo fica no histórico
        self.alugar(date(2026, 5, 1))
        with no_dia(date(2026, 6, 1)):
            r = self.client.get(f"/api/contratos/?box={self.box.id}")
        self.assertEqual([(x["inicio"], x["ativo"]) for x in r.data["results"]],
                         [("2026-05-01", True), ("2026-01-10", False)])
        self.assertEqual(r.data["results"][1]["duracao"], "3 meses e 5 dias")
        self.assertEqual(r.data["results"][0]["duracao"], "1 mês")

    def test_mudar_valor_atualiza_contrato_ativo(self):
        self.alugar(date(2026, 1, 10))
        with no_dia(date(2026, 2, 1)):
            self.client.patch(f"/api/boxes/{self.box.id}/", {"valor": "450", "dia_vencimento": 20})
        c = Contrato.objects.get()
        self.assertEqual((c.valor, c.dia_vencimento), (450, 20))

    def test_ficha_traz_contratos(self):
        self.alugar(date(2026, 1, 10))
        self.liberar(date(2026, 2, 10))
        r = self.client.get(f"/api/clientes/{self.cliente.id}/ficha/")
        self.assertEqual(len(r.data["contratos"]), 1)
        self.assertFalse(r.data["contratos"][0]["ativo"])

    def test_pdf(self):
        self.alugar(date(2026, 1, 10))
        c = Contrato.objects.get()
        r = self.client.get(f"/api/contratos/{c.id}/pdf/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r["Content-Type"], "application/pdf")
        self.assertTrue(r.content.startswith(b"%PDF"))
        self.assertIn(f"contrato-newbox-{c.numero}.pdf", r["Content-Disposition"])

    def test_outra_sede_nao_ve(self):
        self.alugar(date(2026, 1, 10))
        c = Contrato.objects.get()
        beto = User.objects.create_user("11144477735")
        Funcionario.objects.create(usuario=beto, nome="Beto", cpf="11144477735", sede=self.cambeba)
        self.client.force_authenticate(beto)
        self.assertEqual(self.client.get(f"/api/contratos/{c.id}/pdf/").status_code, 404)
        self.assertEqual(self.client.get("/api/contratos/").data["count"], 0)


class ExclusaoComHistoricoTests(ContratosTests):
    def test_ninguem_exclui_box_e_cliente_com_historico_fica(self):
        for usuario in (self.ana, User.objects.create_user("chefe3", is_staff=True)):
            self.client.force_authenticate(usuario)
            r = self.client.delete(f"/api/boxes/{self.box.id}/")
            self.assertEqual(r.status_code, 405)
        self.assertTrue(Box.objects.filter(pk=self.box.pk).exists())
        self.client.force_authenticate(self.ana)
        self.alugar(date(2026, 1, 10))
        self.liberar(date(2026, 2, 10))
        self.assertEqual(self.client.delete(f"/api/clientes/{self.cliente.id}/").status_code, 409)


class CatalogoTests(APITestCase):
    def setUp(self):
        self.coco = Sede.objects.get(nome="Cocó")
        self.cambeba = Sede.objects.get(nome="Cambeba")
        self.ana = User.objects.create_user("52998224725")
        Funcionario.objects.create(usuario=self.ana, nome="Ana", cpf="52998224725", sede=self.coco)
        self.admin = User.objects.create_user("chefe", is_staff=True)
        self.client.force_authenticate(self.ana)

    def test_box_pelo_catalogo(self):
        g4 = self.coco.tipos.get(codigo="G4")
        box = Box.objects.create(sede=self.coco, tamanho="antigo", valor=1)
        r = self.client.patch(f"/api/boxes/{box.id}/", {"tipo": g4.id})
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["tamanho"], "G4")
        self.assertEqual(r.data["tipo_detalhe"]["dimensoes"], "5,5 x 3,7 x 2,9 m")
        r = self.client.patch(f"/api/boxes/{box.id}/", {"valor": "1400"})
        self.assertEqual(r.data["valor"], "1400.00")

    def test_tipo_de_outra_unidade_e_campos_obrigatorios(self):
        p1_camb = self.cambeba.tipos.get(codigo="P1")
        box = Box.objects.create(sede=self.coco, tamanho="P1", valor=1)
        self.assertIn("tipo", self.client.patch(f"/api/boxes/{box.id}/", {"tipo": p1_camb.id}).data)

    def test_box_sem_catalogo_continua_funcionando(self):
        box = Box.objects.create(sede=self.coco, tamanho="P1", valor=1, tipo=self.coco.tipos.get(codigo="P1"))
        r = self.client.patch(f"/api/boxes/{box.id}/", {"tipo": None, "tamanho": "Especial"}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIsNone(r.data["tipo"])

    def test_catalogo_leitura_para_todos_edicao_so_admin(self):
        r = self.client.get(f"/api/tipos/?sede={self.cambeba.id}")
        self.assertEqual(len(r.data), 8)
        tipo = self.coco.tipos.get(codigo="P1")
        self.assertEqual(self.client.patch(f"/api/tipos/{tipo.id}/", {"valor": "420"}).status_code, 403)
        self.client.force_authenticate(self.admin)
        r = self.client.patch(f"/api/tipos/{tipo.id}/", {"valor": "420"})
        self.assertEqual(r.data["valor"], "420.00")
        r = self.client.post("/api/tipos/", {
            "sede": self.coco.id, "codigo": "g5", "area": "30", "volume": "87", "comprimento": "6",
            "largura": "5", "altura": "2.9", "sugestao_uso": "Galpão", "valor": "2000",
        })
        self.assertEqual(r.data["codigo"], "G5")
        Box.objects.create(sede=self.coco, tipo=tipo, tamanho="P1", valor=420)
        self.assertEqual(self.client.delete(f"/api/tipos/{tipo.id}/").status_code, 409)

    def test_lista_de_espera_oferece_codigos(self):
        tamanhos = self.client.get("/api/interessados/tamanhos/").data
        self.assertIn("M1 SUP", tamanhos)
        self.assertIn("G4", tamanhos)



@override_settings(MEDIA_ROOT="/tmp/newbox-test-media")
class NotaFiscalTests(APITestCase):
    def setUp(self):
        self.coco = Sede.objects.get(nome="Cocó")
        self.ana = User.objects.create_user("52998224725")
        Funcionario.objects.create(usuario=self.ana, nome="Ana", cpf="52998224725", sede=self.coco)
        self.cliente = Cliente.objects.create(nome="Carlos Souza", telefone="85998765432", email="carlos@exemplo.com")
        box = Box.objects.create(sede=self.coco, tamanho="P1", valor=400, cliente=self.cliente,
                                 anexo_pagamento="c/x.pdf", dia_vencimento=10, alugado_em=date(2026, 11, 1))
        self.m = Mensalidade.objects.create(box=box, cliente=self.cliente, competencia=date(2026, 11, 1),
                                            vencimento=date(2026, 11, 10), valor=400)
        self.url = f"/api/mensalidades/{self.m.id}/nota-fiscal/"
        self.client.force_authenticate(self.ana)

    def pdf(self, nome="nf.pdf"):
        return SimpleUploadedFile(nome, b"%PDF-1.4 nota", content_type="application/pdf")

    def test_envia_nota_por_email_com_anexo(self):
        r = self.client.post(self.url, {"arquivo": self.pdf(), "numero": "1234"}, format="multipart")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["nota_numero"], "1234")
        self.assertEqual(r.data["nota_enviada_para"], "carlos@exemplo.com")
        self.assertIsNotNone(r.data["nota_enviada_em"])
        self.assertEqual(len(mail.outbox), 1)
        email = mail.outbox[0]
        self.assertEqual(email.to, ["carlos@exemplo.com"])
        self.assertIn("novembro de 2026", email.subject)
        self.assertIn("nº 1234", email.subject)
        self.assertIn("Olá, Carlos!", email.body)
        nome, conteudo, tipo = email.attachments[0]
        self.assertEqual((nome, tipo), ("nota-fiscal-newbox-2026-11-box%d.pdf" % self.m.box_id, "application/pdf"))
        self.assertTrue(conteudo.startswith(b"%PDF"))

    def test_reenviar_sem_novo_arquivo(self):
        self.assertIn("arquivo", self.client.post(self.url, {}, format="multipart").data)
        self.client.post(self.url, {"arquivo": self.pdf()}, format="multipart")
        r = self.client.post(self.url, {}, format="multipart")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(mail.outbox), 2)

    def test_so_pdf_e_cliente_precisa_de_email(self):
        r = self.client.post(self.url, {"arquivo": SimpleUploadedFile("nf.png", b"x")}, format="multipart")
        self.assertIn("arquivo", r.data)
        self.cliente.email = ""
        self.cliente.save()
        r = self.client.post(self.url, {"arquivo": self.pdf()}, format="multipart")
        self.assertEqual(r.status_code, 400)
        self.assertIn("sem e-mail", r.data["detail"])
        self.assertEqual(len(mail.outbox), 0)

    def test_falha_no_email_guarda_a_nota(self):
        with mock.patch("boxes.notas.EmailMultiAlternatives.send", side_effect=OSError("smtp fora")):
            r = self.client.post(self.url, {"arquivo": self.pdf()}, format="multipart")
        self.assertEqual(r.status_code, 502)
        self.m.refresh_from_db()
        self.assertTrue(self.m.nota_fiscal.name)
        self.assertIsNone(self.m.nota_enviada_em)

    def test_outra_sede_nao_envia(self):
        beto = User.objects.create_user("11144477735")
        Funcionario.objects.create(usuario=beto, nome="Beto", cpf="11144477735", sede=Sede.objects.get(nome="Cambeba"))
        self.client.force_authenticate(beto)
        self.assertEqual(self.client.post(self.url, {"arquivo": self.pdf()}, format="multipart").status_code, 404)


from .models import Comunicado, EnvioComunicado  # noqa: E402


class ComunicadosTests(APITestCase):
    def setUp(self):
        self.coco = Sede.objects.get(nome="Cocó")
        self.cambeba = Sede.objects.get(nome="Cambeba")
        self.ana = User.objects.create_user("52998224725")
        Funcionario.objects.create(usuario=self.ana, nome="Ana", cpf="52998224725", sede=self.coco)
        self.admin = User.objects.create_user("chefe", is_staff=True)

        def cliente(nome, sede=None, email=True, tel=True):
            c = Cliente.objects.create(nome=nome, email=f"{nome.lower()}@exemplo.com" if email else "",
                                       telefone="85998765432" if tel else "")
            if sede:
                Box.objects.create(sede=sede, tamanho="P1", valor=1, cliente=c, anexo_pagamento="c/x.pdf",
                                   dia_vencimento=5, alugado_em=date(2026, 11, 1))
            return c

        self.carlos = cliente("Carlos", self.coco)
        self.maria = cliente("Maria", self.coco, email=False)
        self.joao = cliente("Joao", self.cambeba, tel=False)
        self.antigo = cliente("Antigo")  # sem box

    def criar(self, **dados):
        base = {"titulo": "Feriado", "mensagem": "Olá, {nome}! Fecharemos no feriado.", "publico": "ativos"}
        return self.client.post("/api/comunicados/", {**base, **dados}, format="json")

    def test_previa(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get("/api/comunicados/previa/?publico=ativos").data,
                         {"total": 3, "com_email": 2, "com_whatsapp": 2})
        self.assertEqual(self.client.get("/api/comunicados/previa/?publico=todos").data["total"], 4)
        self.assertEqual(self.client.get(f"/api/comunicados/previa/?publico=ativos&sede={self.cambeba.id}").data["total"], 1)
        # funcionário: sempre a própria unidade
        self.client.force_authenticate(self.ana)
        self.assertEqual(self.client.get(f"/api/comunicados/previa/?sede={self.cambeba.id}").data["total"], 2)

    def test_admin_envia_para_todos_os_ativos(self):
        self.client.force_authenticate(self.admin)
        r = self.criar()
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data["resumo"], {
            "total": 3, "email_enviados": 2, "email_falhos": 0, "sem_email": 1,
            "whatsapp_enviados": 0, "whatsapp_pendentes": 2, "sem_whatsapp": 1,
        })
        self.assertEqual(sorted(e.to[0] for e in mail.outbox), ["carlos@exemplo.com", "joao@exemplo.com"])
        self.assertIn("Olá, Carlos! Fecharemos no feriado.", next(e for e in mail.outbox if e.to == ["carlos@exemplo.com"]).body)
        self.assertEqual(mail.outbox[0].subject, "Newbox - Feriado")

    def test_funcionario_so_envia_para_a_propria_unidade(self):
        self.client.force_authenticate(self.ana)
        self.assertIn("sede", self.criar(sede=self.cambeba.id).data)
        r = self.criar()
        self.assertEqual(r.data["sede"], self.coco.id)
        self.assertEqual(r.data["resumo"]["total"], 2)
        self.assertEqual([e.to for e in mail.outbox], [["carlos@exemplo.com"]])
        # não vê comunicados da outra unidade
        self.client.force_authenticate(self.admin)
        self.criar(sede=self.cambeba.id)
        self.client.force_authenticate(self.ana)
        self.assertEqual(self.client.get("/api/comunicados/").data["count"], 1)

    def test_whatsapp_marcar_enviado(self):
        self.client.force_authenticate(self.admin)
        cid = self.criar(por_email=False).data["id"]
        self.assertEqual(len(mail.outbox), 0)
        envios = self.client.get(f"/api/comunicados/{cid}/envios/").data
        carlos = next(e for e in envios if e["cliente_nome"] == "Carlos")
        self.assertEqual(carlos["texto"], "Olá, Carlos! Fecharemos no feriado.")
        self.assertEqual(carlos["email_situacao"], "nao_se_aplica")
        r = self.client.post(f"/api/comunicados/{cid}/envios/{carlos['id']}/whatsapp/")
        self.assertEqual(r.data["whatsapp_situacao"], "enviado")
        r = self.client.post(f"/api/comunicados/{cid}/envios/{carlos['id']}/whatsapp/", {"enviado": False}, format="json")
        self.assertEqual(r.data["whatsapp_situacao"], "pendente")

    def test_precisa_de_um_canal_e_texto(self):
        self.client.force_authenticate(self.admin)
        self.assertIn("por_email", self.criar(por_email=False, por_whatsapp=False).data)
        self.assertIn("mensagem", self.criar(mensagem="").data)

    def test_falha_de_email_e_reenvio(self):
        self.client.force_authenticate(self.admin)
        with mock.patch("boxes.comunicados.EmailMultiAlternatives.send", side_effect=OSError("smtp")):
            r = self.criar()
        self.assertEqual(r.data["resumo"]["email_falhos"], 2)
        r = self.client.post(f"/api/comunicados/{r.data['id']}/reenviar-emails/")
        self.assertEqual((r.data["resumo"]["email_falhos"], r.data["resumo"]["email_enviados"]), (0, 2))


@override_settings(MEDIA_ROOT="/tmp/newbox-test-media")
class ExcluirClienteAoLiberarTests(APITestCase):
    def setUp(self):
        self.coco = Sede.objects.get(nome="Cocó")
        self.ana = User.objects.create_user("52998224725")
        Funcionario.objects.create(usuario=self.ana, nome="Ana", cpf="52998224725", sede=self.coco)
        self.cliente = Cliente.objects.create(nome="Carlos", telefone="85998765432", email="c@exemplo.com",
                                              cpf="24681357928")
        self.client.force_authenticate(self.ana)
        self.b1 = self.alugar_box()

    def alugar_box(self):
        box = Box.objects.create(sede=self.coco, tamanho="P1", valor=100)
        r = self.client.patch(f"/api/boxes/{box.id}/", {
            "cliente": self.cliente.id, "dia_vencimento": 10,
            "anexo_pagamento": SimpleUploadedFile("c.pdf", b"%PDF", content_type="application/pdf"),
        }, format="multipart")
        self.assertEqual(r.status_code, 200, r.data)
        return box

    def nomes(self, url="/api/clientes/"):
        return [c["nome"] for c in self.client.get(url).data["results"]]

    def test_ultimo_box_liberado_vira_ex_cliente(self):
        r = self.client.post(f"/api/boxes/{self.b1.id}/liberar/")
        self.assertTrue(r.data["cliente_excluido"])
        self.assertEqual(self.nomes(), [])
        self.assertEqual(self.nomes("/api/clientes/?excluidos=true"), ["Carlos"])
        # histórico continua acessível
        ficha = self.client.get(f"/api/clientes/{self.cliente.id}/ficha/").data
        self.assertEqual(len(ficha["contratos"]), 1)
        self.assertFalse(ficha["cliente"]["ativo"])
        # CPF de ex-cliente: pede para escolher na lista
        box = Box.objects.create(sede=self.coco, tamanho="P2", valor=100)
        r = self.client.post(f"/api/boxes/{box.id}/alugar/", {
            "nome": "Carlos 2", "telefone": "85911112222", "email": "x@exemplo.com", "cpf": "246.813.579-28",
            "dia_vencimento": 10, "anexo_pagamento": SimpleUploadedFile("c.pdf", b"%PDF", content_type="application/pdf"),
        }, format="multipart")
        self.assertIn("ex-cliente", str(r.data["cpf"]))
        # alugar de novo: volta a ser cliente
        r = self.client.post(f"/api/boxes/{box.id}/alugar/", {
            "cliente": self.cliente.id, "dia_vencimento": 10,
            "anexo_pagamento": SimpleUploadedFile("c.pdf", b"%PDF", content_type="application/pdf"),
        }, format="multipart")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(self.nomes(), ["Carlos"])
        self.cliente.refresh_from_db()
        self.assertIsNone(self.cliente.excluido_em)

    def test_continua_cliente_se_tem_outro_box(self):
        self.alugar_box()
        r = self.client.post(f"/api/boxes/{self.b1.id}/liberar/")
        self.assertFalse(r.data["cliente_excluido"])
        self.assertEqual(self.nomes(), ["Carlos"])

    def test_comunicado_ignora_excluidos(self):
        self.client.post(f"/api/boxes/{self.b1.id}/liberar/")
        admin = User.objects.create_user("chefe", is_staff=True)
        self.client.force_authenticate(admin)
        self.assertEqual(self.client.get("/api/comunicados/previa/?publico=todos").data["total"], 0)


import tempfile  # noqa: E402
from decimal import Decimal  # noqa: E402
from io import StringIO  # noqa: E402

from django.core.management import call_command  # noqa: E402


@override_settings(MEDIA_ROOT="/tmp/newbox-test-media")
class ImportarPlanilhaTests(APITestCase):
    CABECALHO = "sede;box;tamanho;valor;cliente;cpf_cnpj;whatsapp;email;endereco;inicio;vencimento;observacao\n"

    def importar(self, linhas, *extra):
        with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, encoding="utf-8-sig") as f:
            f.write(self.CABECALHO + "\n".join(linhas))
        saida = StringIO()
        call_command("importar_planilha", f.name, *extra, stdout=saida)
        return saida.getvalue()

    def test_simulacao_nao_grava(self):
        saida = self.importar(["Cocó;1.1;;1250,00;Fulano;529.982.247-25;(85) 9 9999-0000;f@x.com;Rua A, CEP 60000-000;27/06/2025;25;"])
        self.assertIn("SIMULAÇÃO", saida)
        self.assertFalse(Box.objects.exists())

    @mock.patch("boxes.cobranca.hoje", return_value=date(2026, 11, 13))
    def test_importa_aluguel_cnpj_e_estimativas(self, _):
        saida = self.importar([
            "Cocó;1.1;;1250,00;Fulano de Tal;529.982.247-25;(85) 9 9999-0000;F@X.com, outro@x.com;Rua A, 1, CEP 60000-000;27/06/2025;25;",
            "Cocó;2;;765,00;ASSEF AUTOS LTDA;58.457.820/0001-97;(85) 9 9193-1515;a@x.com;Av. B;24/01/2026;;Valor promocional",
            "Cocó;35;;;;;;;;;;",
            "Cambeba;3;;400,00;Fulano de Tal;529.982.247-25;+351 921;;;01/02/2020;5;",
        ], "--confirmar")
        self.assertIn("Dados gravados", saida)
        b = Box.objects.get(sede__nome="Cocó", numero="1.1")
        self.assertEqual((b.tamanho, b.valor, b.dia_vencimento, str(b.alugado_em)), ("G3", Decimal("1250.00"), 25, "2025-06-27"))
        self.assertEqual(b.cobranca_desde, date(2026, 11, 1))  # dia 25/11 ainda vai vencer
        fulano = b.cliente
        self.assertEqual((fulano.email, fulano.endereco), ("f@x.com", "Rua A, 1, CEP 60000-000"))
        self.assertEqual(fulano.boxes.count(), 2)  # mesmo CPF nas duas sedes = mesmo cliente
        assef = Box.objects.get(numero="2").cliente
        self.assertEqual((assef.nome, assef.cpf), ("Assef Autos Ltda", "58457820000197"))
        b2 = Box.objects.get(numero="2")
        self.assertEqual((b2.tamanho, b2.dia_vencimento), ("G1", 25))  # 765 = G1 com 10% de desconto
        self.assertIn("Vencimento estimado: dia 25", b2.observacao)
        self.assertIn("Valor promocional", b2.observacao)
        livre = Box.objects.get(numero="35")
        self.assertEqual((livre.alugado, livre.tamanho, livre.valor), (False, "A definir", 0))
        self.assertIn("Telefone do exterior", Box.objects.get(sede__nome="Cambeba", numero="3").observacao)
        self.assertEqual(Contrato.objects.filter(fim__isnull=True).count(), 3)
        # mensalidades só a partir do próximo vencimento, não desde 2020
        cobranca.garantir_mensalidades(ate=date(2026, 11, 13))
        self.assertEqual(Mensalidade.objects.filter(competencia__lt=date(2026, 11, 1)).count(), 0)
        # Cambeba 3 vence dia 5: o de novembro já passou, então a cobrança começa em dezembro
        self.assertFalse(Mensalidade.objects.filter(box__sede__nome="Cambeba", box__numero="3").exists())
        self.assertEqual(Box.objects.get(sede__nome="Cambeba", numero="3").cobranca_desde, date(2026, 12, 1))
        # rodar de novo não duplica
        self.importar(["Cocó;1.1;;1300,00;Fulano de Tal;529.982.247-25;;;;27/06/2025;25;"], "--confirmar")
        self.assertEqual(Box.objects.count(), 4)
        self.assertEqual(Box.objects.get(numero="1.1").valor, Decimal("1300.00"))
        self.assertEqual(Cliente.objects.count(), 2)

    def test_recusa_banco_com_dados_de_exemplo(self):
        Box.objects.create(sede=Sede.objects.get(nome="Cocó"), tamanho="P1", valor=10)
        with self.assertRaisesMessage(Exception, "--apagar-dados-de-exemplo"):
            self.importar(["Cocó;1;;400;;;;;;;;"], "--confirmar")
        self.importar(["Cocó;1;;400;;;;;;;;"], "--confirmar", "--apagar-dados-de-exemplo")
        self.assertEqual(list(Box.objects.values_list("numero", "tamanho")), [("1", "P1")])

    def test_cnpj_e_numero_pela_api(self):
        ana = User.objects.create_user("52998224725")
        coco = Sede.objects.get(nome="Cocó")
        Funcionario.objects.create(usuario=ana, nome="Ana", cpf="52998224725", sede=coco)
        self.client.force_authenticate(ana)
        box = Box.objects.create(sede=coco, tamanho="P1", valor=100, numero="1.1")
        outro = Box.objects.create(sede=coco, tamanho="P1", valor=100)
        r = self.client.patch(f"/api/boxes/{outro.id}/", {"numero": "1.1"})
        self.assertIn("numero", r.data)
        r = self.client.post(f"/api/boxes/{box.id}/alugar/", {
            "nome": "Empresa X", "telefone": "85999990000", "email": "x@x.com",
            "cpf": "58.457.820/0001-97", "endereco": "Rua Z, 10", "dia_vencimento": 10,
            "anexo_pagamento": SimpleUploadedFile("c.pdf", b"%PDF", content_type="application/pdf"),
        }, format="multipart")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["numero"], "1.1")
        c = Cliente.objects.get()
        self.assertEqual((c.cpf, c.endereco), ("58457820000197", "Rua Z, 10"))
        r = self.client.patch(f"/api/clientes/{c.id}/", {"cpf": "58.457.820/0001-00"})
        self.assertIn("CNPJ inválido", str(r.data["cpf"]))
        pdf = self.client.get(f"/api/contratos/{Contrato.objects.get().id}/pdf/")
        self.assertEqual(pdf.status_code, 200)


class FiltroDiaVencimentoTests(APITestCase):
    def test_clientes_por_dia(self):
        coco = Sede.objects.get(nome="Cocó")
        ana = User.objects.create_user("52998224725")
        Funcionario.objects.create(usuario=ana, nome="Ana", cpf="52998224725", sede=coco)
        self.client.force_authenticate(ana)
        a = Cliente.objects.create(nome="A", telefone="85999990000")
        b = Cliente.objects.create(nome="B", telefone="85999990001")
        for cli, dia in [(a, 5), (a, 20), (b, 10)]:
            Box.objects.create(sede=coco, tamanho="P1", valor=1, cliente=cli, anexo_pagamento="c/x.pdf",
                               dia_vencimento=dia, alugado_em="2026-11-01")
        r = self.client.get("/api/clientes/")
        self.assertEqual({c["nome"]: c["dias_vencimento"] for c in r.data["results"]}, {"A": [5, 20], "B": [10]})
        r = self.client.get("/api/clientes/?dia=5")
        self.assertEqual([c["nome"] for c in r.data["results"]], ["A"])

    def test_admin_filtra_por_sede(self):
        coco, camb = Sede.objects.get(nome="Cocó"), Sede.objects.get(nome="Cambeba")
        self.client.force_authenticate(User.objects.create_user("chefe", is_staff=True))
        a = Cliente.objects.create(nome="A", telefone="85999990000")
        b = Cliente.objects.create(nome="B", telefone="85999990001")
        for cli, sede in [(a, coco), (b, camb), (b, coco)]:
            Box.objects.create(sede=sede, tamanho="P1", valor=1, cliente=cli, anexo_pagamento="c/x.pdf",
                               dia_vencimento=5, alugado_em="2026-11-01")
        nomes = lambda url: [c["nome"] for c in self.client.get(url).data["results"]]  # noqa: E731
        self.assertEqual(nomes(f"/api/clientes/?sede={coco.id}"), ["A", "B"])
        self.assertEqual(nomes(f"/api/clientes/?sede={camb.id}"), ["B"])


@override_settings(MEDIA_ROOT="/tmp/newbox-test-media")
class RelatoriosTests(APITestCase):
    def setUp(self):
        self.coco, self.camb = Sede.objects.get(nome="Cocó"), Sede.objects.get(nome="Cambeba")
        self.cli = Cliente.objects.create(nome="A", telefone="85999990000")
        self.b1 = Box.objects.create(sede=self.coco, numero="1", tamanho="P1", valor=100)
        self.b2 = Box.objects.create(sede=self.coco, numero="2", tamanho="P1", valor=100)
        Box.objects.create(sede=self.camb, numero="1", tamanho="P1", valor=100)
        # b1 alugado desde setembro; b2 teve contrato só em setembro
        Contrato.objects.create(box=self.b2, cliente=self.cli, tamanho="P1", valor=100, dia_vencimento=5,
                                inicio=date(2026, 9, 1), fim=date(2026, 10, 1))
        Box.objects.filter(pk=self.b1.pk).update(cliente=self.cli, anexo_pagamento="c/x.pdf", dia_vencimento=5,
                                                 alugado_em=date(2026, 9, 10))
        Contrato.objects.create(box=self.b1, cliente=self.cli, tamanho="P1", valor=100, dia_vencimento=5,
                                inicio=date(2026, 9, 10))

    @mock.patch("boxes.cobranca.hoje", return_value=date(2026, 11, 13))
    def test_ocupacao_e_pagamentos(self, _):
        # setembro pago em dia, outubro com atraso, novembro em aberto
        cobranca.garantir_mensalidades()
        Mensalidade.objects.filter(competencia=date(2026, 9, 1)).update(pago_em=date(2026, 9, 5), comprovante="c/x.pdf")
        Mensalidade.objects.filter(competencia=date(2026, 10, 1)).update(pago_em=date(2026, 10, 9), comprovante="c/x.pdf")
        admin = User.objects.create_user("chefe", is_staff=True)
        self.client.force_authenticate(admin)
        r = self.client.get(f"/api/relatorios/?meses=3&sede={self.coco.id}")
        self.assertEqual(r.status_code, 200)
        set_, out, nov = r.data["meses"]
        self.assertEqual((set_["mes"], set_["ocupados"], set_["total"]), ("2026-09", 2, 2))
        self.assertEqual((out["ocupados"], nov["ocupados"], nov["ocupacao_pct"]), (1, 1, 50.0))
        self.assertEqual((set_["pago_em_dia"], set_["adimplencia_pct"]), (Decimal("100"), 100.0))
        self.assertEqual((out["pago_atraso"], out["adimplencia_pct"]), (Decimal("100"), 100.0))
        self.assertEqual((nov["em_aberto"], nov["inadimplencia_pct"]), (Decimal("100"), 100.0))
        self.assertEqual([(d["nome"], d["valor"], d["dias_em_atraso"]) for d in r.data["devedores"]],
                         [("A", Decimal("100"), 8)])
        # todas as sedes: 3 boxes
        self.assertEqual(self.client.get("/api/relatorios/?meses=1").data["meses"][0]["total"], 3)

    def test_funcionario_ve_so_a_sede_dele(self):
        bruno = User.objects.create_user("39053344705")
        Funcionario.objects.create(usuario=bruno, nome="Bruno", cpf="39053344705", sede=self.camb)
        self.client.force_authenticate(bruno)
        r = self.client.get(f"/api/relatorios/?meses=1&sede={self.coco.id}")
        self.assertEqual((r.data["sede"], r.data["meses"][0]["total"]), (self.camb.id, 1))
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/api/relatorios/").status_code, 401)


import shutil  # noqa: E402
from pathlib import Path  # noqa: E402

from .models import Alteracao  # noqa: E402

PASTA_BACKUP_TESTE = "/tmp/newbox-test-backups"


@override_settings(MEDIA_ROOT="/tmp/newbox-test-media", NEWBOX_BACKUP_PASTA=PASTA_BACKUP_TESTE,
                   NEWBOX_BACKUP_COPIA="/tmp/newbox-test-backups-copia")
class SegurancaTests(APITestCase):
    def setUp(self):
        shutil.rmtree(PASTA_BACKUP_TESTE, ignore_errors=True)
        shutil.rmtree("/tmp/newbox-test-backups-copia", ignore_errors=True)
        self.coco = Sede.objects.get(nome="Cocó")
        self.ana = User.objects.create_user("52998224725")
        Funcionario.objects.create(usuario=self.ana, nome="Ana Lima", cpf="52998224725", sede=self.coco)
        self.admin = User.objects.create_user("chefe", is_staff=True)
        self.cliente = Cliente.objects.create(nome="Carlos", telefone="85999990000", email="c@x.com")
        Alteracao.objects.all().delete()

    def test_historico_registra_quem_e_o_que_mudou(self):
        self.client.force_authenticate(self.ana)
        self.client.patch(f"/api/clientes/{self.cliente.id}/", {"nome": "Carlos Souza", "email": "novo@x.com"})
        a = Alteracao.objects.get()
        self.assertEqual((a.usuario_nome, a.acao, a.tipo, a.objeto), ("Ana Lima", "alterou", "cliente", "Carlos Souza"))
        self.assertEqual(a.mudancas["nome"]["antes_txt"], "Carlos")
        self.assertEqual(a.mudancas["email"]["depois"], "novo@x.com")
        self.assertNotIn("telefone", a.mudancas)
        # funcionário não vê o histórico; administrador vê
        self.assertEqual(self.client.get("/api/alteracoes/").status_code, 403)
        self.client.force_authenticate(self.admin)
        r = self.client.get("/api/alteracoes/?usuario=Ana Lima")
        self.assertEqual(r.data["count"], 1)
        self.assertEqual(self.client.get("/api/alteracoes/quem/").data["usuarios"], ["Ana Lima"])
        # desfazer
        r = self.client.post(f"/api/alteracoes/{a.id}/desfazer/")
        self.assertEqual(r.status_code, 200, r.data)
        self.cliente.refresh_from_db()
        self.assertEqual((self.cliente.nome, self.cliente.email), ("Carlos", "c@x.com"))
        self.assertEqual(self.client.post(f"/api/alteracoes/{a.id}/desfazer/").status_code, 409)
        self.assertEqual(Alteracao.objects.latest("id").usuario_nome, "Administrador")

    def test_desfazer_exclusao_recria_o_registro(self):
        self.client.force_authenticate(self.ana)
        i = self.client.post("/api/interessados/", {"nome": "Paula", "telefone": "85998765432",
                                                     "email": "p@x.com", "sede": self.coco.id}).data
        self.client.delete(f"/api/interessados/{i['id']}/")
        self.assertFalse(Interessado.objects.exists())
        excl = Alteracao.objects.get(acao="excluiu")
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(f"/api/alteracoes/{excl.id}/desfazer/").status_code, 200)
        volta = Interessado.objects.get(pk=i["id"])
        self.assertEqual((volta.nome, volta.email, volta.sede_id), ("Paula", "p@x.com", self.coco.id))

    def test_restaurar_exige_confirmar(self):
        with self.assertRaisesMessage(Exception, "--confirmar"):
            call_command("restaurar_backup", __file__, stdout=StringIO())


from rest_framework.test import APITransactionTestCase  # noqa: E402


@override_settings(MEDIA_ROOT="/tmp/newbox-test-media", NEWBOX_BACKUP_PASTA=PASTA_BACKUP_TESTE,
                   NEWBOX_BACKUP_COPIA="/tmp/newbox-test-backups-copia")
class RestaurarBackupTests(APITransactionTestCase):
    """Fora da transação de teste: restaurar apaga e recarrega o banco de verdade."""

    serialized_rollback = True  # devolve sedes e catálogo (migrações) para os próximos testes
    setUp = SegurancaTests.setUp

    def test_backup_e_restaurar(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get("/api/backups/").data["backups"], [])
        r = self.client.post("/api/backups/")
        self.assertEqual(r.status_code, 201)
        nome = r.data["nome"]
        self.assertTrue((Path("/tmp/newbox-test-backups-copia") / nome).exists())
        r = self.client.get(f"/api/backups/{nome}/")
        self.assertEqual((r.status_code, r["Content-Type"]), (200, "application/zip"))
        self.assertEqual(self.client.get("/api/backups/..%2Fsettings.py/").status_code, 404)
        self.client.force_authenticate(self.ana)
        self.assertEqual(self.client.post("/api/backups/").status_code, 403)
        # "ex-funcionário" estraga os dados; o backup volta tudo
        Cliente.objects.filter(pk=self.cliente.pk).update(nome="APAGADO")
        Interessado.objects.create(nome="Lixo", telefone="85911112222")
        call_command("restaurar_backup", str(Path(PASTA_BACKUP_TESTE) / nome), "--confirmar", stdout=StringIO())
        self.assertEqual(Cliente.objects.get(pk=self.cliente.pk).nome, "Carlos")
        self.assertFalse(Interessado.objects.exists())
        self.assertTrue(User.objects.filter(username="52998224725").exists())

