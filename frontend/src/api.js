/**
 * Cliente da API do Django.
 * Guarda os tokens JWT no navegador e renova o "access" sozinho quando expira.
 */

const CHAVE = "newbox.tokens";

export function lerTokens() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE)) || null;
  } catch {
    return null;
  }
}

export function salvarTokens(tokens) {
  if (tokens) localStorage.setItem(CHAVE, JSON.stringify(tokens));
  else localStorage.removeItem(CHAVE);
}

/** Erro da API com mensagens por campo (formato do Django REST Framework). */
export class ErroApi extends Error {
  constructor(status, dados) {
    super(mensagemDeErro(dados) || `Erro ${status}`);
    this.status = status;
    this.dados = dados || {};
  }

  /** Mensagem de um campo específico do formulário. */
  campo(nome) {
    const v = this.dados?.[nome];
    return Array.isArray(v) ? v.join(" ") : v || "";
  }
}

function mensagemDeErro(dados) {
  if (!dados) return "";
  if (typeof dados === "string") return dados;
  if (dados.detail) return dados.detail;
  if (dados.non_field_errors) return dados.non_field_errors.join(" ");
  return "Verifique os campos destacados.";
}

let renovando = null;
let aoDeslogar = () => {};

/** Registra o que fazer quando a sessão expira de vez (volta para o login). */
export function definirAoDeslogar(fn) {
  aoDeslogar = fn;
}

async function renovarAccess() {
  const tokens = lerTokens();
  if (!tokens?.refresh) return false;
  // Várias chamadas podem expirar ao mesmo tempo: renova uma vez só
  renovando ??= fetch("/api/auth/token/refresh/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh: tokens.refresh }),
  })
    .then(async (r) => {
      if (!r.ok) return false;
      const novos = await r.json();
      salvarTokens({ ...tokens, ...novos });
      return true;
    })
    .catch(() => false)
    .finally(() => {
      renovando = null;
    });
  return renovando;
}

/**
 * Faz uma chamada à API.
 * corpo: objeto (vira JSON) ou FormData (para envio de arquivo).
 */
export async function api(caminho, { metodo = "GET", corpo, autenticar = true, arquivo = false } = {}, tentativa = 0) {
  const headers = {};
  let body;
  if (corpo instanceof FormData) body = corpo;
  else if (corpo !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(corpo);
  }
  const tokens = lerTokens();
  if (autenticar && tokens?.access) headers.Authorization = `Bearer ${tokens.access}`;

  let resposta;
  try {
    resposta = await fetch(`/api${caminho}`, { method: metodo, headers, body });
  } catch {
    throw new ErroApi(0, { detail: "Sem conexão com o servidor. Tente novamente." });
  }

  if (resposta.status === 401 && autenticar && tokens?.refresh && tentativa === 0) {
    if (await renovarAccess()) return api(caminho, { metodo, corpo, autenticar, arquivo }, 1);
    salvarTokens(null);
    aoDeslogar();
  }

  if (resposta.status === 204) return null;
  if (arquivo && resposta.ok) return resposta.blob();
  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    if (resposta.status === 429) {
      throw new ErroApi(429, { detail: "Muitas tentativas. Aguarde um minuto e tente de novo." });
    }
    throw new ErroApi(resposta.status, dados);
  }
  return dados;
}

/** Busca todos os itens de uma lista paginada. */
export async function listarTudo(caminho) {
  const sep = caminho.includes("?") ? "&" : "?";
  let pagina = await api(`${caminho}${sep}page_size=500`);
  const itens = [...pagina.results];
  while (pagina.next) {
    const url = new URL(pagina.next);
    pagina = await api(url.pathname.replace(/^\/api/, "") + url.search);
    itens.push(...pagina.results);
  }
  return itens;
}

/**
 * Abre um PDF protegido por login numa nova aba.
 * A aba é aberta já no clique (antes do download) para o navegador não bloquear.
 */
export async function abrirPdf(caminho, nomeArquivo = "documento.pdf") {
  const aba = window.open("", "_blank");
  if (aba) aba.document.write("<p style='font-family:sans-serif;padding:2rem'>Gerando PDF...</p>");
  try {
    const blob = await api(caminho, { arquivo: true });
    const url = URL.createObjectURL(blob);
    if (aba) {
      aba.location.href = url;
    } else {
      const a = document.createElement("a");
      a.href = url;
      a.download = nomeArquivo;
      a.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (erro) {
    aba?.close();
    throw erro;
  }
}
