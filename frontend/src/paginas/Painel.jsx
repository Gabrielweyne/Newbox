import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Banner } from "../componentes/Layout";
import { IconeCaixa, IconeChave, IconeCofre } from "../componentes/Icones";
import { Aviso, Carregando, Cartao } from "../componentes/ui";
import { listarTudo } from "../api";
import { useAuth } from "../auth";
import { formatarMoeda, primeiroNome } from "../formato";

function Numero({ icone: Icone, rotulo, valor, destaque, link }) {
  return (
    <Link to={link} className="group">
      <Cartao className="flex h-full items-start gap-4 p-5 transition group-hover:ring-roxo-300">
        <Icone className="size-10 shrink-0 text-roxo" strokeWidth={1.2} />
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
        <Numero icone={IconeCaixa} rotulo="Total de boxes" valor={sede.numero_de_box} link={base} />
        <Numero icone={IconeCofre} rotulo="Alugados" valor={sede.alugados} destaque="text-roxo" link={`${base}&status=alugados`} />
        <Numero icone={IconeChave} rotulo="Livres" valor={sede.nao_alugados} destaque="text-emerald-700" link={`${base}&status=livres`} />
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


export default function Painel() {
  const { usuario } = useAuth();
  const [sedes, setSedes] = useState(null);
  const [receitas, setReceitas] = useState({});
  const [erro, setErro] = useState("");

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

  return (
    <>
      <Banner
        titulo={`Olá, ${nome}!`}
        subtitulo={usuario.sede ? `Resumo da sede ${usuario.sede.nome}` : "Resumo das sedes da Newbox"}
      />
      <div className="mx-auto max-w-6xl space-y-10 px-4 py-10">
        <Aviso>{erro}</Aviso>
        {!sedes && !erro && <Carregando />}
        {sedes?.map((s) => (
          <ResumoSede key={s.id} sede={s} receita={receitas[s.id] || 0} mostrarNome={sedes.length > 1} />
        ))}
      </div>
    </>
  );
}
