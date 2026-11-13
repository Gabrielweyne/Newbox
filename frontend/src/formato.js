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

/** CPF (até 11 dígitos) ou CNPJ (12 a 14 dígitos), formatado enquanto digita. */
export function formatarDocumento(valor) {
  const d = String(valor || "").replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11) return formatarCpf(d);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

/** "Box 1.1" (número pintado no box) ou "Box #12" para boxes ainda sem número. */
export function nomeBox(numero, id) {
  return numero ? `Box ${numero}` : `Box #${id}`;
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

/** 5.50 -> "5,5" */
export const formatarNumero = (v) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
