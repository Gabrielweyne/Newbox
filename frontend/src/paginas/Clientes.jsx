import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import Confirmar from "../componentes/Confirmar";
import { Banner } from "../componentes/Layout";
import { IconeBusca, IconeLapis, IconeLixo, IconeMais, IconePessoas, IconeWhatsapp } from "../componentes/Icones";
import { Aviso, Botao, Campo, Carregando, Cartao, Etiqueta, Modal, Vazio } from "../componentes/ui";
import { api, listarTudo } from "../api";
import { formatarCpf } from "../formato";
import { formatarTelefone, linkWhatsapp } from "../whatsapp";

export function FormCliente({ cliente, aoSalvar, aoFechar }) {
  const [dados, setDados] = useState({
    nome: cliente?.nome ?? "",
    telefone: formatarTelefone(cliente?.telefone ?? ""),
    cpf: formatarCpf(cliente?.cpf ?? ""),
    email: cliente?.email ?? "",
  });
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const mudar = (c) => (e) => {
    const v = e.target.value;
    setDados((d) => ({ ...d, [c]: c === "telefone" ? formatarTelefone(v) : c === "cpf" ? formatarCpf(v) : v }));
  };

  async function enviar(e) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const salvo = await (cliente
        ? api(`/clientes/${cliente.id}/`, { metodo: "PATCH", corpo: dados })
        : api("/clientes/", { metodo: "POST", corpo: dados }));
      aoSalvar(salvo);
    } catch (err) {
      setErro(err);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4" noValidate>
      {erro && !["nome", "telefone", "cpf", "email"].some((c) => erro.campo(c)) && <Aviso>{erro.message}</Aviso>}
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
          rotulo="CPF (opcional)"
          inputMode="numeric"
          placeholder="000.000.000-00"
          value={dados.cpf}
          onChange={mudar("cpf")}
          erro={erro?.campo("cpf")}
        />
        <Campo rotulo="E-mail (opcional)" type="email" value={dados.email} onChange={mudar("email")} erro={erro?.campo("email")} />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Botao type="button" variante="fantasma" onClick={aoFechar}>
          Cancelar
        </Botao>
        <Botao type="submit" carregando={enviando}>
          {cliente ? "Salvar" : "Cadastrar cliente"}
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

  const carregar = useCallback(() => {
    listarTudo("/clientes/").then(setClientes).catch((e) => setErro(e.message));
  }, []);
  useEffect(carregar, [carregar]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const digitos = termo.replace(/\D/g, "");
    return (clientes || []).filter(
      (c) =>
        c.nome.toLowerCase().includes(termo) ||
        (digitos.length >= 3 && (c.telefone.includes(digitos) || c.cpf.includes(digitos)))
    );
  }, [clientes, busca]);

  const fechar = () => setJanela(null);

  return (
    <>
      <Banner titulo="Clientes" subtitulo="Clientes compartilhados entre as sedes Cocó e Cambeba">
        <Botao onClick={() => setJanela({ tipo: "novo" })}>
          <IconeMais className="size-4" /> Novo cliente
        </Botao>
      </Banner>

      <div className="mx-auto max-w-6xl px-4 py-8">
        <label className="relative mb-5 block sm:w-80">
          <span className="sr-only">Buscar cliente</span>
          <IconeBusca className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-marinho-claro/50" />
          <input
            type="search"
            placeholder="Buscar por nome, WhatsApp ou CPF"
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
            <Vazio icone={IconePessoas} titulo="Nenhum cliente encontrado">
              {clientes?.length ? "Tente outro nome." : "Cadastre clientes aqui ou direto ao alugar um box."}
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
                        {c.total_boxes === 0
                          ? "nenhum box alugado"
                          : `${c.total_boxes} box${c.total_boxes > 1 ? "es" : ""} alugado${c.total_boxes > 1 ? "s" : ""}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
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
                    <button
                      onClick={() => setJanela({ tipo: "excluir", cliente: c })}
                      className="rounded-md p-2 text-red-700 hover:bg-red-50"
                      aria-label={`Excluir ${c.nome}`}
                    >
                      <IconeLixo className="size-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>

      <Modal aberto={janela?.tipo === "novo" || janela?.tipo === "editar"} titulo={janela?.cliente ? "Editar cliente" : "Novo cliente"} aoFechar={fechar}>
        <FormCliente
          cliente={janela?.cliente}
          aoFechar={fechar}
          aoSalvar={() => {
            fechar();
            carregar();
          }}
        />
      </Modal>
      <Confirmar
        aberto={janela?.tipo === "excluir"}
        titulo={`Excluir ${janela?.cliente?.nome}?`}
        textoBotao="Excluir"
        variante="perigo"
        aoFechar={fechar}
        aoConfirmar={async () => {
          await api(`/clientes/${janela.cliente.id}/`, { metodo: "DELETE" });
          carregar();
        }}
      >
        <p>Só é possível excluir clientes que não estão alugando nenhum box.</p>
      </Confirmar>
    </>
  );
}
