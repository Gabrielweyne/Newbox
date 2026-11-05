import { Link } from "react-router";
import logo from "../assets/logo.png";
import logoBranco from "../assets/logo-branco.png";

/** Layout das telas de login, cadastro e senha. */
export default function LayoutAcesso({ titulo, subtitulo, children, rodape }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-marinho p-12 text-white lg:flex">
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.06]"
          style={{ backgroundImage: "repeating-linear-gradient(90deg, #fff 0 2px, transparent 2px 16px)" }}
        />
        <img src={logoBranco} alt="Newbox - Guarda tudo" className="relative h-24 w-auto self-start" />
        <p className="relative max-w-md text-4xl leading-tight font-normal">
          Se você precisa de espaço, <span className="text-roxo-300">nós temos o lugar.</span>
        </p>
        <p className="relative text-sm text-white/60">Área do funcionário · Cocó e Cambeba</p>
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-3 bg-roxo" />
      </aside>

      <section className="flex flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-md">
          <Link to="/login" className="mb-10 inline-block lg:hidden">
            <img src={logo} alt="Newbox - Guarda tudo" className="h-12 w-auto" />
          </Link>
          <h1 className="text-2xl font-semibold text-marinho">{titulo}</h1>
          {subtitulo && <p className="mt-2 text-sm text-marinho-claro/70">{subtitulo}</p>}
          <div className="mt-8">{children}</div>
          {rodape && <div className="mt-8 text-center text-sm text-marinho-claro/80">{rodape}</div>}
        </div>
      </section>
    </div>
  );
}
