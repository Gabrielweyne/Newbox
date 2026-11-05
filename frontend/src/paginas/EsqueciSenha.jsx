import { useState } from "react";
import { Link } from "react-router";
import LayoutAcesso from "../componentes/LayoutAcesso";
import { Aviso, Botao, Campo } from "../componentes/ui";
import { api } from "../api";
import { formatarCpf } from "../formato";

export default function EsqueciSenha() {
  const [cpf, setCpf] = useState("");
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      const r = await api("/auth/senha/esqueci/", { metodo: "POST", corpo: { cpf }, autenticar: false });
      setMensagem(r.detail);
    } catch (err) {
      setErro(err.campo?.("cpf") || err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <LayoutAcesso
      titulo="Esqueci minha senha"
      subtitulo="Informe seu CPF. Enviaremos um link para o e-mail cadastrado."
      rodape={
        <Link to="/login" className="font-medium text-roxo hover:underline">
          Voltar para o login
        </Link>
      }
    >
      {mensagem ? (
        <Aviso tipo="sucesso">{mensagem}</Aviso>
      ) : (
        <form onSubmit={enviar} className="space-y-5" noValidate>
          <Aviso>{erro}</Aviso>
          <Campo
            rotulo="CPF"
            inputMode="numeric"
            placeholder="000.000.000-00"
            value={cpf}
            onChange={(e) => setCpf(formatarCpf(e.target.value))}
            autoFocus
          />
          <Botao type="submit" carregando={enviando} className="w-full">
            Enviar link
          </Botao>
        </form>
      )}
    </LayoutAcesso>
  );
}
