import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import Confirmar from "../componentes/Confirmar";
import ListaContratos, { BotaoPdf } from "../componentes/Contratos";
import { Banner } from "../componentes/Layout";
import {
  IconeBusca,
  IconeCaixa,
  IconeClipe,
  IconeDestravar,
  IconeLapis,
  IconeChave,
  IconeHistorico,
} from "../componentes/Icones";
import { Aviso, Botao, Campo, Carregando, Cartao, Etiqueta, Modal, Selecao, Vazio } from "../componentes/ui";
import { api, ErroApi, listarTudo } from "../api";
import { useAuth } from "../auth";
import { useAvisos } from "../avisos";
import { DIAS_VENCIMENTO, formatarDocumento, formatarMoeda, formatarNumero, nomeBox } from "../formato";
import { formatarTelefone } from "../whatsapp";

/* ---------- Formulário de box (novo / editar) ---------- */

function FormBox({ box, sedes, admin, sedePadrao, aoSalvar, aoFechar }) {
  const [dados, setDados] = useState({
    // Funcionário: sempre a própria sede (vem do login, não depende da lista ter carregado)
    sede: box?.sede ?? sedePadrao ?? (sedes.length === 1 ? sedes[0].id : ""),
    tipo: box ? (box.tipo ? String(box.tipo) : "outro") : "",
    tamanho: box?.tamanho ?? "",
    valor: box?.valor ?? "",
    dia_vencimento: box?.dia_vencimento ?? "",
    numero: box?.numero ?? "",
    observacao: box?.observacao ?? "",
  });
  const [tipos, setTipos] = useState([]);
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const mudar = (c) => (e) => setDados((d) => ({ ...d, [c]: e.target.value }));

  // Catálogo da unidade escolhida
  useEffect(() => {
    if (!dados.sede) return setTipos([]);
    api(`/tipos/?sede=${dados.sede}`).then(setTipos).catch(() => setTipos([]));
  }, [dados.sede]);

  const tipoEscolhido = tipos.find((t) => String(t.id) === dados.tipo);
  function escolherTipo(e) {
    const id = e.target.value;
    const t = tipos.find((x) => String(x.id) === id);
    setDados((d) => ({ ...d, tipo: id, ...(t ? { tamanho: t.codigo, valor: t.valor } : {}) }));
  }

  async function enviar(e) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    const corpo = { valor: dados.valor, numero: dados.numero, observacao: dados.observacao };
    if (dados.tipo && dados.tipo !== "outro") corpo.tipo = Number(dados.tipo);
    else {
      corpo.tipo = null;
      corpo.tamanho = dados.tamanho;
    }
    if (admin) corpo.sede = dados.sede;
    if (box?.alugado) corpo.dia_vencimento = dados.dia_vencimento;
    try {
      const salvo = box
        ? await api(`/boxes/${box.id}/`, { metodo: "PATCH", corpo })
        : await api("/boxes/", { metodo: "POST", corpo });
      aoSalvar(salvo);
    } catch (err) {
      setErro(err);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4" noValidate>
      {erro && !["sede", "tipo", "tamanho", "valor", "numero"].some((c) => erro.campo(c)) && <Aviso>{erro.message}</Aviso>}
      <Campo
        rotulo="Número do box"
        placeholder="Ex.: 1.1"
        value={dados.numero}
        onChange={mudar("numero")}
        erro={erro?.campo("numero")}
        ajuda="O número pintado no box."
      />
      {admin && (
        <Selecao rotulo="Sede" value={dados.sede} onChange={mudar("sede")} erro={erro?.campo("sede")}>
          <option value="">Selecione</option>
          {sedes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nome}
            </option>
          ))}
        </Selecao>
      )}
      <Selecao rotulo="Tamanho (catálogo)" value={dados.tipo} onChange={escolherTipo} erro={erro?.campo("tipo")}>
        <option value="">{dados.sede ? "Selecione" : "Escolha a sede primeiro"}</option>
        {tipos.map((t) => (
          <option key={t.id} value={t.id}>
            Box {t.codigo} · {formatarMoeda(t.valor)} · {t.sugestao_uso}
          </option>
        ))}
        <option value="outro">Outro tamanho (fora do catálogo)</option>
      </Selecao>
      {tipoEscolhido && (
        <p className="-mt-2 rounded-md bg-roxo-50 px-3 py-2 text-xs text-roxo-700">
          {formatarNumero(tipoEscolhido.comprimento)} x {formatarNumero(tipoEscolhido.largura)} x{" "}
          {formatarNumero(tipoEscolhido.altura)} m · {formatarNumero(tipoEscolhido.area)} m² ·{" "}
          {formatarNumero(tipoEscolhido.volume)} m³
        </p>
      )}
      {dados.tipo === "outro" && (
        <Campo
          rotulo="Tamanho"
          placeholder="Ex.: Especial 2x2 m"
          value={dados.tamanho}
          onChange={mudar("tamanho")}
          erro={erro?.campo("tamanho")}
          autoFocus
        />
      )}
      <Campo
        rotulo="Valor (R$)"
        type="number"
        min="0"
        step="0.01"
        inputMode="decimal"
        placeholder="0,00"
        value={dados.valor}
        onChange={mudar("valor")}
        erro={erro?.campo("valor")}
        ajuda={
          box?.alugado
            ? "Mensalidades futuras ainda não pagas passam a usar o novo valor."
            : tipoEscolhido && Number(dados.valor) !== Number(tipoEscolhido.valor)
              ? `Valor de tabela: ${formatarMoeda(tipoEscolhido.valor)}`
              : "Preenchido pelo catálogo; pode ser ajustado."
        }
      />
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Observação</span>
        <textarea
          rows={3}
          value={dados.observacao}
          onChange={mudar("observacao")}
          placeholder="Ex.: valor promocional até 10/08"
          className="w-full rounded-md border border-roxo-200 bg-white px-3 py-2 text-sm focus:border-roxo focus:ring-2 focus:ring-roxo-100 focus:outline-none"
        />
        <span className="mt-1 block text-xs text-marinho-claro/70">
          Anotações deste box. Apague o que já foi conferido.
        </span>
      </label>
      {box?.alugado && (
        <Selecao
          rotulo="Dia de vencimento"
          value={dados.dia_vencimento}
          onChange={mudar("dia_vencimento")}
          erro={erro?.campo("dia_vencimento")}
        >
          {DIAS_VENCIMENTO.map((d) => (
            <option key={d} value={d}>
              Dia {d}
            </option>
          ))}
        </Selecao>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Botao type="button" variante="fantasma" onClick={aoFechar}>
          Cancelar
        </Botao>
        <Botao type="submit" carregando={enviando}>
          {box ? "Salvar" : "Cadastrar box"}
        </Botao>
      </div>
    </form>
  );
}

/** Observação do box (ex.: o que veio da planilha antiga e precisa ser conferido). */
function Observacao({ texto }) {
  const conferir = PARA_CONFERIR.test(texto);
  return (
    <p
      className={`mt-1 max-w-72 text-xs leading-snug ${conferir ? "text-amber-700" : "text-marinho-claro/70"}`}
      title={texto}
    >
      {conferir && "⚠ "}
      {texto.length > 120 ? `${texto.slice(0, 117)}...` : texto}
    </p>
  );
}

/* ---------- Alugar box: cliente + comprovante ---------- */

const soDigitos = (v) => String(v || "").replace(/\D/g, "");

/**
 * Aluga um box. É o único lugar onde nasce um cliente novo (não existe cliente sem box).
 * Com `interessado` (alguém da lista de espera), os dados dele já vêm preenchidos.
 */
export function FormAlugar({ box, interessado, aoSalvar, aoFechar }) {
  const [clientes, setClientes] = useState(null);
  const [exClientes, setExClientes] = useState([]);
  const [cliente, setCliente] = useState("");
  const [novo, setNovo] = useState({ nome: "", telefone: "", email: "", cpf: "", endereco: "" });
  const [arquivo, setArquivo] = useState(null);
  const [dia, setDia] = useState("");
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    Promise.all([listarTudo("/clientes/"), listarTudo("/clientes/?excluidos=true")])
      .then(([ativos, ex]) => {
        setClientes(ativos);
        setExClientes(ex);
        if (!interessado) return;
        // A pessoa da lista de espera já é (ou já foi) cliente? Usa o cadastro dela.
        const email = (interessado.email || "").toLowerCase();
        const tel = soDigitos(interessado.telefone);
        const achado = [...ativos, ...ex].find(
          (c) => (email && c.email?.toLowerCase() === email) || (tel && soDigitos(c.telefone) === tel)
        );
        if (achado) setCliente(String(achado.id));
        else {
          setCliente("novo");
          setNovo({
            nome: interessado.nome || "",
            telefone: formatarTelefone(interessado.telefone || ""),
            email: interessado.email || "",
            cpf: "",
            endereco: "",
          });
        }
      })
      .catch((e) => setErro(e));
  }, [interessado]);

  const ehNovo = cliente === "novo";
  const exEscolhido = exClientes.find((c) => String(c.id) === cliente);
  const mudarNovo = (c) => (e) => {
    const v = e.target.value;
    setNovo((d) => ({ ...d, [c]: c === "telefone" ? formatarTelefone(v) : c === "cpf" ? formatarDocumento(v) : v }));
    setErro(null);
  };

  async function enviar(e) {
    e.preventDefault();
    setErro(null);
    if (!cliente) return setErro(new ErroApi(400, { cliente: ["Escolha o cliente."] }));
    if (ehNovo && !novo.nome.trim()) return setErro(new ErroApi(400, { nome: ["Informe o nome do cliente."] }));
    if (!dia) return setErro(new ErroApi(400, { dia_vencimento: ["Escolha o dia de vencimento."] }));
    if (!arquivo) return setErro(new ErroApi(400, { anexo_pagamento: ["Anexe o comprovante de pagamento."] }));
    setEnviando(true);
    try {
      const corpo = new FormData();
      if (ehNovo) Object.entries(novo).forEach(([k, v]) => corpo.append(k, v));
      else corpo.append("cliente", cliente);
      corpo.append("anexo_pagamento", arquivo);
      corpo.append("dia_vencimento", dia);
      if (interessado) corpo.append("interessado", interessado.id);
      aoSalvar(await api(`/boxes/${box.id}/alugar/`, { metodo: "POST", corpo }));
    } catch (err) {
      setErro(err);
    } finally {
      setEnviando(false);
    }
  }

  if (!clientes && !erro) return <Carregando texto="Carregando clientes..." />;
  const campos = ["cliente", "nome", "telefone", "email", "cpf", "endereco", "anexo_pagamento", "dia_vencimento"];

  return (
    <form onSubmit={enviar} className="space-y-4" noValidate>
      <p className="rounded-md bg-roxo-50 px-4 py-3 text-sm text-roxo-700">
        {nomeBox(box.numero, box.id)} · {box.tamanho} · {formatarMoeda(box.valor)} · Sede {box.sede_nome}
      </p>
      {interessado && (
        <Aviso tipo="info">
          {ehNovo
            ? `${interessado.nome} veio da lista de espera: os dados dele já estão preenchidos. Confira e complete.`
            : `${interessado.nome} veio da lista de espera e já tem cadastro: usamos o cadastro existente.`}
        </Aviso>
      )}
      {erro && !campos.some((c) => erro.campo(c)) && <Aviso>{erro.message}</Aviso>}
      <Selecao
        rotulo="Cliente"
        value={cliente}
        onChange={(e) => {
          setCliente(e.target.value);
          setErro(null);
        }}
        erro={erro?.campo("cliente")}
      >
        <option value="">Selecione</option>
        <option value="novo">+ Cliente novo</option>
        {clientes?.length > 0 && (
          <optgroup label="Clientes">
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </optgroup>
        )}
        {exClientes.length > 0 && (
          <optgroup label="Ex-clientes (voltam a ser clientes)">
            {exClientes.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </optgroup>
        )}
      </Selecao>
      {exEscolhido && (
        <p className="-mt-2 text-xs text-roxo-700">
          {exEscolhido.nome} é ex-cliente: ao confirmar, volta para a lista de clientes.
        </p>
      )}
      {ehNovo && (
        <div className="space-y-4 rounded-md bg-fundo p-4">
          <Campo rotulo="Nome do cliente" value={novo.nome} onChange={mudarNovo("nome")} erro={erro?.campo("nome")} autoFocus={!interessado} />
          <Campo
            rotulo="WhatsApp"
            inputMode="tel"
            placeholder="(85) 99999-9999"
            value={novo.telefone}
            onChange={mudarNovo("telefone")}
            erro={erro?.campo("telefone")}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              rotulo="E-mail"
              type="email"
              value={novo.email}
              onChange={mudarNovo("email")}
              erro={erro?.campo("email")}
              ajuda="Para onde vai a nota fiscal."
            />
            <Campo
              rotulo="CPF ou CNPJ (opcional)"
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={novo.cpf}
              onChange={mudarNovo("cpf")}
              erro={erro?.campo("cpf")}
            />
          </div>
          <Campo
            rotulo="Endereço com CEP (opcional)"
            placeholder="Rua, número, bairro, CEP"
            value={novo.endereco}
            onChange={mudarNovo("endereco")}
            erro={erro?.campo("endereco")}
          />
        </div>
      )}
      <Selecao
        rotulo="Dia de vencimento"
        value={dia}
        onChange={(e) => {
          setDia(e.target.value);
          setErro(null);
        }}
        erro={erro?.campo("dia_vencimento")}
        ajuda="A mensalidade vence todo mês neste dia. Em fevereiro, o dia 30 vira o último dia do mês."
      >
        <option value="">Selecione</option>
        {DIAS_VENCIMENTO.map((d) => (
          <option key={d} value={d}>
            Todo dia {d}
          </option>
        ))}
      </Selecao>
      <div>
        <p className="mb-1.5 text-sm font-medium">Comprovante do 1º pagamento</p>
        <label
          className={`flex cursor-pointer items-center gap-3 rounded-md border border-dashed px-4 py-4 text-sm transition hover:bg-roxo-50 ${
            erro?.campo("anexo_pagamento") ? "border-red-400" : "border-roxo-300"
          }`}
        >
          <IconeClipe className="size-6 shrink-0 text-roxo" />
          <span className="min-w-0 truncate">
            {arquivo ? arquivo.name : "Clique para anexar (PDF ou imagem)"}
          </span>
          <input
            type="file"
            accept=".pdf,image/*"
            className="sr-only"
            onChange={(e) => {
              setArquivo(e.target.files[0] || null);
              setErro(null);
            }}
          />
        </label>
        {erro?.campo("anexo_pagamento") && (
          <p className="mt-1.5 text-xs text-red-600">{erro.campo("anexo_pagamento")}</p>
        )}
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Botao type="button" variante="fantasma" onClick={aoFechar}>
          Cancelar
        </Botao>
        <Botao type="submit" carregando={enviando}>
          Confirmar aluguel
        </Botao>
      </div>
    </form>
  );
}

/* ---------- Histórico do box ---------- */

function HistoricoBox({ box }) {
  const [contratos, setContratos] = useState(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    listarTudo(`/contratos/?box=${box.id}`).then(setContratos).catch((e) => setErro(e.message));
  }, [box.id]);
  if (erro) return <Aviso>{erro}</Aviso>;
  if (!contratos) return <Carregando />;
  return (
    <div className="-mx-6 -mb-6 border-t border-roxo-100">
      <ListaContratos contratos={contratos} mostrarCliente />
    </div>
  );
}

/* ---------- Página ---------- */

function Situacao({ box }) {
  if (!box.alugado) return <Etiqueta cor="verde">Livre</Etiqueta>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Etiqueta>Alugado</Etiqueta>
      {box.em_atraso && <Etiqueta cor="vermelho">Em atraso</Etiqueta>}
    </span>
  );
}

const FILTROS = [
  { valor: "todos", rotulo: "Todos" },
  { valor: "livres", rotulo: "Livres" },
  { valor: "alugados", rotulo: "Alugados" },
  { valor: "conferir", rotulo: "⚠ Para conferir" },
];

const PARA_CONFERIR = /conferir|definir|estimad|inválid|não informad|não tem|incomplet/i;
const naSituacao = (s, b) =>
  s === "todos" || (s === "conferir" ? PARA_CONFERIR.test(b.observacao || "") : (s === "alugados") === b.alugado);

function Acoes({ box, abrir }) {
  const btn = "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition";
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {box.alugado ? (
        <>
          <a href={box.anexo_pagamento} target="_blank" rel="noreferrer" className={`${btn} text-roxo hover:bg-roxo-50`}>
            <IconeClipe className="size-4" /> Comprovante
          </a>
          {box.contrato_ativo && (
            <BotaoPdf id={box.contrato_ativo} rotulo="Contrato" className="!ring-0" />
          )}
          <button onClick={() => abrir("liberar", box)} className={`${btn} text-marinho-claro hover:bg-roxo-50`}>
            <IconeDestravar className="size-4" /> Liberar
          </button>
        </>
      ) : (
        <button onClick={() => abrir("alugar", box)} className={`${btn} bg-roxo text-white hover:bg-roxo-600`}>
          <IconeChave className="size-4" /> Alugar
        </button>
      )}
      <button onClick={() => abrir("historico", box)} className={`${btn} text-marinho-claro hover:bg-roxo-50`} aria-label={`Histórico do box ${box.id}`} title="Histórico">
        <IconeHistorico className="size-4" />
      </button>
      <button onClick={() => abrir("editar", box)} className={`${btn} text-marinho-claro hover:bg-roxo-50`} aria-label={`Editar box ${box.id}`}>
        <IconeLapis className="size-4" />
      </button>
    </div>
  );
}

export default function Boxes() {
  const { usuario } = useAuth();
  const { atualizar: atualizarAvisos } = useAvisos();
  const [params, setParams] = useSearchParams();
  const [boxes, setBoxes] = useState(null);
  const [sedes, setSedes] = useState([]);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [janela, setJanela] = useState(null); // { tipo, box }
  const [recemAlugado, setRecemAlugado] = useState(null);
  const [infoCliente, setInfoCliente] = useState(null);
  const [avisoLiberado, setAvisoLiberado] = useState("");

  // Ao abrir "Liberar", busca se o cliente tem outros boxes e atrasos
  useEffect(() => {
    setInfoCliente(null);
    if (janela?.tipo === "liberar" && janela.box.cliente) {
      api(`/clientes/${janela.box.cliente}/`).then(setInfoCliente).catch(() => {});
    }
  }, [janela]);
  const status = params.get("status") || "todos";
  const sedeFiltro = params.get("sede") || "";

  const carregar = useCallback(() => {
    Promise.all([listarTudo("/boxes/"), listarTudo("/sedes/")])
      .then(([b, s]) => {
        setBoxes(b);
        setSedes(s);
      })
      .catch((e) => setErro(e.message));
    atualizarAvisos();
  }, [atualizarAvisos]);
  useEffect(carregar, [carregar]);

  const mudarFiltro = (chave, valor) => {
    const p = new URLSearchParams(params);
    if (valor && valor !== "todos") p.set(chave, valor);
    else p.delete(chave);
    setParams(p, { replace: true });
  };

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (boxes || []).filter(
      (b) =>
        naSituacao(status, b) &&
        (!sedeFiltro || String(b.sede) === sedeFiltro) &&
        (!termo ||
          String(b.id) === termo.replace("#", "") ||
          (b.numero || "").toLowerCase() === termo.replace(/^box\s*/, "") ||
          b.tamanho.toLowerCase().includes(termo) ||
          (b.cliente_nome || "").toLowerCase().includes(termo))
    );
  }, [boxes, status, sedeFiltro, busca]);

  const abrir = (tipo, box = null) => setJanela({ tipo, box });
  const fechar = () => setJanela(null);
  const aposSalvar = () => {
    fechar();
    carregar();
  };

  const contagem = (s) =>
    (boxes || []).filter((b) => (!sedeFiltro || String(b.sede) === sedeFiltro) && naSituacao(s, b)).length;

  return (
    <>
      <Banner titulo="Boxes" subtitulo={usuario.sede ? `Sede ${usuario.sede.nome}` : "Todas as sedes"} />

      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Situação">
            {FILTROS.map((f) => (
              <button
                key={f.valor}
                role="tab"
                aria-selected={status === f.valor}
                onClick={() => mudarFiltro("status", f.valor)}
                className={`rounded-full px-4 py-1.5 text-sm transition ${
                  status === f.valor ? "bg-roxo text-white" : "bg-white text-marinho-claro ring-1 ring-roxo-100 hover:ring-roxo-300"
                }`}
              >
                {f.rotulo} <span className="opacity-70">({boxes ? contagem(f.valor) : "–"})</span>
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {usuario.admin && (
              <select
                aria-label="Filtrar por sede"
                value={sedeFiltro}
                onChange={(e) => mudarFiltro("sede", e.target.value)}
                className="rounded-md border border-roxo-200 bg-white px-3 py-2 text-sm focus:border-roxo focus:ring-2 focus:ring-roxo-100 focus:outline-none"
              >
                <option value="">Todas as sedes</option>
                {sedes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            )}
            <label className="relative block">
              <span className="sr-only">Buscar</span>
              <IconeBusca className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-marinho-claro/50" />
              <input
                type="search"
                placeholder="Buscar nº, tamanho ou cliente"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full rounded-md border border-roxo-200 bg-white py-2 pr-3 pl-9 text-sm focus:border-roxo focus:ring-2 focus:ring-roxo-100 focus:outline-none sm:w-72"
              />
            </label>
          </div>
        </div>

        <Aviso>{erro}</Aviso>
        {avisoLiberado && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <span>✅ {avisoLiberado}</span>
            <button onClick={() => setAvisoLiberado("")} className="text-xs text-emerald-900/70 hover:underline">Fechar</button>
          </div>
        )}
        {(() => {
          const b = recemAlugado && boxes?.find((x) => x.id === recemAlugado);
          if (!b?.contrato_ativo) return null;
          return (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <span>
                <strong>🎉 {nomeBox(b.numero, b.id)} alugado para {b.cliente_nome}!</strong> O contrato já está pronto para imprimir e assinar.
              </span>
              <span className="flex items-center gap-2">
                <BotaoPdf id={b.contrato_ativo} rotulo="Abrir contrato" className="bg-white" />
                <button onClick={() => setRecemAlugado(null)} className="text-xs text-emerald-900/70 hover:underline">
                  Fechar
                </button>
              </span>
            </div>
          );
        })()}
        <Cartao className="overflow-hidden">
          {!boxes && !erro ? (
            <Carregando />
          ) : visiveis.length === 0 ? (
            <Vazio icone={IconeCaixa} titulo="Nenhum box encontrado">
              {boxes?.length ? "Ajuste os filtros ou a busca." : "Nenhum box cadastrado nesta sede."}
            </Vazio>
          ) : (
            <>
              {/* Tabela (telas grandes) */}
              <table className="hidden w-full text-sm md:table">
                <thead className="bg-roxo-50 text-left text-xs tracking-wide text-roxo-700 uppercase">
                  <tr>
                    <th className="px-5 py-3 font-medium">Box</th>
                    {usuario.admin && <th className="px-5 py-3 font-medium">Sede</th>}
                    <th className="px-5 py-3 font-medium">Tamanho</th>
                    <th className="px-5 py-3 font-medium">Valor</th>
                    <th className="px-5 py-3 font-medium">Situação</th>
                    <th className="px-5 py-3 font-medium">Cliente</th>
                    <th className="px-5 py-3"><span className="sr-only">Ações</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-roxo-100">
                  {visiveis.map((b) => (
                    <tr key={b.id} className="hover:bg-fundo">
                      <td className="px-5 py-3">
                        <p className="font-semibold whitespace-nowrap text-marinho">{b.numero || `#${b.id}`}</p>
                        {b.observacao && <Observacao texto={b.observacao} />}
                      </td>
                      {usuario.admin && <td className="px-5 py-3">{b.sede_nome}</td>}
                      <td className="px-5 py-3">
                        <p>{b.tamanho}</p>
                        {b.tipo_detalhe && <p className="text-xs text-marinho-claro/60">{b.tipo_detalhe.dimensoes}</p>}
                      </td>
                      <td className="px-5 py-3 tabular-nums">{formatarMoeda(b.valor)}</td>
                      <td className="px-5 py-3">
                        <Situacao box={b} />
                      </td>
                      <td className="px-5 py-3">
                        {b.cliente_nome ? (
                          <>
                            <p>{b.cliente_nome}</p>
                            <p className="text-xs text-marinho-claro/60">Vence todo dia {b.dia_vencimento}</p>
                          </>
                        ) : (
                          <span className="text-marinho-claro/40">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <Acoes box={b} abrir={abrir} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Cartões (celular) */}
              <ul className="divide-y divide-roxo-100 md:hidden">
                {visiveis.map((b) => (
                  <li key={b.id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-marinho">
                          {nomeBox(b.numero, b.id)} <span className="font-normal text-marinho-claro/70">· {b.tamanho}</span>
                        </p>
                        {b.observacao && <Observacao texto={b.observacao} />}
                        <p className="text-sm tabular-nums">{formatarMoeda(b.valor)}{usuario.admin && ` · ${b.sede_nome}`}</p>
                        {b.cliente_nome && (
                          <p className="mt-1 text-sm text-roxo">
                            {b.cliente_nome} <span className="text-xs text-marinho-claro/60">· vence dia {b.dia_vencimento}</span>
                          </p>
                        )}
                      </div>
                      <Situacao box={b} />
                    </div>
                    <Acoes box={b} abrir={abrir} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </Cartao>
      </div>

      <Modal aberto={janela?.tipo === "editar"} titulo={`Editar ${nomeBox(janela?.box?.numero, janela?.box?.id).toLowerCase()}`} aoFechar={fechar}>
        <FormBox
          box={janela?.box}
          sedes={sedes}
          admin={usuario.admin}
          sedePadrao={usuario.sede?.id}
          aoSalvar={aposSalvar}
          aoFechar={fechar}
        />
      </Modal>
      <Modal aberto={janela?.tipo === "alugar"} titulo="Alugar box" aoFechar={fechar}>
        {janela?.tipo === "alugar" && (
          <FormAlugar
            box={janela.box}
            aoSalvar={(b) => {
              setRecemAlugado(b.id);
              aposSalvar();
            }}
            aoFechar={fechar}
          />
        )}
      </Modal>
      <Modal aberto={janela?.tipo === "historico"} titulo={`Histórico do ${nomeBox(janela?.box?.numero, janela?.box?.id).toLowerCase()}`} aoFechar={fechar}>
        {janela?.tipo === "historico" && <HistoricoBox box={janela.box} />}
      </Modal>
      <Confirmar
        aberto={janela?.tipo === "liberar"}
        titulo={`Liberar ${nomeBox(janela?.box?.numero, janela?.box?.id).toLowerCase()}?`}
        textoBotao="Liberar box"
        aoFechar={fechar}
        aoConfirmar={async () => {
          const r = await api(`/boxes/${janela.box.id}/liberar/`, { metodo: "POST" });
          setAvisoLiberado(
            r.cliente_excluido
              ? `${nomeBox(r.numero, r.id)} liberado. ${janela.box.cliente_nome} não tem outro box e foi para Clientes > Ex-clientes (o histórico continua guardado).`
              : `${nomeBox(r.numero, r.id)} liberado.`
          );
          carregar();
        }}
      >
        <p>
          O aluguel de <strong className="text-marinho">{janela?.box?.cliente_nome}</strong> será encerrado e o box ficará livre.
        </p>
        {infoCliente &&
          (infoCliente.total_boxes > 1 ? (
            <p className="rounded-md bg-fundo px-3 py-2 text-xs">
              {janela?.box?.cliente_nome} tem outro(s) box(es) alugado(s), então continua na lista de clientes.
            </p>
          ) : (
            <p className="rounded-md bg-fundo px-3 py-2 text-xs">
              Este é o único box de {janela?.box?.cliente_nome}: ele sai da lista de clientes e vai para{" "}
              <strong>Ex-clientes</strong>. Contratos e pagamentos ficam guardados.
            </p>
          ))}
        {infoCliente?.atrasadas > 0 && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            Atenção: {janela?.box?.cliente_nome} ainda tem {infoCliente.atrasadas} mensalidade(s) atrasada(s).
          </p>
        )}
      </Confirmar>
    </>
  );
}
