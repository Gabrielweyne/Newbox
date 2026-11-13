import { useCallback, useEffect, useMemo, useState } from "react";
import { Banner } from "../componentes/Layout";
import { IconeCheck, IconeEmail, IconeMegafone, IconeMais, IconeWhatsapp } from "../componentes/Icones";
import { Aviso, Botao, Campo, Carregando, Cartao, Etiqueta, Modal, Selecao, Vazio } from "../componentes/ui";
import { api, listarTudo } from "../api";
import { useAuth } from "../auth";
import { formatarData } from "../formato";
import { formatarTelefone, linkWhatsapp } from "../whatsapp";

const MODELOS = [
  {
    nome: "Feriado",
    titulo: "Funcionamento no feriado",
    mensagem:
      "Olá, {nome}!\n\nPassando para avisar que no feriado de [DATA] a Newbox estará fechada. Voltamos ao horário normal no dia [DATA].\n\nSe precisar acessar seu box, programe-se com antecedência. 😉\n\nEquipe Newbox",
  },
  {
    nome: "Horário especial",
    titulo: "Horário especial de funcionamento",
    mensagem:
      "Olá, {nome}!\n\nNo dia [DATA] a Newbox vai funcionar em horário especial: das [HORA] às [HORA].\n\nQualquer dúvida, é só chamar a gente por aqui.\n\nEquipe Newbox",
  },
  {
    nome: "Aviso geral",
    titulo: "Aviso importante",
    mensagem: "Olá, {nome}!\n\n[ESCREVA O AVISO AQUI]\n\nEquipe Newbox",
  },
];

function Novo({ usuario, sedes, aoEnviar, aoFechar }) {
  const [dados, setDados] = useState({
    titulo: "", mensagem: "", publico: "ativos", sede: usuario.sede?.id ? String(usuario.sede.id) : "",
    por_email: true, por_whatsapp: true,
  });
  const [previa, setPrevia] = useState(null);
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const mudar = (c) => (e) => setDados((d) => ({ ...d, [c]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  useEffect(() => {
    setPrevia(null);
    api(`/comunicados/previa/?publico=${dados.publico}${dados.sede ? `&sede=${dados.sede}` : ""}`)
      .then(setPrevia)
      .catch(() => {});
  }, [dados.publico, dados.sede]);

  const exemplo = dados.mensagem.replaceAll("{nome}", "Carlos");
  const pendenteColchete = /\[[A-ZÇÃÉ ]+\]/.test(dados.mensagem);

  async function enviar(e) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      aoEnviar(await api("/comunicados/", { metodo: "POST", corpo: { ...dados, sede: dados.sede || null } }));
    } catch (err) {
      setErro(err);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4" noValidate>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-marinho-claro/70">Modelos:</span>
        {MODELOS.map((m) => (
          <button
            key={m.nome}
            type="button"
            onClick={() => setDados((d) => ({ ...d, titulo: m.titulo, mensagem: m.mensagem }))}
            className="rounded-full px-3 py-1 text-xs text-roxo ring-1 ring-roxo-200 hover:bg-roxo-50"
          >
            {m.nome}
          </button>
        ))}
      </div>
      {erro && !["titulo", "mensagem", "sede", "por_email"].some((c) => erro.campo(c)) && <Aviso>{erro.message}</Aviso>}
      <Campo rotulo="Título" value={dados.titulo} onChange={mudar("titulo")} erro={erro?.campo("titulo")} placeholder="Ex.: Funcionamento no feriado" />
      <div>
        <label htmlFor="c-msg" className="mb-1.5 block text-sm font-medium">Mensagem</label>
        <textarea
          id="c-msg"
          rows={7}
          value={dados.mensagem}
          onChange={mudar("mensagem")}
          className={`block w-full rounded-md border bg-white px-3.5 py-2.5 text-sm focus:ring-2 focus:outline-none ${
            erro?.campo("mensagem") ? "border-red-400 focus:ring-red-200" : "border-roxo-200 focus:border-roxo focus:ring-roxo-100"
          }`}
        />
        {erro?.campo("mensagem") ? (
          <p className="mt-1.5 text-xs text-red-600">{erro.campo("mensagem")}</p>
        ) : (
          <p className="mt-1.5 text-xs text-marinho-claro/60">Use <code>{"{nome}"}</code> para o primeiro nome de cada cliente.</p>
        )}
        {pendenteColchete && (
          <p className="mt-1 text-xs text-amber-700">Atenção: ainda há trechos entre [colchetes] para preencher.</p>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Selecao rotulo="Para quem" value={dados.publico} onChange={mudar("publico")}>
          <option value="ativos">Clientes com box alugado</option>
          <option value="todos">Todos os clientes</option>
        </Selecao>
        {usuario.admin ? (
          <Selecao rotulo="Unidade" value={dados.sede} onChange={mudar("sede")}>
            <option value="">As duas unidades</option>
            {sedes.map((s) => (
              <option key={s.id} value={s.id}>{s.nome}</option>
            ))}
          </Selecao>
        ) : (
          <Campo rotulo="Unidade" value={usuario.sede?.nome || ""} disabled />
        )}
      </div>
      <fieldset className="flex flex-wrap gap-5 text-sm">
        <legend className="mb-1.5 text-sm font-medium">Enviar por</legend>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={dados.por_email} onChange={mudar("por_email")} className="size-4 accent-[#965ba5]" />
          E-mail (automático)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={dados.por_whatsapp} onChange={mudar("por_whatsapp")} className="size-4 accent-[#965ba5]" />
          WhatsApp (lista para enviar um a um)
        </label>
      </fieldset>
      {erro?.campo("por_email") && <p className="text-xs text-red-600">{erro.campo("por_email")}</p>}

      <div className="rounded-md bg-roxo-50 px-4 py-3 text-sm text-roxo-700">
        {previa ? (
          <>
            <strong>{previa.total} cliente(s)</strong> vão receber
            {dados.por_email && ` · ${previa.com_email} por e-mail`}
            {dados.por_whatsapp && ` · ${previa.com_whatsapp} por WhatsApp`}
            {previa.total - Math.max(dados.por_email ? previa.com_email : 0, dados.por_whatsapp ? previa.com_whatsapp : 0) > 0 &&
              " (alguns sem contato cadastrado)"}
          </>
        ) : (
          "Calculando destinatários..."
        )}
      </div>
      {exemplo.trim() && (
        <details className="text-xs text-marinho-claro/70">
          <summary className="cursor-pointer">Ver como o cliente recebe</summary>
          <p className="mt-2 rounded-md bg-fundo p-3 whitespace-pre-line">{exemplo}</p>
        </details>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Botao type="button" variante="fantasma" onClick={aoFechar}>Cancelar</Botao>
        <Botao type="submit" carregando={enviando} disabled={!previa?.total}>
          Enviar comunicado
        </Botao>
      </div>
    </form>
  );
}

const SIT = {
  enviado: <Etiqueta cor="verde">Enviado</Etiqueta>,
  falhou: <Etiqueta cor="vermelho">Falhou</Etiqueta>,
  pendente: <Etiqueta cor="amarelo">Pendente</Etiqueta>,
  sem_contato: <Etiqueta cor="cinza">Sem contato</Etiqueta>,
  nao_se_aplica: null,
};

function Detalhe({ comunicado, aoAtualizar }) {
  const [envios, setEnvios] = useState(null);
  const [erro, setErro] = useState("");
  const [reenviando, setReenviando] = useState(false);

  const carregar = useCallback(() => {
    api(`/comunicados/${comunicado.id}/envios/`).then(setEnvios).catch((e) => setErro(e.message));
  }, [comunicado.id]);
  useEffect(carregar, [carregar]);

  async function marcar(envio, enviado) {
    const novo = await api(`/comunicados/${comunicado.id}/envios/${envio.id}/whatsapp/`, { metodo: "POST", corpo: { enviado } });
    setEnvios((l) => l.map((x) => (x.id === envio.id ? novo : x)));
    aoAtualizar();
  }

  const r = comunicado.resumo;
  const zap = (envios || []).filter((e) => e.whatsapp_situacao !== "nao_se_aplica");
  const zapFeitos = zap.filter((e) => e.whatsapp_situacao === "enviado").length;
  const zapComNumero = zap.filter((e) => e.telefone).length;

  return (
    <div className="space-y-4">
      <p className="rounded-md bg-fundo p-3 text-sm whitespace-pre-line text-marinho-claro">{comunicado.mensagem}</p>
      <div className="flex flex-wrap gap-2 text-sm">
        {comunicado.por_email && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-roxo-50 px-3 py-1 text-roxo-700">
            <IconeEmail className="size-4" /> {r.email_enviados} e-mail(s) enviado(s)
            {r.email_falhos > 0 && <strong className="text-red-700"> · {r.email_falhos} falharam</strong>}
          </span>
        )}
        {comunicado.por_whatsapp && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-emerald-800">
            <IconeWhatsapp className="size-4" /> {zapFeitos} de {zapComNumero} no WhatsApp
          </span>
        )}
        {r.email_falhos > 0 && (
          <Botao
            variante="secundario"
            className="!py-1 text-xs"
            carregando={reenviando}
            onClick={async () => {
              setReenviando(true);
              await api(`/comunicados/${comunicado.id}/reenviar-emails/`, { metodo: "POST" }).catch((e) => setErro(e.message));
              setReenviando(false);
              carregar();
              aoAtualizar();
            }}
          >
            Tentar e-mails de novo
          </Botao>
        )}
      </div>
      {comunicado.por_whatsapp && zapComNumero > 0 && zapFeitos < zapComNumero && (
        <Aviso tipo="info">
          Clique em <strong>Enviar</strong> em cada cliente: o WhatsApp abre com a mensagem pronta. Depois de mandar, ele fica marcado
          como enviado.
        </Aviso>
      )}
      <Aviso>{erro}</Aviso>
      {!envios ? (
        <Carregando />
      ) : (
        <ul className="-mx-6 max-h-[50vh] divide-y divide-roxo-100 overflow-y-auto border-y border-roxo-100">
          {envios.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-6 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-marinho">{e.cliente_nome}</p>
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-marinho-claro/70">
                  {comunicado.por_email && (
                    <>
                      <IconeEmail className="size-3.5" /> {e.email || "sem e-mail"} {SIT[e.email_situacao]}
                    </>
                  )}
                </p>
              </div>
              {comunicado.por_whatsapp &&
                (e.telefone ? (
                  e.whatsapp_situacao === "enviado" ? (
                    <button
                      onClick={() => marcar(e, false)}
                      className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-50"
                      title="Clique para desmarcar"
                    >
                      <IconeCheck className="size-4" /> Enviado no WhatsApp
                    </button>
                  ) : (
                    <a
                      href={linkWhatsapp(e.telefone, `*${comunicado.titulo}*\n\n${e.texto}`)}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => marcar(e, true)}
                      className="inline-flex items-center gap-1.5 rounded-md bg-[#25d366] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#1ebe5a]"
                    >
                      <IconeWhatsapp className="size-4" /> Enviar · {formatarTelefone(e.telefone)}
                    </a>
                  )
                ) : (
                  <span className="text-xs text-marinho-claro/50">sem WhatsApp</span>
                ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Comunicados() {
  const { usuario } = useAuth();
  const [lista, setLista] = useState(null);
  const [sedes, setSedes] = useState([]);
  const [erro, setErro] = useState("");
  const [novo, setNovo] = useState(false);
  const [aberto, setAberto] = useState(null);

  const carregar = useCallback(() => {
    listarTudo("/comunicados/").then(setLista).catch((e) => setErro(e.message));
  }, []);
  useEffect(() => {
    carregar();
    api("/funcionarios/sedes/", { autenticar: false }).then(setSedes).catch(() => {});
  }, [carregar]);

  const atual = useMemo(() => lista?.find((c) => c.id === aberto), [lista, aberto]);

  return (
    <>
      <Banner titulo="Comunicados" subtitulo="Avisos para os clientes por e-mail e WhatsApp (feriados, horários...)">
        <Botao onClick={() => setNovo(true)}>
          <IconeMais className="size-4" /> Novo comunicado
        </Botao>
      </Banner>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <Aviso>{erro}</Aviso>
        <Cartao className="overflow-hidden">
          {!lista ? (
            <Carregando />
          ) : lista.length === 0 ? (
            <Vazio icone={IconeMegafone} titulo="Nenhum comunicado ainda 📣">
              Use "Novo comunicado" para avisar os clientes sobre feriados, horários especiais e mais.
            </Vazio>
          ) : (
            <ul className="divide-y divide-roxo-100">
              {lista.map((c) => {
                const r = c.resumo;
                return (
                  <li key={c.id}>
                    <button onClick={() => setAberto(c.id)} className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left hover:bg-fundo">
                      <div className="min-w-0">
                        <p className="font-medium text-marinho">{c.titulo}</p>
                        <p className="text-xs text-marinho-claro/70">
                          {formatarData(c.criado_em.slice(0, 10))} · {c.sede_nome || "As duas unidades"} ·{" "}
                          {c.publico === "ativos" ? "clientes com box" : "todos os clientes"} · {r.total} cliente(s)
                          {c.criado_por_nome && ` · por ${c.criado_por_nome}`}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        {c.por_email && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-roxo-50 px-2.5 py-1 text-roxo-700">
                            <IconeEmail className="size-3.5" /> {r.email_enviados}
                            {r.email_falhos > 0 && <span className="text-red-700"> · {r.email_falhos} falhas</span>}
                          </span>
                        )}
                        {c.por_whatsapp && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-800">
                            <IconeWhatsapp className="size-3.5" /> {r.whatsapp_enviados}/{r.whatsapp_enviados + r.whatsapp_pendentes}
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Cartao>
      </div>

      <Modal aberto={novo} titulo="Novo comunicado" aoFechar={() => setNovo(false)} largura="max-w-2xl">
        {novo && (
          <Novo
            usuario={usuario}
            sedes={sedes}
            aoFechar={() => setNovo(false)}
            aoEnviar={(c) => {
              setNovo(false);
              setLista((l) => [c, ...(l || [])]);
              setAberto(c.id);
            }}
          />
        )}
      </Modal>
      <Modal aberto={!!atual} titulo={atual?.titulo} aoFechar={() => setAberto(null)} largura="max-w-2xl">
        {atual && <Detalhe comunicado={atual} aoAtualizar={carregar} />}
      </Modal>
    </>
  );
}
