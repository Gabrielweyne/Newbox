import { useState } from "react";
import { NavLink, Outlet } from "react-router";
import logo from "../assets/logo.png";
import logoBranco from "../assets/logo-branco.png";
import { useAuth } from "../auth";
import { primeiroNome } from "../formato";
import { IconeCaixa, IconeCasa, IconeCracha, IconeMenu, IconePessoas, IconeSair, IconeX } from "./Icones";

function linksDo(usuario) {
  const links = [
    { para: "/", rotulo: "Painel", icone: IconeCasa, fim: true },
    { para: "/boxes", rotulo: "Boxes", icone: IconeCaixa },
    { para: "/clientes", rotulo: "Clientes", icone: IconePessoas },
  ];
  if (usuario.admin) links.push({ para: "/funcionarios", rotulo: "Funcionários", icone: IconeCracha });
  return links;
}

export default function Layout() {
  const { usuario, sair } = useAuth();
  const [menuAberto, setMenuAberto] = useState(false);
  const links = linksDo(usuario);
  const nome = usuario.funcionario?.nome || "Administrador";
  const local = usuario.sede?.nome ? `Sede ${usuario.sede.nome}` : "Todas as sedes";

  const classeLink = ({ isActive }) =>
    `flex items-center gap-2 rounded-md px-3 py-2 tracking-wide transition-colors ${
      isActive ? "text-roxo" : "text-marinho-claro hover:text-roxo"
    }`;

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-20 border-t-4 border-marinho bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex h-18 max-w-6xl items-center justify-between gap-4 px-4">
          <NavLink to="/" className="shrink-0">
            <img src={logo} alt="Newbox - Guarda tudo" className="h-10 w-auto" />
          </NavLink>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Principal">
            {links.map((l) => (
              <NavLink key={l.para} to={l.para} end={l.fim} className={classeLink}>
                {l.rotulo}
              </NavLink>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <div className="text-right leading-tight">
              <p className="text-sm font-medium">{primeiroNome(nome)}</p>
              <p className="text-xs text-roxo">{local}</p>
            </div>
            <button
              onClick={sair}
              className="rounded-md p-2 text-marinho-claro/70 hover:bg-roxo-50 hover:text-roxo"
              title="Sair"
              aria-label="Sair"
            >
              <IconeSair />
            </button>
          </div>

          <button
            className="rounded-md p-2 text-marinho md:hidden"
            onClick={() => setMenuAberto((v) => !v)}
            aria-label="Menu"
            aria-expanded={menuAberto}
          >
            {menuAberto ? <IconeX className="size-6" /> : <IconeMenu className="size-6" />}
          </button>
        </div>

        {menuAberto && (
          <nav className="border-t border-roxo-100 px-4 pb-4 md:hidden" aria-label="Principal (celular)">
            <div className="py-3 text-sm">
              <p className="font-medium">{nome}</p>
              <p className="text-xs text-roxo">{local}</p>
            </div>
            {links.map((l) => (
              <NavLink key={l.para} to={l.para} end={l.fim} className={classeLink} onClick={() => setMenuAberto(false)}>
                <l.icone /> {l.rotulo}
              </NavLink>
            ))}
            <button onClick={sair} className="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-marinho-claro hover:text-roxo">
              <IconeSair /> Sair
            </button>
          </nav>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="bg-roxo text-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-6 sm:flex-row">
          <img src={logoBranco} alt="Newbox" className="h-12 w-auto" />
          <p className="text-center text-xs text-white/85">
            Área do funcionário · New Box © {new Date().getFullYear()} Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}

/** Faixa de título, no estilo do banner "Home" do site. */
export function Banner({ titulo, subtitulo, children }) {
  return (
    <section className="relative overflow-hidden bg-marinho">
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: "repeating-linear-gradient(90deg, #fff 0 2px, transparent 2px 14px)",
        }}
      />
      <div className="relative mx-auto flex max-w-6xl flex-col gap-4 px-4 py-9 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-medium tracking-wide text-roxo-300 sm:text-4xl">{titulo}</h1>
          {subtitulo && <p className="mt-2 text-sm text-white/75">{subtitulo}</p>}
        </div>
        {children && <div className="flex flex-wrap gap-2">{children}</div>}
      </div>
      <div className="h-3 bg-noite" />
    </section>
  );
}
