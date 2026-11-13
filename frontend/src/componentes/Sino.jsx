import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useAvisos } from "../avisos";
import { formatarData, formatarMoeda } from "../formato";
import { IconeSino } from "./Icones";

function Item({ m, tipo }) {
  const cores = {
    pagou: "bg-emerald-500",
    naoPagou: "bg-amber-500",
    atrasada: "bg-red-500",
  };
  const texto = {
    pagou: "pagou",
    naoPagou: "ainda não pagou",
    atrasada: `atrasada desde ${formatarData(m.vencimento, { ano: false })}`,
  };
  return (
    <li className="flex items-start gap-3 px-4 py-2.5">
      <span className={`mt-1.5 size-2 shrink-0 rounded-full ${cores[tipo]}`} aria-hidden />
      <div className="min-w-0 text-sm">
        <p className="truncate font-medium text-marinho">{m.cliente_nome}</p>
        <p className="text-xs text-marinho-claro/70">
          Box #{m.box} · {formatarMoeda(m.valor)} · {texto[tipo]}
        </p>
      </div>
    </li>
  );
}

/** Sininho do cabeçalho: vagas para a lista de espera, vencimentos de hoje e atrasos. */
export default function Sino() {
  const { avisos } = useAvisos();
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e) => ref.current && !ref.current.contains(e.target) && setAberto(false);
    const esc = (e) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  const n = avisos?.pendencias || 0;
  const hoje = avisos?.vencem_hoje || [];
  const pagaram = hoje.filter((m) => m.situacao === "paga");
  const naoPagaram = hoje.filter((m) => m.situacao !== "paga");
  const atrasadas = avisos?.atrasadas || [];
  const oportunidades = avisos?.oportunidades || [];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setAberto((v) => !v)}
        className="relative rounded-md p-2 text-marinho-claro/80 hover:bg-roxo-50 hover:text-roxo"
        aria-label={n ? `Avisos: ${n} pendência(s)` : "Avisos"}
        aria-expanded={aberto}
      >
        <IconeSino className="size-6" />
        {n > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex min-w-5 items-center justify-center rounded-full bg-roxo px-1 text-[11px] leading-5 font-semibold text-white">
            {n > 99 ? "99+" : n}
          </span>
        )}
      </button>

      {aberto && (
        <div className="absolute right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-roxo-100">
          <div className="bg-marinho px-4 py-3">
            <p className="font-medium text-white">Avisos</p>
            <p className="text-xs text-white/70">
              {[
                oportunidades.length && `${oportunidades.length} vaga(s) para a lista de espera`,
                hoje.length ? `${hoje.length} vencimento(s) hoje` : "nenhum vencimento hoje",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {!avisos ? (
              <p className="px-4 py-6 text-center text-sm text-marinho-claro/70">Carregando...</p>
            ) : hoje.length === 0 && atrasadas.length === 0 && oportunidades.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-marinho-claro/70">Tudo em dia por aqui! 🎉</p>
            ) : (
              <>
                {oportunidades.length > 0 && (
                  <section>
                    <p className="bg-emerald-50 px-4 py-1.5 text-xs font-semibold tracking-wide text-emerald-800 uppercase">
                      Vaga para a lista de espera
                    </p>
                    <ul>
                      {oportunidades.map((i) => (
                        <li key={i.id}>
                          <Link
                            to="/espera"
                            onClick={() => setAberto(false)}
                            className="flex items-start gap-3 px-4 py-2.5 hover:bg-fundo"
                          >
                            <span className="mt-1.5 size-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                            <div className="min-w-0 text-sm">
                              <p className="truncate font-medium text-marinho">{i.nome}</p>
                              <p className="text-xs text-marinho-claro/70">
                                Liberou box {i.vagas[0].tamanho} · unidade {i.vagas[0].sede_nome} · chame no WhatsApp
                              </p>
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {hoje.length > 0 && (
                  <section>
                    <p className="bg-roxo-50 px-4 py-1.5 text-xs font-semibold tracking-wide text-roxo-700 uppercase">
                      Vencem hoje
                    </p>
                    <ul>
                      {naoPagaram.map((m) => <Item key={m.id} m={m} tipo="naoPagou" />)}
                      {pagaram.map((m) => <Item key={m.id} m={m} tipo="pagou" />)}
                    </ul>
                  </section>
                )}
                {atrasadas.length > 0 && (
                  <section>
                    <p className="bg-red-50 px-4 py-1.5 text-xs font-semibold tracking-wide text-red-800 uppercase">
                      Em atraso
                    </p>
                    <ul>
                      {atrasadas.map((m) => <Item key={m.id} m={m} tipo="atrasada" />)}
                    </ul>
                  </section>
                )}
              </>
            )}
          </div>
          <Link
            to="/mensalidades?aba=pendentes"
            onClick={() => setAberto(false)}
            className="block border-t border-roxo-100 px-4 py-3 text-center text-sm font-medium text-roxo hover:bg-roxo-50"
          >
            Ver mensalidades
          </Link>
        </div>
      )}
    </div>
  );
}
