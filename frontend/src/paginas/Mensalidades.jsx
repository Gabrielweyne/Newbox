import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import Confirmar from "../componentes/Confirmar";
import BotaoCobrar from "../componentes/BotaoCobrar";
import BotaoNotaFiscal from "../componentes/NotaFiscal";
import { Banner } from "../componentes/Layout";
import RegistrarPagamento from "../componentes/RegistrarPagamento";
import { IconeCalendario, IconeClipe, IconeDinheiro, IconeSetaDir, IconeSetaEsq } from "../componentes/Icones";
import { Aviso, Carregando, Cartao, Etiqueta, Vazio } from "../componentes/ui";
import { api, listarTudo } from "../api";
import { useAuth } from "../auth";
import { useAvisos } from "../avisos";
import { formatarData, formatarMoeda, nomeDoMes, SITUACOES, somarMes } from "../formato";

const mesAtual = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const ABAS = [
  { valor: "todas", rotulo: "Todas" },
  { valor: "pendentes", rotulo: "Não pagas" },
  { valor: "atrasada", rotulo: "Atrasadas" },
  { valor: "paga", rotulo: "Pagas" },
];

const naAba = (aba, m) =>
  aba === "todas" || (aba === "pendentes" ? m.situacao !== "paga" : m.situacao === aba);

function Resumo({ rotulo, valor, detalhe, cor }) {
  return (
    <Cartao className="p-4">
      <p className="text-xs text-marinho-claro/70">{rotulo}</p>
      <p className={`mt-1 text-xl font-semibold ${cor}`}>{valor}</p>
      <p className="text-xs text-marinho-claro/60">{detalhe}</p>
    </Cartao>
  );
}

function Acoes({ m, pagar, desfazer, atualizar }) {
  const btn = "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition";
  if (m.situacao !== "paga") {
    return (
      <div className="flex flex-wrap justify-end gap-1.5">
        {m.situacao !== "a_vencer" && <BotaoCobrar m={m} />}
        <BotaoNotaFiscal m={m} aoAtualizar={atualizar} />
        <button onClick={() => pagar(m)} className={`${btn} bg-roxo text-white hover:bg-roxo-600`}>
          <IconeDinheiro className="size-4" /> Registrar pagamento
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      <BotaoNotaFiscal m={m} aoAtualizar={atualizar} />
      <a href={m.comprovante} target="_blank" rel="noreferrer" className={`${btn} text-roxo hover:bg-roxo-50`}>
        <IconeClipe className="size-4" /> Comprovante
      </a>
      <button onClick={() => desfazer(m)} className={`${btn} text-marinho-claro/70 hover:bg-roxo-50`}>
        Desfazer
      </button>
    </div>
  );
}

export default function Mensalidades() {
  const { usuario } = useAuth();
  const { atualizar: atualizarAvisos } = useAvisos();
  const [params, setParams] = useSearchParams();
  const competencia = params.get("mes") || mesAtual();
  const aba = params.get("aba") || "todas";
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState("");
  const [pagando, setPagando] = useState(null);
  const [desfazendo, setDesfazendo] = useState(null);

  const carregar = useCallback(() => {
    setLista(null);
    setErro("");
    listarTudo(`/mensalidades/?competencia=${competencia}`)
      .then(setLista)
      .catch((e) => setErro(e.message));
  }, [competencia]);
  useEffect(carregar, [carregar]);

  const mudar = (chave, valor, padrao) => {
    const p = new URLSearchParams(params);
    if (valor === padrao) p.delete(chave);
    else p.set(chave, valor);
    setParams(p, { replace: true });
  };

  const totais = useMemo(() => {
    const t = { recebido: 0, aReceber: 0, pagas: 0, abertas: 0, atrasadas: 0 };
    (lista || []).forEach((m) => {
      if (m.situacao === "paga") {
        t.recebido += Number(m.valor);
        t.pagas++;
      } else {
        t.aReceber += Number(m.valor);
        t.abertas++;
        if (m.situacao === "atrasada") t.atrasadas++;
      }
    });
    return t;
  }, [lista]);

  const visiveis = (lista || []).filter((m) => naAba(aba, m));

  function aposMudanca(atualizada) {
    setLista((l) => l.map((x) => (x.id === atualizada.id ? atualizada : x)));
    atualizarAvisos();
  }

  return (
    <>
      <Banner titulo="Mensalidades" subtitulo={usuario.sede ? `Sede ${usuario.sede.nome}` : "Todas as sedes"} />
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => mudar("mes", somarMes(competencia, -1), mesAtual())}
              className="rounded-md p-2 text-marinho-claro ring-1 ring-roxo-100 hover:bg-white hover:text-roxo"
              aria-label="Mês anterior"
            >
              <IconeSetaEsq />
            </button>
            <p className="flex min-w-48 items-center justify-center gap-2 font-medium text-marinho">
              <IconeCalendario className="size-5 text-roxo" /> {nomeDoMes(competencia)}
            </p>
            <button
              onClick={() => mudar("mes", somarMes(competencia, 1), mesAtual())}
              className="rounded-md p-2 text-marinho-claro ring-1 ring-roxo-100 hover:bg-white hover:text-roxo"
              aria-label="Próximo mês"
            >
              <IconeSetaDir />
            </button>
          </div>
          {competencia !== mesAtual() && (
            <button onClick={() => mudar("mes", mesAtual(), mesAtual())} className="text-sm text-roxo hover:underline">
              Voltar para o mês atual
            </button>
          )}
        </div>

        {lista && lista.length > 0 && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Resumo rotulo="Recebido" valor={formatarMoeda(totais.recebido)} detalhe={`${totais.pagas} paga(s)`} cor="text-emerald-700" />
            <Resumo rotulo="A receber" valor={formatarMoeda(totais.aReceber)} detalhe={`${totais.abertas} em aberto`} cor="text-marinho" />
            <Resumo rotulo="Atrasadas" valor={totais.atrasadas} detalhe="vencidas e não pagas" cor="text-red-700" />
            <Resumo
              rotulo="Adimplência"
              valor={`${Math.round((totais.pagas / lista.length) * 100)}%`}
              detalhe="das mensalidades do mês"
              cor="text-roxo"
            />
          </div>
        )}

        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Situação">
          {ABAS.map((a) => (
            <button
              key={a.valor}
              role="tab"
              aria-selected={aba === a.valor}
              onClick={() => mudar("aba", a.valor, "todas")}
              className={`rounded-full px-4 py-1.5 text-sm transition ${
                aba === a.valor ? "bg-roxo text-white" : "bg-white text-marinho-claro ring-1 ring-roxo-100 hover:ring-roxo-300"
              }`}
            >
              {a.rotulo} <span className="opacity-70">({lista ? lista.filter((m) => naAba(a.valor, m)).length : "–"})</span>
            </button>
          ))}
        </div>

        <Aviso>{erro}</Aviso>
        <Cartao className="overflow-hidden">
          {!lista && !erro ? (
            <Carregando />
          ) : visiveis.length === 0 ? (
            <Vazio icone={IconeCalendario} titulo="Nenhuma mensalidade aqui">
              {lista?.length ? "Nada nesta situação." : "Não há boxes alugados neste mês."}
            </Vazio>
          ) : (
            <ul className="divide-y divide-roxo-100">
              {visiveis.map((m) => {
                const s = SITUACOES[m.situacao];
                return (
                  <li key={m.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium text-marinho">
                        <Link to={`/clientes/${m.cliente}`} className="hover:text-roxo">{m.cliente_nome}</Link>{" "}
                        <span className="font-normal text-marinho-claro/60">
                          · Box #{m.box} ({m.box_tamanho}){usuario.admin && ` · ${m.sede_nome}`}
                        </span>
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-marinho-claro/80">
                        <Etiqueta cor={s.cor}>{s.rotulo}</Etiqueta>
                        <span>Vence {formatarData(m.vencimento)}</span>
                        <span className="tabular-nums">{formatarMoeda(m.valor)}</span>
                        {m.pago_em && (
                          <span className="text-xs text-marinho-claro/60">
                            Pago em {formatarData(m.pago_em)}
                            {m.registrado_por_nome && ` · registrado por ${m.registrado_por_nome}`}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="sm:shrink-0">
                      <Acoes m={m} pagar={setPagando} desfazer={setDesfazendo} atualizar={aposMudanca} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Cartao>
      </div>

      <RegistrarPagamento
        mensalidade={pagando}
        aoFechar={() => setPagando(null)}
        aoSalvar={(m) => {
          setPagando(null);
          aposMudanca(m);
        }}
      />
      <Confirmar
        aberto={!!desfazendo}
        titulo="Desfazer pagamento?"
        textoBotao="Desfazer"
        variante="perigo"
        aoFechar={() => setDesfazendo(null)}
        aoConfirmar={async () => aposMudanca(await api(`/mensalidades/${desfazendo.id}/desfazer/`, { metodo: "POST" }))}
      >
        <p>
          Use só se o pagamento de <strong className="text-marinho">{desfazendo?.cliente_nome}</strong> foi registrado por
          engano. A mensalidade volta a ficar em aberto.
        </p>
      </Confirmar>
    </>
  );
}
