import { useEffect, useState } from "react";

/*
 * O canguru da logo da Newbox pulando pela tela toda vez que alguém conclui uma
 * ação (salvar, alugar, registrar pagamento...). Quem preferir pode desligar no
 * rodapé. Respeita "reduzir movimento" do sistema: aí ele só aparece e some.
 */

const CHAVE = "newbox:canguru";
export const EVENTO_ACAO = "newbox:acao";

export function canguruLigado() {
  try {
    return localStorage.getItem(CHAVE) !== "desligado";
  } catch {
    return true;
  }
}

export function ligarCanguru(ligado) {
  try {
    localStorage.setItem(CHAVE, ligado ? "ligado" : "desligado");
  } catch {
    /* sem armazenamento: fica ligado */
  }
}

/** O canguru da logo (mãe com o filhote na bolsa), em traço. */
export function DesenhoCanguru({ className = "" }) {
  return (
    <svg viewBox="-2 -2 66 62" className={className} aria-hidden="true">
      <g fill="none" stroke="#965ba5" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M48.5 15 V20 C48.5 22 46 22.5 41 23 C33 24 29.5 30 28 38 C27 46 24.5 52.5 16 53.5 C10 54 4 54 0.5 54" />
        <path d="M40 36 H47 C49 36 50 38 49 40.5 L36 49 C34.5 50 34.5 51 34.5 52 V55 H55" />
      </g>
      <g fill="#965ba5">
        <path d="M44 1.5 C44 0.2 46 0 46.6 1.3 L49 6.5 L51.5 1.3 C52 0 54 0.3 53.6 1.8 L51.8 7 C55 7.3 59.5 8.5 60 11 C60.4 13.2 57.5 14.3 55 14 C52.5 13.8 50.5 15.5 48.5 15 C46.8 14.6 46.5 12 47.3 9.5 Z" />
        <path d="M47.2 28.6 C47 27.6 48.3 27.3 48.7 28.2 L49.6 30.2 L50.6 28.4 C51 27.6 52.2 28 51.9 29 L51.3 30.8 C53 31 54.6 31.8 54.6 33.1 C54.6 34.4 52.8 35 51.4 34.8 C50 34.6 48.4 35.4 47.6 34.6 C46.9 33.8 47.3 32.2 48 31.2 Z" />
      </g>
      <circle cx="54.5" cy="10.6" r="1.1" fill="#ffffff" />
    </svg>
  );
}

/** Fica escutando as ações e solta o canguru. Vai uma vez no layout da área do funcionário. */
export default function CanguruPulando() {
  const [vez, setVez] = useState(0); // muda a cada ação para reiniciar a animação

  useEffect(() => {
    let timer;
    const pular = () => {
      if (!canguruLigado()) return;
      setVez((v) => v + 1);
      clearTimeout(timer);
      timer = setTimeout(() => setVez(0), 1900);
    };
    window.addEventListener(EVENTO_ACAO, pular);
    return () => {
      window.removeEventListener(EVENTO_ACAO, pular);
      clearTimeout(timer);
    };
  }, []);

  if (!vez) return null;
  return (
    <div key={vez} className="canguru-trajeto pointer-events-none fixed bottom-5 left-5 z-50" aria-hidden="true">
      <div className="canguru-pulo">
        <DesenhoCanguru className="h-20 w-auto drop-shadow-[0_2px_0_#fff]" />
      </div>
      <div className="canguru-sombra mx-auto -mt-1 h-2 w-14 rounded-full bg-marinho/15" />
    </div>
  );
}

/** Liga/desliga, para o rodapé. */
export function BotaoCanguru() {
  const [ligado, setLigado] = useState(canguruLigado);
  return (
    <button
      type="button"
      onClick={() => {
        ligarCanguru(!ligado);
        setLigado(!ligado);
        if (!ligado) setTimeout(() => window.dispatchEvent(new Event(EVENTO_ACAO)), 50);
      }}
      className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs text-white hover:bg-white/25"
      aria-pressed={ligado}
    >
      <span aria-hidden="true">🦘</span> Canguru animado: {ligado ? "ligado" : "desligado"}
    </button>
  );
}
