# Banco de dados Newbox

PostgreSQL. Arquivos:

- `schema.sql`: tabelas, regras e view de resumo
- `seed.sql`: dados de exemplo (opcional)

```bash
createdb newbox
psql -d newbox -f database/schema.sql
psql -d newbox -f database/seed.sql
```

## Tabelas

| Tabela    | Campos                                                                     |
|-----------|----------------------------------------------------------------------------|
| `sede`    | id, nome, endereco                                                         |
| `cliente` | id, nome                                                                   |
| `box`     | id, sede_id, tamanho, valor, cliente_id (cliente que aluga), anexo_pagamento |

## Relacionamentos

- **sede 1 → N box**: uma sede Newbox tem muitos boxes (`box.sede_id`)
- **cliente 1 → N box**: um cliente pode alugar muitos boxes (`box.cliente_id`)

## Regras

- Todos os campos são obrigatórios (NOT NULL, e textos não podem ficar em branco).
- Exceção lógica no box: se o box está **alugado**, *cliente* e *anexo de pagamento*
  são obrigatórios juntos. Se está **livre**, os dois ficam vazios.
- Não dá para apagar uma sede que tem boxes, nem um cliente que aluga boxes.

## Número de box / Alugados / Não alugados

São calculados automaticamente pela view `vw_sede_resumo`, sem coluna guardada:

```sql
SELECT * FROM vw_sede_resumo;
```
