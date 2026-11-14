import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import Confirmar from "../componentes/Confirmar";
import { IconeBusca, IconeDinheiro, IconeWhatsapp } from "../componentes/Icones";
import { Banner } from "../componentes/Layout";
import { Aviso, Botao, Campo, Carregando, Cartao, Etiqueta, Vazio } from "../componentes/ui";
import { api, listarTudo } from "../api";
import { formatarMoeda, nomeBox, nomeDoMes } from "../formato";
import { linkWhatsapp } from "../whatsapp";

const SITUACAO = {
  agendado: { rotulo: "Agendado", cor: "amarelo" },
  aplicado: { rotulo: "Em vigor", cor: "verde" },
  cancelado: { rotulo: "Cancelado", cor: "cinza" },
};

/** Próximos 12 meses, começando no atual: [{ valor: "2026-12", rotulo: "Dezembro de 2026" }] */
function proximosMeses() {
  const hoje = new Date();
  return Array.from({ length: 13 }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
    const valor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return { valor, rotulo: nomeDoMes(valor) + (i === 0 ? " (já neste mês)" : "") };
  });
}

const campo =
  "rounded-md border border-roxo-200 bg-white px-3 py-2 text-sm focus:border-roxo focus:ring-2 focus:ring-roxo-100 focus:outline-none";

/* ---------- Avisos de um reajuste (e-mail e WhatsApp) ---------- */

function Avisos({ r, aoMudar }) {
  async function marcarWhatsapp() {
    aoMudar(await api(`/reajustes/${r.id}/whatsapp/`, { metodo: "POST" }));
  }
  async function reenviar() {
    aoMudar(await api(`/reajustes/${r.id}/reenviar-email/`, { metodo: "POST" }));
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {r.email_enviado_em ? (
        <span className="text-emerald-800">✓ E-mail enviado</span>
      ) : (
        <span className="text-amber-800">
          ⚠ {r.email_erro || "E-mail não enviado"}
          {r.cliente_email && (
            <button onClick={reenviar} className="ml-1.5 font-medium text-roxo hover:underline">
              Enviar e-mail
            </button>
          )}
        </span>
      )}
      {r.cliente_telefone &&
        (r.whatsapp_enviado_em ? (
          <span className="text-emerald-800">✓ WhatsApp enviado</span>
        ) : (
          <a
            href={linkWhatsapp(r.cliente_telefone, r.whatsapp_texto)}
            target="_blank"
            rel="noreferrer"
            onClick={marcarWhatsapp}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#25d366] px-2.5 py-1.5 font-medium text-white hover:bg-[#1ebe5a]"
          >
            <IconeWhatsapp className="size-4" /> Avisar no WhatsApp
          </a>
        ))}
    </div>
  );
}

/* ---------- Novo reajuste ---------- */

function NovoReajuste({ boxInicial, aoCriar }) {
  const meses = useMemo(proximosMeses, []);
  const [boxes, setBoxes] = useState(null);
  const [sedes, setSedes] = useState([]);
  const [filtro, setFiltro] = useState({ sede: "", tamanho: "", busca: "" });
  const [escolhidos, setEscolhidos] = useState(() => new Set(boxInicial ? [Number(boxInicial)] : []));
  const [dados, setDados] = useState({ modo: "percentual", valor: "", percentual: "", vigencia: meses[1].valor, mensagem: "", enviar_email: true });
  const [previa, setPrevia] = useState(null);
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    Promise.all([listarTudo("/boxes/?alugado=true"), listarTudo("/sedes/")])
      .then(([b, s]) => {
        setBoxes(b);
        setSedes(s);
      })
      .catch((e) => setErro(e));
  }, []);
  useEffect(() => setPrevia(null), [escolhidos, dados]);

  const tamanhos = useMemo(() => [...new Set((boxes || []).map((b) => b.tamanho))].sort(), [boxes]);
  const visiveis = (boxes || []).filter((b) => {
    const termo = filtro.busca.trim().toLowerCase();
    return (
      (!filtro.sede || String(b.sede) === filtro.sede) &&
      (!filtro.tamanho || b.tamanho === filtro.tamanho) &&
      (!termo || (b.numero || "").toLowerCase() === termo || (b.cliente_nome || "").toLowerCase().includes(termo))
    );
  });
  const todosMarcados = visiveis.length > 0 && visiveis.every((b) => escolhidos.has(b.id));
  const alternar = (id) =>
    setEscolhidos((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const marcarTodos = () =>
    setEscolhidos((s) => {
      const n = new Set(s);
      visiveis.forEach((b) => (todosMarcados ? n.delete(b.id) : n.add(b.id)));
      return n;
    });
  const mudar = (c) => (e) => setDados((d) => ({ ...d, [c]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const corpo = () => ({
    boxes: [...escolhidos],
    modo: dados.modo,
    vigencia: dados.vigencia,
    mensagem: dados.mensagem,
    enviar_email: dados.enviar_email,
    ...(dados.modo === "valor" ? { valor: dados.valor.replace(",", ".") } : { percentual: dados.percentual.replace(",", ".") }),
  });

  async function verPrevia() {
    setErro(null);
    setEnviando(true);
    try {
      setPrevia(await api("/reajustes/previa/", { metodo: "POST", corpo: corpo() }));
    } catch (e) {
      setErro(e);
    } finally {
      setEnviando(false);
    }
  }

  async function confirmar() {
    const criados = await api("/reajustes/", { metodo: "POST", corpo: corpo() });
    setEscolhidos(new Set());
    setPrevia(null);
    aoCriar(criados);
  }

  if (!boxes && !erro) return <Cartao><Carregando texto="Carregando boxes alugados..." /></Cartao>;
  const errosBoxes = erro?.dados?.boxes;

  return (
    <Cartao className="p-5">
      <h2 className="font-semibold text-marinho">Novo reajuste</h2>
      <p className="mt-0.5 text-sm text-marinho-claro/70">
        Escolha os boxes, o novo valor e a partir de quando. O cliente é avisado na hora e o valor muda sozinho quando o mês
        chegar.
      </p>

      {/* 1. Boxes */}
      <h3 className="mt-5 mb-2 text-sm font-medium text-marinho">1. Quais boxes</h3>
      <div className="grid gap-2 sm:grid-cols-3">
        <select aria-label="Sede" value={filtro.sede} onChange={(e) => setFiltro((f) => ({ ...f, sede: e.target.value }))} className={campo}>
          <option value="">Todas as sedes</option>
          {sedes.map((s) => (
            <option key={s.id} value={s.id}>Sede {s.nome}</option>
          ))}
        </select>
        <select aria-label="Tamanho" value={filtro.tamanho} onChange={(e) => setFiltro((f) => ({ ...f, tamanho: e.target.value }))} className={campo}>
          <option value="">Todos os tamanhos</option>
          {tamanhos.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <label className="relative">
          <span className="sr-only">Buscar</span>
          <IconeBusca className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-marinho-claro/50" />
          <input
            type="search"
            placeholder="Nº do box ou cliente"
            value={filtro.busca}
            onChange={(e) => setFiltro((f) => ({ ...f, busca: e.target.value }))}
            className={`${campo} w-full pl-9`}
          />
        </label>
      </div>
      <div className="mt-2 max-h-72 overflow-y-auto rounded-md ring-1 ring-roxo-100">
        <label className="sticky top-0 flex cursor-pointer items-center gap-3 border-b border-roxo-100 bg-roxo-50 px-4 py-2 text-xs font-medium text-roxo-700">
          <input type="checkbox" checked={todosMarcados} onChange={marcarTodos} className="size-4 accent-[#965ba5]" />
          Marcar todos os {visiveis.length} da lista
        </label>
        {visiveis.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-marinho-claro/60">Nenhum box alugado com esses filtros.</p>
        ) : (
          visiveis.map((b) => (
            <label key={b.id} className="flex cursor-pointer items-center gap-3 border-b border-roxo-50 px-4 py-2 text-sm last:border-0 hover:bg-fundo">
              <input type="checkbox" checked={escolhidos.has(b.id)} onChange={() => alternar(b.id)} className="size-4 accent-[#965ba5]" />
              <span className="w-28 shrink-0 font-medium text-marinho">{nomeBox(b.numero, b.id)}</span>
              <span className="min-w-0 flex-1 truncate">{b.cliente_nome}</span>
              <span className="hidden text-xs text-marinho-claro/60 sm:inline">{b.tamanho} · {b.sede_nome}</span>
              <span className="w-24 text-right tabular-nums">{formatarMoeda(b.valor)}</span>
            </label>
          ))
        )}
      </div>
      <p className="mt-1 text-xs text-marinho-claro/70">{escolhidos.size} box(es) escolhido(s)</p>
      {errosBoxes && (
        <ul className="mt-2 space-y-1 text-xs text-red-700">
          {[].concat(errosBoxes).map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}

      {/* 2. Valor e data */}
      <h3 className="mt-5 mb-2 text-sm font-medium text-marinho">2. Novo valor e a partir de quando</h3>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <p className="mb-1.5 text-sm font-medium">Como reajustar</p>
          <div className="flex rounded-md ring-1 ring-roxo-200" role="radiogroup">
            {[["percentual", "Porcentagem"], ["valor", "Novo valor"]].map(([v, r]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={dados.modo === v}
                onClick={() => setDados((d) => ({ ...d, modo: v }))}
                className={`flex-1 px-3 py-2 text-sm first:rounded-l-md last:rounded-r-md ${dados.modo === v ? "bg-roxo text-white" : "bg-white text-marinho-claro hover:bg-roxo-50"}`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        {dados.modo === "percentual" ? (
          <Campo
            rotulo="Reajuste (%)"
            inputMode="decimal"
            placeholder="Ex.: 5"
            value={dados.percentual}
            onChange={mudar("percentual")}
            erro={erro?.campo?.("percentual")}
            ajuda="Use número negativo para desconto."
          />
        ) : (
          <Campo
            rotulo="Novo valor (R$)"
            inputMode="decimal"
            placeholder="Ex.: 450,00"
            value={dados.valor}
            onChange={mudar("valor")}
            erro={erro?.campo?.("valor")}
            ajuda="O mesmo valor para todos os boxes escolhidos."
          />
        )}
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">A partir de</span>
          <select value={dados.vigencia} onChange={mudar("vigencia")} className={`${campo} w-full`}>
            {meses.map((m) => (
              <option key={m.valor} value={m.valor}>{m.rotulo}</option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-marinho-claro/70">Primeira mensalidade com o valor novo.</span>
        </label>
      </div>
      <label className="mt-4 block">
        <span className="mb-1.5 block text-sm font-medium">Mensagem para o cliente (opcional)</span>
        <textarea
          rows={2}
          value={dados.mensagem}
          onChange={mudar("mensagem")}
          placeholder="Ex.: Reajuste anual conforme contrato."
          className={`${campo} w-full`}
        />
      </label>
      <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" checked={dados.enviar_email} onChange={mudar("enviar_email")} className="size-4 accent-[#965ba5]" />
        Avisar os clientes por e-mail agora
      </label>

      {erro && !["boxes", "valor", "percentual"].some((c) => erro.campo?.(c)) && <div className="mt-3"><Aviso>{erro.message}</Aviso></div>}

      {/* 3. Prévia */}
      {previa && (
        <div className="mt-5">
          <h3 className="mb-2 text-sm font-medium text-marinho">3. Confira antes de confirmar</h3>
          <div className="overflow-x-auto rounded-md ring-1 ring-roxo-100">
            <table className="w-full text-sm">
              <thead className="bg-roxo-50 text-left text-xs tracking-wide text-roxo-700 uppercase">
                <tr>
                  <th className="px-3 py-2 font-medium">Box</th>
                  <th className="px-3 py-2 font-medium">Cliente</th>
                  <th className="px-3 py-2 text-right font-medium">Hoje</th>
                  <th className="px-3 py-2 text-right font-medium">Novo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-roxo-100">
                {previa.boxes.map((b) => (
                  <tr key={b.box}>
                    <td className="px-3 py-2">{nomeBox(b.box_numero, b.box)} <span className="text-xs text-marinho-claro/60">· {b.sede_nome}</span></td>
                    <td className="px-3 py-2">{b.cliente_nome}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(b.valor_anterior)}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">{formatarMoeda(b.valor_novo)}</td>
                  </tr>
                ))}
              </tbody>
              {previa.boxes.length > 1 && (
                <tfoot className="border-t border-roxo-200 font-medium">
                  <tr>
                    <td className="px-3 py-2" colSpan={2}>Total por mês</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(previa.total_anterior)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(previa.total_novo)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p className="mt-2 text-xs text-marinho-claro/70">
            Vale a partir de {nomeDoMes(previa.vigencia).toLowerCase()}.{" "}
            {dados.enviar_email ? "Os clientes recebem um e-mail agora." : "Nenhum e-mail será enviado."} O aviso por WhatsApp
            fica pronto na próxima tela.
          </p>
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2">
        {previa ? (
          <Botao onClick={() => setEnviando("confirmar")}>Confirmar reajuste de {previa.boxes.length} box(es)</Botao>
        ) : (
          <Botao onClick={verPrevia} carregando={enviando === true} disabled={!escolhidos.size}>
            Ver como fica
          </Botao>
        )}
      </div>
      <Confirmar
        aberto={enviando === "confirmar"}
        titulo="Confirmar o reajuste?"
        textoBotao="Confirmar"
        aoFechar={() => setEnviando(false)}
        aoConfirmar={confirmar}
      >
        <p>
          {previa?.boxes.length} box(es) passam a ter o novo valor a partir de {previa && nomeDoMes(previa.vigencia).toLowerCase()}.
          {dados.enviar_email && " Os clientes serão avisados por e-mail agora."}
        </p>
      </Confirmar>
    </Cartao>
  );
}

/* ---------- Histórico ---------- */

function ItemReajuste({ r, aoMudar, aoCancelar }) {
  const s = SITUACAO[r.situacao];
  return (
    <li className="space-y-2 px-5 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm">
            <strong className="text-marinho">{nomeBox(r.box_numero, r.box)}</strong>{" "}
            <span className="text-marinho-claro/70">· {r.sede_nome} ·</span>{" "}
            <Link to={`/clientes/${r.cliente}`} className="text-marinho hover:text-roxo">{r.cliente_nome}</Link>{" "}
            <Etiqueta cor={s.cor}>{s.rotulo}</Etiqueta>
          </p>
          <p className="mt-0.5 text-sm tabular-nums">
            {formatarMoeda(r.valor_anterior)} → <strong className="text-marinho">{formatarMoeda(r.valor_novo)}</strong>
            {r.percentual !== null && (
              <span className="text-xs text-marinho-claro/70">
                {" "}({r.percentual > 0 ? "+" : ""}{String(r.percentual).replace(".", ",")}%)
              </span>
            )}
            <span className="text-xs text-marinho-claro/70"> · a partir de {nomeDoMes(r.vigencia.slice(0, 7)).toLowerCase()}</span>
          </p>
        </div>
        {r.situacao === "agendado" && (
          <button onClick={() => aoCancelar(r)} className="text-xs font-medium text-red-700 hover:underline">
            Cancelar
          </button>
        )}
      </div>
      {r.situacao !== "cancelado" && <Avisos r={r} aoMudar={aoMudar} />}
    </li>
  );
}

export default function Reajustes() {
  const [params] = useSearchParams();
  const [lista, setLista] = useState(null);
  const [recentes, setRecentes] = useState(null);
  const [situacao, setSituacao] = useState("");
  const [cancelando, setCancelando] = useState(null);
  const [erro, setErro] = useState("");

  const carregar = useCallback(() => {
    listarTudo(`/reajustes/${situacao ? `?situacao=${situacao}` : ""}`).then(setLista).catch((e) => setErro(e.message));
  }, [situacao]);
  useEffect(carregar, [carregar]);

  const trocar = (novo) => {
    setLista((l) => l?.map((x) => (x.id === novo.id ? novo : x)));
    setRecentes((l) => l?.map((x) => (x.id === novo.id ? novo : x)));
  };

  return (
    <>
      <Banner titulo="Reajustes" subtitulo="Aumente (ou reduza) o valor de boxes alugados e avise os clientes" />
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        {recentes && (
          <Cartao className="overflow-hidden ring-emerald-200">
            <div className="bg-emerald-50 px-5 py-3 text-sm text-emerald-900">
              <strong>✓ Reajuste registrado para {recentes.length} box(es).</strong> Agora avise cada cliente no WhatsApp
              (a mensagem já vai pronta).
            </div>
            <ul className="divide-y divide-roxo-100">
              {recentes.map((r) => (
                <ItemReajuste key={r.id} r={r} aoMudar={trocar} aoCancelar={setCancelando} />
              ))}
            </ul>
          </Cartao>
        )}

        <NovoReajuste
          boxInicial={params.get("box")}
          aoCriar={(criados) => {
            setRecentes(criados);
            carregar();
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />

        <Cartao className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 p-5">
            <h2 className="font-semibold text-marinho">Histórico de reajustes</h2>
            <select aria-label="Situação" value={situacao} onChange={(e) => setSituacao(e.target.value)} className={campo}>
              <option value="">Todos</option>
              <option value="agendado">Agendados</option>
              <option value="aplicado">Em vigor</option>
              <option value="cancelado">Cancelados</option>
            </select>
          </div>
          <Aviso>{erro}</Aviso>
          {!lista && !erro ? (
            <Carregando />
          ) : lista?.length === 0 ? (
            <Vazio icone={IconeDinheiro} titulo="Nenhum reajuste ainda" />
          ) : (
            <ul className="divide-y divide-roxo-100 border-t border-roxo-100">
              {lista?.map((r) => (
                <ItemReajuste key={r.id} r={r} aoMudar={trocar} aoCancelar={setCancelando} />
              ))}
            </ul>
          )}
        </Cartao>
      </div>

      <Confirmar
        aberto={!!cancelando}
        titulo="Cancelar este reajuste?"
        textoBotao="Cancelar reajuste"
        variante="perigo"
        aoFechar={() => setCancelando(null)}
        aoConfirmar={async () => {
          trocar(await api(`/reajustes/${cancelando.id}/cancelar/`, { metodo: "POST" }));
        }}
      >
        <p>
          O valor de {cancelando && nomeBox(cancelando.box_numero, cancelando.box)} continua{" "}
          {cancelando && formatarMoeda(cancelando.valor_anterior)}. Se o cliente já foi avisado, lembre de avisar que o
          reajuste foi cancelado.
        </p>
      </Confirmar>
    </>
  );
}
