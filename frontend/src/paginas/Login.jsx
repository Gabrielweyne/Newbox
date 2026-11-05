import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import LayoutAcesso from "../componentes/LayoutAcesso";
import { Aviso, Botao, Campo } from "../componentes/ui";
import { useAuth } from "../auth";
import { formatarCpf } from "../formato";

export default function Login() {
  const { entrar } = useAuth();
  const navegar = useNavigate();
  const local = useLocation();
  const [cpf, setCpf] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      await entrar(cpf, senha);
      navegar(local.state?.de || "/", { replace: true });
    } catch (err) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <LayoutAcesso
      titulo="Entrar"
      subtitulo="Use seu CPF e senha para acessar a área da sua sede."
      rodape={
        <>
          Ainda não tem acesso?{" "}
          <Link to="/cadastro" className="font-medium text-roxo hover:underline">
            Cadastre-se
          </Link>
        </>
      }
    >
      <form onSubmit={enviar} className="space-y-5" noValidate>
        {local.state?.mensagem && <Aviso tipo="sucesso">{local.state.mensagem}</Aviso>}
        <Aviso>{erro}</Aviso>
        <Campo
          rotulo="CPF"
          inputMode="numeric"
          autoComplete="username"
          placeholder="000.000.000-00"
          value={cpf}
          onChange={(e) => setCpf(formatarCpf(e.target.value))}
          required
          autoFocus
        />
        <div>
          <Campo
            rotulo="Senha"
            type="password"
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
          />
          <Link to="/esqueci-senha" className="mt-2 inline-block text-sm text-roxo hover:underline">
            Esqueci minha senha
          </Link>
        </div>
        <Botao type="submit" carregando={enviando} className="w-full">
          Entrar
        </Botao>
      </form>
    </LayoutAcesso>
  );
}
