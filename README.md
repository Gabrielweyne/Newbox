# Newbox

API da Newbox (aluguel de boxes) em **Django REST Framework** + **PostgreSQL**.

## Como rodar

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
createdb newbox
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

Configuração por variáveis de ambiente: `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`,
`DJANGO_SECRET_KEY` (também assina os JWT), `DJANGO_DEBUG` (`1`/`0`), `DJANGO_ALLOWED_HOSTS` (separados por vírgula).

Testes: `python manage.py test boxes`

## Modelo de dados (app `boxes`)

| Model     | Campos                                                                 |
|-----------|------------------------------------------------------------------------|
| `Sede`    | nome (único), endereco                                                 |
| `Cliente` | nome                                                                   |
| `Box`     | sede, tamanho, valor, cliente (quem aluga), anexo_pagamento (arquivo) |
| `Funcionario` | usuario (login), nome, cpf (único, validado), sede               |

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

1. O funcionário se cadastra em `POST /api/auth/registro/` com `nome`, `cpf`, `sede`, `senha` e `confirmar_senha`.
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

Segurança:
- Login limitado a 10 tentativas por minuto por IP.
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
