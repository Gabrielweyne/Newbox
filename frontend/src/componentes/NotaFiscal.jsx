import { useState } from "react";
import { Link } from "react-router";
import { api } from "../api";
import { formatarData, nomeBox } from "../formato";
import { IconeDocumento, IconeEmail } from "./Icones";
import { Aviso, Botao, Campo, Modal } from "./ui";

/** Botão "Nota fiscal" de uma mensalidade: anexa o PDF e envia ao cliente por e-mail. */
export default function BotaoNotaFiscal({ m, aoAtualizar }) {
  const [aberto, setAberto] = useState(false);
  if (!m.cliente_email) {
    return (
      <Link
        to={`/clientes/${m.cliente}`}
        className="inline-flex items-center rounded-md px-2.5 py-1.5 text-xs text-marinho-claro/70 ring-1 ring-roxo-100 hover:bg-fundo"
        title="Cliente sem e-mail: cadastre para enviar a nota fiscal"
      >
        Cadastrar e-mail
      </Link>
    );
  }
  const enviada = !!m.nota_enviada_em;
  return (
    <>
      <button
        onClick={() => setAberto(true)}
        className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition ${
          enviada ? "text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-50" : "text-roxo ring-1 ring-roxo-200 hover:bg-roxo-50"
        }`}
        title={enviada ? `Enviada em ${formatarData(m.nota_enviada_em.slice(0, 10))} para ${m.nota_enviada_para}` : "Enviar nota fiscal"}
      >
        <IconeDocumento className="size-4" /> {enviada ? "NF enviada" : "Nota fiscal"}
      </button>
      <Modal aberto={aberto} titulo="Nota fiscal" aoFechar={() => setAberto(false)}>
        {aberto && (
          <Formulario
            m={m}
            aoFechar={() => setAberto(false)}
            aoSalvar={(nova) => {
              setAberto(false);
              aoAtualizar(nova);
            }}
          />
        )}
      </Modal>
    </>
  );
}

function Formulario({ m, aoFechar, aoSalvar }) {
  const [arquivo, setArquivo] = useState(null);
  const [numero, setNumero] = useState(m.nota_numero || "");
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const corpo = new FormData();
    if (arquivo) {
      corpo.append("arquivo", arquivo);
      corpo.append("numero", numero);
    }
    try {
      aoSalvar(await api(`/mensalidades/${m.id}/nota-fiscal/`, { metodo: "POST", corpo }));
    } catch (err) {
      setErro(err);
      if (err.status === 502 && err.dados?.mensalidade) aoSalvar(err.dados.mensalidade);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4" noValidate>
      <div className="rounded-md bg-roxo-50 px-4 py-3 text-sm text-roxo-700">
        <p className="font-medium">{m.cliente_nome} · {nomeBox(m.box_numero, m.box)}</p>
        <p>Mensalidade com vencimento em {formatarData(m.vencimento)}</p>
        <p className="mt-1 flex items-center gap-1.5">
          <IconeEmail className="size-4" /> Será enviada para <strong>{m.cliente_email}</strong>
        </p>
      </div>
      {m.nota_enviada_em && (
        <Aviso tipo="sucesso">
          Nota{m.nota_numero && ` nº ${m.nota_numero}`} enviada em {formatarData(m.nota_enviada_em.slice(0, 10))} para{" "}
          {m.nota_enviada_para}.{" "}
          <a href={m.nota_fiscal} target="_blank" rel="noreferrer" className="font-medium underline">
            Ver PDF
          </a>
        </Aviso>
      )}
      {erro && !erro.campo("arquivo") && <Aviso>{erro.message}</Aviso>}
      <div>
        <p className="mb-1.5 text-sm font-medium">{m.nota_fiscal ? "Substituir por outro PDF (opcional)" : "PDF da nota fiscal"}</p>
        <label
          className={`flex cursor-pointer items-center gap-3 rounded-md border border-dashed px-4 py-4 text-sm transition hover:bg-roxo-50 ${
            erro?.campo("arquivo") ? "border-red-400" : "border-roxo-300"
          }`}
        >
          <IconeDocumento className="size-6 shrink-0 text-roxo" />
          <span className="min-w-0 truncate">{arquivo ? arquivo.name : "Clique para anexar o PDF emitido"}</span>
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={(e) => {
              setArquivo(e.target.files[0] || null);
              setErro(null);
            }}
          />
        </label>
        {erro?.campo("arquivo") && <p className="mt-1.5 text-xs text-red-600">{erro.campo("arquivo")}</p>}
      </div>
      {(arquivo || !m.nota_fiscal) && (
        <Campo rotulo="Número da nota (opcional)" value={numero} onChange={(e) => setNumero(e.target.value)} />
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Botao type="button" variante="fantasma" onClick={aoFechar}>Cancelar</Botao>
        <Botao type="submit" carregando={enviando}>
          {arquivo || !m.nota_fiscal ? "Enviar ao cliente" : "Reenviar e-mail"}
        </Botao>
      </div>
    </form>
  );
}
