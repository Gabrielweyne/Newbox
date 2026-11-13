import { useCallback, useEffect, useState } from "react";
import Confirmar from "../componentes/Confirmar";
import { IconeHistorico } from "../componentes/Icones";
import { Banner } from "../componentes/Layout";
import { Aviso, Botao, Carregando, Cartao, Etiqueta, Vazio } from "../componentes/ui";
import { api } from "../api";

const ACOES = {
  criou: { rotulo: "Criou", cor: "verde" },
  alterou: { rotulo: "Alterou", cor: "roxo" },
  excluiu: { rotulo: "Excluiu", cor: "vermelho" },
};

const quando = (iso) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

const tamanho = (bytes) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`);

/* ---------- Backups ---------- */

function Backups() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [fazendo, setFazendo] = useState(false);

  const carregar = useCallback(() => {
    api("/backups/").then(setDados).catch((e) => setErro(e.message));
  }, []);
  useEffect(carregar, [carregar]);

  async function baixar(nome) {
    try {
      const blob = await api(`/backups/${nome}/`, { arquivo: true });
      const url = URL.createObjectURL(blob);
      Object.assign(document.createElement("a"), { href: url, download: nome }).click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErro(e.message);
    }
  }

  async function fazerAgora() {
    setFazendo(true);
    setErro("");
    try {
      const r = await api("/backups/", { metodo: "POST" });
      carregar();
      await baixar(r.nome);
    } catch (e) {
      setErro(e.message);
    } finally {
      setFazendo(false);
    }
  }

  const ultimo = dados?.backups[0];
  return (
    <Cartao className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-marinho">Backup (cópia de segurança)</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-marinho-claro/70">
            Cópia completa de todos os dados e comprovantes. O sistema faz um por dia sozinho e guarda os últimos 30. Se
            alguém apagar ou estragar informações, dá para voltar ao dia anterior.
          </p>
        </div>
        <Botao onClick={fazerAgora} carregando={fazendo}>
          Fazer backup e baixar
        </Botao>
      </div>
      <div className="mt-4 space-y-3">
        <Aviso>{erro}</Aviso>
        {!dados && !erro ? (
          <Carregando />
        ) : dados && (
          <>
            {ultimo ? (
              <Aviso tipo="sucesso">Último backup: {quando(ultimo.criado_em)} ({tamanho(ultimo.tamanho)}).</Aviso>
            ) : (
              <Aviso tipo="info">Ainda não há backups. Clique em "Fazer backup e baixar".</Aviso>
            )}
            {!dados.copia_externa && (
              <Aviso tipo="info">
                Os backups estão só neste computador. Para ter uma cópia fora dele, peça para configurar a pasta do Google
                Drive (NEWBOX_BACKUP_COPIA no .env) ou baixe um backup de vez em quando e guarde em outro lugar.
              </Aviso>
            )}
            {dados.backups.length > 0 && (
              <ul className="divide-y divide-roxo-100 rounded-md ring-1 ring-roxo-100">
                {dados.backups.slice(0, 7).map((b) => (
                  <li key={b.nome} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <span>
                      {quando(b.criado_em)} <span className="text-xs text-marinho-claro/60">· {tamanho(b.tamanho)}</span>
                    </span>
                    <button onClick={() => baixar(b.nome)} className="text-xs font-medium text-roxo hover:underline">
                      Baixar
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-marinho-claro/60">
              Para voltar a um backup é preciso rodar um comando no computador do sistema (fica no LEIA-ME dentro do
              arquivo). Isso evita que alguém apague tudo pelo site.
            </p>
          </>
        )}
      </div>
    </Cartao>
  );
}

/* ---------- Histórico de alterações ---------- */

function Mudancas({ alteracao }) {
  const [tudo, setTudo] = useState(false);
  const itens = Object.entries(alteracao.mudancas);
  const visiveis = tudo ? itens : itens.slice(0, 4);
  if (!itens.length) return null;
  return (
    <ul className="mt-2 space-y-0.5 text-xs">
      {visiveis.map(([campo, m]) => (
        <li key={campo} className="text-marinho-claro">
          <span className="font-medium text-marinho">{m.rotulo}:</span>{" "}
          {alteracao.acao === "alterou" ? (
            <>
              <span className="text-red-700 line-through decoration-red-300">{m.antes_txt}</span> →{" "}
              <span className="text-emerald-800">{m.depois_txt}</span>
            </>
          ) : (
            <span>{alteracao.acao === "excluiu" ? m.antes_txt : m.depois_txt}</span>
          )}
        </li>
      ))}
      {itens.length > 4 && (
        <li>
          <button onClick={() => setTudo((v) => !v)} className="font-medium text-roxo hover:underline">
            {tudo ? "Mostrar menos" : `Mostrar mais ${itens.length - 4} campo(s)`}
          </button>
        </li>
      )}
    </ul>
  );
}

function Historico() {
  const [filtros, setFiltros] = useState({ usuario: "", tipo: "", acao: "", busca: "" });
  const [opcoes, setOpcoes] = useState({ usuarios: [], tipos: [] });
  const [lista, setLista] = useState(null);
  const [proxima, setProxima] = useState(null);
  const [erro, setErro] = useState("");
  const [desfazendo, setDesfazendo] = useState(null);
  const mudar = (c) => (e) => setFiltros((f) => ({ ...f, [c]: e.target.value }));

  useEffect(() => {
    api("/alteracoes/quem/").then(setOpcoes).catch(() => {});
  }, []);

  const carregar = useCallback(
    (pagina = 1) => {
      const p = new URLSearchParams({ page: pagina });
      Object.entries(filtros).forEach(([k, v]) => v && p.set(k, v));
      if (pagina === 1) setLista(null);
      api(`/alteracoes/?${p}`)
        .then((r) => {
          setLista((l) => (pagina === 1 ? r.results : [...(l || []), ...r.results]));
          setProxima(r.next ? pagina + 1 : null);
        })
        .catch((e) => setErro(e.message));
    },
    [filtros]
  );
  useEffect(() => {
    const t = setTimeout(() => carregar(1), 250);
    return () => clearTimeout(t);
  }, [carregar]);

  const classeFiltro =
    "rounded-md border border-roxo-200 bg-white px-3 py-2 text-sm focus:border-roxo focus:ring-2 focus:ring-roxo-100 focus:outline-none";

  return (
    <Cartao className="overflow-hidden">
      <div className="space-y-3 p-5">
        <div>
          <h2 className="font-semibold text-marinho">Histórico de alterações</h2>
          <p className="mt-0.5 text-sm text-marinho-claro/70">
            Quem criou, mudou ou excluiu o quê, e quando. Se algo foi feito errado (ou de propósito), use "Desfazer".
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-4">
          <select aria-label="Quem" value={filtros.usuario} onChange={mudar("usuario")} className={classeFiltro}>
            <option value="">Todas as pessoas</option>
            {opcoes.usuarios.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
          <select aria-label="Tipo" value={filtros.tipo} onChange={mudar("tipo")} className={classeFiltro}>
            <option value="">Tudo</option>
            {opcoes.tipos.map((t) => (
              <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
          <select aria-label="Ação" value={filtros.acao} onChange={mudar("acao")} className={classeFiltro}>
            <option value="">Criou, alterou ou excluiu</option>
            {Object.entries(ACOES).map(([v, a]) => (
              <option key={v} value={v}>{a.rotulo}</option>
            ))}
          </select>
          <input
            type="search"
            placeholder="Buscar (nome, box...)"
            value={filtros.busca}
            onChange={mudar("busca")}
            className={classeFiltro}
          />
        </div>
        <Aviso>{erro}</Aviso>
      </div>

      {!lista && !erro ? (
        <Carregando />
      ) : lista?.length === 0 ? (
        <Vazio icone={IconeHistorico} titulo="Nenhuma alteração encontrada" />
      ) : (
        <ul className="divide-y divide-roxo-100 border-t border-roxo-100">
          {lista?.map((a) => (
            <li key={a.id} className={`px-5 py-3.5 ${a.desfeita_em ? "bg-fundo opacity-70" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm">
                    <strong className="text-marinho">{a.usuario_nome}</strong>{" "}
                    <Etiqueta cor={ACOES[a.acao].cor}>{ACOES[a.acao].rotulo}</Etiqueta> {a.tipo}{" "}
                    <strong className="text-marinho">{a.objeto}</strong>
                  </p>
                  <p className="text-xs text-marinho-claro/60">
                    {quando(a.quando)}
                    {a.desfeita_em && ` · desfeita por ${a.desfeita_por} em ${quando(a.desfeita_em)}`}
                  </p>
                  <Mudancas alteracao={a} />
                </div>
                {!a.desfeita_em && (
                  <button
                    onClick={() => setDesfazendo(a)}
                    className="shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium text-roxo ring-1 ring-roxo-200 hover:bg-roxo-50"
                  >
                    Desfazer
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {proxima && (
        <div className="border-t border-roxo-100 p-4 text-center">
          <Botao variante="secundario" onClick={() => carregar(proxima)}>
            Carregar mais
          </Botao>
        </div>
      )}

      <Confirmar
        aberto={!!desfazendo}
        titulo="Desfazer esta alteração?"
        textoBotao="Desfazer"
        aoFechar={() => setDesfazendo(null)}
        aoConfirmar={async () => {
          const r = await api(`/alteracoes/${desfazendo.id}/desfazer/`, { metodo: "POST" });
          setLista((l) => l.map((x) => (x.id === r.id ? r : x)));
          carregar(1);
        }}
      >
        <p>
          {desfazendo?.acao === "criou"
            ? `O registro "${desfazendo?.objeto}" será excluído.`
            : desfazendo?.acao === "excluiu"
              ? `O registro "${desfazendo?.objeto}" volta a existir, com os dados que tinha.`
              : `Os campos alterados de "${desfazendo?.objeto}" voltam ao valor de antes.`}
        </p>
        <p className="text-xs">
          Desfazer muda só este registro. Se a ação mexeu em outras coisas (por exemplo, liberar um box também encerra o
          contrato), confira depois ou use um backup.
        </p>
      </Confirmar>
    </Cartao>
  );
}

export default function Seguranca() {
  return (
    <>
      <Banner titulo="Segurança" subtitulo="Backup dos dados e histórico do que cada pessoa fez no sistema" />
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <Backups />
        <Historico />
      </div>
    </>
  );
}
