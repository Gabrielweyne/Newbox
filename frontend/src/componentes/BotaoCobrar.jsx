import { Link } from "react-router";
import { linkWhatsapp, mensagemCobranca } from "../whatsapp";
import { IconeWhatsapp } from "./Icones";

/** "Cobrar no WhatsApp" para uma mensalidade em aberto. Sem telefone, leva à ficha do cliente. */
export default function BotaoCobrar({ m, compacto }) {
  if (!m.cliente_telefone) {
    return (
      <Link
        to={`/clientes/${m.cliente}`}
        className="inline-flex shrink-0 items-center rounded-md px-2.5 py-1.5 text-xs text-marinho-claro/70 ring-1 ring-roxo-100 hover:bg-fundo"
        title="Cliente sem WhatsApp cadastrado"
      >
        Cadastrar WhatsApp
      </Link>
    );
  }
  return (
    <a
      href={linkWhatsapp(m.cliente_telefone, mensagemCobranca(m))}
      target="_blank"
      rel="noreferrer"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[#25d366] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#1ebe5a]"
      aria-label={`Cobrar ${m.cliente_nome} no WhatsApp`}
    >
      <IconeWhatsapp className="size-4" /> {compacto ? "Cobrar" : "Cobrar no WhatsApp"}
    </a>
  );
}
