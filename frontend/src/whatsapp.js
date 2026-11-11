/** Link do WhatsApp com mensagem pronta. Aceita "85999998888" ou "5585999998888". */
export function linkWhatsapp(numero, texto) {
  let n = String(numero || "").replace(/\D/g, "");
  if (n.length === 10 || n.length === 11) n = `55${n}`;
  return `https://wa.me/${n}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;
}

/** 85998765432 -> (85) 99876-5432 */
export function formatarTelefone(valor) {
  const d = String(valor || "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Mensagem para avisar alguém da lista de espera que surgiu uma vaga. */
export function mensagemVaga(interessado, vaga) {
  const nome = String(interessado.nome || "").trim().split(/\s+/)[0];
  if (!vaga) {
    return `Olá, ${nome}! Aqui é da Newbox. Você está na nossa lista de espera e queríamos falar sobre o box que você procura.`;
  }
  return (
    `Olá, ${nome}! Aqui é da Newbox. 😊\n` +
    `Você está na nossa lista de espera e acabou de liberar um box de ${vaga.tamanho} na unidade ${vaga.sede_nome}.\n` +
    `Ainda tem interesse?`
  );
}
