import { useState } from "react";
import { Aviso, Botao, Modal } from "./ui";

/** Janela "Tem certeza?" para ações como liberar ou excluir. */
export default function Confirmar({ aberto, titulo, children, textoBotao, variante = "primario", aoConfirmar, aoFechar }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  async function confirmar() {
    setEnviando(true);
    setErro("");
    try {
      await aoConfirmar();
      aoFechar();
    } catch (err) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal aberto={aberto} titulo={titulo} aoFechar={() => { setErro(""); aoFechar(); }} largura="max-w-md">
      <div className="space-y-4 text-sm text-marinho-claro/80">
        {children}
        <Aviso>{erro}</Aviso>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Botao variante="fantasma" onClick={aoFechar}>
          Cancelar
        </Botao>
        <Botao variante={variante} carregando={enviando} onClick={confirmar}>
          {textoBotao}
        </Botao>
      </div>
    </Modal>
  );
}
