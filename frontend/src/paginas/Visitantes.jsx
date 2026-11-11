import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import logo from "../assets/logo.png";
import logoBranco from "../assets/logo-branco.png";
import {
  IconeCaixa,
  IconeCofre,
  IconeCofrinho,
  IconeEmail,
  IconeMapa,
  IconeMenu,
  IconeTelefone,
  IconeWhatsapp,
  IconeX,
} from "../componentes/Icones";
import { api } from "../api";
import { useAuth } from "../auth";

/* ---------- WhatsApp ---------- */

const WHATSAPP_PADRAO = "558599620414";

function linkWhatsapp(numero, texto) {
  const n = String(numero || WHATSAPP_PADRAO).replace(/\D/g, "");
  return `https://wa.me/${n}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;
}

const MENSAGEM_PADRAO = "Olá! Vim pelo site da Newbox e gostaria de saber mais sobre os boxes.";

function BotaoWhatsapp({ numero, texto = MENSAGEM_PADRAO, children, className = "" }) {
  return (
    <a
      href={linkWhatsapp(numero, texto)}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center justify-center gap-2 rounded-md bg-[#25d366] px-5 py-3 font-medium text-white shadow-sm transition hover:bg-[#1ebe5a] ${className}`}
    >
      <IconeWhatsapp className="size-5" />
      {children}
    </a>
  );
}

/* ---------- Ilustração: corredor com portas de enrolar ---------- */

function Corredor() {
  const portas = [0, 1, 2, 3];
  return (
    <svg viewBox="0 0 400 300" className="h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="chao" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2c3e50" />
          <stop offset="1" stopColor="#1a2430" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill="#23313f" />
      <polygon points="0,300 400,300 250,170 150,170" fill="url(#chao)" />
      <rect x="150" y="70" width="100" height="100" fill="#251f3c" />
      <rect x="185" y="105" width="30" height="65" fill="#965ba5" opacity=".55" />
      {portas.map((i) => {
        const x0 = i * 37.5;
        const x1 = (i + 1) * 37.5;
        const y = (x) => 70 * (x / 150);
        return (
          <g key={`e${i}`}>
            <polygon
              points={`${x0 + 3},${y(x0 + 3) + 10} ${x1 - 3},${y(x1 - 3) + 10} ${x1 - 3},${300 - (300 - 170) * (x1 / 150) + 2} ${x0 + 3},${300 - (300 - 170) * (x0 / 150) + 2}`}
              fill={i % 2 ? "#3a4a5c" : "#34465a"}
            />
            {[...Array(9)].map((_, k) => (
              <line
                key={k}
                x1={x0 + 3}
                x2={x1 - 3}
                y1={y(x0 + 3) + 18 + k * (16 - i * 2.5)}
                y2={y(x1 - 3) + 18 + k * (16 - i * 2.5)}
                stroke="#23313f"
                strokeWidth="1.2"
                opacity=".7"
              />
            ))}
          </g>
        );
      })}
      {portas.map((i) => {
        const x0 = 400 - i * 37.5;
        const x1 = 400 - (i + 1) * 37.5;
        const y = (x) => 70 * ((400 - x) / 150);
        return (
          <g key={`d${i}`}>
            <polygon
              points={`${x0 - 3},${y(x0 - 3) + 10} ${x1 + 3},${y(x1 + 3) + 10} ${x1 + 3},${300 - (300 - 170) * ((400 - x1) / 150) + 2} ${x0 - 3},${300 - (300 - 170) * ((400 - x0) / 150) + 2}`}
              fill={i % 2 ? "#3a4a5c" : "#34465a"}
            />
            {[...Array(9)].map((_, k) => (
              <line
                key={k}
                x1={x0 - 3}
                x2={x1 + 3}
                y1={y(x0 - 3) + 18 + k * (16 - i * 2.5)}
                y2={y(x1 + 3) + 18 + k * (16 - i * 2.5)}
                stroke="#23313f"
                strokeWidth="1.2"
                opacity=".7"
              />
            ))}
          </g>
        );
      })}
      <polygon points="0,0 400,0 250,70 150,70" fill="#1d2833" />
      {[0, 1, 2].map((i) => (
        <rect key={i} x={190 - i * 8} y={20 + i * 14} width={20 + i * 16} height="3" rx="1.5" fill="#d9c1e1" opacity={0.5 + i * 0.15} />
      ))}
    </svg>
  );
}

/* ---------- Seções ---------- */

const PASSOS = [
  {
    icone: IconeCofre,
    titulo: "O que é?",
    texto:
      "Self storage é um espaço só seu, fechado, para guardar o que não cabe em casa ou na empresa: móveis, estoque, documentos, equipamentos e muito mais.",
  },
  {
    icone: IconeCaixa,
    titulo: "Como guardar",
    texto: "Junte os itens que deseja guardar e escolha o box do tamanho certo para eles. Você aluga pelo tempo que precisar.",
  },
  {
    icone: IconeCofre,
    titulo: "Calcule seu espaço",
    texto: "Temos boxes de vários tamanhos. Não sabe qual escolher? Conte o que vai guardar e a gente ajuda a calcular.",
  },
  {
    icone: IconeCofrinho,
    titulo: "Orçamento",
    texto: "Espaços versáteis com preços acessíveis. Peça seu orçamento pelo WhatsApp, sem compromisso.",
  },
];

const PRAZOS = ["O quanto antes", "Nos próximos 30 dias", "Ainda estou pesquisando"];

function enderecoDefinido(endereco) {
  return endereco && !/a definir/i.test(endereco);
}

function linkMapa(sede) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Newbox ${sede.endereco}`)}`;
}

function Cabecalho({ whatsapp }) {
  const { usuario } = useAuth();
  const [aberto, setAberto] = useState(false);
  const links = [
    ["#como-funciona", "Como funciona"],
    ["#tamanhos", "Tamanhos"],
    ["#unidades", "Unidades"],
    ["#contato", "Contato"],
  ];
  const areaFuncionario = usuario ? "/painel" : "/login";

  return (
    <header className="sticky top-0 z-30 border-t-4 border-marinho bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex h-18 max-w-6xl items-center justify-between gap-4 px-4">
        <a href="#inicio" className="shrink-0">
          <img src={logo} alt="Newbox - Guarda tudo" className="h-10 w-auto" />
        </a>
        <nav className="hidden items-center gap-7 lg:flex" aria-label="Seções">
          {links.map(([href, rotulo]) => (
            <a key={href} href={href} className="tracking-wide text-marinho-claro transition hover:text-roxo">
              {rotulo}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-4 lg:flex">
          <Link to={areaFuncionario} className="text-sm text-marinho-claro/70 hover:text-roxo">
            Área do funcionário
          </Link>
          <BotaoWhatsapp numero={whatsapp} className="!px-4 !py-2.5 text-sm">
            Fale conosco
          </BotaoWhatsapp>
        </div>
        <button
          className="rounded-md p-2 text-marinho lg:hidden"
          onClick={() => setAberto((v) => !v)}
          aria-label="Menu"
          aria-expanded={aberto}
        >
          {aberto ? <IconeX className="size-6" /> : <IconeMenu className="size-6" />}
        </button>
      </div>
      {aberto && (
        <nav className="border-t border-roxo-100 px-4 pb-4 lg:hidden" aria-label="Seções (celular)">
          {links.map(([href, rotulo]) => (
            <a key={href} href={href} onClick={() => setAberto(false)} className="block py-2.5 text-marinho-claro">
              {rotulo}
            </a>
          ))}
          <Link to={areaFuncionario} className="block py-2.5 text-sm text-marinho-claro/70">
            Área do funcionário
          </Link>
        </nav>
      )}
    </header>
  );
}

function Tamanhos({ dados, aoEscolher }) {
  const [sedeId, setSedeId] = useState(null);
  const sedes = dados?.sedes || [];
  const sede = sedes.find((s) => s.id === sedeId) || sedes[0];

  return (
    <section id="tamanhos" className="scroll-mt-20 bg-fundo py-20">
      <div className="mx-auto max-w-6xl px-4">
        <p className="text-sm font-medium tracking-widest text-roxo uppercase">Tamanhos</p>
        <h2 className="mt-2 text-3xl font-medium text-marinho">Encontre o box ideal</h2>
        <p className="mt-3 max-w-2xl text-marinho-claro/80">
          Veja os tamanhos de cada unidade. A disponibilidade é atualizada em tempo real pela nossa equipe.
        </p>

        {!dados ? (
          <p className="mt-10 text-marinho-claro/60">Carregando tamanhos...</p>
        ) : (
          <>
            <div className="mt-8 flex flex-wrap gap-2" role="tablist" aria-label="Unidade">
              {sedes.map((s) => (
                <button
                  key={s.id}
                  role="tab"
                  aria-selected={s.id === sede?.id}
                  onClick={() => setSedeId(s.id)}
                  className={`rounded-full px-5 py-2 text-sm transition ${
                    s.id === sede?.id ? "bg-roxo text-white" : "bg-white text-marinho-claro ring-1 ring-roxo-100 hover:ring-roxo-300"
                  }`}
                >
                  Unidade {s.nome}
                </button>
              ))}
            </div>

            {sede?.tamanhos.length ? (
              <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {sede.tamanhos.map((t) => (
                  <div key={t.tamanho} className="flex flex-col rounded-xl bg-white p-6 shadow-sm ring-1 ring-roxo-100">
                    <IconeCaixa className="size-10 text-roxo" strokeWidth={1.2} />
                    <p className="mt-4 text-2xl font-medium text-marinho">{t.tamanho}</p>
                    <p className={`mt-1 text-sm ${t.disponivel ? "text-emerald-700" : "text-marinho-claro/60"}`}>
                      {t.disponivel ? "● Disponível" : "○ Consulte disponibilidade"}
                    </p>
                    <button
                      onClick={() => aoEscolher(sede.id, t.tamanho)}
                      className="mt-6 rounded-md px-4 py-2 text-sm font-medium text-roxo ring-1 ring-roxo-200 transition hover:bg-roxo-50"
                    >
                      Quero este tamanho
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-8 text-marinho-claro/70">Fale com a gente para saber os tamanhos desta unidade.</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function Unidades({ dados }) {
  return (
    <section id="unidades" className="scroll-mt-20 bg-white py-20">
      <div className="mx-auto max-w-6xl px-4">
        <p className="text-sm font-medium tracking-widest text-roxo uppercase">Unidades</p>
        <h2 className="mt-2 text-3xl font-medium text-marinho">Onde estamos</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {(dados?.sedes || []).map((s) => (
            <div key={s.id} className="flex gap-5 rounded-xl bg-marinho p-7 text-white">
              <IconeMapa className="size-9 shrink-0 text-roxo-300" strokeWidth={1.3} />
              <div>
                <h3 className="text-xl font-medium">Unidade {s.nome}</h3>
                {enderecoDefinido(s.endereco) ? (
                  <>
                    <p className="mt-2 text-white/80">{s.endereco}</p>
                    <a
                      href={linkMapa(s)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-block text-sm font-medium text-roxo-300 hover:text-white"
                    >
                      Como chegar →
                    </a>
                  </>
                ) : (
                  <p className="mt-2 text-white/80">Fortaleza - CE. Fale com a gente pelo WhatsApp para receber a localização.</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Contato({ dados, escolha }) {
  const sedes = dados?.sedes || [];
  const contato = dados?.contato || {};
  const [form, setForm] = useState({ nome: "", sede: "", tamanho: "", prazo: PRAZOS[0], obs: "" });

  useEffect(() => {
    if (escolha) setForm((f) => ({ ...f, sede: String(escolha.sede), tamanho: escolha.tamanho }));
  }, [escolha]);

  const sedeEscolhida = sedes.find((s) => String(s.id) === form.sede);
  const tamanhos = sedeEscolhida?.tamanhos || [];
  const mudar = (c) => (e) =>
    setForm((f) => ({ ...f, [c]: e.target.value, ...(c === "sede" ? { tamanho: "" } : {}) }));

  const mensagem = useMemo(() => {
    const linhas = [`Olá! Vim pelo site da Newbox${form.nome.trim() ? ` e meu nome é ${form.nome.trim()}` : ""}.`];
    linhas.push(
      `Tenho interesse em um box${form.tamanho ? ` de ${form.tamanho}` : ""}${
        sedeEscolhida ? ` na unidade ${sedeEscolhida.nome}` : ""
      }.`
    );
    if (!form.tamanho) linhas.push("Gostaria de ajuda para escolher o tamanho.");
    linhas.push(`Prazo: ${form.prazo.toLowerCase()}.`);
    if (form.obs.trim()) linhas.push(`Vou guardar: ${form.obs.trim()}`);
    return linhas.join("\n");
  }, [form, sedeEscolhida]);

  const campo =
    "block w-full rounded-md border border-roxo-200 bg-white px-3.5 py-2.5 text-sm text-marinho-claro focus:border-roxo focus:ring-2 focus:ring-roxo-100 focus:outline-none";

  return (
    <section id="contato" className="scroll-mt-20 bg-fundo py-20">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <p className="text-sm font-medium tracking-widest text-roxo uppercase">Contato</p>
          <h2 className="mt-2 text-3xl font-medium text-marinho">Agende sua visita ou peça um orçamento</h2>
          <p className="mt-4 text-marinho-claro/80">
            Preencha ao lado e a conversa abre direto no nosso WhatsApp, com sua mensagem pronta.
          </p>
          <ul className="mt-8 space-y-4 text-marinho-claro">
            <li className="flex items-center gap-3">
              <IconeWhatsapp className="size-5 text-[#25d366]" />
              <a href={linkWhatsapp(contato.whatsapp, MENSAGEM_PADRAO)} target="_blank" rel="noreferrer" className="hover:text-roxo">
                WhatsApp
              </a>
            </li>
            {contato.telefone && (
              <li className="flex items-center gap-3">
                <IconeTelefone className="size-5 text-roxo" />
                <a href={`tel:${contato.telefone.replace(/\D/g, "")}`} className="hover:text-roxo">
                  {contato.telefone}
                </a>
              </li>
            )}
            {contato.email && (
              <li className="flex items-center gap-3">
                <IconeEmail className="size-5 text-roxo" />
                <a href={`mailto:${contato.email}`} className="hover:text-roxo">
                  {contato.email}
                </a>
              </li>
            )}
          </ul>
        </div>

        <form
          className="space-y-4 rounded-xl bg-white p-6 shadow-sm ring-1 ring-roxo-100 sm:p-8 lg:col-span-3"
          onSubmit={(e) => {
            e.preventDefault();
            window.open(linkWhatsapp(contato.whatsapp, mensagem), "_blank", "noopener");
          }}
        >
          <div>
            <label htmlFor="v-nome" className="mb-1.5 block text-sm font-medium">Seu nome</label>
            <input id="v-nome" className={campo} value={form.nome} onChange={mudar("nome")} autoComplete="name" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="v-sede" className="mb-1.5 block text-sm font-medium">Unidade</label>
              <select id="v-sede" className={campo} value={form.sede} onChange={mudar("sede")}>
                <option value="">Qualquer uma</option>
                {sedes.map((s) => (
                  <option key={s.id} value={s.id}>{s.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="v-tamanho" className="mb-1.5 block text-sm font-medium">Tamanho</label>
              <select id="v-tamanho" className={campo} value={form.tamanho} onChange={mudar("tamanho")}>
                <option value="">Não sei, preciso de ajuda</option>
                {(tamanhos.length ? tamanhos : [...new Map(sedes.flatMap((s) => s.tamanhos).map((t) => [t.tamanho, t])).values()]).map((t) => (
                  <option key={t.tamanho} value={t.tamanho}>{t.tamanho}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="v-prazo" className="mb-1.5 block text-sm font-medium">Quando precisa?</label>
            <select id="v-prazo" className={campo} value={form.prazo} onChange={mudar("prazo")}>
              {PRAZOS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="v-obs" className="mb-1.5 block text-sm font-medium">
              O que vai guardar? <span className="font-normal text-marinho-claro/60">(opcional)</span>
            </label>
            <textarea id="v-obs" rows={3} className={campo} value={form.obs} onChange={mudar("obs")}
              placeholder="Ex.: móveis de um apartamento de 2 quartos" />
          </div>
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#25d366] px-5 py-3 font-medium text-white shadow-sm transition hover:bg-[#1ebe5a]"
          >
            <IconeWhatsapp className="size-5" /> Enviar pelo WhatsApp
          </button>
          <details className="text-xs text-marinho-claro/60">
            <summary className="cursor-pointer">Ver mensagem que será enviada</summary>
            <p className="mt-2 rounded-md bg-fundo p-3 whitespace-pre-line">{mensagem}</p>
          </details>
        </form>
      </div>
    </section>
  );
}

/* ---------- Página ---------- */

export default function Visitantes() {
  const [dados, setDados] = useState(null);
  const [escolha, setEscolha] = useState(null);
  const whatsapp = dados?.contato?.whatsapp;

  useEffect(() => {
    document.title = "Newbox | Self storage em Fortaleza - Guarda tudo";
    api("/publico/", { autenticar: false })
      .then(setDados)
      .catch(() => setDados({ sedes: [], contato: { whatsapp: WHATSAPP_PADRAO } }));
    return () => {
      document.title = "Newbox | Área do Funcionário";
    };
  }, []);

  function escolher(sede, tamanho) {
    setEscolha({ sede, tamanho, quando: Date.now() });
    document.getElementById("contato")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div id="inicio" className="min-h-svh bg-white">
      <Cabecalho whatsapp={whatsapp} />

      {/* Destaque */}
      <section className="relative overflow-hidden bg-marinho">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 lg:grid-cols-2 lg:py-24">
          <div className="relative z-10">
            <p className="text-sm font-medium tracking-widest text-roxo-300 uppercase">Self storage em Fortaleza</p>
            <h1 className="mt-4 text-4xl leading-tight font-normal text-white sm:text-5xl">
              Se você precisa de espaço, <span className="text-roxo-300">nós temos o lugar.</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg text-white/75">
              Boxes de vários tamanhos para guardar móveis, estoque, documentos e tudo o que você precisar, nas
              unidades Cocó e Cambeba.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <BotaoWhatsapp numero={whatsapp}>Falar no WhatsApp</BotaoWhatsapp>
              <a
                href="#tamanhos"
                className="inline-flex items-center rounded-md px-5 py-3 font-medium text-white ring-1 ring-white/30 transition hover:bg-white/10"
              >
                Ver tamanhos
              </a>
            </div>
          </div>
          <div className="relative mx-auto aspect-[4/3] w-full max-w-lg overflow-hidden rounded-xl shadow-2xl ring-1 ring-white/10">
            <Corredor />
          </div>
        </div>
        <div className="h-4 bg-noite" />
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="scroll-mt-20 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <p className="text-sm font-medium tracking-widest text-roxo uppercase">Como funciona</p>
          <h2 className="mt-2 text-3xl font-medium text-marinho">Guardar nunca foi tão simples</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {PASSOS.map(({ icone: Icone, titulo, texto }, i) => (
              <div
                key={titulo}
                className={`rounded-xl p-7 ${i === 0 ? "bg-noite text-white" : "bg-white ring-1 ring-roxo-100"}`}
              >
                <Icone className={`size-11 ${i === 0 ? "text-white" : "text-roxo"}`} strokeWidth={1.2} />
                <h3 className={`mt-6 text-lg font-medium ${i === 0 ? "text-white" : "text-marinho"}`}>{titulo}</h3>
                <p className={`mt-3 text-sm leading-relaxed ${i === 0 ? "text-white/80" : "text-marinho-claro/75"}`}>
                  {texto}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Tamanhos dados={dados} aoEscolher={escolher} />
      <Unidades dados={dados} />
      <Contato dados={dados} escolha={escolha} />

      {/* Faixa final */}
      <section className="bg-marinho py-12">
        <p className="mx-auto max-w-4xl px-4 text-center text-3xl font-normal text-white sm:text-4xl">
          Se você precisa de espaço, <span className="text-roxo-300">nós temos o lugar.</span>
        </p>
      </section>

      <footer className="bg-roxo text-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-3">
          <img src={logoBranco} alt="Newbox - Guarda tudo" className="h-24 w-auto self-start" />
          <div className="text-sm">
            <p className="mb-3 font-semibold">CONTATO</p>
            {(dados?.sedes || []).filter((s) => enderecoDefinido(s.endereco)).map((s) => (
              <p key={s.id} className="mb-2 text-white/90">{s.endereco}</p>
            ))}
            {dados?.contato?.telefone && <p className="text-white/90">{dados.contato.telefone}</p>}
            {dados?.contato?.email && <p className="mt-2 text-white/90">{dados.contato.email}</p>}
          </div>
          <div className="text-sm">
            <p className="mb-3 font-semibold">MENU</p>
            {[["#como-funciona", "Como funciona"], ["#tamanhos", "Tamanhos"], ["#unidades", "Unidades"], ["#contato", "Contato"]].map(
              ([h, r]) => (
                <a key={h} href={h} className="block py-1 text-white/90 hover:text-white">{r}</a>
              )
            )}
            <Link to="/login" className="block py-1 text-white/90 hover:text-white">Área do funcionário</Link>
          </div>
        </div>
        <p className="border-t border-white/15 py-4 text-center text-xs text-white/80">
          New Box © {new Date().getFullYear()} Todos os direitos reservados.
        </p>
      </footer>

      {/* Botão flutuante */}
      <a
        href={linkWhatsapp(whatsapp, MENSAGEM_PADRAO)}
        target="_blank"
        rel="noreferrer"
        aria-label="Falar no WhatsApp"
        className="fixed right-5 bottom-5 z-40 flex size-14 items-center justify-center rounded-full bg-[#25d366] text-white shadow-lg transition hover:scale-105"
      >
        <IconeWhatsapp className="size-8" />
      </a>
    </div>
  );
}
