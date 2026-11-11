import { useEffect, useState } from "react";
import { api } from "../api";
import { formatarMoeda } from "../formato";
import { Cartao } from "./ui";

/** Carrega a disponibilidade de boxes livres nas sedes. */
export function useDisponibilidade(chave) {
  const [dados, setDados] = useState(null);
  useEffect(() => {
    api("/disponibilidade/").then(setDados).catch(() => setDados([]));
  }, [chave]);
  return dados;
}

const norm = (t) => String(t || "").toLowerCase().replace(/\s+/g, "");

/** Quantos livres de um tamanho em cada sede: [{nome, livres, valor_a_partir}] */
export function livresPorSede(dados, tamanho) {
  return (dados || []).map((s) => {
    const itens = tamanho ? s.tamanhos.filter((t) => norm(t.tamanho) === norm(tamanho)) : s.tamanhos;
    const livres = itens.reduce((n, t) => n + t.livres, 0);
    const valores = itens.map((t) => t.valor_a_partir).filter((v) => v != null).map(Number);
    return { id: s.id, nome: s.nome, livres, valor_a_partir: valores.length ? Math.min(...valores) : null };
  });
}

/** Tabela "tamanho x sede" com boxes livres, para consultar a outra unidade. */
export default function Disponibilidade({ dados, minhaSede }) {
  if (!dados) return null;
  const tamanhos = [];
  dados.forEach((s) =>
    s.tamanhos.forEach((t) => {
      if (!tamanhos.some((x) => norm(x) === norm(t.tamanho))) tamanhos.push(t.tamanho);
    })
  );

  return (
    <Cartao className="overflow-hidden">
      <div className="border-b border-roxo-100 px-5 py-4">
        <h2 className="font-semibold text-marinho">Boxes livres nas sedes</h2>
        <p className="text-xs text-marinho-claro/70">Para oferecer outra unidade quando a sua estiver cheia.</p>
      </div>
      {tamanhos.length === 0 ? (
        <p className="px-5 py-6 text-sm text-marinho-claro/70">Nenhum box cadastrado.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-roxo-50 text-left text-xs tracking-wide text-roxo-700 uppercase">
              <tr>
                <th className="px-5 py-2.5 font-medium">Tamanho</th>
                {dados.map((s) => (
                  <th key={s.id} className="px-5 py-2.5 font-medium">
                    {s.nome}
                    {minhaSede === s.id && <span className="ml-1 font-normal normal-case">(sua)</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-roxo-100">
              {tamanhos.map((tam) => (
                <tr key={tam}>
                  <td className="px-5 py-2.5 font-medium text-marinho">{tam}</td>
                  {livresPorSede(dados, tam).map((s) => (
                    <td key={s.id} className="px-5 py-2.5">
                      {s.livres > 0 ? (
                        <span className="text-emerald-700">
                          <strong>{s.livres}</strong> livre{s.livres > 1 ? "s" : ""}
                          <span className="block text-xs text-marinho-claro/60">a partir de {formatarMoeda(s.valor_a_partir)}</span>
                        </span>
                      ) : (
                        <span className="text-marinho-claro/40">Nenhum</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Cartao>
  );
}
