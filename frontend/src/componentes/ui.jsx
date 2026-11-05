import { useEffect, useId, useRef } from "react";
import { IconeX } from "./Icones";

const estilosBotao = {
  primario: "bg-roxo text-white hover:bg-roxo-600 shadow-sm",
  secundario: "bg-white text-roxo ring-1 ring-roxo-200 hover:bg-roxo-50",
  perigo: "bg-white text-red-700 ring-1 ring-red-200 hover:bg-red-50",
  fantasma: "text-marinho-claro/80 hover:bg-roxo-50 hover:text-roxo",
};

export function Botao({ variante = "primario", carregando, className = "", children, ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${estilosBotao[variante]} ${className}`}
      disabled={carregando || props.disabled}
      {...props}
    >
      {carregando && <Girando />}
      {children}
    </button>
  );
}

export function Girando({ className = "size-4" }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-current border-r-transparent ${className}`}
      role="status"
      aria-label="Carregando"
    />
  );
}

export function Carregando({ texto = "Carregando..." }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-roxo">
      <Girando className="size-6" />
      <span className="text-sm text-marinho-claro/70">{texto}</span>
    </div>
  );
}

const estiloCampo =
  "block w-full rounded-md border bg-white px-3.5 py-2.5 text-sm text-marinho-claro placeholder:text-marinho-claro/40 transition focus:outline-none focus:ring-2";
const comErro = (erro) =>
  erro
    ? "border-red-400 focus:border-red-500 focus:ring-red-200"
    : "border-roxo-200 focus:border-roxo focus:ring-roxo-100";

function Rotulo({ id, rotulo, ajuda, erro, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-marinho-claro">
        {rotulo}
      </label>
      {children}
      {erro ? (
        <p className="mt-1.5 text-xs text-red-600">{erro}</p>
      ) : (
        ajuda && <p className="mt-1.5 text-xs text-marinho-claro/60">{ajuda}</p>
      )}
    </div>
  );
}

export function Campo({ rotulo, erro, ajuda, ...props }) {
  const id = useId();
  return (
    <Rotulo id={id} rotulo={rotulo} ajuda={ajuda} erro={erro}>
      <input id={id} className={`${estiloCampo} ${comErro(erro)}`} aria-invalid={!!erro} {...props} />
    </Rotulo>
  );
}

export function Selecao({ rotulo, erro, ajuda, children, ...props }) {
  const id = useId();
  return (
    <Rotulo id={id} rotulo={rotulo} ajuda={ajuda} erro={erro}>
      <select id={id} className={`${estiloCampo} ${comErro(erro)}`} aria-invalid={!!erro} {...props}>
        {children}
      </select>
    </Rotulo>
  );
}

export function Aviso({ tipo = "erro", children }) {
  if (!children) return null;
  const estilos = {
    erro: "border-red-200 bg-red-50 text-red-800",
    sucesso: "border-emerald-200 bg-emerald-50 text-emerald-800",
    info: "border-roxo-200 bg-roxo-50 text-roxo-700",
  };
  return (
    <div role={tipo === "erro" ? "alert" : "status"} className={`rounded-md border px-4 py-3 text-sm ${estilos[tipo]}`}>
      {children}
    </div>
  );
}

export function Etiqueta({ cor = "roxo", children }) {
  const estilos = {
    roxo: "bg-roxo-100 text-roxo-700",
    verde: "bg-emerald-100 text-emerald-800",
    cinza: "bg-slate-100 text-slate-700",
    amarelo: "bg-amber-100 text-amber-800",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${estilos[cor]}`}>
      {children}
    </span>
  );
}

export function Modal({ aberto, titulo, aoFechar, children, largura = "max-w-lg" }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberto && !d.open) d.showModal();
    if (!aberto && d.open) d.close();
  }, [aberto]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        aoFechar();
      }}
      onClick={(e) => e.target === ref.current && aoFechar()}
      className={`m-auto w-[calc(100%-2rem)] ${largura} rounded-xl bg-white p-0 shadow-2xl backdrop:bg-noite/60 backdrop:backdrop-blur-[2px]`}
    >
      {aberto && (
        <div className="p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <h2 className="text-lg font-semibold text-marinho">{titulo}</h2>
            <button onClick={aoFechar} className="-m-1 rounded p-1 text-marinho-claro/60 hover:text-roxo" aria-label="Fechar">
              <IconeX />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function Vazio({ icone: Icone, titulo, children }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {Icone && <Icone className="mb-4 size-12 text-roxo-300" strokeWidth={1.2} />}
      <p className="font-medium text-marinho">{titulo}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-marinho-claro/70">{children}</p>}
    </div>
  );
}

export function Cartao({ className = "", children }) {
  return <div className={`rounded-xl bg-white shadow-sm ring-1 ring-roxo-100 ${className}`}>{children}</div>;
}
