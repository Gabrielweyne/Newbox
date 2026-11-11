# Newbox

Sistema interno da Newbox (aluguel de boxes):

- `boxes/`, `config/`: API em **Django REST Framework** + **PostgreSQL**
- `frontend/`: site dos funcionários em **React** (Vite + Tailwind), com o visual de newboxbrasil.com.br

## Testar rápido no computador

Veja **[COMO_TESTAR.md](COMO_TESTAR.md)**: um clique em `iniciar.bat` (Windows) ou
`./iniciar.sh` (Mac/Linux) instala tudo, cria dados de exemplo e abre o site. Usa SQLite, sem
precisar instalar o PostgreSQL.

## Como rodar a API

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
createdb newbox
cp .env.example .env   # e preencha
python manage.py migrate
python manage.py createsuperuser   # use o CPF (só números) como "Username"
python manage.py runserver
```

O login do site é feito por CPF, então o **administrador também usa o CPF** como nome de usuário.

## Como rodar o site

Precisa do [Node.js](https://nodejs.org) 20 ou mais novo. Com a API rodando em outro terminal:

```bash
cd frontend
npm install
npm run dev
```

Abra http://localhost:3000: a **página pública** (visitantes) fica em `/` e a **área dos
funcionários** em `/painel` (login em `/login`). Em desenvolvimento, o site repassa `/api` e `/media` para o Django
na porta 8000 (veja `frontend/vite.config.js`).

Telas: login, cadastro, esqueci/redefinir senha, painel da sede (com vencimentos do dia e
atrasos), boxes (cadastrar, alugar com comprovante e dia de vencimento, liberar, excluir),
mensalidades (registrar pagamentos mês a mês), clientes e, para o administrador, aprovação de
funcionários. O sininho no topo mostra quem pagou e quem não pagou nos dias de vencimento.

Para gerar a versão de produção: `npm run build` (arquivos em `frontend/dist/`).

As configurações ficam no arquivo `.env` (modelo em `.env.example`), ou em variáveis de ambiente: `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`,
`DJANGO_SECRET_KEY` (também assina os JWT), `DJANGO_DEBUG` (`1`/`0`), `DJANGO_ALLOWED_HOSTS` (separados por vírgula).

Testes: `python manage.py test boxes`

## Modelo de dados (app `boxes`)

| Model     | Campos                                                                 |
|-----------|------------------------------------------------------------------------|
| `Sede`    | nome (único), endereco                                                 |
| `Cliente` | nome, telefone (WhatsApp, obrigatório para novos), cpf (opcional, validado, único), email (opcional) |
| `Box`     | sede, tamanho, valor, cliente (quem aluga), anexo_pagamento (arquivo), dia_vencimento, alugado_em |
| `Mensalidade` | box, cliente, competencia (mês), vencimento, valor, pago_em, comprovante, registrado_por |
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

## Catálogo de tamanhos (por unidade)

- Cada unidade tem seu catálogo (tela **Tamanhos**): código (P1, M1 SUP, G4...), dimensões,
  área, volume, sugestão de uso e valor mensal. Carregado dos catálogos em PDF da Newbox Sede
  (Cambeba) e da Newbox Cocó.
- Ao cadastrar um box, escolhe-se o tamanho do catálogo e o valor vem preenchido (pode ser
  ajustado). Ainda é possível cadastrar um tamanho "fora do catálogo".
- Só o administrador altera o catálogo; a mudança vale na hora para a página pública e para os
  próximos boxes (boxes já cadastrados mantêm o valor deles).
- Cada unidade tem nome público ("Newbox Sede (Cambeba)", "Newbox Cocó") e o **próprio WhatsApp**
  (editáveis em `/admin/` → Sedes).

## Página pública (visitantes)

Em `/`: conteúdo dos catálogos (diferenciais, soluções para empresas, facilidades extras), o
**catálogo de cada unidade** com medidas, sugestão de uso, preço e disponibilidade em tempo real
("Disponível" ou "Consulte"), endereços com Google Maps, horário e um formulário que abre o
**WhatsApp da unidade escolhida** com a mensagem pronta. Configurável no `.env`:
`NEWBOX_WHATSAPP` (principal, só números com 55 + DDD), `NEWBOX_TELEFONE`, `NEWBOX_EMAIL`,
`NEWBOX_INSTAGRAM`, `NEWBOX_HORARIO`.

## Clientes e cobrança pelo WhatsApp

- Cliente novo precisa de **WhatsApp**; CPF e e-mail são opcionais. Clientes antigos sem
  WhatsApp aparecem com o aviso "Sem WhatsApp" para completar o cadastro.
- **Ficha do cliente** (`/clientes/<id>`): contato, total em atraso, boxes alugados e histórico
  de mensalidades, com registrar pagamento e cobrar.
- Mensalidades **atrasadas** ou que **vencem hoje** têm o botão **Cobrar no WhatsApp**, com a
  mensagem pronta (box, valor e vencimento), no painel, na página de mensalidades e na ficha.

## Contratos e histórico

- Cada aluguel gera um **contrato** (cliente, box, valor, vencimento, início). Ao **liberar** o
  box, o contrato é **encerrado** com a data de fim e fica no histórico.
- **PDF do contrato**: botão "Contrato" no box alugado e "Baixar PDF" na ficha do cliente.
- Ficha do cliente mostra todos os contratos, com **por quanto tempo** alugou; cada box tem
  o botão **Histórico** com quem já o alugou.
- Box ou cliente com contratos no histórico **não pode ser excluído** (para não perder o registro).
- **As cláusulas são um modelo genérico**: revise com um advogado e edite em
  `boxes/templates/contrato/clausulas.txt` (não precisa mexer no código). Dados da empresa no
  `.env`: `NEWBOX_RAZAO_SOCIAL`, `NEWBOX_CNPJ`, `NEWBOX_CIDADE`.

## Lista de espera e vagas nas duas sedes

- Quando um cliente chamar e não houver box livre, o funcionário anota em **Lista de espera**
  (nome, WhatsApp, unidade ou "qualquer uma", tamanho ou "qualquer um"). A lista é
  compartilhada entre as sedes.
- Ao **liberar** ou **cadastrar** um box que sirva para alguém da lista, o sininho e o painel
  avisam os funcionários da sede do box, com o botão **Chamar no WhatsApp** (mensagem pronta).
  Marcar "contatado", "alugou" ou "desistiu" tira o aviso.
- O quadro **Boxes livres nas sedes** (painel e lista de espera) mostra quantos boxes de cada
  tamanho estão livres em cada unidade e a partir de qual valor, para oferecer a outra unidade.
  Ao anotar alguém, o sistema já avisa se há vaga em outra sede.

## Mensalidades e avisos de vencimento

- Ao alugar, escolhe-se o **dia de vencimento**: 5, 10, 15, 20, 25 ou 30 (em meses mais curtos,
  o 30 vira o último dia do mês).
- Cada box alugado gera **uma mensalidade por mês** automaticamente. A primeira já nasce paga,
  com o comprovante anexado no aluguel.
- Para registrar um pagamento, o funcionário anexa o comprovante (tela Mensalidades, painel ou
  sininho). Um registro feito por engano pode ser desfeito.
- Ao **liberar** um box, mensalidades ainda não vencidas são apagadas; as **atrasadas continuam**
  registradas (o cliente ainda deve).
- Mudar o valor ou o dia de vencimento de um box alugado atualiza as mensalidades futuras não pagas.

### Avisos

- **No site:** sininho com o número de pendências, faixa amarela nos dias de vencimento enquanto
  alguém não pagou, e quadro "Vencem hoje / Em atraso" no painel.
- **Por e-mail:** o comando abaixo envia, nos dias de vencimento, para os funcionários de cada
  sede (e um resumo das duas sedes para os administradores) a lista de quem pagou, quem não pagou
  e quem está atrasado. Nos outros dias ele não envia nada.

```bash
python manage.py avisar_vencimentos                       # roda o envio de hoje
python manage.py avisar_vencimentos --data 2026-12-10     # simula outro dia
```

Ele precisa rodar **uma vez por dia** no servidor. No Linux, com `crontab -e`:

```
0 8 * * * cd /caminho/para/Newbox && .venv/bin/python manage.py avisar_vencimentos
```

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
| `/api/clientes/`  | CRUD de clientes. Busca por nome, WhatsApp ou CPF: `?busca=`. `GET .../<id>/ficha/` (boxes e mensalidades do cliente) |
| `/api/boxes/`     | CRUD de boxes. Filtros: `?sede=`, `?cliente=`, `?alugado=true\|false`. `POST /api/boxes/<id>/liberar/` encerra o aluguel |
| `/api/funcionarios/` | Consulta de funcionários. Filtros: `?sede=`, `?aprovado=true\|false`. Admin: `POST .../<id>/aprovar/` e `.../<id>/bloquear/` |
| `/api/funcionarios/sedes/` | Aberto: lista as sedes para o formulário de cadastro |
| `/api/mensalidades/` | Mensalidades. Filtros: `?competencia=AAAA-MM`, `?situacao=paga\|pendente\|atrasada\|vence_hoje\|a_vencer`, `?box=`, `?sede=`. `GET .../avisos/` (vencem hoje + atrasadas), `POST .../<id>/pagar/` (comprovante, pago_em), `POST .../<id>/desfazer/` |
| `/api/interessados/` | Lista de espera (CRUD). `?situacao=`. `GET .../oportunidades/` (quem já tem vaga na sua sede), `GET .../tamanhos/` |
| `/api/disponibilidade/` | Boxes livres por sede e tamanho, com valor mínimo (sem dados de clientes) |
| `/api/contratos/` | Contratos (somente leitura). `?cliente=`, `?box=`, `?ativo=true\|false`. `GET .../<id>/pdf/` baixa o PDF |
| `/api/tipos/`     | Catálogo de tamanhos. `?sede=`. Leitura para todos; criar/editar/excluir só admin |
| `/api/publico/`   | **Aberto.** Sedes, endereços, tamanhos de box e se há algum livre, mais os contatos (sem clientes, valores ou quantidades) |
| `/admin/`         | Painel administrativo do Django                                           |

O comprovante é enviado como arquivo (`multipart/form-data`) no campo `anexo_pagamento`
e fica salvo em `media/comprovantes/AAAA/MM/`.
