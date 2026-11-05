import { useEffect, useState } from "react";
import { Link } from "react-router";
import LayoutAcesso from "../componentes/LayoutAcesso";
import { Aviso, Botao, Campo, Selecao } from "../componentes/ui";
import { IconeCheck } from "../componentes/Icones";
import { api, ErroApi } from "../api";
import { formatarCpf } from "../formato";

const vazio = { nome: "", cpf: "", email: "", sede: "", senha: "", confirmar_senha: "" };

export default function Cadastro() {
  const [dados, setDados] = useState(vazio);
  const [sedes, setSedes] = useState([]);
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [concluido, setConcluido] = useState(false);

  useEffect(() => {
    api("/funcionarios/sedes/", { autenticar: false }).then(setSedes).catch(() => {});
  }, []);

  const mudar = (campo) => (e) =>
    setDados((d) => ({ ...d, [campo]: campo === "cpf" ? formatarCpf(e.target.value) : e.target.value }));

  async function enviar(e) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await api("/auth/registro/", { metodo: "POST", corpo: dados, autenticar: false });
      setConcluido(true);
    } catch (err) {
      setErro(err instanceof ErroApi ? err : new ErroApi(0, { detail: err.message }));
    } finally {
      setEnviando(false);
    }
  }

  if (concluido) {
    return (
      <LayoutAcesso titulo="Cadastro enviado!">
        <div className="space-y-6">
          <div className="flex size-14 items-center justify-center rounded-full bg-roxo-100 text-roxo">
            <IconeCheck className="size-7" />
          </div>
          <p className="text-marinho-claro/80">
            Recebemos seu cadastro. Assim que o administrador aprovar seu acesso, você poderá entrar
            com seu CPF e senha.
          </p>
          <Link to="/login" className="inline-block font-medium text-roxo hover:underline">
            Voltar para o login
          </Link>
        </div>
      </LayoutAcesso>
    );
  }

  const e = (campo) => erro?.campo(campo);

  return (
    <LayoutAcesso
      titulo="Criar acesso"
      subtitulo="Preencha seus dados. O administrador vai aprovar seu acesso."
      rodape={
        <>
          Já tem acesso?{" "}
          <Link to="/login" className="font-medium text-roxo hover:underline">
            Entrar
          </Link>
        </>
      }
    >
      <form onSubmit={enviar} className="space-y-4" noValidate>
        {erro && !Object.keys(vazio).some((c) => e(c)) && <Aviso>{erro.message}</Aviso>}
        <Campo rotulo="Nome completo" autoComplete="name" value={dados.nome} onChange={mudar("nome")} erro={e("nome")} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            rotulo="CPF"
            inputMode="numeric"
            placeholder="000.000.000-00"
            value={dados.cpf}
            onChange={mudar("cpf")}
            erro={e("cpf")}
          />
          <Selecao rotulo="Sede onde trabalha" value={dados.sede} onChange={mudar("sede")} erro={e("sede")}>
            <option value="">Selecione</option>
            {sedes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </Selecao>
        </div>
        <Campo
          rotulo="E-mail"
          type="email"
          autoComplete="email"
          value={dados.email}
          onChange={mudar("email")}
          erro={e("email")}
          ajuda="Usado para recuperar sua senha."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            rotulo="Senha"
            type="password"
            autoComplete="new-password"
            value={dados.senha}
            onChange={mudar("senha")}
            erro={e("senha")}
            ajuda="Mínimo de 8 caracteres."
          />
          <Campo
            rotulo="Confirmar senha"
            type="password"
            autoComplete="new-password"
            value={dados.confirmar_senha}
            onChange={mudar("confirmar_senha")}
            erro={e("confirmar_senha")}
          />
        </div>
        <Botao type="submit" carregando={enviando} className="mt-2 w-full">
          Enviar cadastro
        </Botao>
      </form>
    </LayoutAcesso>
  );
}
