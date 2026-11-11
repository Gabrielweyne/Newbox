import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useLocation } from "react-router";
import { api } from "./api";

/**
 * Avisos: mensalidades que vencem hoje, atrasadas e vagas para a lista de espera.
 * Atualiza ao trocar de página, a cada 5 minutos e depois de registrar pagamentos.
 */
const AvisosContext = createContext(null);

export function AvisosProvider({ children }) {
  const [avisos, setAvisos] = useState(null);
  const local = useLocation();

  const atualizar = useCallback(() => {
    Promise.all([
      api("/mensalidades/avisos/"),
      api("/interessados/oportunidades/").catch(() => []),
    ])
      .then(([m, oportunidades]) =>
        setAvisos({ ...m, oportunidades, pendencias: m.pendencias + oportunidades.length })
      )
      .catch(() => {});
  }, []);

  useEffect(atualizar, [atualizar, local.pathname]);
  useEffect(() => {
    const id = setInterval(atualizar, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [atualizar]);

  return <AvisosContext.Provider value={{ avisos, atualizar }}>{children}</AvisosContext.Provider>;
}

export function useAvisos() {
  return useContext(AvisosContext);
}
