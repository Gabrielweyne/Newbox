import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Banner } from "../componentes/Layout";
import { IconeCaixa, IconeChave, IconeCofre } from "../componentes/Icones";
import BotaoCobrar from "../componentes/BotaoCobrar";
import Disponibilidade, { useDisponibilidade } from "../componentes/Disponibilidade";
import { IconeWhatsapp } from "../componentes/Icones";
import RegistrarPagamento from "../componentes/RegistrarPagamento";
import { linkWhatsapp, mensagemVaga } from "../whatsapp";
import { Aviso, Carregando, Cartao, Etiqueta } from "../componentes/ui";
import { listarTudo } from "../api";
import { useAuth } from "../auth";
import { useAvisos } from "../avisos";
import { formatarData, formatarMoeda, primeiroNome } from "../formato";

const BOLHAS = {
  roxo: "bg-roxo-100 text-roxo",
  amarelo: "bg-amber-100 text-amber-700",
  verde: "bg-emerald-100 text-emerald-700",
};

function Numero({ icone: Icone, rotulo, valor, destaque, link, bolha = "roxo" }) {
  return (
    <Link to={link} className="group">
      <Cartao className="flex h-full items-center gap-4 p-5 transition group-hover:-translate-y-0.5 group-hover:ring-roxo-300">
        <span className={`flex size-14 shrink-0 items-center justify-center rounded-2xl ${BOLHAS[bolha]}`}>
          <Icone className="size-7" strokeWidth={1.5} />
        </span>
        <div>
          <p className="text-sm text-marinho-claro/70">{rotulo}</p>
          <p className={`mt-1 text-3xl font-semibold ${destaque || "text-marinho"}`}>{valor}</p>
        </div>
      </Cartao>
    </Link>
  );
}

function ResumoSede({ sede, receita, mostrarNome }) {
  const ocupacao = sede.numero_de_box ? Math.round((sede.alugados / sede.numero_de_box) * 100) : 0;
  const base = `/boxes?sede=${sede.id}`;
  return (
    <section>
      {mostrarNome && <h2 className="mb-4 text-lg font-semibold text-marinho">Sede {sede.nome}</h2>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Numero icone={IconeCaixa} rotulo="Total de boxes" valor={sede.numero_de_box} link={base} bolha="amarelo" />
        <Numero icone={IconeCofre} rotulo="Alugados" valor={sede.alugados} destaque="text-roxo" link={`${base}&status=alugados`} />
        <Numero icone={IconeChave} rotulo="Livres" valor={sede.nao_alugados} destaque="text-emerald-700" link={`${base}&status=livres`} bolha="verde" />
      </div>
      <Cartao className="mt-4 grid gap-6 p-5 sm:grid-cols-2">
        <div>
          <div className="flex items-baseline justify-between">
            <p className="text-sm text-marinho-claro/70">Ocupação</p>
            <p className="font-semibold text-roxo">{ocupacao}%</p>
          </div>
          <div
            className="mt-3 h-2.5 overflow-hidden rounded-full bg-roxo-100"
            role="progressbar"
            aria-valuenow={ocupacao}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Ocupação da sede ${sede.nome}`}
          >
            <div className="h-full rounded-full bg-roxo transition-all" style={{ width: `${ocupacao}%` }} />
          </div>
        </div>
        <div>
          <p className="text-sm text-marinho-claro/70">Soma dos valores dos boxes alugados</p>
          <p className="mt-1 text-2xl font-semibold text-marinho">{formatarMoeda(receita)}</p>
        </div>
      </Cartao>
      <p className="mt-3 text-xs text-marinho-claro/60">{sede.endereco}</p>
    </section>
  );
}


function LinhaAviso({ m, admin, aoPagar }) {
  const paga = m.situacao === "paga";
  return (
    <li className="flex items-center justify-between gap-3 px-5 py-3">
      <div className="min-w-0">
        <Link to={`/clientes/${m.cliente}`} className="block truncate font-medium text-marinho hover:text-roxo">
          {m.cliente_nome}
        </Link>
        <p className="text-xs text-marinho-claro/70">
          Box #{m.box}
          {admin && ` · ${m.sede_nome}`} · {formatarMoeda(m.valor)}
          {m.situacao === "atrasada" && ` · venceu ${formatarData(m.vencimento)}`}
        </p>
      </div>
      {paga ? (
        <Etiqueta cor="verde">Pagou</Etiqueta>
      ) : (
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          <BotaoCobrar m={m} compacto />
          <button
            onClick={() => aoPagar(m)}
            className="rounded-md bg-roxo px-2.5 py-1.5 text-xs font-medium text-white hover:bg-roxo-600"
          >
            Registrar pagamento
          </button>
        </div>
      )}
    </li>
  );
}

/** Quadro "quem pagou e quem não pagou" dos vencimentos de hoje + atrasadas. */
function Vencimentos({ admin }) {
  const { avisos, atualizar } = useAvisos();
  const [pagando, setPagando] = useState(null);
  if (!avisos || (!avisos.vencem_hoje.length && !avisos.atrasadas.length)) return null;
  const hoje = [...avisos.vencem_hoje].sort((a, b) => (a.situacao === "paga") - (b.situacao === "paga"));
  const pagaram = hoje.filter((m) => m.situacao === "paga").length;

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      {hoje.length > 0 && (
        <Cartao className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-roxo-100 px-5 py-4">
            <div>
              <h2 className="font-semibold text-marinho">Vencem hoje</h2>
              <p className="text-xs text-marinho-claro/70">
                {pagaram} de {hoje.length} já pagaram
              </p>
            </div>
            <Link to="/mensalidades" className="text-sm text-roxo hover:underline">
              Ver todas
            </Link>
          </div>
          <ul className="divide-y divide-roxo-100">
            {hoje.map((m) => (
              <LinhaAviso key={m.id} m={m} admin={admin} aoPagar={setPagando} />
            ))}
          </ul>
        </Cartao>
      )}
      {avisos.atrasadas.length > 0 && (
        <Cartao className="overflow-hidden ring-red-100">
          <div className="flex items-center justify-between gap-3 border-b border-red-100 bg-red-50/60 px-5 py-4">
            <div>
              <h2 className="font-semibold text-red-800">Em atraso</h2>
              <p className="text-xs text-red-800/70">Mensalidades vencidas e não pagas</p>
            </div>
            <Link to="/mensalidades?aba=atrasada" className="text-sm text-roxo hover:underline">
              Ver todas
            </Link>
          </div>
          <ul className="divide-y divide-roxo-100">
            {avisos.atrasadas.map((m) => (
              <LinhaAviso key={m.id} m={m} admin={admin} aoPagar={setPagando} />
            ))}
          </ul>
        </Cartao>
      )}
      <RegistrarPagamento
        mensalidade={pagando}
        aoFechar={() => setPagando(null)}
        aoSalvar={() => {
          setPagando(null);
          atualizar();
        }}
      />
    </section>
  );
}

/** Pessoas da lista de espera que já têm box livre na sede. */
function VagasParaEspera() {
  const { avisos } = useAvisos();
  const itens = avisos?.oportunidades || [];
  if (!itens.length) return null;
  return (
    <Cartao className="overflow-hidden ring-emerald-200">
      <div className="flex items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50/70 px-5 py-4">
        <div>
          <h2 className="font-semibold text-emerald-900">Liberou vaga para a lista de espera</h2>
          <p className="text-xs text-emerald-900/70">Chame essas pessoas antes que o box seja alugado.</p>
        </div>
        <Link to="/espera" className="text-sm text-roxo hover:underline">Ver lista</Link>
      </div>
      <ul className="divide-y divide-roxo-100">
        {itens.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <p className="truncate font-medium text-marinho">{i.nome}</p>
              <p className="text-xs text-marinho-claro/70">
                Box #{i.vagas[0].id} · {i.vagas[0].tamanho} · {i.vagas[0].sede_nome}
              </p>
            </div>
            <a
              href={linkWhatsapp(i.telefone, mensagemVaga(i, i.vagas[0]))}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[#25d366] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1ebe5a]"
            >
              <IconeWhatsapp className="size-4" /> Chamar
            </a>
          </li>
        ))}
      </ul>
    </Cartao>
  );
}

export default function Painel() {
  const { usuario } = useAuth();
  const [sedes, setSedes] = useState(null);
  const [receitas, setReceitas] = useState({});
  const [erro, setErro] = useState("");
  const disponibilidade = useDisponibilidade();

  useEffect(() => {
    Promise.all([listarTudo("/sedes/"), listarTudo("/boxes/?alugado=true")])
      .then(([s, alugados]) => {
        setSedes(s);
        const soma = {};
        alugados.forEach((b) => (soma[b.sede] = (soma[b.sede] || 0) + Number(b.valor)));
        setReceitas(soma);
      })
      .catch((e) => setErro(e.message));
  }, []);

  const nome = usuario.funcionario ? primeiroNome(usuario.funcionario.nome) : "Administrador";
  const { avisos } = useAvisos();
  const hora = new Date().getHours();
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
  const emoji = hora < 12 ? "☀️" : hora < 18 ? "👋" : "🌙";
  const pendencias = avisos?.pendencias ?? null;
  const recado =
    pendencias === null
      ? "Carregando os avisos do dia..."
      : pendencias === 0
        ? "Tudo em dia por aqui! 🎉 Nenhuma pendência para hoje."
        : `Hoje tem ${pendencias} ${pendencias === 1 ? "aviso" : "avisos"} para acompanhar. Bora? 💪`;

  return (
    <>
      <Banner
        titulo={`${saudacao}, ${nome}! ${emoji}`}
        subtitulo={`${recado} ${usuario.sede ? `· Sede ${usuario.sede.nome}` : "· Todas as sedes"}`}
      />
      <div className="mx-auto max-w-6xl space-y-10 px-4 py-10">
        <Aviso>{erro}</Aviso>
        <VagasParaEspera />
        <Vencimentos admin={usuario.admin} />
        {!sedes && !erro && <Carregando />}
        {sedes?.map((s) => (
          <ResumoSede key={s.id} sede={s} receita={receitas[s.id] || 0} mostrarNome={sedes.length > 1} />
        ))}
        {sedes && <Disponibilidade dados={disponibilidade} minhaSede={usuario.sede?.id} />}
      </div>
    </>
  );
}
