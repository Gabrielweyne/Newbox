import { useState } from "react";
import { abrirPdf } from "../api";
import { formatarData, formatarMoeda } from "../formato";
import { IconeDocumento } from "./Icones";
import { Etiqueta } from "./ui";

/** Botão que abre o PDF de um contrato. */
export function BotaoPdf({ contrato, id, numero, rotulo = "Baixar PDF", className = "" }) {
  const [abrindo, setAbrindo] = useState(false);
  const [erro, setErro] = useState("");
  const cid = contrato?.id ?? id;
  return (
    <span className="inline-flex shrink-0 flex-col items-end">
      <button
        onClick={async () => {
          setAbrindo(true);
          setErro("");
          try {
            await abrirPdf(`/contratos/${cid}/pdf/`, `contrato-newbox-${contrato?.numero ?? numero ?? cid}.pdf`);
          } catch (e) {
            setErro(e.message);
          } finally {
            setAbrindo(false);
          }
        }}
        disabled={abrindo}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-roxo ring-1 ring-roxo-200 transition hover:bg-roxo-50 disabled:opacity-60 ${className}`}
      >
        <IconeDocumento className="size-4" /> {abrindo ? "Gerando..." : rotulo}
      </button>
      {erro && <span className="mt-1 text-xs text-red-600">{erro}</span>}
    </span>
  );
}

/** Lista de contratos (ficha do cliente ou histórico do box). */
export default function ListaContratos({ contratos, mostrarCliente = false, mostrarBox = true }) {
  if (!contratos.length) {
    return <p className="px-5 py-4 text-sm text-marinho-claro/70">Nenhum contrato registrado.</p>;
  }
  return (
    <ul className="divide-y divide-roxo-100">
      {contratos.map((c) => (
        <li key={c.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-sm">
            <p className="font-medium text-marinho">
              {mostrarCliente ? c.cliente_nome : `Box #${c.box} · ${c.tamanho}`}{" "}
              {c.ativo ? <Etiqueta cor="verde">Ativo</Etiqueta> : <Etiqueta cor="cinza">Encerrado</Etiqueta>}
            </p>
            <p className="text-xs text-marinho-claro/70">
              {mostrarBox && mostrarCliente && `Box #${c.box} · `}
              {c.sede_nome} · {formatarData(c.inicio)} até {c.fim ? formatarData(c.fim) : "hoje"} ·{" "}
              <strong className="font-medium text-marinho-claro">{c.duracao}</strong> · {formatarMoeda(c.valor)}/mês
            </p>
            <p className="text-xs text-marinho-claro/50">Contrato nº {c.numero}</p>
          </div>
          <BotaoPdf contrato={c} />
        </li>
      ))}
    </ul>
  );
}
