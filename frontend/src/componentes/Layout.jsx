import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import logo from "../assets/logo.png";
import fotoCorredor from "../assets/fotos/boxes-corredor.jpg";
import fotoFachada from "../assets/fotos/fachada.jpg";
import fotoFachadaAlta from "../assets/fotos/fachada-alta.jpg";
import fotoFachadaPerto from "../assets/fotos/fachada-perto.jpg";
import fotoGalpao from "../assets/fotos/galpao.jpg";
import logoBranco from "../assets/logo-branco.png";
import { useAuth } from "../auth";
import { AvisosProvider, useAvisos } from "../avisos";
import { primeiroNome } from "../formato";
import {
  IconeCaixa,
  IconeCalendario,
  IconeCasa,
  IconeCracha,
  IconeEspera,
  IconeGrafico,
  IconeMegafone,
  IconeMenu,
  IconePessoas,
  IconeSair,
  IconeSetaDir,
  IconeX,
} from "./Icones";
import Sino from "./Sino";

function linksDo(usuario) {
  const links = [
    { para: "/painel", rotulo: "Painel", icone: IconeCasa, fim: true },
    { para: "/boxes", rotulo: "Boxes", icone: IconeCaixa },
    { para: "/mensalidades", rotulo: "Mensalidades", icone: IconeCalendario },
    { para: "/clientes", rotulo: "Clientes", icone: IconePessoas },
    { para: "/espera", rotulo: "Lista de espera", icone: IconeEspera },
    { para: "/comunicados", rotulo: "Comunicados", icone: IconeMegafone },
    // "mais": ficam no menu "Mais" no computador
    { para: "/relatorios", rotulo: "Relatórios", icone: IconeGrafico, mais: true },
    { para: "/tamanhos", rotulo: "Tamanhos e preços", icone: IconeCaixa, mais: true },
  ];
  if (usuario.admin) links.push({ para: "/funcionarios", rotulo: "Funcionários", icone: IconeCracha, mais: true });
  return links;
}

export default function Layout() {
  return (
    <AvisosProvider>
      <Estrutura />
    </AvisosProvider>
  );
}

/** Menu "Mais" do computador (itens usados com menos frequência). */
function MenuMais({ links, classeLink }) {
  const [aberto, setAberto] = useState(false);
  const local = useLocation();
  const ativo = links.some((l) => local.pathname.startsWith(l.para));
  useEffect(() => setAberto(false), [local.pathname]);
  useEffect(() => {
    if (!aberto) return;
    const fechar = (e) => !e.target.closest?.("[data-menu-mais]") && setAberto(false);
    document.addEventListener("mousedown", fechar);
    return () => document.removeEventListener("mousedown", fechar);
  }, [aberto]);
  if (!links.length) return null;
  return (
    <div className="relative" data-menu-mais>
      <button
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className={`flex items-center gap-1 rounded-md px-2.5 py-2 tracking-wide transition-colors ${
          ativo ? "text-roxo" : "text-marinho-claro hover:text-roxo"
        }`}
      >
        Mais <IconeSetaDir className={`size-4 transition ${aberto ? "-rotate-90" : "rotate-90"}`} />
      </button>
      {aberto && (
        <div className="absolute right-0 z-30 mt-2 w-56 rounded-xl bg-white p-1.5 shadow-xl ring-1 ring-roxo-100">
          {links.map((l) => (
            <NavLink key={l.para} to={l.para} className={classeLink}>
              <l.icone /> {l.rotulo}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

/** Faixa de lembrete nos dias de vencimento enquanto houver quem não pagou. */
function LembreteDoDia() {
  const { avisos } = useAvisos();
  if (!avisos?.dia_de_vencimento) return null;
  const faltam = avisos.vencem_hoje.filter((m) => m.situacao !== "paga").length;
  if (!faltam) return null;
  return (
    <div className="bg-amber-50 text-amber-900 ring-1 ring-amber-200">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
        <p>
          <strong>Hoje é dia de vencimento.</strong> {faltam} cliente{faltam > 1 ? "s ainda não pagaram" : " ainda não pagou"}.
        </p>
        <Link to="/mensalidades?aba=pendentes" className="font-medium underline-offset-2 hover:underline">
          Ver quem falta
        </Link>
      </div>
    </div>
  );
}

function Estrutura() {
  const { usuario, sair } = useAuth();
  const [menuAberto, setMenuAberto] = useState(false);
  const links = linksDo(usuario);
  const nome = usuario.funcionario?.nome || "Administrador";
  const local = usuario.sede?.nome ? `Sede ${usuario.sede.nome}` : "Todas as sedes";

  const classeLink = ({ isActive }) =>
    `flex items-center gap-2 rounded-md px-2.5 py-2 tracking-wide whitespace-nowrap transition-colors ${
      isActive ? "text-roxo" : "text-marinho-claro hover:text-roxo"
    }`;

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-20 border-t-4 border-marinho bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex h-18 max-w-6xl items-center justify-between gap-4 px-4">
          <NavLink to="/painel" className="shrink-0">
            <img src={logo} alt="Newbox - Guarda tudo" className="h-10 w-auto" />
          </NavLink>

          <nav className="hidden items-center gap-0.5 xl:flex" aria-label="Principal">
            {links.filter((l) => !l.mais).map((l) => (
              <NavLink key={l.para} to={l.para} end={l.fim} className={classeLink}>
                {l.rotulo}
              </NavLink>
            ))}
            <MenuMais links={links.filter((l) => l.mais)} classeLink={classeLink} />
          </nav>

          <div className="ml-auto flex items-center gap-1 xl:ml-0 xl:hidden">
            <Sino />
          </div>

          <div className="hidden items-center gap-3 xl:flex">
            <Sino />
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
            className="rounded-md p-2 text-marinho xl:hidden"
            onClick={() => setMenuAberto((v) => !v)}
            aria-label="Menu"
            aria-expanded={menuAberto}
          >
            {menuAberto ? <IconeX className="size-6" /> : <IconeMenu className="size-6" />}
          </button>
        </div>

        {menuAberto && (
          <nav className="border-t border-roxo-100 px-4 pb-4 xl:hidden" aria-label="Principal (celular)">
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
      <LembreteDoDia />

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

// Fotos reais da Newbox usadas no topo de cada página
const FOTOS = {
  "/painel": fotoFachada,
  "/boxes": fotoCorredor,
  "/mensalidades": fotoGalpao,
  "/clientes": fotoFachadaPerto,
  "/espera": fotoCorredor,
  "/tamanhos": fotoGalpao,
  "/comunicados": fotoFachadaAlta,
  "/relatorios": fotoGalpao,
  "/funcionarios": fotoFachadaPerto,
};

/** Faixa de título com foto da Newbox e degradê roxo. */
export function Banner({ titulo, subtitulo, children, foto }) {
  const local = useLocation();
  const chave = Object.keys(FOTOS).find((k) => local.pathname.startsWith(k));
  const imagem = foto || FOTOS[chave] || fotoGalpao;
  return (
    <section className="relative overflow-hidden bg-roxo-700">
      <img src={imagem} alt="" aria-hidden className="absolute inset-0 size-full object-cover" />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-noite/90 via-roxo-700/80 to-roxo/40" />
      <div className="relative mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-medium tracking-wide text-white drop-shadow-sm sm:text-4xl">{titulo}</h1>
          {subtitulo && <p className="mt-2 max-w-2xl text-sm text-white/85">{subtitulo}</p>}
        </div>
        {children && <div className="flex flex-wrap gap-2">{children}</div>}
      </div>
      <div className="relative h-1.5 bg-amarelo" />
    </section>
  );
}
