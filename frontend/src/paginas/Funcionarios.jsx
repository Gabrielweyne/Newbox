import { useCallback, useEffect, useState } from "react";
import { Banner } from "../componentes/Layout";
import { IconeBloquear, IconeCheck, IconeCracha } from "../componentes/Icones";
import { Aviso, Botao, Carregando, Cartao, Etiqueta, Vazio } from "../componentes/ui";
import { api, listarTudo } from "../api";
import { formatarCpf } from "../formato";

export default function Funcionarios() {
  const [lista, setLista] = useState(null);
  const [aba, setAba] = useState("pendentes");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(null);

  const carregar = useCallback(() => {
    listarTudo("/funcionarios/").then(setLista).catch((e) => setErro(e.message));
  }, []);
  useEffect(carregar, [carregar]);

  async function acao(f, tipo) {
    setOcupado(f.id);
    setErro("");
    try {
      const atualizado = await api(`/funcionarios/${f.id}/${tipo}/`, { metodo: "POST" });
      setLista((l) => l.map((x) => (x.id === f.id ? atualizado : x)));
    } catch (err) {
      setErro(err.message);
    } finally {
      setOcupado(null);
    }
  }

  const pendentes = (lista || []).filter((f) => !f.aprovado);
  const ativos = (lista || []).filter((f) => f.aprovado);
  const visiveis = aba === "pendentes" ? pendentes : ativos;

  return (
    <>
      <Banner titulo="Funcionários" subtitulo="Aprove novos cadastros e controle quem tem acesso" />
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-5 flex gap-2" role="tablist">
          {[
            ["pendentes", "Aguardando aprovação", pendentes.length],
            ["ativos", "Com acesso", ativos.length],
          ].map(([valor, rotulo, n]) => (
            <button
              key={valor}
              role="tab"
              aria-selected={aba === valor}
              onClick={() => setAba(valor)}
              className={`rounded-full px-4 py-1.5 text-sm transition ${
                aba === valor ? "bg-roxo text-white" : "bg-white text-marinho-claro ring-1 ring-roxo-100 hover:ring-roxo-300"
              }`}
            >
              {rotulo} <span className="opacity-70">({lista ? n : "–"})</span>
            </button>
          ))}
        </div>

        <div className="mb-4">
          <Aviso>{erro}</Aviso>
        </div>
        <Cartao className="overflow-hidden">
          {!lista && !erro ? (
            <Carregando />
          ) : visiveis.length === 0 ? (
            <Vazio icone={IconeCracha} titulo={aba === "pendentes" ? "Nenhum cadastro aguardando" : "Nenhum funcionário com acesso"}>
              {aba === "pendentes" && "Novos cadastros feitos pelo site aparecem aqui."}
            </Vazio>
          ) : (
            <ul className="divide-y divide-roxo-100">
              {visiveis.map((f) => (
                <li key={f.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-marinho">
                      {f.nome} <Etiqueta cor="cinza">{f.sede_nome}</Etiqueta>
                    </p>
                    <p className="mt-0.5 text-sm text-marinho-claro/70">
                      CPF {formatarCpf(f.cpf)} · {f.email || "sem e-mail"}
                    </p>
                  </div>
                  {f.aprovado ? (
                    <Botao variante="perigo" carregando={ocupado === f.id} onClick={() => acao(f, "bloquear")}>
                      <IconeBloquear className="size-4" /> Bloquear acesso
                    </Botao>
                  ) : (
                    <Botao carregando={ocupado === f.id} onClick={() => acao(f, "aprovar")}>
                      <IconeCheck className="size-4" /> Aprovar
                    </Botao>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>
    </>
  );
}
