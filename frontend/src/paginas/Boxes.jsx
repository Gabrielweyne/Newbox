import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import Confirmar from "../componentes/Confirmar";
import { Banner } from "../componentes/Layout";
import {
  IconeBusca,
  IconeCaixa,
  IconeClipe,
  IconeDestravar,
  IconeLapis,
  IconeLixo,
  IconeMais,
  IconeChave,
} from "../componentes/Icones";
import { Aviso, Botao, Campo, Carregando, Cartao, Etiqueta, Modal, Selecao, Vazio } from "../componentes/ui";
import { api, ErroApi, listarTudo } from "../api";
import { useAuth } from "../auth";
import { DIAS_VENCIMENTO, formatarMoeda } from "../formato";

/* ---------- Formulário de box (novo / editar) ---------- */

function FormBox({ box, sedes, admin, aoSalvar, aoFechar }) {
  const [dados, setDados] = useState({
    sede: box?.sede ?? (sedes.length === 1 ? sedes[0].id : ""),
    tamanho: box?.tamanho ?? "",
    valor: box?.valor ?? "",
    dia_vencimento: box?.dia_vencimento ?? "",
  });
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const mudar = (c) => (e) => setDados((d) => ({ ...d, [c]: e.target.value }));

  async function enviar(e) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    const corpo = { tamanho: dados.tamanho, valor: dados.valor };
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
      {erro && !["sede", "tamanho", "valor"].some((c) => erro.campo(c)) && <Aviso>{erro.message}</Aviso>}
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
      <Campo
        rotulo="Tamanho"
        placeholder="Ex.: 2x2 m, P, M, G"
        value={dados.tamanho}
        onChange={mudar("tamanho")}
        erro={erro?.campo("tamanho")}
        autoFocus
      />
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
        ajuda={box?.alugado ? "Mensalidades futuras ainda não pagas passam a usar o novo valor." : undefined}
      />
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

/* ---------- Alugar box: cliente + comprovante ---------- */

function FormAlugar({ box, aoSalvar, aoFechar }) {
  const [clientes, setClientes] = useState(null);
  const [cliente, setCliente] = useState("");
  const [novoNome, setNovoNome] = useState("");
  const [arquivo, setArquivo] = useState(null);
  const [dia, setDia] = useState("");
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    listarTudo("/clientes/").then(setClientes).catch((e) => setErro(e));
  }, []);

  const novo = cliente === "novo";

  async function enviar(e) {
    e.preventDefault();
    setErro(null);
    if (!cliente) return setErro(new ErroApi(400, { cliente: ["Escolha o cliente."] }));
    if (novo && !novoNome.trim()) return setErro(new ErroApi(400, { nome: ["Informe o nome do cliente."] }));
    if (!dia) return setErro(new ErroApi(400, { dia_vencimento: ["Escolha o dia de vencimento."] }));
    if (!arquivo) return setErro(new ErroApi(400, { anexo_pagamento: ["Anexe o comprovante de pagamento."] }));
    setEnviando(true);
    try {
      let idCliente = cliente;
      if (novo) idCliente = (await api("/clientes/", { metodo: "POST", corpo: { nome: novoNome } })).id;
      const corpo = new FormData();
      corpo.append("cliente", idCliente);
      corpo.append("anexo_pagamento", arquivo);
      corpo.append("dia_vencimento", dia);
      aoSalvar(await api(`/boxes/${box.id}/`, { metodo: "PATCH", corpo }));
    } catch (err) {
      setErro(err);
    } finally {
      setEnviando(false);
    }
  }

  if (!clientes && !erro) return <Carregando texto="Carregando clientes..." />;
  const campos = ["cliente", "nome", "anexo_pagamento", "dia_vencimento"];

  return (
    <form onSubmit={enviar} className="space-y-4" noValidate>
      <p className="rounded-md bg-roxo-50 px-4 py-3 text-sm text-roxo-700">
        Box #{box.id} · {box.tamanho} · {formatarMoeda(box.valor)} · Sede {box.sede_nome}
      </p>
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
        <option value="novo">+ Cadastrar novo cliente</option>
        {clientes?.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </Selecao>
      {novo && (
        <Campo
          rotulo="Nome do novo cliente"
          value={novoNome}
          onChange={(e) => setNovoNome(e.target.value)}
          erro={erro?.campo("nome")}
          autoFocus
        />
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
];

function Acoes({ box, abrir }) {
  const btn = "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition";
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {box.alugado ? (
        <>
          <a href={box.anexo_pagamento} target="_blank" rel="noreferrer" className={`${btn} text-roxo hover:bg-roxo-50`}>
            <IconeClipe className="size-4" /> Comprovante
          </a>
          <button onClick={() => abrir("liberar", box)} className={`${btn} text-marinho-claro hover:bg-roxo-50`}>
            <IconeDestravar className="size-4" /> Liberar
          </button>
        </>
      ) : (
        <button onClick={() => abrir("alugar", box)} className={`${btn} bg-roxo text-white hover:bg-roxo-600`}>
          <IconeChave className="size-4" /> Alugar
        </button>
      )}
      <button onClick={() => abrir("editar", box)} className={`${btn} text-marinho-claro hover:bg-roxo-50`} aria-label={`Editar box ${box.id}`}>
        <IconeLapis className="size-4" />
      </button>
      {box.alugado ? (
        <span className="w-[34px]" aria-hidden />
      ) : (
        <button onClick={() => abrir("excluir", box)} className={`${btn} text-red-700 hover:bg-red-50`} aria-label={`Excluir box ${box.id}`}>
          <IconeLixo className="size-4" />
        </button>
      )}
    </div>
  );
}

export default function Boxes() {
  const { usuario } = useAuth();
  const [params, setParams] = useSearchParams();
  const [boxes, setBoxes] = useState(null);
  const [sedes, setSedes] = useState([]);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [janela, setJanela] = useState(null); // { tipo, box }
  const status = params.get("status") || "todos";
  const sedeFiltro = params.get("sede") || "";

  const carregar = useCallback(() => {
    Promise.all([listarTudo("/boxes/"), listarTudo("/sedes/")])
      .then(([b, s]) => {
        setBoxes(b);
        setSedes(s);
      })
      .catch((e) => setErro(e.message));
  }, []);
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
        (status === "todos" || (status === "alugados") === b.alugado) &&
        (!sedeFiltro || String(b.sede) === sedeFiltro) &&
        (!termo ||
          String(b.id) === termo.replace("#", "") ||
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
    (boxes || []).filter((b) => (!sedeFiltro || String(b.sede) === sedeFiltro) && (s === "todos" || (s === "alugados") === b.alugado)).length;

  return (
    <>
      <Banner titulo="Boxes" subtitulo={usuario.sede ? `Sede ${usuario.sede.nome}` : "Todas as sedes"}>
        <Botao onClick={() => abrir("novo")}>
          <IconeMais className="size-4" /> Novo box
        </Botao>
      </Banner>

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
        <Cartao className="overflow-hidden">
          {!boxes && !erro ? (
            <Carregando />
          ) : visiveis.length === 0 ? (
            <Vazio icone={IconeCaixa} titulo="Nenhum box encontrado">
              {boxes?.length ? "Ajuste os filtros ou a busca." : "Cadastre o primeiro box em \"Novo box\"."}
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
                      <td className="px-5 py-3 font-semibold text-marinho">#{b.id}</td>
                      {usuario.admin && <td className="px-5 py-3">{b.sede_nome}</td>}
                      <td className="px-5 py-3">{b.tamanho}</td>
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
                          Box #{b.id} <span className="font-normal text-marinho-claro/70">· {b.tamanho}</span>
                        </p>
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

      <Modal aberto={janela?.tipo === "novo" || janela?.tipo === "editar"} titulo={janela?.box ? `Editar box #${janela.box.id}` : "Novo box"} aoFechar={fechar}>
        <FormBox box={janela?.box} sedes={sedes} admin={usuario.admin} aoSalvar={aposSalvar} aoFechar={fechar} />
      </Modal>
      <Modal aberto={janela?.tipo === "alugar"} titulo="Alugar box" aoFechar={fechar}>
        {janela?.tipo === "alugar" && <FormAlugar box={janela.box} aoSalvar={aposSalvar} aoFechar={fechar} />}
      </Modal>
      <Confirmar
        aberto={janela?.tipo === "liberar"}
        titulo={`Liberar box #${janela?.box?.id}?`}
        textoBotao="Liberar box"
        aoFechar={fechar}
        aoConfirmar={async () => {
          await api(`/boxes/${janela.box.id}/liberar/`, { metodo: "POST" });
          carregar();
        }}
      >
        <p>
          O aluguel de <strong className="text-marinho">{janela?.box?.cliente_nome}</strong> será encerrado e o box ficará livre.
        </p>
      </Confirmar>
      <Confirmar
        aberto={janela?.tipo === "excluir"}
        titulo={`Excluir box #${janela?.box?.id}?`}
        textoBotao="Excluir"
        variante="perigo"
        aoFechar={fechar}
        aoConfirmar={async () => {
          await api(`/boxes/${janela.box.id}/`, { metodo: "DELETE" });
          carregar();
        }}
      >
        <p>Essa ação não pode ser desfeita.</p>
      </Confirmar>
    </>
  );
}
