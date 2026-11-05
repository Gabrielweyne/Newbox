-- =====================================================================
-- Banco de dados Newbox (PostgreSQL)
--
-- Relacionamentos:
--   sede    1 ──── N  box   (uma sede Newbox tem muitos boxes)
--   cliente 1 ──── N  box   (um cliente pode alugar muitos boxes)
--
-- "Número de box", "Alugados" e "Não alugados" da sede NÃO são
-- guardados como colunas: são calculados a partir da tabela box
-- (view vw_sede_resumo), assim nunca ficam desatualizados.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- SEDE (tabela "NEWBOX" do desenho)
-- ---------------------------------------------------------------------
CREATE TABLE sede (
    id          SERIAL PRIMARY KEY,
    nome        VARCHAR(120) NOT NULL UNIQUE CHECK (btrim(nome) <> ''),     -- Nome Sede
    endereco    VARCHAR(255) NOT NULL        CHECK (btrim(endereco) <> ''), -- Endereço
    criado_em   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- CLIENTE
-- ---------------------------------------------------------------------
CREATE TABLE cliente (
    id          SERIAL PRIMARY KEY,
    nome        VARCHAR(150) NOT NULL CHECK (btrim(nome) <> ''),  -- Nome
    criado_em   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- BOX
-- ---------------------------------------------------------------------
CREATE TABLE box (
    id               SERIAL PRIMARY KEY,
    sede_id          INTEGER       NOT NULL
                     REFERENCES sede (id) ON DELETE RESTRICT,
    tamanho          VARCHAR(50)   NOT NULL CHECK (btrim(tamanho) <> ''),  -- Tamanho (ex.: '2x2 m', 'P', 'M', 'G')
    valor            NUMERIC(10,2) NOT NULL CHECK (valor >= 0),  -- Valor (R$)
    cliente_id       INTEGER
                     REFERENCES cliente (id) ON DELETE RESTRICT, -- Cliente que aluga (NULL = livre)
    anexo_pagamento  VARCHAR(500),              -- Caminho/URL do comprovante de pagamento
    criado_em        TIMESTAMPTZ   NOT NULL DEFAULT now(),

    -- Todos os campos são obrigatórios. "Cliente que aluga" e "Anexo pagamento"
    -- só existem quando o box está alugado; por isso a regra é:
    --   box alugado  -> cliente E anexo de pagamento obrigatórios
    --   box livre    -> nenhum dos dois (é o que conta como "Não alugado")
    CONSTRAINT ck_box_aluguel_completo CHECK (
        (cliente_id IS NULL AND anexo_pagamento IS NULL)
        OR
        (cliente_id IS NOT NULL AND anexo_pagamento IS NOT NULL
         AND btrim(anexo_pagamento) <> '')
    )
);

CREATE INDEX idx_box_sede    ON box (sede_id);
CREATE INDEX idx_box_cliente ON box (cliente_id);

-- ---------------------------------------------------------------------
-- Resumo por sede: Número de box / Alugados / Não alugados
-- ---------------------------------------------------------------------
CREATE VIEW vw_sede_resumo AS
SELECT
    s.id,
    s.nome,
    s.endereco,
    COUNT(b.id)                                   AS numero_de_box,
    COUNT(b.id) FILTER (WHERE b.cliente_id IS NOT NULL) AS alugados,
    COUNT(b.id) FILTER (WHERE b.cliente_id IS NULL)     AS nao_alugados
FROM sede s
LEFT JOIN box b ON b.sede_id = s.id
GROUP BY s.id, s.nome, s.endereco;

COMMIT;
