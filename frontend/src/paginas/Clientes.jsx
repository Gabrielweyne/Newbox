import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Banner } from "../componentes/Layout";
import { IconeBusca, IconeLapis, IconePessoas, IconeWhatsapp } from "../componentes/Icones";
import { Aviso, Botao, Campo, Carregando, Cartao, Etiqueta, Modal, Vazio } from "../componentes/ui";
import { api, listarTudo } from "../api";
import { DIAS_VENCIMENTO, formatarDocumento } from "../formato";
import { formatarTelefone, linkWhatsapp } from "../whatsapp";

/** Editar dados do cliente. Clientes novos só são cadastrados ao alugar um box. */
export function FormCliente({ cliente, aoSalvar, aoFechar }) {
  const [dados, setDados] = useState({
    nome: cliente?.nome ?? "",
    telefone: formatarTelefone(cliente?.telefone ?? ""),
    cpf: formatarDocumento(cliente?.cpf ?? ""),
    email: cliente?.email ?? "",
    endereco: cliente?.endereco ?? "",
  });
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const mudar = (c) => (e) => {
    const v = e.target.value;
    setDados((d) => ({ ...d, [c]: c === "telefone" ? formatarTelefone(v) : c === "cpf" ? formatarDocumento(v) : v }));
  };

  async function enviar(e) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const salvo = await api(`/clientes/${cliente.id}/`, { metodo: "PATCH", corpo: dados });
      aoSalvar(salvo);
    } catch (err) {
      setErro(err);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4" noValidate>
      {erro && !["nome", "telefone", "cpf", "email", "endereco"].some((c) => erro.campo(c)) && <Aviso>{erro.message}</Aviso>}
      <Campo rotulo="Nome do cliente" value={dados.nome} onChange={mudar("nome")} erro={erro?.campo("nome")} autoFocus />
      <Campo
        rotulo="WhatsApp"
        inputMode="tel"
        placeholder="(85) 99999-9999"
        value={dados.telefone}
        onChange={mudar("telefone")}
        erro={erro?.campo("telefone")}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          rotulo="CPF ou CNPJ (opcional)"
          inputMode="numeric"
          placeholder="000.000.000-00"
          value={dados.cpf}
          onChange={mudar("cpf")}
          erro={erro?.campo("cpf")}
        />
        <Campo rotulo="E-mail" type="email" ajuda="Para onde vai a nota fiscal." value={dados.email} onChange={mudar("email")} erro={erro?.campo("email")} />
      </div>
      <Campo
        rotulo="Endereço com CEP (opcional)"
        placeholder="Rua, número, bairro, CEP"
        value={dados.endereco}
        onChange={mudar("endereco")}
        erro={erro?.campo("endereco")}
      />
      <div className="flex justify-end gap-2 pt-2">
        <Botao type="button" variante="fantasma" onClick={aoFechar}>
          Cancelar
        </Botao>
        <Botao type="submit" carregando={enviando}>
          Salvar
        </Botao>
      </div>
    </form>
  );
}

export default function Clientes() {
  const [clientes, setClientes] = useState(null);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [janela, setJanela] = useState(null);
  const [aba, setAba] = useState("ativos");
  const [dia, setDia] = useState(null); // filtro por dia de vencimento

  const carregar = useCallback(() => {
    setClientes(null);
    listarTudo(`/clientes/${aba === "excluidos" ? "?excluidos=true" : ""}`)
      .then(setClientes)
      .catch((e) => setErro(e.message));
  }, [aba]);
  useEffect(carregar, [carregar]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const digitos = termo.replace(/\D/g, "");
    return (clientes || []).filter(
      (c) =>
        (!dia || c.dias_vencimento.includes(dia)) &&
        (c.nome.toLowerCase().includes(termo) ||
          (digitos.length >= 3 && (c.telefone.includes(digitos) || c.cpf.includes(digitos))))
    );
  }, [clientes, busca, dia]);

  const fechar = () => setJanela(null);

  return (
    <>
      <Banner
        titulo="Clientes"
        subtitulo="Quem está com box alugado (nas sedes Cocó e Cambeba). Cliente novo é cadastrado ao alugar um box."
      />

      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-4 flex flex-wrap gap-2" role="tablist">
          {[
            ["ativos", "Clientes"],
            ["excluidos", "Ex-clientes"],
          ].map(([v, r]) => (
            <button
              key={v}
              role="tab"
              aria-selected={aba === v}
              onClick={() => setAba(v)}
              className={`rounded-full px-4 py-1.5 text-sm transition ${
                aba === v ? "bg-roxo text-white" : "bg-white text-marinho-claro ring-1 ring-roxo-100 hover:ring-roxo-300"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        {aba === "excluidos" && (
          <p className="mb-4 text-sm text-marinho-claro/70">
            Quem já liberou todos os boxes. Contratos e pagamentos continuam guardados. Se a pessoa voltar, é só
            escolher o nome dela ao alugar um box: ela volta a ser cliente.
          </p>
        )}
        {aba === "ativos" && (
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="Dia de vencimento">
            <span className="mr-1 text-marinho-claro/70">Pagam no dia:</span>
            {[null, ...DIAS_VENCIMENTO].map((d) => (
              <button
                key={d ?? "todos"}
                onClick={() => setDia(d)}
                aria-pressed={dia === d}
                className={`rounded-full px-3 py-1 transition ${
                  dia === d ? "bg-amarelo font-medium text-marinho" : "bg-white text-marinho-claro ring-1 ring-roxo-100 hover:ring-roxo-300"
                }`}
              >
                {d ? `Dia ${d}` : "Todos"}{" "}
                <span className="opacity-70">
                  ({clientes ? clientes.filter((c) => !d || c.dias_vencimento.includes(d)).length : "–"})
                </span>
              </button>
            ))}
          </div>
        )}
        <label className="relative mb-5 block sm:w-80">
          <span className="sr-only">Buscar cliente</span>
          <IconeBusca className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-marinho-claro/50" />
          <input
            type="search"
            placeholder="Buscar por nome, WhatsApp, CPF ou CNPJ"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full rounded-md border border-roxo-200 bg-white py-2 pr-3 pl-9 text-sm focus:border-roxo focus:ring-2 focus:ring-roxo-100 focus:outline-none"
          />
        </label>

        <Aviso>{erro}</Aviso>
        <Cartao className="overflow-hidden">
          {!clientes && !erro ? (
            <Carregando />
          ) : visiveis.length === 0 ? (
            <Vazio icone={IconePessoas} titulo="Nenhum cliente encontrado 🔍">
              {aba === "excluidos"
                ? "Nenhum ex-cliente."
                : clientes?.length
                  ? "Tente outro nome."
                  : "Os clientes aparecem aqui quando um box é alugado."}
            </Vazio>
          ) : (
            <ul className="divide-y divide-roxo-100">
              {visiveis.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-fundo">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-roxo-100 text-sm font-semibold text-roxo-700">
                      {c.nome.trim()[0]?.toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <Link to={`/clientes/${c.id}`} className="block truncate font-medium text-marinho hover:text-roxo">
                        {c.nome} {c.atrasadas > 0 && <Etiqueta cor="vermelho">{c.atrasadas} em atraso</Etiqueta>}
                      </Link>
                      <p className="text-xs text-marinho-claro/60">
                        {c.telefone ? formatarTelefone(c.telefone) : <span className="text-amber-700">Sem WhatsApp</span>} ·{" "}
                        {!c.email && <><span className="text-amber-700">Sem e-mail</span> ·{" "}</>}
                        {c.total_boxes === 0
                          ? "nenhum box alugado"
                          : `${c.total_boxes} box${c.total_boxes > 1 ? "es" : ""} alugado${c.total_boxes > 1 ? "s" : ""}`}
                        {c.dias_vencimento.length > 0 && ` · paga dia ${c.dias_vencimento.join(" e ")}`}
                        {c.excluido_em && ` · ex-cliente desde ${new Date(c.excluido_em).toLocaleDateString("pt-BR")}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {c.telefone && (
                      <a
                        href={linkWhatsapp(c.telefone)}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md p-2 text-[#1ebe5a] hover:bg-emerald-50"
                        aria-label={`WhatsApp de ${c.nome}`}
                      >
                        <IconeWhatsapp className="size-4" />
                      </a>
                    )}
                    <button
                      onClick={() => setJanela({ tipo: "editar", cliente: c })}
                      className="rounded-md p-2 text-marinho-claro hover:bg-roxo-50 hover:text-roxo"
                      aria-label={`Editar ${c.nome}`}
                    >
                      <IconeLapis className="size-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>

      <Modal aberto={janela?.tipo === "editar"} titulo="Editar cliente" aoFechar={fechar}>
        <FormCliente
          cliente={janela?.cliente}
          aoFechar={fechar}
          aoSalvar={() => {
            fechar();
            carregar();
          }}
        />
      </Modal>
    </>
  );
}
