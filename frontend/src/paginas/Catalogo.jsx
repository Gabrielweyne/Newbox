import { useCallback, useEffect, useState } from "react";
import Confirmar from "../componentes/Confirmar";
import { Banner } from "../componentes/Layout";
import { IconeCaixa, IconeLapis, IconeLixo, IconeMais } from "../componentes/Icones";
import { Aviso, Botao, Campo, Carregando, Cartao, Modal, Vazio } from "../componentes/ui";
import { api } from "../api";
import { useAuth } from "../auth";
import { formatarMoeda, formatarNumero } from "../formato";

const CAMPOS = ["codigo", "sugestao_uso", "comprimento", "largura", "altura", "area", "volume", "valor", "ordem"];

function FormTipo({ tipo, sede, aoSalvar, aoFechar }) {
  const [dados, setDados] = useState(() =>
    Object.fromEntries(CAMPOS.map((c) => [c, tipo?.[c] ?? (c === "ordem" ? 0 : "")]))
  );
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const mudar = (c) => (e) => {
    const v = e.target.value;
    setDados((d) => {
      const novo = { ...d, [c]: v };
      // Calcula área e volume a partir das medidas, se o usuário não mexeu neles
      if (["comprimento", "largura", "altura"].includes(c)) {
        const [cc, l, a] = [novo.comprimento, novo.largura, novo.altura].map(Number);
        if (cc && l) novo.area = (cc * l).toFixed(2);
        if (cc && l && a) novo.volume = (cc * l * a).toFixed(2);
      }
      return novo;
    });
  };

  async function enviar(e) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      await (tipo
        ? api(`/tipos/${tipo.id}/`, { metodo: "PATCH", corpo: dados })
        : api("/tipos/", { metodo: "POST", corpo: { ...dados, sede: sede.id } }));
      aoSalvar();
    } catch (err) {
      setErro(err);
    } finally {
      setEnviando(false);
    }
  }

  const num = { type: "number", step: "0.01", min: "0", inputMode: "decimal" };
  return (
    <form onSubmit={enviar} className="space-y-4" noValidate>
      {erro && !CAMPOS.some((c) => erro.campo(c)) && <Aviso>{erro.message}</Aviso>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo rotulo="Código" placeholder="Ex.: P1" value={dados.codigo} onChange={mudar("codigo")} erro={erro?.campo("codigo")} autoFocus />
        <div className="sm:col-span-2">
          <Campo rotulo="Valor mensal (R$)" {...num} value={dados.valor} onChange={mudar("valor")} erro={erro?.campo("valor")} />
        </div>
      </div>
      <Campo rotulo="Sugestão de uso" value={dados.sugestao_uso} onChange={mudar("sugestao_uso")} erro={erro?.campo("sugestao_uso")} />
      <div className="grid grid-cols-3 gap-3">
        <Campo rotulo="Comprimento (m)" {...num} value={dados.comprimento} onChange={mudar("comprimento")} erro={erro?.campo("comprimento")} />
        <Campo rotulo="Largura (m)" {...num} value={dados.largura} onChange={mudar("largura")} erro={erro?.campo("largura")} />
        <Campo rotulo="Altura (m)" {...num} value={dados.altura} onChange={mudar("altura")} erro={erro?.campo("altura")} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Campo rotulo="Área (m²)" {...num} value={dados.area} onChange={mudar("area")} erro={erro?.campo("area")} />
        <Campo rotulo="Volume (m³)" {...num} value={dados.volume} onChange={mudar("volume")} erro={erro?.campo("volume")} />
        <Campo rotulo="Ordem" type="number" min="0" value={dados.ordem} onChange={mudar("ordem")} ajuda="Posição na lista" />
      </div>
      <p className="text-xs text-marinho-claro/60">
        Mudar o valor aqui vale para novos aluguéis e para a página pública. Boxes já cadastrados mantêm o valor deles.
      </p>
      <div className="flex justify-end gap-2 pt-2">
        <Botao type="button" variante="fantasma" onClick={aoFechar}>Cancelar</Botao>
        <Botao type="submit" carregando={enviando}>{tipo ? "Salvar" : "Adicionar tamanho"}</Botao>
      </div>
    </form>
  );
}

export default function Catalogo() {
  const { usuario } = useAuth();
  const [sedes, setSedes] = useState([]);
  const [sedeId, setSedeId] = useState(usuario.sede?.id ?? null);
  const [tipos, setTipos] = useState(null);
  const [erro, setErro] = useState("");
  const [janela, setJanela] = useState(null);

  useEffect(() => {
    api("/funcionarios/sedes/", { autenticar: false }).then((s) => {
      setSedes(s);
      setSedeId((atual) => atual ?? s[0]?.id ?? null);
    });
  }, []);

  const carregar = useCallback(() => {
    if (!sedeId) return;
    setTipos(null);
    api(`/tipos/?sede=${sedeId}`).then(setTipos).catch((e) => setErro(e.message));
  }, [sedeId]);
  useEffect(carregar, [carregar]);

  const sede = sedes.find((s) => s.id === sedeId);
  const fechar = () => setJanela(null);

  return (
    <>
      <Banner titulo="Tamanhos e preços" subtitulo="Catálogo de boxes de cada unidade (aparece na página pública)">
        {usuario.admin && sede && (
          <Botao onClick={() => setJanela({ tipo: "novo" })}>
            <IconeMais className="size-4" /> Novo tamanho
          </Botao>
        )}
      </Banner>
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-8">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Unidade">
          {sedes.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={s.id === sedeId}
              onClick={() => setSedeId(s.id)}
              className={`rounded-full px-4 py-1.5 text-sm transition ${
                s.id === sedeId ? "bg-roxo text-white" : "bg-white text-marinho-claro ring-1 ring-roxo-100 hover:ring-roxo-300"
              }`}
            >
              {s.nome}
            </button>
          ))}
        </div>
        <Aviso>{erro}</Aviso>
        <Cartao className="overflow-hidden">
          {!tipos ? (
            <Carregando />
          ) : tipos.length === 0 ? (
            <Vazio icone={IconeCaixa} titulo="Nenhum tamanho cadastrado nesta unidade" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-roxo-50 text-left text-xs tracking-wide text-roxo-700 uppercase">
                  <tr>
                    <th className="px-5 py-3 font-medium">Box</th>
                    <th className="px-5 py-3 font-medium">Dimensões (C x L x A)</th>
                    <th className="px-5 py-3 font-medium">Área / Volume</th>
                    <th className="px-5 py-3 font-medium">Sugestão de uso</th>
                    <th className="px-5 py-3 font-medium">Valor</th>
                    <th className="px-5 py-3 font-medium">Boxes</th>
                    {usuario.admin && <th className="px-5 py-3"><span className="sr-only">Ações</span></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-roxo-100">
                  {tipos.map((t) => (
                    <tr key={t.id} className="hover:bg-fundo">
                      <td className="px-5 py-3 font-semibold whitespace-nowrap text-marinho">{t.codigo}</td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        {formatarNumero(t.comprimento)} x {formatarNumero(t.largura)} x {formatarNumero(t.altura)} m
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        {formatarNumero(t.area)} m² / {formatarNumero(t.volume)} m³
                      </td>
                      <td className="px-5 py-3">{t.sugestao_uso}</td>
                      <td className="px-5 py-3 font-medium whitespace-nowrap tabular-nums">{formatarMoeda(t.valor)}</td>
                      <td className="px-5 py-3 text-marinho-claro/70">{t.total_boxes}</td>
                      {usuario.admin && (
                        <td className="px-5 py-3">
                          <div className="flex justify-end gap-1">
                            <button onClick={() => setJanela({ tipo: "editar", item: t })} className="rounded-md p-2 hover:bg-roxo-50" aria-label={`Editar ${t.codigo}`}>
                              <IconeLapis className="size-4" />
                            </button>
                            <button onClick={() => setJanela({ tipo: "excluir", item: t })} className="rounded-md p-2 text-red-700 hover:bg-red-50" aria-label={`Excluir ${t.codigo}`}>
                              <IconeLixo className="size-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Cartao>
        {!usuario.admin && (
          <p className="text-sm text-marinho-claro/70">Só o administrador pode alterar tamanhos e preços.</p>
        )}
      </div>

      <Modal
        aberto={janela?.tipo === "novo" || janela?.tipo === "editar"}
        titulo={janela?.item ? `Editar Box ${janela.item.codigo} · ${sede?.nome}` : `Novo tamanho · ${sede?.nome}`}
        aoFechar={fechar}
      >
        {(janela?.tipo === "novo" || janela?.tipo === "editar") && (
          <FormTipo tipo={janela.item} sede={sede} aoFechar={fechar} aoSalvar={() => { fechar(); carregar(); }} />
        )}
      </Modal>
      <Confirmar
        aberto={janela?.tipo === "excluir"}
        titulo={`Excluir Box ${janela?.item?.codigo}?`}
        textoBotao="Excluir"
        variante="perigo"
        aoFechar={fechar}
        aoConfirmar={async () => {
          await api(`/tipos/${janela.item.id}/`, { metodo: "DELETE" });
          carregar();
        }}
      >
        <p>O tamanho sai do catálogo e da página pública. Só é possível excluir se nenhum box usar este tamanho.</p>
      </Confirmar>
    </>
  );
}
