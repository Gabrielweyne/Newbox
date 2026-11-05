// Ícones de traço fino, no estilo dos ícones do site da Newbox.
const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

const Svg = ({ children, className = "size-5", ...p }) => (
  <svg viewBox="0 0 24 24" className={className} {...base} {...p}>
    {children}
  </svg>
);

export const IconeCaixa = (p) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="5" rx="1" />
    <path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4" />
  </Svg>
);
export const IconeCofre = (p) => (
  <Svg {...p}>
    <rect x="3" y="3" width="18" height="18" rx="1.5" />
    <circle cx="13" cy="12" r="3.5" />
    <path d="M13 8.5V10M6.5 8v8" />
  </Svg>
);
export const IconeChave = (p) => (
  <Svg {...p}>
    <circle cx="8" cy="15" r="4" />
    <path d="m11 12 9-9M17 6l3 3M14 9l2 2" />
  </Svg>
);
export const IconePessoas = (p) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5" />
  </Svg>
);
export const IconeCracha = (p) => (
  <Svg {...p}>
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <circle cx="12" cy="10" r="2.5" />
    <path d="M8 17a4 4 0 0 1 8 0M10 3v2h4V3" />
  </Svg>
);
export const IconeCasa = (p) => (
  <Svg {...p}>
    <path d="m3 11 9-7 9 7M5 9.5V20h14V9.5M10 20v-6h4v6" />
  </Svg>
);
export const IconeSair = (p) => (
  <Svg {...p}>
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10" />
  </Svg>
);
export const IconeMais = (p) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const IconeLapis = (p) => (
  <Svg {...p}>
    <path d="m4 20 1-4L16 5l3 3L8 19l-4 1ZM14 7l3 3" />
  </Svg>
);
export const IconeLixo = (p) => (
  <Svg {...p}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Svg>
);
export const IconeClipe = (p) => (
  <Svg {...p}>
    <path d="m20 11-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7" />
  </Svg>
);
export const IconeBusca = (p) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </Svg>
);
export const IconeX = (p) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);
export const IconeMenu = (p) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);
export const IconeCheck = (p) => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
);
export const IconeBloquear = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m6 6 12 12" />
  </Svg>
);
export const IconeDestravar = (p) => (
  <Svg {...p}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 7.5-2" />
  </Svg>
);
export const IconeSino = (p) => (
  <Svg {...p}>
    <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16ZM10 20a2 2 0 0 0 4 0" />
  </Svg>
);
export const IconeCalendario = (p) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15" rx="1.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Svg>
);
export const IconeSetaEsq = (p) => (
  <Svg {...p}>
    <path d="m15 5-7 7 7 7" />
  </Svg>
);
export const IconeSetaDir = (p) => (
  <Svg {...p}>
    <path d="m9 5 7 7-7 7" />
  </Svg>
);
export const IconeDinheiro = (p) => (
  <Svg {...p}>
    <rect x="2.5" y="6" width="19" height="12" rx="1.5" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M6 9.5v5M18 9.5v5" />
  </Svg>
);
