# Como testar o sistema Newbox no seu computador

## 1. Instale dois programas (só na primeira vez)

- **Python 3.12**: https://www.python.org/downloads/
  No Windows, na primeira tela do instalador, **marque "Add python.exe to PATH"**.
- **Node.js (versão LTS)**: https://nodejs.org

Não precisa instalar banco de dados: para testar, o sistema usa um banco em arquivo.

## 2. Inicie o sistema

1. Descompacte o arquivo `Newbox.zip` numa pasta (ex.: Documentos).
2. Abra a pasta `Newbox`.
3. **Windows:** dê dois cliques em `iniciar.bat`.
   **Mac/Linux:** abra o Terminal na pasta e rode `./iniciar.sh`.

Na primeira vez ele baixa e instala as dependências (alguns minutos). Depois abre o
navegador em **http://localhost:3000**. No Windows, duas janelas pretas ficam abertas:
são o sistema rodando. Para desligar, feche essas janelas.

> Se o Windows mostrar "O Windows protegeu o computador", clique em **Mais informações →
> Executar assim mesmo**. Se o firewall perguntar, pode permitir o acesso.

O endereço **http://localhost:3000** abre a **página pública** (a que os clientes veem). Para
entrar no sistema, clique em **"Área do funcionário"** no topo.

## 3. Entre com um dos usuários de exemplo

Senha de todos: **Newbox#2026**

| Quem | CPF | O que ver |
|------|-----|-----------|
| Administrador | 111.444.777-35 | As duas sedes, aprovação de funcionários |
| Ana Lima (Cocó) | 529.982.247-25 | Só a sede Cocó |
| Bruno Melo (Cambeba) | 390.533.447-05 | Só a sede Cambeba |
| Carla Dias (Cocó) | 153.509.460-56 | Cadastro aguardando aprovação (não entra até o admin aprovar) |

Já existem boxes, clientes e mensalidades — inclusive algumas **atrasadas**, para ver o
sininho e os avisos funcionando. Na **Lista de espera** há duas pessoas: entre como Ana,
**libere o box do Pedro Rocha** (3x3 m) e veja o aviso para chamar o Rui no WhatsApp.

## O que testar

- Login, cadastro de funcionário novo e aprovação pelo administrador
- Painel da sede, boxes livres e alugados
- Alugar um box (escolhendo o dia de vencimento e anexando qualquer PDF ou foto)
- Mensalidades: registrar pagamento, desfazer, navegar entre meses
- Sininho de avisos no topo
- "Esqueci minha senha": no teste, o e-mail **não é enviado de verdade**; ele aparece na
  janela preta do servidor (Django), com o link para criar a nova senha

> Neste modo de teste o sistema abre só no próprio computador (não pelo celular).

## Nas próximas vezes

Depois da primeira instalação, para ligar servidor e site **juntos numa só janela**:

```
py rodar.py
```

(Mac/Linux: `python3 rodar.py`.) No VS Code: **Terminal → Executar Tarefa de Compilação** (ou Ctrl+Shift+B). Para desligar, Ctrl+C.

## Comandos úteis

Recriar os dados de exemplo do zero (apaga tudo o que você testou). No Windows, rode no
Prompt de Comando dentro da pasta `Newbox`:

```
.venv\Scripts\python manage.py dados_exemplo --apagar
```

Mac/Linux:

```
.venv/bin/python manage.py dados_exemplo --apagar
```

Simular o e-mail diário de vencimentos (aparece na janela do servidor):

```
.venv\Scripts\python manage.py avisar_vencimentos --forcar
```

## Deu erro?

Copie a mensagem de erro da janela preta e mande para o Claude (sem senhas).
