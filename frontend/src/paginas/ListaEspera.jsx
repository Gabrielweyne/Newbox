import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import Confirmar from "../componentes/Confirmar";
import Disponibilidade, { livresPorSede, useDisponibilidade } from "../componentes/Disponibilidade";
import { Banner } from "../componentes/Layout";
import { IconeChave, IconeEspera, IconeLixo, IconeMais, IconeWhatsapp } from "../componentes/Icones";
import { FormAlugar } from "./Boxes";
import { Aviso, Botao, Campo, Carregando, Cartao, Etiqueta, Modal, Selecao, Vazio } from "../componentes/ui";
import { api, listarTudo } from "../api";
import { useAuth } from "../auth";
import { useAvisos } from "../avisos";
import { formatarData, formatarMoeda, nomeBox } from "../formato";
import { formatarTelefone, linkWhatsapp, mensagemVaga } from "../whatsapp";

const ABAS = [
  { valor: "aguardando", rotulo: "Aguardando vaga" },
  { valor: "contatado", rotulo: "Contatados" },
  { valor: "encerrados", rotulo: "Encerrados" },
];
const SITUACAO = {
  aguardando: { rotulo: "Aguardando", cor: "amarelo" },
  contatado: { rotulo: "Contatado", cor: "roxo" },
  alugou: { rotulo: "Alugou", cor: "verde" },
  desistiu: { rotulo: "Desistiu", cor: "cinza" },
};
const naAba = (aba, i) => (aba === "encerrados" ? ["alugou", "desistiu"].includes(i.situacao) : i.situacao === aba);

/* ---------- Formulário: anotar interessado ---------- */

function FormInteressado({ sedes, tamanhos, disponibilidade, sedePadrao, aoSalvar, aoFechar }) {
  const [dados, setDados] = useState({
    nome: "", telefone: "", email: "", sede: sedePadrao ? String(sedePadrao) : "", tamanho: "", observacao: "",
  });
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const mudar = (c) => (e) =>
    setDados((d) => ({ ...d, [c]: c === "telefone" ? formatarTelefone(e.target.value) : e.target.value }));

  // Dica: há vaga agora em alguma sede para o tamanho escolhido?
  const livres = livresPorSede(disponibilidade, dados.tamanho).filter((s) => s.livres > 0);
  const naEscolhida = livres.find((s) => String(s.id) === dados.sede);
  const outras = livres.filter((s) => String(s.id) !== dados.sede);

  async function enviar(e) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      await api("/interessados/", { metodo: "POST", corpo: { ...dados, sede: dados.sede || null } });
      aoSalvar();
    } catch (err) {
      setErro(err);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4" noValidate>
      {erro && !["nome", "telefone", "email"].some((c) => erro.campo(c)) && <Aviso>{erro.message}</Aviso>}
      <Campo rotulo="Nome" value={dados.nome} onChange={mudar("nome")} erro={erro?.campo("nome")} autoFocus />
      <Campo
        rotulo="WhatsApp"
        inputMode="tel"
        placeholder="(85) 99999-9999"
        value={dados.telefone}
        onChange={mudar("telefone")}
        erro={erro?.campo("telefone")}
      />
      <Campo
        rotulo="E-mail"
        type="email"
        value={dados.email}
        onChange={mudar("email")}
        erro={erro?.campo("email")}
        ajuda="Quando surgir a vaga, a pessoa vira cliente com estes dados, sem precisar digitar de novo."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Selecao rotulo="Unidade desejada" value={dados.sede} onChange={mudar("sede")}>
          <option value="">Qualquer uma</option>
          {sedes.map((s) => (
            <option key={s.id} value={s.id}>{s.nome}</option>
          ))}
        </Selecao>
        <Selecao rotulo="Tamanho" value={dados.tamanho} onChange={mudar("tamanho")}>
          <option value="">Qualquer tamanho</option>
          {tamanhos.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </Selecao>
      </div>
      {naEscolhida ? (
        <Aviso tipo="sucesso">
          Há {naEscolhida.livres} box(es) {dados.tamanho || ""} livre(s) no {naEscolhida.nome} agora, a partir de{" "}
          {formatarMoeda(naEscolhida.valor_a_partir)}. Dá para alugar direto, sem lista de espera!
        </Aviso>
      ) : (
        outras.length > 0 && (
          <Aviso tipo="info">
            <strong>Tem vaga em outra unidade:</strong>{" "}
            {outras.map((s) => `${s.livres} livre(s) no ${s.nome} (a partir de ${formatarMoeda(s.valor_a_partir)})`).join(" · ")}.
            Ofereça ao cliente!
          </Aviso>
        )
      )}
      <Campo
        rotulo="Observação (opcional)"
        placeholder="Ex.: precisa a partir de dezembro"
        value={dados.observacao}
        onChange={mudar("observacao")}
      />
      <div className="flex justify-end gap-2 pt-2">
        <Botao type="button" variante="fantasma" onClick={aoFechar}>Cancelar</Botao>
        <Botao type="submit" carregando={enviando}>Adicionar à lista</Botao>
      </div>
    </form>
  );
}

/* ---------- Página ---------- */

export default function ListaEspera() {
  const { usuario } = useAuth();
  const { atualizar: atualizarAvisos } = useAvisos();
  const [lista, setLista] = useState(null);
  const [sedes, setSedes] = useState([]);
  const [tamanhos, setTamanhos] = useState([]);
  const [aba, setAba] = useState("aguardando");
  const [erro, setErro] = useState("");
  const [novo, setNovo] = useState(false);
  const [excluindo, setExcluindo] = useState(null);
  const [alugando, setAlugando] = useState(null); // { interessado, box }
  const [recemAlugado, setRecemAlugado] = useState(null);
  // Funcionário só aluga boxes da própria sede; administrador, de qualquer uma
  const podeAlugar = (vaga) => usuario.admin || vaga.sede === usuario.sede?.id;
  const [versao, setVersao] = useState(0);
  const disponibilidade = useDisponibilidade(versao);

  const carregar = useCallback(() => {
    Promise.all([listarTudo("/interessados/"), api("/funcionarios/sedes/"), api("/interessados/tamanhos/")])
      .then(([l, s, t]) => {
        setLista(l);
        setSedes(s);
        setTamanhos(t);
      })
      .catch((e) => setErro(e.message));
    setVersao((v) => v + 1);
  }, []);
  useEffect(carregar, [carregar]);

  async function mudarSituacao(i, situacao) {
    try {
      const novoItem = await api(`/interessados/${i.id}/`, { metodo: "PATCH", corpo: { situacao } });
      setLista((l) => l.map((x) => (x.id === i.id ? novoItem : x)));
      atualizarAvisos();
    } catch (err) {
      setErro(err.message);
    }
  }

  const visiveis = (lista || []).filter((i) => naAba(aba, i));
  const comVaga = (lista || []).filter((i) => i.situacao === "aguardando" && i.vagas.length).length;

  return (
    <>
      <Banner titulo="Lista de espera" subtitulo="Quem quer um box e está aguardando vaga (compartilhada entre as sedes)">
        <Botao onClick={() => setNovo(true)}>
          <IconeMais className="size-4" /> Adicionar interessado
        </Botao>
      </Banner>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {comVaga > 0 && (
            <Aviso tipo="sucesso">
              <strong>{comVaga} pessoa(s) da lista já têm vaga disponível.</strong> Chame no WhatsApp e, se ela quiser,
              clique em "Alugar box": ela vira cliente com os dados que já estão aqui.
            </Aviso>
          )}
          <div className="flex flex-wrap gap-2" role="tablist">
            {ABAS.map((a) => (
              <button
                key={a.valor}
                role="tab"
                aria-selected={aba === a.valor}
                onClick={() => setAba(a.valor)}
                className={`rounded-full px-4 py-1.5 text-sm transition ${
                  aba === a.valor ? "bg-roxo text-white" : "bg-white text-marinho-claro ring-1 ring-roxo-100 hover:ring-roxo-300"
                }`}
              >
                {a.rotulo} <span className="opacity-70">({lista ? lista.filter((i) => naAba(a.valor, i)).length : "–"})</span>
              </button>
            ))}
          </div>
          <Aviso>{erro}</Aviso>
          {recemAlugado && (
            <Aviso tipo="sucesso">
              <strong>🎉 {recemAlugado.nome} agora é cliente</strong> e alugou o {nomeBox(recemAlugado.numero, recemAlugado.box).toLowerCase()}. O contrato está
              em Boxes, pronto para imprimir.{" "}
              <Link to={`/clientes/${recemAlugado.cliente}`} className="font-medium underline">Ver ficha do cliente</Link>
            </Aviso>
          )}

          <Cartao className="overflow-hidden">
            {!lista && !erro ? (
              <Carregando />
            ) : visiveis.length === 0 ? (
              <Vazio icone={IconeEspera} titulo="Ninguém esperando por aqui 😊">
                {aba === "aguardando" && "Quando um cliente chamar e não houver vaga, anote aqui. Avisaremos quando liberar um box."}
              </Vazio>
            ) : (
              <ul className="divide-y divide-roxo-100">
                {visiveis.map((i) => {
                  const vaga = i.vagas[0];
                  const s = SITUACAO[i.situacao];
                  return (
                    <li key={i.id} className={`space-y-3 px-5 py-4 ${vaga && i.situacao === "aguardando" ? "bg-emerald-50/60" : ""}`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-marinho">
                            {i.nome} <Etiqueta cor={s.cor}>{s.rotulo}</Etiqueta>
                          </p>
                          <p className="mt-0.5 text-sm text-marinho-claro/80">
                            {formatarTelefone(i.telefone)} ·{" "}
                            {i.email || <span className="text-amber-700">sem e-mail</span>} · {i.tamanho || "Qualquer tamanho"} ·{" "}
                            {i.sede_nome ? `Unidade ${i.sede_nome}` : "Qualquer unidade"}
                          </p>
                          <p className="text-xs text-marinho-claro/60">
                            Desde {formatarData(i.criado_em.slice(0, 10))}
                            {i.criado_por_nome && ` · anotado por ${i.criado_por_nome}`}
                            {i.observacao && ` · ${i.observacao}`}
                          </p>
                        </div>
                        <a
                          href={linkWhatsapp(i.telefone, mensagemVaga(i, vaga))}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[#25d366] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1ebe5a]"
                        >
                          <IconeWhatsapp className="size-4" /> Chamar no WhatsApp
                        </a>
                      </div>

                      {vaga && ["aguardando", "contatado"].includes(i.situacao) && (
                        <p className="text-sm text-emerald-800">
                          ✓ Vaga agora: {i.vagas.map((v) => `${nomeBox(v.numero, v.id)} (${v.tamanho}, ${v.sede_nome}, ${formatarMoeda(v.valor)})`).slice(0, 3).join(" · ")}
                          {i.vagas.length > 3 && ` e mais ${i.vagas.length - 3}`}
                        </p>
                      )}

                      {["aguardando", "contatado"].includes(i.situacao) && i.vagas.some(podeAlugar) && (
                        <div className="flex flex-wrap gap-1.5">
                          {i.vagas.filter(podeAlugar).slice(0, 3).map((v) => (
                            <button
                              key={v.id}
                              onClick={() => setAlugando({ interessado: i, box: v })}
                              className="inline-flex items-center gap-1.5 rounded-md bg-roxo px-3 py-1.5 text-xs font-medium text-white hover:bg-roxo-600"
                            >
                              <IconeChave className="size-4" /> Alugar {nomeBox(v.numero, v.id).toLowerCase()} ({v.tamanho}) e virar cliente
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="flex flex-wrap gap-1.5 text-xs">
                        {i.situacao !== "contatado" && i.situacao !== "alugou" && (
                          <button onClick={() => mudarSituacao(i, "contatado")} className="rounded-md px-2.5 py-1.5 font-medium text-roxo ring-1 ring-roxo-200 hover:bg-roxo-50">
                            Marcar como contatado
                          </button>
                        )}
                        {i.situacao !== "alugou" && (
                          <button onClick={() => mudarSituacao(i, "alugou")} className="rounded-md px-2.5 py-1.5 font-medium text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-50">
                            Alugou
                          </button>
                        )}
                        {i.situacao !== "desistiu" && (
                          <button onClick={() => mudarSituacao(i, "desistiu")} className="rounded-md px-2.5 py-1.5 font-medium text-marinho-claro ring-1 ring-roxo-100 hover:bg-fundo">
                            Desistiu
                          </button>
                        )}
                        {i.situacao !== "aguardando" && (
                          <button onClick={() => mudarSituacao(i, "aguardando")} className="rounded-md px-2.5 py-1.5 font-medium text-marinho-claro ring-1 ring-roxo-100 hover:bg-fundo">
                            Voltar para a espera
                          </button>
                        )}
                        <button
                          onClick={() => setExcluindo(i)}
                          className="ml-auto rounded-md p-1.5 text-red-700 hover:bg-red-50"
                          aria-label={`Excluir ${i.nome}`}
                        >
                          <IconeLixo className="size-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Cartao>
        </div>

        <div>
          <Disponibilidade dados={disponibilidade} minhaSede={usuario.sede?.id} />
        </div>
      </div>

      <Modal aberto={novo} titulo="Adicionar à lista de espera" aoFechar={() => setNovo(false)}>
        <FormInteressado
          sedes={sedes}
          tamanhos={tamanhos}
          disponibilidade={disponibilidade}
          sedePadrao={usuario.sede?.id}
          aoFechar={() => setNovo(false)}
          aoSalvar={() => {
            setNovo(false);
            setAba("aguardando");
            carregar();
            atualizarAvisos();
          }}
        />
      </Modal>
      <Modal aberto={!!alugando} titulo="Alugar box para quem estava na espera" aoFechar={() => setAlugando(null)}>
        {alugando && (
          <FormAlugar
            box={alugando.box}
            interessado={alugando.interessado}
            aoFechar={() => setAlugando(null)}
            aoSalvar={(b) => {
              setRecemAlugado({ nome: b.cliente_nome, box: b.id, numero: b.numero, cliente: b.cliente });
              setAlugando(null);
              setAba("encerrados");
              carregar();
              atualizarAvisos();
            }}
          />
        )}
      </Modal>
      <Confirmar
        aberto={!!excluindo}
        titulo={`Excluir ${excluindo?.nome}?`}
        textoBotao="Excluir"
        variante="perigo"
        aoFechar={() => setExcluindo(null)}
        aoConfirmar={async () => {
          await api(`/interessados/${excluindo.id}/`, { metodo: "DELETE" });
          carregar();
          atualizarAvisos();
        }}
      >
        <p>A pessoa sai da lista de espera. Para guardar o histórico, prefira marcar "Desistiu".</p>
      </Confirmar>
    </>
  );
}
