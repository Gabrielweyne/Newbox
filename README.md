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
`DJANGO_SECRET_KEY`, `DJANGO_DEBUG` (`1`/`0`), `DJANGO_ALLOWED_HOSTS` (separados por vírgula).

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

## Login de funcionários

1. O funcionário se cadastra em `POST /api/auth/registro/` com `nome`, `cpf`, `sede`, `senha` e `confirmar_senha`.
2. A conta nasce **aguardando aprovação**. Um administrador aprova em `/admin/` → Funcionários →
   selecionar → ação "Aprovar acesso".
3. Login em `POST /api/auth/login/` com `cpf` e `senha`, que devolve um `token`.
4. Nas demais chamadas, envie o header `Authorization: Token <token>`.
5. `GET /api/auth/eu/` mostra quem está logado; `POST /api/auth/logout/` invalida o token.

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
