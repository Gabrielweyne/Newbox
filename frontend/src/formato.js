const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export const formatarMoeda = (valor) => moeda.format(Number(valor || 0));

/** 52998224725 -> 529.982.247-25 */
export function formatarCpf(valor) {
  const d = String(valor || "").replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

export function primeiroNome(nome) {
  return String(nome || "").trim().split(/\s+/)[0];
}

/** "2026-11-05" -> "05/11/2026" (sem problemas de fuso horário) */
export function formatarData(iso, { ano = true } = {}) {
  if (!iso) return "";
  const [a, m, d] = iso.split("-");
  return ano ? `${d}/${m}/${a}` : `${d}/${m}`;
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
  "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "2026-11" -> "Novembro de 2026" */
export function nomeDoMes(competencia) {
  const [a, m] = competencia.split("-").map(Number);
  const nome = MESES[m - 1];
  return `${nome[0].toUpperCase()}${nome.slice(1)} de ${a}`;
}

/** Soma meses a "AAAA-MM" */
export function somarMes(competencia, n) {
  const [a, m] = competencia.split("-").map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export const SITUACOES = {
  paga: { rotulo: "Paga", cor: "verde" },
  vence_hoje: { rotulo: "Vence hoje", cor: "amarelo" },
  a_vencer: { rotulo: "A vencer", cor: "cinza" },
  atrasada: { rotulo: "Atrasada", cor: "vermelho" },
};

export const DIAS_VENCIMENTO = [5, 10, 15, 20, 25, 30];
