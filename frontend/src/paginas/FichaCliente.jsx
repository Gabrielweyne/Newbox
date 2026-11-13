import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import BotaoCobrar from "../componentes/BotaoCobrar";
import ListaContratos from "../componentes/Contratos";
import BotaoNotaFiscal from "../componentes/NotaFiscal";
import { Banner } from "../componentes/Layout";
import { IconeClipe, IconeEmail, IconeLapis, IconeWhatsapp } from "../componentes/Icones";
import RegistrarPagamento from "../componentes/RegistrarPagamento";
import { Aviso, Botao, Carregando, Cartao, Etiqueta, Modal, Vazio } from "../componentes/ui";
import { api } from "../api";
import { useAvisos } from "../avisos";
import { formatarCpf, formatarData, formatarMoeda, SITUACOES } from "../formato";
import { formatarTelefone, linkWhatsapp } from "../whatsapp";
import { FormCliente } from "./Clientes";

export default function FichaCliente() {
  const { id } = useParams();
  const { atualizar: atualizarAvisos } = useAvisos();
  const [ficha, setFicha] = useState(null);
  const [erro, setErro] = useState("");
  const [editando, setEditando] = useState(false);
  const [pagando, setPagando] = useState(null);

  const carregar = useCallback(() => {
    api(`/clientes/${id}/ficha/`).then(setFicha).catch((e) => setErro(e.status === 404 ? "Cliente não encontrado." : e.message));
  }, [id]);
  useEffect(carregar, [carregar]);

  if (!ficha) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        {erro ? <Aviso>{erro}</Aviso> : <Carregando />}
      </div>
    );
  }

  const { cliente, boxes, mensalidades, contratos } = ficha;
  const abertas = mensalidades.filter((m) => m.situacao !== "paga");
  const emAtraso = abertas.filter((m) => m.situacao === "atrasada");
  const totalAtraso = emAtraso.reduce((s, m) => s + Number(m.valor), 0);

  return (
    <>
      <Banner titulo={cliente.nome} subtitulo="Ficha do cliente">
        <Botao variante="secundario" onClick={() => setEditando(true)}>
          <IconeLapis className="size-4" /> Editar dados
        </Botao>
        {cliente.telefone && (
          <a
            href={linkWhatsapp(cliente.telefone)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-md bg-[#25d366] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#1ebe5a]"
          >
            <IconeWhatsapp className="size-4" /> WhatsApp
          </a>
        )}
      </Banner>

      {!cliente.ativo && (
        <div className="mx-auto mt-6 max-w-6xl px-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span>
              Este cliente foi <strong>excluído</strong> da lista
              {cliente.excluido_em && ` em ${new Date(cliente.excluido_em).toLocaleDateString("pt-BR")}`}. O histórico abaixo
              continua guardado.
            </span>
            <Botao
              variante="secundario"
              className="!py-1.5 text-xs"
              onClick={async () => {
                await api(`/clientes/${cliente.id}/reativar/`, { metodo: "POST" });
                carregar();
              }}
            >
              Reativar cliente
            </Botao>
          </div>
        </div>
      )}
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-3">
        <div className="space-y-6">
          <Cartao className="space-y-3 p-5 text-sm">
            <h2 className="font-semibold text-marinho">Contato</h2>
            <p className="flex items-center gap-2">
              <IconeWhatsapp className="size-4 text-[#1ebe5a]" />
              {cliente.telefone ? (
                formatarTelefone(cliente.telefone)
              ) : (
                <button onClick={() => setEditando(true)} className="text-amber-700 hover:underline">
                  Sem WhatsApp, cadastrar
                </button>
              )}
            </p>
            <p className="flex items-center gap-2">
              <IconeEmail className="size-4 text-roxo" />
              {cliente.email || (
                <button onClick={() => setEditando(true)} className="text-amber-700 hover:underline">
                  Sem e-mail, cadastrar
                </button>
              )}
            </p>
            {cliente.cpf && <p className="text-marinho-claro/80">CPF {formatarCpf(cliente.cpf)}</p>}
          </Cartao>

          <Cartao className={`p-5 ${emAtraso.length ? "ring-red-200" : ""}`}>
            <p className="text-sm text-marinho-claro/70">Situação</p>
            {emAtraso.length ? (
              <>
                <p className="mt-1 text-2xl font-semibold text-red-700">{formatarMoeda(totalAtraso)}</p>
                <p className="text-sm text-red-800/80">em {emAtraso.length} mensalidade(s) atrasada(s)</p>
              </>
            ) : (
              <p className="mt-1 text-lg font-semibold text-emerald-700">Em dia</p>
            )}
          </Cartao>

          <Cartao className="overflow-hidden">
            <h2 className="border-b border-roxo-100 px-5 py-4 font-semibold text-marinho">Boxes alugados</h2>
            {boxes.length === 0 ? (
              <p className="px-5 py-4 text-sm text-marinho-claro/70">Nenhum box alugado no momento.</p>
            ) : (
              <ul className="divide-y divide-roxo-100 text-sm">
                {boxes.map((b) => (
                  <li key={b.id} className="px-5 py-3">
                    <p className="font-medium text-marinho">
                      Box #{b.id} · {b.tamanho} {b.em_atraso && <Etiqueta cor="vermelho">Em atraso</Etiqueta>}
                    </p>
                    <p className="text-xs text-marinho-claro/70">
                      {b.sede_nome} · {formatarMoeda(b.valor)}/mês · vence todo dia {b.dia_vencimento} · desde{" "}
                      {formatarData(b.alugado_em)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {ficha.outras_sedes && (
              <p className="border-t border-roxo-100 px-5 py-3 text-xs text-marinho-claro/60">
                Este cliente também aluga na outra unidade.
              </p>
            )}
          </Cartao>
        </div>

        <div className="space-y-6 lg:col-span-2">
        <Cartao className="overflow-hidden">
          <div className="border-b border-roxo-100 px-5 py-4">
            <h2 className="font-semibold text-marinho">Contratos</h2>
            <p className="text-xs text-marinho-claro/70">
              {contratos.length
                ? `${contratos.length} contrato(s) · cliente desde ${formatarData(contratos[contratos.length - 1].inicio)}`
                : "Nenhum contrato ainda"}
            </p>
          </div>
          <ListaContratos contratos={contratos} />
        </Cartao>

        <Cartao className="overflow-hidden">
          <h2 className="border-b border-roxo-100 px-5 py-4 font-semibold text-marinho">Histórico de mensalidades</h2>
          {mensalidades.length === 0 ? (
            <Vazio titulo="Nenhuma mensalidade ainda" />
          ) : (
            <ul className="divide-y divide-roxo-100">
              {mensalidades.map((m) => {
                const s = SITUACOES[m.situacao];
                return (
                  <li key={m.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm">
                      <p className="font-medium text-marinho">
                        Vence {formatarData(m.vencimento)} <Etiqueta cor={s.cor}>{s.rotulo}</Etiqueta>
                      </p>
                      <p className="text-xs text-marinho-claro/70">
                        Box #{m.box} ({m.box_tamanho}) · {formatarMoeda(m.valor)}
                        {m.pago_em && ` · pago em ${formatarData(m.pago_em)}`}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <BotaoNotaFiscal m={{ ...m, cliente_email: cliente.email }} aoAtualizar={carregar} />
                      {m.situacao === "paga" ? (
                        <a
                          href={m.comprovante}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-roxo hover:bg-roxo-50"
                        >
                          <IconeClipe className="size-4" /> Comprovante
                        </a>
                      ) : (
                        <>
                          {m.situacao !== "a_vencer" && <BotaoCobrar m={m} compacto />}
                          <button
                            onClick={() => setPagando(m)}
                            className="rounded-md bg-roxo px-2.5 py-1.5 text-xs font-medium text-white hover:bg-roxo-600"
                          >
                            Registrar pagamento
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {abertas.length > 0 && (
            <p className="border-t border-roxo-100 px-5 py-3 text-xs text-marinho-claro/60">
              {abertas.length} mensalidade(s) em aberto.
            </p>
          )}
        </Cartao>
        </div>
      </div>

      <p className="mx-auto max-w-6xl px-4 pb-8 text-sm">
        <Link to="/clientes" className="text-roxo hover:underline">← Voltar para clientes</Link>
      </p>

      <Modal aberto={editando} titulo="Editar cliente" aoFechar={() => setEditando(false)}>
        <FormCliente
          cliente={cliente}
          aoFechar={() => setEditando(false)}
          aoSalvar={() => {
            setEditando(false);
            carregar();
          }}
        />
      </Modal>
      <RegistrarPagamento
        mensalidade={pagando}
        aoFechar={() => setPagando(null)}
        aoSalvar={() => {
          setPagando(null);
          carregar();
          atualizarAvisos();
        }}
      />
    </>
  );
}
