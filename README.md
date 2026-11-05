# Newbox

API da Newbox (aluguel de boxes) em **Django REST Framework** + **PostgreSQL**.

## Como rodar

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
createdb newbox
cp .env.example .env   # e preencha
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

As configurações ficam no arquivo `.env` (modelo em `.env.example`), ou em variáveis de ambiente: `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`,
`DJANGO_SECRET_KEY` (também assina os JWT), `DJANGO_DEBUG` (`1`/`0`), `DJANGO_ALLOWED_HOSTS` (separados por vírgula).

Testes: `python manage.py test boxes`

## Modelo de dados (app `boxes`)

| Model     | Campos                                                                 |
|-----------|------------------------------------------------------------------------|
| `Sede`    | nome (único), endereco                                                 |
| `Cliente` | nome                                                                   |
| `Box`     | sede, tamanho, valor, cliente (quem aluga), anexo_pagamento (arquivo) |
| `Funcionario` | usuario (login + e-mail), nome, cpf (único, validado), sede      |

- **Sede 1 → N Box**: uma sede tem muitos boxes
- **Cliente 1 → N Box**: um cliente pode alugar muitos boxes
- **Sede 1 → N Funcionario**: cada funcionário trabalha em uma sede

As sedes **Cocó** e **Cambeba** são criadas pela migration `0003` (endereço provisório, editar no `/admin/`).

Regras (validadas na API **e** no banco):
- Todos os campos são obrigatórios e não podem ficar em branco.
- Box **alugado**: cliente e anexo de pagamento são obrigatórios juntos. Box **livre**: os dois ficam vazios.
- Não é possível apagar sede ou cliente que tenha boxes vinculados (a API responde 409).

## Endpoints

## Autenticação (JWT)

1. O funcionário se cadastra em `POST /api/auth/registro/` com `nome`, `cpf`, `email`, `sede`, `senha` e `confirmar_senha`.
2. A conta nasce **aguardando aprovação**. Um administrador aprova em `/admin/` → Funcionários →
   selecionar → ação "Aprovar acesso".
3. Login em `POST /api/auth/login/` com `cpf` e `senha`. A resposta traz:
   - `access`: token JWT de acesso (vale 30 min)
   - `refresh`: token para renovar o acesso (vale 1 dia)
   - `sede`: `{id, nome}` da sede do funcionário, para o site direcioná-lo (`null` para admin)
   - `funcionario`: dados do funcionário
4. Nas demais chamadas envie o header `Authorization: Bearer <access>`.
5. Quando o `access` expirar: `POST /api/auth/token/refresh/` com `{refresh}` devolve um novo par.
   O refresh antigo deixa de valer (rotação).
6. `POST /api/auth/logout/` com `{refresh}` invalida o refresh token.
7. `GET /api/auth/eu/` mostra quem está logado e a sede.

### Esqueci minha senha

1. `POST /api/auth/senha/esqueci/` com `{cpf}`. Se houver funcionário **aprovado** com esse CPF,
   ele recebe um e-mail com o link `{FRONTEND_URL}/redefinir-senha?uid=...&token=...`.
   A resposta é sempre a mesma, exista ou não o CPF (não revela quem é cadastrado).
2. A página do site lê `uid` e `token` do link e envia
   `POST /api/auth/senha/redefinir/` com `{uid, token, senha, confirmar_senha}`.
3. O link vale 1 hora (`PASSWORD_RESET_HORAS`), só pode ser usado uma vez, e a troca
   derruba as sessões (JWT) abertas.

Sem configuração de e-mail, as mensagens só aparecem no terminal do `runserver`.

#### Configurando o envio pelo Gmail

1. Crie uma conta Gmail para a empresa (ex.: `newbox.fortaleza@gmail.com`).
2. Ative a **Verificação em duas etapas**: Conta Google → Segurança.
3. Gere uma **senha de app**: https://myaccount.google.com/apppasswords → dê o nome
   "Newbox site" → copie a senha de 16 letras (aparece só uma vez).
4. No `.env`, preencha `EMAIL_HOST_USER` e `DEFAULT_FROM_EMAIL` com o endereço do Gmail e
   `EMAIL_HOST_PASSWORD` com a senha de app (sem espaços). Os demais campos de e-mail do
   `.env.example` já estão prontos para o Gmail.
5. Teste: `python manage.py sendtestemail seu.email.pessoal@exemplo.com`

Observações: o Gmail gratuito envia até ~500 e-mails por dia (de sobra para recuperação de
senha). Se a senha da conta Google for trocada, a senha de app deixa de valer e é preciso
gerar outra.

O administrador pode corrigir o e-mail de um funcionário em `/admin/` → Funcionários.

Segurança:
- Login limitado a 10 tentativas por minuto por IP; pedidos de senha, a 5 por minuto.
- Bloquear o funcionário no admin ou trocar a senha dele derruba os tokens já emitidos.
- Durações configuráveis por `JWT_ACCESS_MINUTOS` e `JWT_REFRESH_DIAS`.
- O token carrega `nome`, `sede_id` e `sede_nome` só para o front-end exibir; as
  permissões sempre consultam a sede no banco.

A senha passa pelas regras de senha do Django (mínimo 8 caracteres, não pode ser comum,
só numérica ou parecida com o nome/CPF).

## Acesso por sede

| Quem | O que pode |
|------|------------|
| Administrador (`is_staff`) | Tudo, nas duas sedes |
| Funcionário | Só boxes, dados e colegas da **própria sede**. Ao criar box, a sede dele é usada automaticamente. Não pode mover box para outra sede nem alterar o cadastro da sede |
| Outro usuário logado | Nada |

Clientes são **compartilhados** entre as sedes (o mesmo cliente pode alugar no Cocó e no Cambeba).

Todos os endpoints abaixo exigem login, exceto os indicados como abertos.

| Rota              | Descrição                                                                 |
|-------------------|---------------------------------------------------------------------------|
| `/api/sedes/`     | CRUD de sedes. Inclui `numero_de_box`, `alugados`, `nao_alugados` (calculados) |
| `/api/clientes/`  | CRUD de clientes                                                          |
| `/api/boxes/`     | CRUD de boxes. Filtros: `?sede=`, `?cliente=`, `?alugado=true\|false`     |
| `/api/funcionarios/` | Consulta de funcionários (somente leitura). Filtro: `?sede=` |
| `/api/funcionarios/sedes/` | Aberto: lista as sedes para o formulário de cadastro |
| `/admin/`         | Painel administrativo do Django                                           |

O comprovante é enviado como arquivo (`multipart/form-data`) no campo `anexo_pagamento`
e fica salvo em `media/comprovantes/AAAA/MM/`.
