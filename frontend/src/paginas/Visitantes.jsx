import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import logo from "../assets/logo.png";
import logoBranco from "../assets/logo-branco.png";
import {
  IconeCaixa,
  IconeCalendario,
  IconeChave,
  IconeCofre,
  IconeDestravar,
  IconeEmail,
  IconeMapa,
  IconeMenu,
  IconeTelefone,
  IconeWhatsapp,
  IconeX,
} from "../componentes/Icones";
import { api } from "../api";
import { useAuth } from "../auth";
import { formatarMoeda } from "../formato";
import { formatarTelefone, linkWhatsapp } from "../whatsapp";

/* ---------- WhatsApp ---------- */

const WHATSAPP_PADRAO = "5585999620414";
const MENSAGEM_PADRAO = "Olá! Vim pelo site da Newbox e gostaria de saber mais sobre os boxes.";

/** "5585999620414" -> "(85) 99962-0414" */
const telefoneBonito = (n) => formatarTelefone(String(n || "").replace(/^55/, ""));

function BotaoWhatsapp({ numero, texto = MENSAGEM_PADRAO, children, className = "" }) {
  return (
    <a
      href={linkWhatsapp(numero || WHATSAPP_PADRAO, texto)}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center justify-center gap-2 rounded-md bg-[#25d366] px-5 py-3 font-medium text-white shadow-sm transition hover:bg-[#1ebe5a] ${className}`}
    >
      <IconeWhatsapp className="size-5" />
      {children}
    </a>
  );
}

const num = (v) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 });

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

/* ---------- Conteúdo (dos catálogos da Newbox) ---------- */

const DIFERENCIAIS = [
  { icone: IconeCaixa, titulo: "Conveniência", texto: "Localização privilegiada com pátio interno coberto para carga e descarga facilitada." },
  { icone: IconeCalendario, titulo: "Flexibilidade", texto: "Contratos mensais sem burocracia. Precisa de mais ou menos espaço? Mudamos na hora." },
  { icone: IconeChave, titulo: "Privacidade", texto: "Você tranca seu box e só você guarda a chave." },
  { icone: IconeDestravar, titulo: "Agilidade", texto: "Contratação rápida com liberação imediata do box." },
  { icone: IconeCofre, titulo: "Segurança total", texto: "Monitoramento 24h e acesso controlado." },
];

const PRAZOS = ["O quanto antes", "Nos próximos 30 dias", "Ainda estou pesquisando"];

function enderecoDefinido(endereco) {
  return endereco && !/a definir/i.test(endereco);
}

function linkMapa(sede) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Newbox ${sede.endereco}`)}`;
}

const LINKS = [
  ["#por-que", "Por que a Newbox"],
  ["#tamanhos", "Tamanhos"],
  ["#unidades", "Unidades"],
  ["#contato", "Contato"],
];

function Cabecalho({ whatsapp }) {
  const { usuario } = useAuth();
  const [aberto, setAberto] = useState(false);
  const areaFuncionario = usuario ? "/painel" : "/login";

  return (
    <header className="sticky top-0 z-30 border-t-4 border-marinho bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex h-18 max-w-6xl items-center justify-between gap-4 px-4">
        <a href="#inicio" className="shrink-0">
          <img src={logo} alt="Newbox - Guarda tudo" className="h-10 w-auto" />
        </a>
        <nav className="hidden items-center gap-7 lg:flex" aria-label="Seções">
          {LINKS.map(([href, rotulo]) => (
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
          {LINKS.map(([href, rotulo]) => (
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

function Medida({ rotulo, valor }) {
  return (
    <div>
      <dt className="text-[11px] tracking-wide text-marinho-claro/55 uppercase">{rotulo}</dt>
      <dd className="text-sm font-medium text-marinho">{valor}</dd>
    </div>
  );
}

function CartaoTipo({ t, aoEscolher }) {
  return (
    <div className="flex flex-col rounded-xl bg-white p-6 shadow-sm ring-1 ring-roxo-100 transition hover:ring-roxo-300">
      <div className="flex items-start justify-between gap-3">
        <p className="text-2xl tracking-wider text-marinho">
          BOX <strong className="font-semibold text-roxo">{t.codigo}</strong>
        </p>
        <span
          className={`mt-1 shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
            t.disponivel ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
          }`}
        >
          {t.disponivel ? "Disponível" : "Consulte"}
        </span>
      </div>
      <p className="mt-3 min-h-10 text-sm leading-snug text-marinho-claro/85">{t.sugestao_uso}</p>
      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2.5 border-t border-roxo-100 pt-4">
        <Medida rotulo="Área" valor={`${num(t.area)} m²`} />
        <Medida rotulo="Volume" valor={`${num(t.volume)} m³`} />
        <div className="col-span-2">
          <Medida rotulo="Dimensões (C x L x A)" valor={`${num(t.comprimento)} x ${num(t.largura)} x ${num(t.altura)} m`} />
        </div>
      </dl>
      <p className="mt-4 text-xl font-semibold text-marinho">
        {formatarMoeda(t.valor)}
        <span className="text-sm font-normal text-marinho-claro/60">/mês</span>
      </p>
      <button
        onClick={() => aoEscolher(t.codigo)}
        className="mt-4 rounded-md px-4 py-2 text-sm font-medium text-roxo ring-1 ring-roxo-200 transition hover:bg-roxo-50"
      >
        Quero este box
      </button>
    </div>
  );
}

function Tamanhos({ dados, aoEscolher }) {
  const [sedeId, setSedeId] = useState(null);
  const sedes = dados?.sedes || [];
  const sede = sedes.find((s) => s.id === sedeId) || sedes[0];

  return (
    <section id="tamanhos" className="scroll-mt-20 bg-fundo py-20">
      <div className="mx-auto max-w-6xl px-4">
        <p className="text-sm font-medium tracking-widest text-roxo uppercase">Catálogo</p>
        <h2 className="mt-2 text-3xl font-medium text-marinho">Encontre o tamanho ideal para você</h2>
        <p className="mt-3 max-w-2xl text-marinho-claro/80">
          Temos o espaço exato para a sua necessidade, desde documentos importantes até o estoque da sua empresa.
          Medidas e valores variam por unidade.
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
                  {s.nome_publico}
                </button>
              ))}
            </div>

            {sede?.tipos.length ? (
              <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {sede.tipos.map((t) => (
                  <CartaoTipo key={t.codigo} t={t} aoEscolher={(codigo) => aoEscolher(sede.id, codigo)} />
                ))}
              </div>
            ) : sede?.tamanhos.length ? (
              <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {sede.tamanhos.map((t) => (
                  <div key={t.tamanho} className="flex flex-col rounded-xl bg-white p-6 shadow-sm ring-1 ring-roxo-100">
                    <IconeCaixa className="size-10 text-roxo" strokeWidth={1.2} />
                    <p className="mt-4 text-2xl font-medium text-marinho">{t.tamanho}</p>
                    <button
                      onClick={() => aoEscolher(sede.id, t.tamanho)}
                      className="mt-6 rounded-md px-4 py-2 text-sm font-medium text-roxo ring-1 ring-roxo-200 hover:bg-roxo-50"
                    >
                      Quero este box
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-8 text-marinho-claro/70">Fale com a gente para saber os tamanhos desta unidade.</p>
            )}
            <p className="mt-6 text-sm text-marinho-claro/70">
              Não sabe qual escolher? <a href="#contato" className="font-medium text-roxo hover:underline">Consulte nossos especialistas</a> e
              encontre o box ideal para você.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function Facilidades() {
  return (
    <section className="bg-white py-20">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 lg:grid-cols-2">
        <div className="rounded-xl bg-fundo p-8">
          <h2 className="text-2xl font-medium text-roxo">Soluções para sua empresa (B2B)</h2>
          <p className="mt-2 text-marinho-claro">
            <strong className="font-semibold text-marinho">Otimize seus custos operacionais</strong> usando a Newbox como seu
            centro logístico:
          </p>
          <ul className="mt-5 space-y-3 text-sm text-marinho-claro/90">
            <li><strong className="text-marinho">Estoque de e-commerce:</strong> gerencie seus produtos com facilidade de acesso.</li>
            <li><strong className="text-marinho">Arquivo morto:</strong> libere m² valiosos no seu escritório guardando documentos com segurança.</li>
            <li><strong className="text-marinho">Logística facilitada:</strong> pátio interno para carga e descarga rápida.</li>
          </ul>
        </div>
        <div className="rounded-xl bg-fundo p-8">
          <h2 className="text-2xl font-medium text-roxo">Facilidades extras</h2>
          <ul className="mt-5 space-y-3 text-sm text-marinho-claro/90">
            <li>
              <strong className="text-marinho">Seguro sob medida:</strong> oferecemos seguro para as instalações, e você pode
              contratar um seguro individual para o conteúdo do seu box no ato da locação.
            </li>
            <li>
              <strong className="text-marinho">Movimentação gratuita:</strong> disponibilizamos carrinhos e autorizamos o uso de
              prateleiras móveis, facilitando o transporte dos seus bens.
            </li>
          </ul>
          <p className="mt-6 flex gap-3 rounded-lg bg-white p-4 text-sm text-marinho-claro ring-1 ring-roxo-100">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-roxo text-xs font-bold text-white">!</span>
            <span>
              <strong className="text-marinho">Atenção:</strong> lembre-se de trazer seus materiais de embalagem (caixas e fitas) e o
              seu cadeado, pois não comercializamos esses itens no local.
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}

function Unidades({ dados }) {
  const horario = dados?.contato?.horario;
  return (
    <section id="unidades" className="scroll-mt-20 bg-fundo py-20">
      <div className="mx-auto max-w-6xl px-4">
        <p className="text-sm font-medium tracking-widest text-roxo uppercase">Unidades</p>
        <h2 className="mt-2 text-3xl font-medium text-marinho">Onde estamos</h2>
        {horario && <p className="mt-3 text-marinho-claro/80">Horário de funcionamento: {horario}</p>}
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {(dados?.sedes || []).map((s) => (
            <div key={s.id} className="flex flex-col gap-5 rounded-xl bg-marinho p-7 text-white sm:flex-row">
              <IconeMapa className="size-9 shrink-0 text-roxo-300" strokeWidth={1.3} />
              <div className="min-w-0 flex-1">
                <h3 className="text-xl font-medium">{s.nome_publico}</h3>
                {enderecoDefinido(s.endereco) ? (
                  <p className="mt-2 text-white/80">{s.endereco}</p>
                ) : (
                  <p className="mt-2 text-white/80">Fortaleza - CE. Fale com a gente para receber a localização.</p>
                )}
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <BotaoWhatsapp numero={s.whatsapp} texto={`Olá! Vim pelo site e gostaria de falar com a ${s.nome_publico}.`} className="!px-4 !py-2 text-sm">
                    {telefoneBonito(s.whatsapp)}
                  </BotaoWhatsapp>
                  {enderecoDefinido(s.endereco) && (
                    <a href={linkMapa(s)} target="_blank" rel="noreferrer" className="text-sm font-medium text-roxo-300 hover:text-white">
                      Como chegar →
                    </a>
                  )}
                </div>
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
  const opcoes = sedeEscolhida
    ? sedeEscolhida.tipos.length
      ? sedeEscolhida.tipos.map((t) => ({ valor: t.codigo, rotulo: `Box ${t.codigo} · ${t.sugestao_uso}` }))
      : sedeEscolhida.tamanhos.map((t) => ({ valor: t.tamanho, rotulo: t.tamanho }))
    : [];
  const destino = sedeEscolhida?.whatsapp || contato.whatsapp || WHATSAPP_PADRAO;
  const mudar = (c) => (e) =>
    setForm((f) => ({ ...f, [c]: e.target.value, ...(c === "sede" ? { tamanho: "" } : {}) }));

  const mensagem = useMemo(() => {
    const linhas = [`Olá! Vim pelo site da Newbox${form.nome.trim() ? ` e meu nome é ${form.nome.trim()}` : ""}.`];
    linhas.push(
      `Tenho interesse em um box${form.tamanho ? ` ${form.tamanho}` : ""}${
        sedeEscolhida ? ` na ${sedeEscolhida.nome_publico}` : ""
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
    <section id="contato" className="scroll-mt-20 bg-white py-20">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <p className="text-sm font-medium tracking-widest text-roxo uppercase">Contato</p>
          <h2 className="mt-2 text-3xl font-medium text-marinho">Consulte nossos especialistas e encontre o box ideal</h2>
          <p className="mt-4 text-marinho-claro/80">
            Preencha ao lado e a conversa abre direto no WhatsApp da unidade escolhida, com sua mensagem pronta.
          </p>
          <ul className="mt-8 space-y-4 text-marinho-claro">
            {sedes.map((s) => (
              <li key={s.id} className="flex items-center gap-3">
                <IconeWhatsapp className="size-5 shrink-0 text-[#25d366]" />
                <a href={linkWhatsapp(s.whatsapp, MENSAGEM_PADRAO)} target="_blank" rel="noreferrer" className="hover:text-roxo">
                  {telefoneBonito(s.whatsapp)} <span className="text-sm text-marinho-claro/60">· {s.nome_publico}</span>
                </a>
              </li>
            ))}
            {contato.telefone && (
              <li className="flex items-center gap-3">
                <IconeTelefone className="size-5 text-roxo" />
                <a href={`tel:${contato.telefone.replace(/\D/g, "")}`} className="hover:text-roxo">{contato.telefone}</a>
              </li>
            )}
            {contato.email && (
              <li className="flex items-center gap-3">
                <IconeEmail className="size-5 text-roxo" />
                <a href={`mailto:${contato.email}`} className="hover:text-roxo">{contato.email}</a>
              </li>
            )}
          </ul>
        </div>

        <form
          className="space-y-4 rounded-xl bg-fundo p-6 ring-1 ring-roxo-100 sm:p-8 lg:col-span-3"
          onSubmit={(e) => {
            e.preventDefault();
            window.open(linkWhatsapp(destino, mensagem), "_blank", "noopener");
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
                  <option key={s.id} value={s.id}>{s.nome_publico}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="v-tamanho" className="mb-1.5 block text-sm font-medium">Box</label>
              <select id="v-tamanho" className={campo} value={form.tamanho} onChange={mudar("tamanho")} disabled={!sedeEscolhida}>
                <option value="">{sedeEscolhida ? "Não sei, preciso de ajuda" : "Escolha a unidade primeiro"}</option>
                {opcoes.map((o) => (
                  <option key={o.valor} value={o.valor}>{o.rotulo}</option>
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
          <p className="text-center text-xs text-marinho-claro/60">
            Vai para o WhatsApp {sedeEscolhida ? `da ${sedeEscolhida.nome_publico}` : "da Newbox Sede"}: {telefoneBonito(destino)}
          </p>
          <details className="text-xs text-marinho-claro/60">
            <summary className="cursor-pointer">Ver mensagem que será enviada</summary>
            <p className="mt-2 rounded-md bg-white p-3 whitespace-pre-line">{mensagem}</p>
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

      <section className="relative overflow-hidden bg-marinho">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 lg:grid-cols-2 lg:py-24">
          <div className="relative z-10">
            <p className="text-sm font-medium tracking-widest text-roxo-300 uppercase">Self storage em Fortaleza</p>
            <h1 className="mt-4 text-4xl leading-tight font-normal text-white sm:text-5xl">
              O espaço que você precisa, <span className="text-roxo-300">com a tranquilidade que você merece.</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg text-white/75">
              Soluções inteligentes de armazenamento para você e sua empresa, nas unidades Sede (Cambeba) e Cocó.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <BotaoWhatsapp numero={whatsapp}>Falar no WhatsApp</BotaoWhatsapp>
              <a
                href="#tamanhos"
                className="inline-flex items-center rounded-md px-5 py-3 font-medium text-white ring-1 ring-white/30 transition hover:bg-white/10"
              >
                Ver tamanhos e preços
              </a>
            </div>
          </div>
          <div className="relative mx-auto aspect-[4/3] w-full max-w-lg overflow-hidden rounded-xl shadow-2xl ring-1 ring-white/10">
            <Corredor />
          </div>
        </div>
        <div className="h-4 bg-noite" />
      </section>

      <section className="py-16">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <h2 className="text-3xl leading-snug font-medium text-marinho">
              Sua <span className="rounded-md bg-marinho px-2 text-white">casa</span> ou{" "}
              <span className="rounded-md bg-marinho px-2 text-white">escritório</span>, sem limites.
            </h2>
          </div>
          <div className="space-y-4 lg:col-span-3">
            <p className="text-lg font-medium text-roxo">
              Viver em um ambiente apertado ou trabalhar em um escritório entulhado gera estresse e limita sua produtividade.
            </p>
            <p className="text-marinho-claro">
              A Newbox nasceu para ser a <strong className="text-marinho">extensão do seu imóvel</strong>, permitindo que você
              recupere o controle do seu espaço com <strong className="text-marinho">tecnologia e praticidade</strong>.
            </p>
          </div>
        </div>
      </section>

      <section id="por-que" className="scroll-mt-20 bg-fundo py-20">
        <div className="mx-auto max-w-6xl px-4">
          <p className="text-sm font-medium tracking-widest text-roxo uppercase">Diferenciais</p>
          <h2 className="mt-2 text-3xl font-medium text-marinho">Por que escolher a Newbox?</h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
            {DIFERENCIAIS.map(({ icone: Icone, titulo, texto }, i) => (
              <div key={titulo} className={`rounded-xl p-6 ${i === 4 ? "bg-noite text-white" : "bg-white ring-1 ring-roxo-100"}`}>
                <span className={`flex size-11 items-center justify-center rounded-full ${i === 4 ? "bg-white/10" : "bg-roxo"} text-white`}>
                  <Icone className="size-6" />
                </span>
                <h3 className={`mt-5 font-medium ${i === 4 ? "text-white" : "text-roxo"}`}>{titulo}</h3>
                <p className={`mt-2 text-sm leading-relaxed ${i === 4 ? "text-white/80" : "text-marinho-claro/80"}`}>{texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Tamanhos dados={dados} aoEscolher={escolher} />
      <Facilidades />
      <Unidades dados={dados} />
      <Contato dados={dados} escolha={escolha} />

      <section className="bg-marinho py-12">
        <p className="mx-auto max-w-4xl px-4 text-center text-3xl font-normal text-white sm:text-4xl">
          Se você precisa de espaço, <span className="text-roxo-300">nós temos o lugar.</span>
        </p>
      </section>

      <footer className="bg-roxo text-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-4">
          <img src={logoBranco} alt="Newbox - Guarda tudo" className="h-24 w-auto self-start" />
          <div className="text-sm md:col-span-2">
            <p className="mb-3 font-semibold">UNIDADES</p>
            {(dados?.sedes || []).map((s) => (
              <div key={s.id} className="mb-3">
                <p className="font-medium">{s.nome_publico}</p>
                {enderecoDefinido(s.endereco) && <p className="text-white/85">{s.endereco}</p>}
                <p className="text-white/85">WhatsApp {telefoneBonito(s.whatsapp)}</p>
              </div>
            ))}
            {dados?.contato?.horario && <p className="mt-4 text-white/85">{dados.contato.horario}</p>}
          </div>
          <div className="text-sm">
            <p className="mb-3 font-semibold">MENU</p>
            {LINKS.map(([h, r]) => (
              <a key={h} href={h} className="block py-1 text-white/90 hover:text-white">{r}</a>
            ))}
            {dados?.contato?.instagram && (
              <a
                href={`https://instagram.com/${dados.contato.instagram}`}
                target="_blank"
                rel="noreferrer"
                className="block py-1 text-white/90 hover:text-white"
              >
                Instagram @{dados.contato.instagram}
              </a>
            )}
            <Link to="/login" className="block py-1 text-white/90 hover:text-white">Área do funcionário</Link>
          </div>
        </div>
        <p className="border-t border-white/15 py-4 text-center text-xs text-white/80">
          New Box © {new Date().getFullYear()} Todos os direitos reservados.
        </p>
      </footer>

      <a
        href={linkWhatsapp(whatsapp || WHATSAPP_PADRAO, MENSAGEM_PADRAO)}
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
