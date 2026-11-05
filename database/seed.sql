-- Dados de exemplo para testes (opcional)
BEGIN;

INSERT INTO sede (nome, endereco) VALUES
    ('Newbox Centro', 'Rua Exemplo, 100 - Centro'),
    ('Newbox Norte',  'Av. Exemplo, 2000 - Zona Norte');

INSERT INTO cliente (nome) VALUES
    ('Maria Silva'),
    ('João Souza');

INSERT INTO box (sede_id, tamanho, valor, cliente_id, anexo_pagamento) VALUES
    (1, '2x2 m', 250.00, 1,    'comprovantes/box1.pdf'),
    (1, '3x3 m', 400.00, 1,    'comprovantes/box2.pdf'),
    (1, '2x2 m', 250.00, NULL, NULL),
    (2, '4x4 m', 600.00, 2,    'comprovantes/box4.pdf'),
    (2, '3x3 m', 400.00, NULL, NULL);

COMMIT;
