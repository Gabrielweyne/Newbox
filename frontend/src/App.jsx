import { Link, Navigate, Route, Routes, useLocation } from "react-router";
import Layout from "./componentes/Layout";
import { Carregando } from "./componentes/ui";
import { useAuth } from "./auth";
import Boxes from "./paginas/Boxes";
import Cadastro from "./paginas/Cadastro";
import Catalogo from "./paginas/Catalogo";
import Relatorios from "./paginas/Relatorios";
import Clientes from "./paginas/Clientes";
import Comunicados from "./paginas/Comunicados";
import EsqueciSenha from "./paginas/EsqueciSenha";
import FichaCliente from "./paginas/FichaCliente";
import Funcionarios from "./paginas/Funcionarios";
import ListaEspera from "./paginas/ListaEspera";
import Login from "./paginas/Login";
import Mensalidades from "./paginas/Mensalidades";
import Painel from "./paginas/Painel";
import RedefinirSenha from "./paginas/RedefinirSenha";
import Visitantes from "./paginas/Visitantes";

/** Só deixa passar quem está logado (e, se pedido, só administrador). */
function Protegida({ children, soAdmin }) {
  const { usuario } = useAuth();
  const local = useLocation();
  if (usuario === undefined) return <Carregando />;
  if (!usuario) return <Navigate to="/login" replace state={{ de: local.pathname + local.search }} />;
  if (soAdmin && !usuario.admin) return <Navigate to="/painel" replace />;
  return children;
}

/** Telas de acesso: quem já está logado vai direto para o painel. */
function Publica({ children }) {
  const { usuario } = useAuth();
  if (usuario === undefined) return <Carregando />;
  return usuario ? <Navigate to="/painel" replace /> : children;
}

function NaoEncontrada() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <p className="text-6xl font-semibold text-roxo-300">404</p>
      <p className="mt-4 text-marinho">Página não encontrada.</p>
      <Link to="/painel" className="mt-6 inline-block font-medium text-roxo hover:underline">
        Voltar ao painel
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Visitantes />} />
      <Route path="/login" element={<Publica><Login /></Publica>} />
      <Route path="/cadastro" element={<Publica><Cadastro /></Publica>} />
      <Route path="/esqueci-senha" element={<Publica><EsqueciSenha /></Publica>} />
      <Route path="/redefinir-senha" element={<RedefinirSenha />} />
      <Route element={<Protegida><Layout /></Protegida>}>
        <Route path="painel" element={<Painel />} />
        <Route path="boxes" element={<Boxes />} />
        <Route path="clientes" element={<Clientes />} />
        <Route path="clientes/:id" element={<FichaCliente />} />
        <Route path="mensalidades" element={<Mensalidades />} />
        <Route path="espera" element={<ListaEspera />} />
        <Route path="tamanhos" element={<Catalogo />} />
        <Route path="relatorios" element={<Relatorios />} />
        <Route path="comunicados" element={<Comunicados />} />
        <Route path="funcionarios" element={<Protegida soAdmin><Funcionarios /></Protegida>} />
        <Route path="*" element={<NaoEncontrada />} />
      </Route>
    </Routes>
  );
}
