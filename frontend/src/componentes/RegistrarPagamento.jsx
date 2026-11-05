import { useState } from "react";
import { api } from "../api";
import { formatarData, formatarMoeda } from "../formato";
import { IconeClipe } from "./Icones";
import { Aviso, Botao, Campo, Modal } from "./ui";

const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Janela para registrar o pagamento de uma mensalidade (comprovante + data). */
export default function RegistrarPagamento({ mensalidade, aoFechar, aoSalvar }) {
  return (
    <Modal aberto={!!mensalidade} titulo="Registrar pagamento" aoFechar={aoFechar}>
      {mensalidade && <Formulario m={mensalidade} aoFechar={aoFechar} aoSalvar={aoSalvar} />}
    </Modal>
  );
}

function Formulario({ m, aoFechar, aoSalvar }) {
  const [arquivo, setArquivo] = useState(null);
  const [data, setData] = useState(hojeIso());
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const corpo = new FormData();
    if (arquivo) corpo.append("comprovante", arquivo);
    corpo.append("pago_em", data);
    try {
      aoSalvar(await api(`/mensalidades/${m.id}/pagar/`, { metodo: "POST", corpo }));
    } catch (err) {
      setErro(err);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4" noValidate>
      <div className="rounded-md bg-roxo-50 px-4 py-3 text-sm text-roxo-700">
        <p className="font-medium">
          Box #{m.box} · {m.cliente_nome}
        </p>
        <p>
          Vencimento {formatarData(m.vencimento)} · {formatarMoeda(m.valor)}
        </p>
      </div>
      {erro && !erro.campo("comprovante") && !erro.campo("pago_em") && <Aviso>{erro.message}</Aviso>}
      <Campo
        rotulo="Data do pagamento"
        type="date"
        max={hojeIso()}
        value={data}
        onChange={(e) => setData(e.target.value)}
        erro={erro?.campo("pago_em")}
      />
      <div>
        <p className="mb-1.5 text-sm font-medium">Comprovante</p>
        <label
          className={`flex cursor-pointer items-center gap-3 rounded-md border border-dashed px-4 py-4 text-sm transition hover:bg-roxo-50 ${
            erro?.campo("comprovante") ? "border-red-400" : "border-roxo-300"
          }`}
        >
          <IconeClipe className="size-6 shrink-0 text-roxo" />
          <span className="min-w-0 truncate">{arquivo ? arquivo.name : "Clique para anexar (PDF ou imagem)"}</span>
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
        {erro?.campo("comprovante") && (
          <p className="mt-1.5 text-xs text-red-600">Anexe o comprovante de pagamento.</p>
        )}
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Botao type="button" variante="fantasma" onClick={aoFechar}>
          Cancelar
        </Botao>
        <Botao type="submit" carregando={enviando}>
          Confirmar pagamento
        </Botao>
      </div>
    </form>
  );
}
