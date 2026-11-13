import { Link } from "react-router";
import logo from "../assets/logo.png";
import fotoFachada from "../assets/fotos/fachada-perto.jpg";
import logoBranco from "../assets/logo-branco.png";

/** Layout das telas de login, cadastro e senha. */
export default function LayoutAcesso({ titulo, subtitulo, children, rodape }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-roxo-700 p-12 text-white lg:flex">
        <img src={fotoFachada} alt="" aria-hidden className="absolute inset-0 size-full object-cover" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-noite/95 via-noite/55 to-roxo-700/30" />
        <Link to="/" className="relative self-start" title="Voltar ao site">
          <img src={logoBranco} alt="Newbox - Guarda tudo" className="h-24 w-auto" />
        </Link>
        <div className="relative">
          <p className="max-w-md text-4xl leading-tight font-normal drop-shadow">
            Se você precisa de espaço, <span className="text-roxo-200">nós temos o lugar.</span>
          </p>
          <p className="mt-4 text-sm text-white/80">Que bom ter você no time! 💜 Área do funcionário · Cocó e Cambeba</p>
        </div>
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-2 bg-amarelo" />
      </aside>

      <section className="flex flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-md">
          <Link to="/" className="mb-10 inline-block lg:hidden">
            <img src={logo} alt="Newbox - Guarda tudo" className="h-12 w-auto" />
          </Link>
          <h1 className="text-2xl font-semibold text-marinho">{titulo}</h1>
          {subtitulo && <p className="mt-2 text-sm text-marinho-claro/70">{subtitulo}</p>}
          <div className="mt-8">{children}</div>
          {rodape && <div className="mt-8 text-center text-sm text-marinho-claro/80">{rodape}</div>}
          <p className="mt-10 text-center text-xs">
            <Link to="/" className="text-marinho-claro/60 hover:text-roxo">
              ← Voltar ao site da Newbox
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
