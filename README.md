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

- **Sede 1 → N Box**: uma sede tem muitos boxes
- **Cliente 1 → N Box**: um cliente pode alugar muitos boxes

Regras (validadas na API **e** no banco):
- Todos os campos são obrigatórios e não podem ficar em branco.
- Box **alugado**: cliente e anexo de pagamento são obrigatórios juntos. Box **livre**: os dois ficam vazios.
- Não é possível apagar sede ou cliente que tenha boxes vinculados (a API responde 409).

## Endpoints

Todos exigem login (sessão em `/api-auth/login/`).

| Rota              | Descrição                                                                 |
|-------------------|---------------------------------------------------------------------------|
| `/api/sedes/`     | CRUD de sedes. Inclui `numero_de_box`, `alugados`, `nao_alugados` (calculados) |
| `/api/clientes/`  | CRUD de clientes                                                          |
| `/api/boxes/`     | CRUD de boxes. Filtros: `?sede=`, `?cliente=`, `?alugado=true\|false`     |
| `/admin/`         | Painel administrativo do Django                                           |

O comprovante é enviado como arquivo (`multipart/form-data`) no campo `anexo_pagamento`
e fica salvo em `media/comprovantes/AAAA/MM/`.
