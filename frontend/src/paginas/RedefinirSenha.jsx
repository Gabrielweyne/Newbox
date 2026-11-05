import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import LayoutAcesso from "../componentes/LayoutAcesso";
import { Aviso, Botao, Campo } from "../componentes/ui";
import { api } from "../api";

export default function RedefinirSenha() {
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const uid = params.get("uid");
  const token = params.get("token");

  async function enviar(e) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const r = await api("/auth/senha/redefinir/", {
        metodo: "POST",
        corpo: { uid, token, senha, confirmar_senha: confirmar },
        autenticar: false,
      });
      navegar("/login", { replace: true, state: { mensagem: r.detail } });
    } catch (err) {
      setErro(err);
    } finally {
      setEnviando(false);
    }
  }

  const linkInvalido = !uid || !token || erro?.campo?.("token");

  return (
    <LayoutAcesso
      titulo="Criar nova senha"
      rodape={
        <Link to="/login" className="font-medium text-roxo hover:underline">
          Voltar para o login
        </Link>
      }
    >
      {linkInvalido ? (
        <div className="space-y-4">
          <Aviso>{erro?.campo?.("token") || "Link inválido. Abra o link exatamente como recebido no e-mail."}</Aviso>
          <Link to="/esqueci-senha" className="inline-block font-medium text-roxo hover:underline">
            Pedir um novo link
          </Link>
        </div>
      ) : (
        <form onSubmit={enviar} className="space-y-5" noValidate>
          {erro && !erro.campo("senha") && !erro.campo("confirmar_senha") && <Aviso>{erro.message}</Aviso>}
          <Campo
            rotulo="Nova senha"
            type="password"
            autoComplete="new-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            erro={erro?.campo("senha")}
            ajuda="Mínimo de 8 caracteres. Evite senhas óbvias."
            autoFocus
          />
          <Campo
            rotulo="Confirmar nova senha"
            type="password"
            autoComplete="new-password"
            value={confirmar}
            onChange={(e) => setConfirmar(e.target.value)}
            erro={erro?.campo("confirmar_senha")}
          />
          <Botao type="submit" carregando={enviando} className="w-full">
            Salvar nova senha
          </Botao>
        </form>
      )}
    </LayoutAcesso>
  );
}
