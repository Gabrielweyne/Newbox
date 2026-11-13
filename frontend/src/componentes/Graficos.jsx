import { useEffect, useRef, useState } from "react";

/*
 * Gráficos de colunas em SVG, sem biblioteca.
 * - Colunas finas (até 24px), ponta arredondada de 4px, base reta.
 * - Grade e eixos discretos; texto sempre em cinza/escuro, nunca na cor da série.
 * - Passe o mouse (ou toque) numa coluna para ver os valores.
 */

const ALTURA = 240;
const MARGEM = { topo: 20, dir: 8, base: 30, esq: 52 };
const GAP = 2; // espaço entre segmentos empilhados

function useLargura() {
  const ref = useRef(null);
  const [largura, setLargura] = useState(640);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new ResizeObserver(([e]) => setLargura(Math.max(280, e.contentRect.width)));
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return [ref, largura];
}

/** Marcas "redondas" para o eixo Y (0, 25, 50...). */
function marcas(maximo, quantidade = 4) {
  if (!maximo) return [0, 1];
  const bruto = maximo / quantidade;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= bruto);
  const topo = Math.ceil(maximo / passo) * passo;
  return Array.from({ length: Math.round(topo / passo) + 1 }, (_, i) => i * passo);
}

/** Retângulo com os cantos de cima arredondados (base reta, no eixo). */
function coluna(x, y, l, a, r = 4) {
  if (a <= 0) return "";
  const rr = Math.min(r, a, l / 2);
  return `M${x},${y + a}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + l - rr}Q${x + l},${y} ${x + l},${y + rr}V${y + a}Z`;
}

/**
 * dados: [{ rotulo, partes: [valor por série], tooltip: [linhas] }]
 * series: [{ nome, cor }]  (uma série = gráfico simples; mais de uma = empilhado)
 */
export function GraficoColunas({ dados, series, formatarEixo, maximoFixo, rotuloFinal, titulo }) {
  const [ref, largura] = useLargura();
  const [ativo, setAtivo] = useState(null);
  const totais = dados.map((d) => d.partes.reduce((s, v) => s + (v || 0), 0));
  const eixo = marcas(maximoFixo ?? Math.max(...totais, 0));
  const topo = eixo[eixo.length - 1] || 1;
  const areaL = largura - MARGEM.esq - MARGEM.dir;
  const areaA = ALTURA - MARGEM.topo - MARGEM.base;
  const faixa = areaL / Math.max(dados.length, 1);
  const larg = Math.min(24, faixa * 0.6);
  const y = (v) => MARGEM.topo + areaA - (v / topo) * areaA;
  const pularRotulo = Math.ceil(dados.length / Math.max(1, Math.floor(areaL / 46)));

  return (
    <div ref={ref} className="relative" onMouseLeave={() => setAtivo(null)}>
      <svg width={largura} height={ALTURA} role="img" aria-label={titulo} className="block overflow-visible">
        {eixo.map((v) => (
          <g key={v}>
            <line x1={MARGEM.esq} x2={largura - MARGEM.dir} y1={y(v)} y2={y(v)} stroke="#ece6ee" strokeWidth="1" />
            <text x={MARGEM.esq - 8} y={y(v)} dy="0.32em" textAnchor="end" className="fill-marinho-claro/70 text-[11px] tabular-nums">
              {formatarEixo(v)}
            </text>
          </g>
        ))}
        {dados.map((d, i) => {
          const x = MARGEM.esq + i * faixa + (faixa - larg) / 2;
          let base = y(0);
          const ultimaComValor = d.partes.reduce((u, v, k) => (v > 0 ? k : u), -1);
          return (
            <g key={d.rotulo}>
              {d.partes.map((v, k) => {
                if (!v) return null;
                const alto = Math.max(1, y(0) - y(v));
                const topoSeg = base - alto;
                const caminho =
                  k === ultimaComValor
                    ? coluna(x, topoSeg, larg, alto)
                    : `M${x},${topoSeg}H${x + larg}V${base}H${x}Z`;
                base = topoSeg - GAP;
                return <path key={k} d={caminho} fill={series[k].cor} opacity={ativo === null || ativo === i ? 1 : 0.45} />;
              })}
              {i % pularRotulo === 0 && (
                <text x={x + larg / 2} y={ALTURA - 10} textAnchor="middle" className="fill-marinho-claro/70 text-[11px]">
                  {d.rotulo}
                </text>
              )}
              {/* área de toque maior que a coluna */}
              <rect
                x={MARGEM.esq + i * faixa}
                y={MARGEM.topo}
                width={faixa}
                height={areaA}
                fill="transparent"
                onMouseEnter={() => setAtivo(i)}
                onClick={() => setAtivo(i)}
              />
            </g>
          );
        })}
        <line x1={MARGEM.esq} x2={largura - MARGEM.dir} y1={y(0)} y2={y(0)} stroke="#c9bccd" strokeWidth="1" />
        {rotuloFinal && dados.length > 0 && totais[totais.length - 1] > 0 && (
          <text
            x={MARGEM.esq + (dados.length - 1) * faixa + faixa / 2}
            y={y(totais[totais.length - 1]) - 6}
            textAnchor="middle"
            className="fill-marinho text-[11px] font-medium tabular-nums"
          >
            {rotuloFinal(dados[dados.length - 1])}
          </text>
        )}
      </svg>
      {ativo !== null && (
        <div
          className="pointer-events-none absolute z-10 w-max max-w-60 rounded-lg bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-roxo-100"
          style={{
            left: Math.min(Math.max(MARGEM.esq + ativo * faixa + faixa / 2 - 90, 0), largura - 190),
            top: 4,
          }}
        >
          <p className="mb-1 font-medium text-marinho">{dados[ativo].titulo || dados[ativo].rotulo}</p>
          {dados[ativo].tooltip.map(([nome, valor, cor]) => (
            <p key={nome} className="flex items-center gap-2 text-marinho-claro">
              {cor && <span className="inline-block size-2.5 shrink-0 rounded-sm" style={{ background: cor }} />}
              <span className="flex-1">{nome}</span>
              <span className="font-medium text-marinho tabular-nums">{valor}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export function Legenda({ series }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-marinho-claro">
      {series.map((s) => (
        <li key={s.nome} className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: s.cor }} />
          {s.nome}
        </li>
      ))}
    </ul>
  );
}
