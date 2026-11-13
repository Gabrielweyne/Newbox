import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { GraficoColunas, Legenda } from "../componentes/Graficos";
import { IconeWhatsapp } from "../componentes/Icones";
import { Banner } from "../componentes/Layout";
import { Aviso, Carregando, Cartao } from "../componentes/ui";
import { api, listarTudo } from "../api";
import { useAuth } from "../auth";
import { formatarMoeda, nomeDoMes } from "../formato";
import { formatarTelefone, linkWhatsapp } from "../whatsapp";

// Cores: ocupação na cor da marca; pagamentos nas cores de situação (com legenda e tabela)
const COR_OCUPACAO = "#965ba5";
const EM_DIA = { nome: "Pago em dia", cor: "#0ca30c" };
const ATRASO = { nome: "Pago com atraso", cor: "#fab219" };
const ABERTO = { nome: "Em aberto (inadimplência)", cor: "#d03b3b" };

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesCurto = (m) => {
  const [a, mm] = m.split("-");
  return `${MESES_CURTOS[Number(mm) - 1]}/${a.slice(2)}`;
};
const porcento = (v) => (v === null || v === undefined ? "—" : `${String(v).replace(".", ",")}%`);
const moedaCurta = (v) =>
  v >= 1000 ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : `R$ ${v}`;

function baixarCsv(nome, cabecalho, linhas) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const texto = [cabecalho, ...linhas].map((l) => l.map(esc).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + texto], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: nome });
  a.click();
  URL.revokeObjectURL(url);
}

/** Cartão de um gráfico com botão para ver a tabela e baixar a planilha. */
function Secao({ titulo, subtitulo, legenda, tabela, csv, children }) {
  const [verTabela, setVerTabela] = useState(false);
  return (
    <Cartao className="p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-marinho">{titulo}</h2>
          {subtitulo && <p className="mt-0.5 text-sm text-marinho-claro/70">{subtitulo}</p>}
        </div>
        <div className="flex gap-2 text-xs">
          <button
            onClick={() => setVerTabela((v) => !v)}
            className="rounded-md px-2.5 py-1.5 font-medium text-roxo ring-1 ring-roxo-200 hover:bg-roxo-50"
          >
            {verTabela ? "Ver gráfico" : "Ver tabela"}
          </button>
          <button
            onClick={csv}
            className="rounded-md px-2.5 py-1.5 font-medium text-roxo ring-1 ring-roxo-200 hover:bg-roxo-50"
          >
            Baixar planilha
          </button>
        </div>
      </div>
      {legenda && !verTabela && <div className="mb-3">{legenda}</div>}
      {verTabela ? tabela : children}
    </Cartao>
  );
}

function Tabela({ colunas, linhas }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-roxo-50 text-left text-xs tracking-wide text-roxo-700 uppercase">
          <tr>
            {colunas.map((c, i) => (
              <th key={c} className={`px-3 py-2 font-medium ${i ? "text-right" : ""}`}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-roxo-100">
          {linhas.map((l) => (
            <tr key={l[0]}>
              {l.map((v, i) => (
                <td key={i} className={`px-3 py-2 ${i ? "text-right tabular-nums" : ""}`}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Numero({ rotulo, valor, detalhe }) {
  return (
    <Cartao className="p-5">
      <p className="text-sm text-marinho-claro/80">{rotulo}</p>
      <p className="mt-1 text-3xl font-medium text-marinho tabular-nums">{valor}</p>
      {detalhe && <p className="mt-1 text-xs text-marinho-claro/70">{detalhe}</p>}
    </Cartao>
  );
}

export default function Relatorios() {
  const { usuario } = useAuth();
  const [sedes, setSedes] = useState([]);
  const [sede, setSede] = useState("");
  const [meses, setMeses] = useState(12);
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (usuario.admin) listarTudo("/sedes/").then(setSedes).catch(() => {});
  }, [usuario.admin]);

  useEffect(() => {
    setDados(null);
    const p = new URLSearchParams({ meses });
    if (sede) p.set("sede", sede);
    api(`/relatorios/?${p}`).then(setDados).catch((e) => setErro(e.message));
  }, [sede, meses]);

  const nomeSede = usuario.sede?.nome || sedes.find((s) => String(s.id) === sede)?.nome;
  const sufixo = nomeSede ? `sede-${nomeSede.toLowerCase().replace(/ó/g, "o")}` : "todas-as-sedes";

  const resumo = useMemo(() => {
    if (!dados) return null;
    const n = (v) => Number(v || 0);
    const soma = (c) => dados.meses.reduce((s, m) => s + n(m[c]), 0);
    const atual = dados.meses[dados.meses.length - 1];
    const previsto = soma("previsto");
    return {
      atual,
      adimplencia: previsto ? Math.round(((soma("pago_em_dia") + soma("pago_atraso")) * 1000) / previsto) / 10 : null,
      emAberto: dados.devedores.reduce((s, d) => s + n(d.valor), 0),
      semPagamentos: previsto === 0,
    };
  }, [dados]);

  return (
    <>
      <Banner titulo="Relatórios" subtitulo={nomeSede ? `Sede ${nomeSede}` : "Todas as sedes"}>
        {usuario.admin && (
          <select
            aria-label="Sede"
            value={sede}
            onChange={(e) => setSede(e.target.value)}
            className="rounded-md border-0 bg-white px-3 py-2 text-sm text-marinho"
          >
            <option value="">Todas as sedes</option>
            {sedes.map((s) => (
              <option key={s.id} value={s.id}>Sede {s.nome}</option>
            ))}
          </select>
        )}
        <select
          aria-label="Período"
          value={meses}
          onChange={(e) => setMeses(Number(e.target.value))}
          className="rounded-md border-0 bg-white px-3 py-2 text-sm text-marinho"
        >
          <option value={6}>Últimos 6 meses</option>
          <option value={12}>Últimos 12 meses</option>
          <option value={24}>Últimos 24 meses</option>
        </select>
      </Banner>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <Aviso>{erro}</Aviso>
        {!dados && !erro ? (
          <Carregando texto="Montando os relatórios..." />
        ) : dados && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Numero
                rotulo="Ocupação hoje"
                valor={porcento(resumo.atual.ocupacao_pct)}
                detalhe={`${resumo.atual.ocupados} de ${resumo.atual.total} boxes alugados`}
              />
              <Numero
                rotulo={`Adimplência (${meses} meses)`}
                valor={porcento(resumo.adimplencia)}
                detalhe="do valor que já venceu, quanto foi pago"
              />
              <Numero
                rotulo="Em aberto agora"
                valor={formatarMoeda(resumo.emAberto)}
                detalhe={`${dados.devedores.length} cliente(s) com mensalidade atrasada`}
              />
            </div>

            {resumo.semPagamentos && (
              <Aviso tipo="info">
                Ainda não há mensalidades vencidas no período. Os pagamentos antigos ficaram na planilha de
                acompanhamento; a adimplência passa a aparecer conforme as mensalidades forem vencendo no sistema.
              </Aviso>
            )}

            {/* 1. Ocupação */}
            <Secao
              titulo="Ocupação por mês"
              subtitulo="Porcentagem de boxes alugados no último dia de cada mês (no mês atual, hoje)"
              csv={() =>
                baixarCsv(`ocupacao-${sufixo}.csv`, ["Mês", "Boxes alugados", "Total de boxes", "Ocupação (%)"],
                  dados.meses.map((m) => [nomeDoMes(m.mes), m.ocupados, m.total, porcento(m.ocupacao_pct)]))
              }
              tabela={
                <Tabela
                  colunas={["Mês", "Alugados", "Total", "Ocupação"]}
                  linhas={dados.meses.map((m) => [nomeDoMes(m.mes), m.ocupados, m.total, porcento(m.ocupacao_pct)])}
                />
              }
            >
              <GraficoColunas
                titulo="Ocupação por mês"
                series={[{ nome: "Ocupação", cor: COR_OCUPACAO }]}
                maximoFixo={100}
                formatarEixo={(v) => `${v}%`}
                rotuloFinal={(d) => porcento(d.pct)}
                dados={dados.meses.map((m) => ({
                  rotulo: mesCurto(m.mes),
                  titulo: nomeDoMes(m.mes),
                  pct: m.ocupacao_pct,
                  partes: [m.ocupacao_pct || 0],
                  tooltip: [
                    ["Ocupação", porcento(m.ocupacao_pct)],
                    ["Boxes alugados", `${m.ocupados} de ${m.total}`],
                  ],
                }))}
              />
            </Secao>

            {/* 2. Adimplência */}
            <Secao
              titulo="Adimplência por mês"
              subtitulo="Mensalidades que já venceram em cada mês: pagas em dia, pagas com atraso e em aberto (R$)"
              legenda={<Legenda series={[EM_DIA, ATRASO, ABERTO]} />}
              csv={() =>
                baixarCsv(`adimplencia-${sufixo}.csv`,
                  ["Mês", "Previsto (R$)", "Pago em dia (R$)", "Pago com atraso (R$)", "Em aberto (R$)", "Adimplência (%)"],
                  dados.meses.map((m) => [nomeDoMes(m.mes), m.previsto, m.pago_em_dia, m.pago_atraso, m.em_aberto,
                    porcento(m.adimplencia_pct)]))
              }
              tabela={
                <Tabela
                  colunas={["Mês", "Previsto", "Em dia", "Com atraso", "Em aberto", "Adimplência"]}
                  linhas={dados.meses.map((m) => [
                    nomeDoMes(m.mes), formatarMoeda(m.previsto), formatarMoeda(m.pago_em_dia),
                    formatarMoeda(m.pago_atraso), formatarMoeda(m.em_aberto), porcento(m.adimplencia_pct),
                  ])}
                />
              }
            >
              <GraficoColunas
                titulo="Adimplência por mês"
                series={[EM_DIA, ATRASO, ABERTO]}
                formatarEixo={moedaCurta}
                dados={dados.meses.map((m) => ({
                  rotulo: mesCurto(m.mes),
                  titulo: nomeDoMes(m.mes),
                  partes: [Number(m.pago_em_dia), Number(m.pago_atraso), Number(m.em_aberto)],
                  tooltip: [
                    [EM_DIA.nome, formatarMoeda(m.pago_em_dia), EM_DIA.cor],
                    [ATRASO.nome, formatarMoeda(m.pago_atraso), ATRASO.cor],
                    [ABERTO.nome, formatarMoeda(m.em_aberto), ABERTO.cor],
                    ["Adimplência", porcento(m.adimplencia_pct)],
                  ],
                }))}
              />
            </Secao>

            {/* 3. Inadimplência */}
            <Secao
              titulo="Inadimplência por mês"
              subtitulo="Porcentagem do valor vencido em cada mês que ainda não foi pago"
              csv={() =>
                baixarCsv(`inadimplencia-${sufixo}.csv`, ["Mês", "Previsto (R$)", "Em aberto (R$)", "Inadimplência (%)"],
                  dados.meses.map((m) => [nomeDoMes(m.mes), m.previsto, m.em_aberto, porcento(m.inadimplencia_pct)]))
              }
              tabela={
                <Tabela
                  colunas={["Mês", "Previsto", "Em aberto", "Inadimplência"]}
                  linhas={dados.meses.map((m) => [
                    nomeDoMes(m.mes), formatarMoeda(m.previsto), formatarMoeda(m.em_aberto), porcento(m.inadimplencia_pct),
                  ])}
                />
              }
            >
              <GraficoColunas
                titulo="Inadimplência por mês"
                series={[ABERTO]}
                maximoFixo={Math.max(10, ...dados.meses.map((m) => m.inadimplencia_pct || 0))}
                formatarEixo={(v) => `${v}%`}
                dados={dados.meses.map((m) => ({
                  rotulo: mesCurto(m.mes),
                  titulo: nomeDoMes(m.mes),
                  partes: [m.inadimplencia_pct || 0],
                  tooltip: [
                    ["Inadimplência", porcento(m.inadimplencia_pct)],
                    ["Em aberto", formatarMoeda(m.em_aberto)],
                    ["Previsto", formatarMoeda(m.previsto)],
                  ],
                }))}
              />
            </Secao>

            {/* Relatório de inadimplentes */}
            <Cartao className="overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-3 p-5">
                <div>
                  <h2 className="font-semibold text-marinho">Clientes inadimplentes</h2>
                  <p className="mt-0.5 text-sm text-marinho-claro/70">
                    Quem tem mensalidade vencida e não paga, do maior valor para o menor
                  </p>
                </div>
                <button
                  onClick={() =>
                    baixarCsv(`inadimplentes-${sufixo}.csv`,
                      ["Cliente", "WhatsApp", "Boxes", "Mensalidades em aberto", "Valor (R$)", "Dias de atraso"],
                      dados.devedores.map((d) => [d.nome, formatarTelefone(d.telefone), d.boxes.join(", "),
                        d.mensalidades, d.valor, d.dias_em_atraso]))
                  }
                  className="rounded-md px-2.5 py-1.5 text-xs font-medium text-roxo ring-1 ring-roxo-200 hover:bg-roxo-50"
                >
                  Baixar planilha
                </button>
              </div>
              {dados.devedores.length === 0 ? (
                <p className="border-t border-roxo-100 px-5 py-8 text-center text-sm text-marinho-claro/70">
                  Nenhum cliente em atraso. 🎉
                </p>
              ) : (
                <ul className="divide-y divide-roxo-100 border-t border-roxo-100">
                  {dados.devedores.map((d) => (
                    <li key={d.cliente} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <Link to={`/clientes/${d.cliente}`} className="font-medium text-marinho hover:text-roxo">
                          {d.nome}
                        </Link>
                        <p className="text-xs text-marinho-claro/70">
                          {d.boxes.join(", ")} · {d.mensalidades} mensalidade(s) · {d.dias_em_atraso} dia(s) de atraso
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-red-700 tabular-nums">{formatarMoeda(d.valor)}</span>
                        {d.telefone && (
                          <a
                            href={linkWhatsapp(d.telefone)}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-md p-2 text-[#1ebe5a] hover:bg-emerald-50"
                            aria-label={`WhatsApp de ${d.nome}`}
                          >
                            <IconeWhatsapp className="size-4" />
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Cartao>
          </>
        )}
      </div>
    </>
  );
}
