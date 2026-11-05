import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, definirAoDeslogar, lerTokens, salvarTokens } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // usuario: undefined = carregando, null = deslogado, objeto = logado
  const [usuario, setUsuario] = useState(undefined);

  const sair = useCallback(async () => {
    const tokens = lerTokens();
    if (tokens?.refresh) {
      api("/auth/logout/", { metodo: "POST", corpo: { refresh: tokens.refresh } }).catch(() => {});
    }
    salvarTokens(null);
    setUsuario(null);
  }, []);

  useEffect(() => {
    definirAoDeslogar(() => setUsuario(null));
    if (!lerTokens()) {
      setUsuario(null);
      return;
    }
    api("/auth/eu/")
      .then(setUsuario)
      .catch(() => {
        salvarTokens(null);
        setUsuario(null);
      });
  }, []);

  async function entrar(cpf, senha) {
    const dados = await api("/auth/login/", {
      metodo: "POST",
      corpo: { cpf, senha },
      autenticar: false,
    });
    salvarTokens({ access: dados.access, refresh: dados.refresh });
    const { access, refresh, ...perfil } = dados;
    setUsuario(perfil);
    return perfil;
  }

  return (
    <AuthContext.Provider value={{ usuario, entrar, sair }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
