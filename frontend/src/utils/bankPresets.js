// Bank presets with vector SVG logos, brand colors, and payout modes for Colombia and Global

export const BANK_PRESETS = [
  {
    id: "nu",
    name: "Nu Colombia",
    country: "🇨🇴",
    currency: "COP",
    color: "#820ad1",
    icon: "💜",
    payoutFrequency: "daily",
    defaultRateEA: 9.35,
    suggestedProducts: ["Cajita Nu (Rendimientos)", "Cajita Ahorro Vacaciones", "Cajita Fondo Emergencias", "CDT Nu Congelada"],
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%"><rect width="100" height="100" rx="22" fill="#820ad1"/><path d="M28 66V34h9.2l12.4 19.8V34h8.8v32h-8.8L37.2 45.4V66H28zm36.8 0V43.6h8.8V66h-8.8zm0-27.2V34h8.8v4.8h-8.8z" fill="#ffffff"/></svg>`,
  },
  {
    id: "finandina",
    name: "Banco Finandina",
    country: "🇨🇴",
    currency: "COP",
    color: "#d10a5a",
    icon: "🌸",
    payoutFrequency: "monthly",
    defaultRateEA: 10.50,
    suggestedProducts: ["FlexiDigital +", "Bolsillo de Ahorro", "Cuenta de Ahorros Finandina", "CDT Digital Finandina"],
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%"><rect width="100" height="100" rx="22" fill="#d10a5a"/><path d="M25 32h50v9H35v10h35v9H35v18H25V32zm38 22l14 16H64l-9-11 5-5h3z" fill="#ffffff"/></svg>`,
  },
  {
    id: "lulo",
    name: "Lulo Bank",
    country: "🇨🇴",
    currency: "COP",
    color: "#00e575",
    icon: "🟢",
    payoutFrequency: "daily",
    defaultRateEA: 13.00,
    suggestedProducts: ["Lulo Cuenta", "Bolsillo Lulo", "Lulo Pro"],
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%"><rect width="100" height="100" rx="22" fill="#0f172a"/><circle cx="50" cy="50" r="32" fill="#00e575"/><text x="50" y="58" font-family="'JetBrains Mono', sans-serif" font-weight="900" font-size="28" fill="#0f172a" text-anchor="middle">L</text></svg>`,
  },
  {
    id: "pibank",
    name: "Pibank",
    country: "🇨🇴",
    currency: "COP",
    color: "#002d72",
    icon: "🔵",
    payoutFrequency: "daily",
    defaultRateEA: 12.00,
    suggestedProducts: ["Cuenta Remunerada Pibank", "CDT Pibank"],
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%"><rect width="100" height="100" rx="22" fill="#002d72"/><text x="50" y="60" font-family="'JetBrains Mono', sans-serif" font-weight="900" font-size="32" fill="#ffffff" text-anchor="middle">π</text></svg>`,
  },
  {
    id: "rappi",
    name: "RappiPay",
    country: "🇨🇴",
    currency: "COP",
    color: "#ff441f",
    icon: "🧡",
    payoutFrequency: "daily",
    defaultRateEA: 10.00,
    suggestedProducts: ["Cuenta RappiPay (Principal)", "Impresora (Bolsillo)", "Fondo de emergencia", "Bóveda RappiCuenta"],
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%"><rect width="100" height="100" rx="22" fill="#ff441f"/><path d="M28 35h24c8 0 14 5 14 13s-6 13-14 13H40v13H28V35zm12 18h11c3.5 0 6-2 6-5s-2.5-5-6-5H40v10z" fill="#ffffff"/></svg>`,
  },
  {
    id: "nequi",
    name: "Nequi",
    country: "🇨🇴",
    currency: "COP",
    color: "#20002c",
    icon: "🟣",
    payoutFrequency: "monthly",
    defaultRateEA: 0.0,
    suggestedProducts: ["Disponible Nequi", "Colchón Nequi", "Bolsillo Nequi", "Metas Nequi"],
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%"><rect width="100" height="100" rx="22" fill="#20002c"/><path d="M30 32h14v22l18-22h18L58 54l22 24H62L44 58v20H30V32z" fill="#ff0080"/></svg>`,
  },
  {
    id: "daviplata",
    name: "Daviplata",
    country: "🇨🇴",
    currency: "COP",
    color: "#ed1c24",
    icon: "📲",
    payoutFrequency: "monthly",
    defaultRateEA: 0.0,
    suggestedProducts: ["Daviplata Principal", "Bolsillo Daviplata"],
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%"><rect width="100" height="100" rx="22" fill="#ed1c24"/><circle cx="50" cy="50" r="28" fill="#ffffff"/><path d="M42 36h12c7 0 12 4 12 10s-5 10-12 10h-6v10H42V36zm6 14h6c3 0 5-1.5 5-4s-2-4-5-4h-6v8z" fill="#ed1c24"/></svg>`,
  },
  {
    id: "uala",
    name: "Ualá Colombia",
    country: "🇨🇴",
    currency: "COP",
    color: "#e80234",
    icon: "🔴",
    payoutFrequency: "daily",
    defaultRateEA: 13.00,
    suggestedProducts: ["Cuenta Ualá Rendimientos"],
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%"><rect width="100" height="100" rx="22" fill="#e80234"/><text x="50" y="62" font-family="'JetBrains Mono', sans-serif" font-weight="900" font-size="36" fill="#ffffff" text-anchor="middle">U</text></svg>`,
  },
  {
    id: "cajasocial",
    name: "Banco Caja Social",
    country: "🇨🇴",
    currency: "COP",
    color: "#004b93",
    icon: "🤝",
    payoutFrequency: "monthly",
    defaultRateEA: 9.25,
    suggestedProducts: ["Cuentamiga", "Cuenta de Ahorros Amiga", "Cuentamiga Para Alcance de Sueños", "Rendicuenta", "CDT Tasa Fija Caja Social"],
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%"><rect width="100" height="100" rx="22" fill="#004b93"/><circle cx="50" cy="50" r="30" fill="none" stroke="#f37021" stroke-width="6"/><text x="50" y="58" font-family="'Inter', -apple-system, sans-serif" font-weight="900" font-size="22" fill="#ffffff" text-anchor="middle">BCS</text></svg>`,
  },
  {
    id: "bancolombia",
    name: "Bancolombia",
    country: "🇨🇴",
    currency: "COP",
    color: "#fdcb02",
    icon: "🟡",
    payoutFrequency: "monthly",
    defaultRateEA: 9.50,
    suggestedProducts: ["Bolsillo Bancolombia", "Cuenta de Ahorros Libre", "A la Mano", "CDT Virtual Bancolombia"],
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%"><rect width="100" height="100" rx="22" fill="#18181b"/><path d="M25 45c12-16 38-16 50 0M25 55c12 16 38 16 50 0" stroke="#fdcb02" stroke-width="8" stroke-linecap="round" fill="none"/></svg>`,
  },
  {
    id: "davivienda",
    name: "Davivienda",
    country: "🇨🇴",
    currency: "COP",
    color: "#ed1c24",
    icon: "🏠",
    payoutFrequency: "monthly",
    defaultRateEA: 9.00,
    suggestedProducts: ["Bolsillo Davivienda", "Cuenta Móvil Davivienda", "Cuenta Rentable", "CDT Digital Davivienda"],
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%"><rect width="100" height="100" rx="22" fill="#ed1c24"/><path d="M50 25L24 46h8v28h36V46h8L50 25zm0 18a6 6 0 110 12 6 6 0 010-12z" fill="#ffffff"/></svg>`,
  },
  {
    id: "bogota",
    name: "Banco de Bogotá",
    country: "🇨🇴",
    currency: "COP",
    color: "#003882",
    icon: "🏛️",
    payoutFrequency: "monthly",
    defaultRateEA: 9.00,
    suggestedProducts: ["Cuenta Libre Ahorro", "Cuenta Rentahorro", "Bolsillos Ahorro", "CDT Digital"],
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%"><rect width="100" height="100" rx="22" fill="#003882"/><path d="M30 68V32h16c8 0 14 4 14 10 0 4-2 7-6 8 5 1 8 5 8 10 0 5-6 8-14 8H30zm10-22h7c3 0 5-1.5 5-4s-2-4-5-4h-7v8zm0 14h8c4 0 6-1.5 6-4s-2-4-6-4h-8v8z" fill="#ffffff"/><circle cx="70" cy="36" r="6" fill="#ffd100"/></svg>`,
  },
  {
    id: "bbva",
    name: "BBVA Colombia",
    country: "🇨🇴",
    currency: "COP",
    color: "#004481",
    icon: "🔷",
    payoutFrequency: "monthly",
    defaultRateEA: 9.20,
    suggestedProducts: ["Cuenta Online BBVA", "Cuenta Nómina Blue", "CDT Digital BBVA"],
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%"><rect width="100" height="100" rx="22" fill="#004481"/><text x="50" y="58" font-family="'Inter', 'Arial Black', sans-serif" font-weight="900" font-size="22" fill="#ffffff" letter-spacing="1" text-anchor="middle">BBVA</text></svg>`,
  },
  {
    id: "scotiabank",
    name: "Scotiabank Colpatria",
    country: "🇨🇴",
    currency: "COP",
    color: "#ec111a",
    icon: "🔴",
    payoutFrequency: "monthly",
    defaultRateEA: 8.50,
    suggestedProducts: ["Cuenta Cero", "Cuenta Ahorro Más", "CDT Digital Colpatria"],
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%"><rect width="100" height="100" rx="22" fill="#ec111a"/><circle cx="50" cy="50" r="28" fill="none" stroke="#ffffff" stroke-width="7"/><path d="M35 52c4-8 12-10 16-6 4 4 2 10 7 12 5 2 9-1 10-4" stroke="#ffffff" stroke-width="6" stroke-linecap="round" fill="none"/></svg>`,
  },
  {
    id: "occidente",
    name: "Banco de Occidente",
    country: "🇨🇴",
    currency: "COP",
    color: "#003974",
    icon: "🌲",
    payoutFrequency: "monthly",
    defaultRateEA: 8.80,
    suggestedProducts: ["Cuenta Ahorro Activo", "Cuenta Ahorro Preferencial", "CDT Occidente"],
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%"><rect width="100" height="100" rx="22" fill="#003974"/><path d="M26 50a24 24 0 1 0 48 0 24 24 0 1 0-48 0z" fill="none" stroke="#00a850" stroke-width="7"/><path d="M38 50a12 12 0 1 0 24 0 12 12 0 1 0-24 0z" fill="#ffffff"/></svg>`,
  },
  {
    id: "villas",
    name: "Banco AV Villas",
    country: "🇨🇴",
    currency: "COP",
    color: "#e30613",
    icon: "🏠",
    payoutFrequency: "monthly",
    defaultRateEA: 8.75,
    suggestedProducts: ["Cuenta Ahorro Fácil", "Bolsillos AV Villas", "CDT Digital AV Villas"],
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%"><rect width="100" height="100" rx="22" fill="#e30613"/><path d="M50 24L26 44h8v28h32V44h8L50 24z" fill="#ffd100"/><text x="50" y="62" font-family="'Inter', sans-serif" font-weight="900" font-size="16" fill="#e30613" text-anchor="middle">AV</text></svg>`,
  },
  {
    id: "popular",
    name: "Banco Popular",
    country: "🇨🇴",
    currency: "COP",
    color: "#007a3d",
    icon: "🟢",
    payoutFrequency: "monthly",
    defaultRateEA: 9.00,
    suggestedProducts: ["Cuenta Diamante", "Cuenta Expreso", "CDT Popular"],
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%"><rect width="100" height="100" rx="22" fill="#007a3d"/><circle cx="50" cy="50" r="28" fill="#ffd100"/><text x="50" y="60" font-family="'Inter', sans-serif" font-weight="900" font-size="26" fill="#007a3d" text-anchor="middle">BP</text></svg>`,
  },
  {
    id: "itau",
    name: "Banco Itaú",
    country: "🇨🇴",
    currency: "COP",
    color: "#ec7000",
    icon: "🟧",
    payoutFrequency: "monthly",
    defaultRateEA: 8.50,
    suggestedProducts: ["Cuenta Ahorros Itaú", "Cuenta Personal Bank", "CDT Digital Itaú"],
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%"><rect width="100" height="100" rx="22" fill="#ec7000"/><rect x="22" y="22" width="56" height="56" rx="14" fill="#003399"/><text x="50" y="58" font-family="'Inter', sans-serif" font-weight="900" font-size="20" fill="#ffd100" text-anchor="middle">itaú</text></svg>`,
  },
  {
    id: "falabella",
    name: "Banco Falabella",
    country: "🇨🇴",
    currency: "COP",
    color: "#439539",
    icon: "💳",
    payoutFrequency: "monthly",
    defaultRateEA: 10.00,
    suggestedProducts: ["Cuenta PAC Ahorro", "Cuenta Débito Costo Cero", "CDT Falabella"],
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%"><rect width="100" height="100" rx="22" fill="#439539"/><text x="50" y="62" font-family="'Inter', sans-serif" font-weight="900" font-size="34" fill="#ffffff" text-anchor="middle">f</text></svg>`,
  },
  {
    id: "bancoagrario",
    name: "Banco Agrario de Colombia",
    country: "🇨🇴",
    currency: "COP",
    color: "#00593b",
    icon: "🌱",
    payoutFrequency: "monthly",
    defaultRateEA: 8.00,
    suggestedProducts: ["Cuenta Tradicional Ahorro", "Cuenta RentaFácil", "CDT Agropecuario"],
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%"><rect width="100" height="100" rx="22" fill="#00593b"/><path d="M50 26c-12 14-8 32 0 48 8-16 12-34 0-48z" fill="#8dc63f"/><path d="M50 74V42" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/></svg>`,
  },
  {
    id: "bancamia",
    name: "Bancamía",
    country: "🇨🇴",
    currency: "COP",
    color: "#009540",
    icon: "🌾",
    payoutFrequency: "monthly",
    defaultRateEA: 9.50,
    suggestedProducts: ["Cuenta Ahorro Plazo", "CDT Bancamía"],
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%"><rect width="100" height="100" rx="22" fill="#009540"/><text x="50" y="58" font-family="'Inter', sans-serif" font-weight="900" font-size="22" fill="#ffffff" text-anchor="middle">MÍA</text></svg>`,
  },
  {
    id: "confiar",
    name: "Confiar Cooperativa",
    country: "🇨🇴",
    currency: "COP",
    color: "#e8175d",
    icon: "🤝",
    payoutFrequency: "monthly",
    defaultRateEA: 10.50,
    suggestedProducts: ["Ahorro a la Vista", "Ahorro Programado", "CDAT Confiar"],
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%"><rect width="100" height="100" rx="22" fill="#e8175d"/><text x="50" y="58" font-family="'Inter', sans-serif" font-weight="900" font-size="18" fill="#ffffff" text-anchor="middle">CONFIAR</text></svg>`,
  },
  {
    id: "serfinanza",
    name: "Banco Serfinanza",
    country: "🇨🇴",
    currency: "COP",
    color: "#005aa9",
    icon: "💎",
    payoutFrequency: "monthly",
    defaultRateEA: 11.00,
    suggestedProducts: ["Cuenta Ahorro Serfinanza", "CDT Serfinanza"],
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%"><rect width="100" height="100" rx="22" fill="#005aa9"/><text x="50" y="60" font-family="'JetBrains Mono', sans-serif" font-weight="900" font-size="30" fill="#ffffff" text-anchor="middle">BS</text></svg>`,
  },
  {
    id: "mejorcdt",
    name: "MejorCDT",
    country: "🇨🇴",
    currency: "COP",
    color: "#00c48c",
    icon: "📜",
    payoutFrequency: "at_maturity",
    defaultRateEA: 11.50,
    suggestedProducts: ["CDT Multibanco MejorCDT"],
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%"><rect width="100" height="100" rx="22" fill="#0b2922"/><path d="M28 66V34l22 18 22-18v32h-8V47.5L50 60.5 36 47.5V66h-8z" fill="#00c48c"/></svg>`,
  },
  {
    id: "plenti",
    name: "Plenti (Ahorros)",
    country: "🇺🇸",
    currency: "USD",
    color: "#7c3aed",
    icon: "🟣",
    payoutFrequency: "daily",
    defaultRateEA: 4.00,
    suggestedProducts: ["Bolsillo a la Vista Plenti USD", "Plenti Lock USD"],
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%"><rect width="100" height="100" rx="22" fill="#1e1b4b"/><circle cx="50" cy="50" r="30" fill="#7c3aed"/><text x="50" y="60" font-family="'JetBrains Mono', sans-serif" font-weight="900" font-size="32" fill="#ffffff" text-anchor="middle">P</text></svg>`,
  },
  {
    id: "plenti_gold",
    name: "Plenti (Oro Cripto / PAXG)",
    country: "🇺🇸",
    currency: "USD",
    color: "#d4af37",
    icon: "🟡",
    payoutFrequency: "daily",
    defaultRateEA: 8.00,
    suggestedProducts: ["Bolsillo Rendimiento Oro (PAXG)"],
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%"><rect width="100" height="100" rx="22" fill="#292524"/><path d="M30 65l10-30h20l10 30H30z" fill="#f59e0b"/><polygon points="40,35 60,35 55,48 45,48" fill="#fbbf24"/><text x="50" y="60" font-family="'JetBrains Mono', sans-serif" font-weight="900" font-size="14" fill="#78350f" text-anchor="middle">GOLD</text></svg>`,
  },
  {
    id: "ibkr",
    name: "Interactive Brokers",
    country: "🇺🇸",
    currency: "USD",
    color: "#d9272e",
    icon: "📈",
    payoutFrequency: "monthly",
    defaultRateEA: 4.58,
    suggestedProducts: ["Efectivo USD Rendimiento IBKR"],
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%"><rect width="100" height="100" rx="22" fill="#1e293b"/><rect x="25" y="25" width="50" height="50" rx="8" fill="#d9272e"/><text x="50" y="58" font-family="'JetBrains Mono', sans-serif" font-weight="900" font-size="20" fill="#ffffff" text-anchor="middle">IBKR</text></svg>`,
  },
  {
    id: "arq",
    name: "ARQ Finance",
    country: "🌎",
    currency: "USD",
    color: "#10b981",
    icon: "💳",
    payoutFrequency: "daily",
    defaultRateEA: 3.50,
    suggestedProducts: ["Cuenta Ahorros Dólares ARQ"],
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%"><rect width="100" height="100" rx="22" fill="#064e3b"/><text x="50" y="60" font-family="'JetBrains Mono', sans-serif" font-weight="900" font-size="28" fill="#34d399" text-anchor="middle">ARQ</text></svg>`,
  },
  {
    id: "lemon",
    name: "Lemon Cash",
    country: "🌎",
    currency: "USD",
    color: "#84cc16",
    icon: "🍋",
    payoutFrequency: "weekly",
    defaultRateEA: 5.00,
    suggestedProducts: ["Billetera Rendimientos Cripto/USD"],
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%"><rect width="100" height="100" rx="22" fill="#14532d"/><text x="50" y="60" font-family="'JetBrains Mono', sans-serif" font-weight="900" font-size="26" fill="#a3e635" text-anchor="middle">LEMON</text></svg>`,
  },
];

/**
 * Normalizer for robust accent-insensitive bank matching
 */
function normalizeStr(s = "") {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Resolve bank preset by name or id with comprehensive aliases
 */
export function getBankPreset(nameOrId = "") {
  const raw = String(nameOrId || "").trim();
  const q = normalizeStr(raw);
  if (!q) {
    return {
      id: "generic",
      name: "Entidad Financiera",
      country: "🇨🇴",
      currency: "COP",
      color: "#38bdf8",
      icon: "🏛️",
      payoutFrequency: "daily",
      defaultRateEA: 9.30,
      suggestedProducts: [],
      logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%"><rect width="100" height="100" rx="22" fill="#38bdf8"/><text x="50" y="60" font-size="36" text-anchor="middle">🏛️</text></svg>`,
    };
  }

  // Exact or alias checks for specific banks
  if (q.includes("nequi")) {
    return BANK_PRESETS.find((p) => p.id === "nequi") || BANK_PRESETS[0];
  }
  if (q.includes("daviplata") || q.includes("davi plata")) {
    return BANK_PRESETS.find((p) => p.id === "daviplata") || BANK_PRESETS[0];
  }
  if (q.includes("cajasocial") || q.includes("bcs") || (q.includes("caja") && q.includes("social"))) {
    return BANK_PRESETS.find((p) => p.id === "cajasocial") || BANK_PRESETS[0];
  }
  if (q.includes("colpatria") || q.includes("scotiabank")) {
    return BANK_PRESETS.find((p) => p.id === "scotiabank") || BANK_PRESETS[0];
  }
  if (q.includes("avvillas") || q.includes("villas")) {
    return BANK_PRESETS.find((p) => p.id === "villas") || BANK_PRESETS[0];
  }
  if (q.includes("bogota")) {
    return BANK_PRESETS.find((p) => p.id === "bogota") || BANK_PRESETS[0];
  }
  if (q.includes("occidente")) {
    return BANK_PRESETS.find((p) => p.id === "occidente") || BANK_PRESETS[0];
  }
  if (q.includes("popular")) {
    return BANK_PRESETS.find((p) => p.id === "popular") || BANK_PRESETS[0];
  }
  if (q.includes("bbva")) {
    return BANK_PRESETS.find((p) => p.id === "bbva") || BANK_PRESETS[0];
  }
  if (q.includes("itau")) {
    return BANK_PRESETS.find((p) => p.id === "itau") || BANK_PRESETS[0];
  }
  if (q.includes("falabella")) {
    return BANK_PRESETS.find((p) => p.id === "falabella") || BANK_PRESETS[0];
  }
  if (q.includes("agrario")) {
    return BANK_PRESETS.find((p) => p.id === "bancoagrario") || BANK_PRESETS[0];
  }
  if (q.includes("bancamia") || q.includes("mia")) {
    return BANK_PRESETS.find((p) => p.id === "bancamia") || BANK_PRESETS[0];
  }
  if (q.includes("confiar")) {
    return BANK_PRESETS.find((p) => p.id === "confiar") || BANK_PRESETS[0];
  }

  for (const p of BANK_PRESETS) {
    const pId = normalizeStr(p.id);
    const pName = normalizeStr(p.name);
    if (pId === q || pName === q || pName.includes(q) || q.includes(pId) || q.includes(pName)) {
      return p;
    }
  }

  // Default fallback
  return {
    id: "generic",
    name: raw || "Entidad Financiera",
    country: "🇨🇴",
    currency: "COP",
    color: "#38bdf8",
    icon: "🏛️",
    payoutFrequency: "daily",
    defaultRateEA: 9.30,
    suggestedProducts: [],
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%"><rect width="100" height="100" rx="22" fill="#38bdf8"/><text x="50" y="60" font-size="36" text-anchor="middle">🏛️</text></svg>`,
  };
}

/**
 * Convert SVG string to data URI
 */
export function svgToDataUri(svgString) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svgString)}`;
}

/**
 * Automatically compute missing monthly interest payout transactions for monthly payout accounts (e.g. Finandina)
 */
export function computeMissingMonthlyYieldTransactions(account, allAccountTransactions = [], historicalRates = {}) {
  if (!account) return [];

  // Filter existing txs
  const accTx = allAccountTransactions.filter(
    (t) => (t.accountId ? t.accountId === account.id : (t.description || "").toLowerCase().includes(account.name.toLowerCase()))
  );

  if (accTx.length === 0) return [];

  // Sort chronologically
  const sortedTx = [...accTx].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const startDateStr = sortedTx[0].date;
  const startDate = new Date(startDateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Group manual movements by date
  const txByDate = {};
  const existingPayoutMonths = new Set();

  for (const t of sortedTx) {
    const d = t.date || new Date().toISOString().slice(0, 10);
    const amt = Math.abs(Number(t.amount || 0));
    const descLower = (t.description || "").toLowerCase();

    // Check if this transaction is already a monthly interest payout
    if (descLower.includes("rendimiento mensual") || descLower.includes("interés mensual") || t.isInterestPayout) {
      existingPayoutMonths.add(d.slice(0, 7)); // 'YYYY-MM'
      continue;
    }

    const isDebit =
      t.type === "debit" ||
      descLower.includes("retiraste") ||
      descLower.includes("retiro") ||
      descLower.includes("invertiste") ||
      Number(t.amount) < 0;

    const change = isDebit ? -amt : amt;
    txByDate[d] = (txByDate[d] || 0) + change;
  }

  const getSavingsRate = (entityId, dStr) => {
    if (Array.isArray(account.rateHistory) && account.rateHistory.length > 0) {
      const sortedRH = [...account.rateHistory].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
      let activeR = null;
      for (const rh of sortedRH) {
        if (rh.date && dStr >= rh.date) activeR = Number(rh.rateEA);
      }
      if (activeR !== null && activeR > 0) return activeR;
    }
    const rates =
      historicalRates?.entities?.[entityId]?.savings_rates ||
      (entityId === "ent_1786771791285" ? historicalRates?.entities?.ent_finandina?.savings_rates : null);
    if (rates && rates.length > 0) {
      for (const r of rates) {
        if (dStr >= r.from && dStr <= r.to) return Number(r.rateEA || account.interestRateEA || 9.30);
      }
    }
    return Number(account.interestRateEA || 9.30);
  };

  let currBalance = 0;
  let currDate = new Date(startDate);
  let currMonthStr = "";
  let currMonthInterest = 0;

  const generatedPayouts = [];

  while (currDate <= today) {
    const dStr = currDate.toISOString().slice(0, 10);
    const mStr = dStr.slice(0, 7); // 'YYYY-MM'

    // Month boundary check
    if (mStr !== currMonthStr) {
      if (currMonthStr && currMonthInterest > 0.01) {
        // Did we already have a payout recorded for this month?
        if (!existingPayoutMonths.has(currMonthStr)) {
          // Last day of that month
          const [yr, mo] = currMonthStr.split("-").map(Number);
          const lastDayOfPrevMonth = new Date(yr, mo, 0).toISOString().slice(0, 10);
          const monthLabel = new Date(yr, mo - 1, 1).toLocaleDateString("es-CO", { month: "short", year: "numeric" });

          generatedPayouts.push({
            id: `tx_monthly_yield_${account.id}_${currMonthStr}`,
            accountId: account.id,
            date: lastDayOfPrevMonth,
            description: `Rendimiento Mensual ${account.name} (${monthLabel})`,
            amount: Number(currMonthInterest.toFixed(2)),
            currency: account.currency || "COP",
            type: "credit",
            isInterestPayout: true,
            createdAt: new Date().toISOString(),
          });
        }
        // Capitalize for subsequent compounding
        currBalance += currMonthInterest;
      }
      currMonthStr = mStr;
      currMonthInterest = 0;
    }

    // Process movements of the day
    if (txByDate[dStr]) {
      currBalance = Math.max(0, currBalance + txByDate[dStr]);
    }

    // Daily interest accumulation (base 360)
    const rateEA = getSavingsRate(account.entityId, dStr);
    const dailyRate = Math.pow(1 + rateEA / 100, 1 / 360) - 1;
    currMonthInterest += currBalance * dailyRate;

    currDate.setDate(currDate.getDate() + 1);
  }

  return generatedPayouts;
}
