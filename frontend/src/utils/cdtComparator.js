// Colombian CDT Rates Comparator and Suggestion Utility
// Provides term filtering, ranking across entities, and net yield calculation.

import { BANK_PRESETS, getBankPreset, svgToDataUri } from "./bankPresets";

export const STANDARD_CDT_TERMS = [
  { days: 90, label: "90 Días (~3 Meses)", shortLabel: "90D" },
  { days: 180, label: "180 Días (~6 Meses)", shortLabel: "180D" },
  { days: 270, label: "270 Días (~9 Meses)", shortLabel: "270D" },
  { days: 360, label: "360 Días (1 Año)", shortLabel: "360D (1A)" },
  { days: 540, label: "540 Días (~1.5 Años)", shortLabel: "540D" },
  { days: 720, label: "720 Días (2 Años)", shortLabel: "720D (2A)" },
];

export const ALL_STANDARD_CDT_DAYS = [30, 60, 90, 120, 180, 270, 360, 540, 720, 1080];

export function getDefaultCdtDayBase(entityOrId = "") {
  const raw = typeof entityOrId === "string"
    ? entityOrId
    : `${entityOrId?.entityId || ""} ${entityOrId?.name || ""}`;
  const lower = String(raw || "").toLowerCase();
  if (lower.includes("ent_nu") || /\bnu\b/.test(lower) || lower.includes("mejorcdt") || lower.includes("koa")) {
    return 365;
  }
  const preset = getBankPreset(lower.replace(/^ent_|^preset_/, ""));
  if (preset && preset.id !== "generic" && preset.dayBase) {
    return preset.dayBase;
  }
  return 360;
}

// Fallback CDT tiers across Colombian & USD institutions when historical_rates is unavailable
const BUILTIN_CDT_BENCHMARKS = [
  {
    presetId: "koa",
    name: "KOA Compañía de Financiamiento",
    currency: "COP",
    dayBase: 365,
    tiers: [
      { min: 60, max: 119, rateEA: 11.40, label: "90 Días Digital KOA" },
      { min: 120, max: 239, rateEA: 12.40, label: "180 Días Digital KOA" },
      { min: 240, max: 329, rateEA: 12.60, label: "270 Días Digital KOA" },
      { min: 330, max: 450, rateEA: 12.90, label: "360 Días Digital KOA" },
      { min: 451, max: 999, rateEA: 13.10, label: "540+ Días Digital KOA" },
    ],
  },
  {
    presetId: "ban100",
    name: "Ban100",
    currency: "COP",
    dayBase: 360,
    tiers: [
      { min: 60, max: 120, rateEA: 11.20, label: "90 Días Digital" },
      { min: 121, max: 220, rateEA: 12.00, label: "180 Días Digital" },
      { min: 221, max: 999, rateEA: 12.50, label: "360 Días Digital" },
    ],
  },
  {
    presetId: "credifamilia",
    name: "Credifamilia",
    currency: "COP",
    dayBase: 360,
    tiers: [
      { min: 60, max: 120, rateEA: 11.10, label: "90 Días Digital" },
      { min: 121, max: 220, rateEA: 11.90, label: "180 Días Digital" },
      { min: 221, max: 999, rateEA: 12.40, label: "360 Días Digital" },
    ],
  },
  {
    presetId: "pibank",
    name: "Pibank",
    currency: "COP",
    dayBase: 365,
    tiers: [
      { min: 1, max: 120, rateEA: 11.00, label: "90 Días" },
      { min: 121, max: 220, rateEA: 11.50, label: "180 Días" },
      { min: 221, max: 999, rateEA: 11.80, label: "360 Días" },
    ],
  },
  {
    presetId: "mejorcdt",
    name: "MejorCDT",
    currency: "COP",
    dayBase: 365,
    tiers: [
      { min: 60, max: 119, rateEA: 10.80, label: "90 Días (KOA/Contactar)" },
      { min: 120, max: 239, rateEA: 11.80, label: "180 Días (KOA)" },
      { min: 240, max: 320, rateEA: 12.00, label: "270 Días (KOA)" },
      { min: 321, max: 450, rateEA: 12.30, label: "360 Días (KOA/Ban100)" },
      { min: 451, max: 650, rateEA: 12.10, label: "540 Días (KOA)" },
      { min: 651, max: 1080, rateEA: 11.90, label: "720 Días" },
    ],
  },
  {
    presetId: "serfinanza",
    name: "Banco Serfinanza",
    currency: "COP",
    dayBase: 360,
    tiers: [
      { min: 1, max: 120, rateEA: 11.50, label: "90 Días Digital" },
      { min: 121, max: 220, rateEA: 12.30, label: "180 Días Digital" },
      { min: 221, max: 999, rateEA: 12.80, label: "360 Días Digital" },
    ],
  },
  {
    presetId: "lulo",
    name: "Lulo Bank",
    currency: "COP",
    dayBase: 365,
    tiers: [
      { min: 1, max: 120, rateEA: 11.00, label: "90 Días" },
      { min: 121, max: 220, rateEA: 11.50, label: "180 Días" },
      { min: 221, max: 999, rateEA: 12.00, label: "360 Días" },
    ],
  },
  {
    presetId: "rappi",
    name: "RappiPay",
    currency: "COP",
    dayBase: 365,
    tiers: [
      { min: 1, max: 999, rateEA: 12.00, label: "CDT / Bóveda RappiPay" },
    ],
  },
  {
    presetId: "coltefinanciera",
    name: "Coltefinanciera",
    currency: "COP",
    dayBase: 360,
    tiers: [
      { min: 1, max: 120, rateEA: 10.70, label: "90 Días Coltefinanciera" },
      { min: 121, max: 220, rateEA: 11.40, label: "180 Días Coltefinanciera" },
      { min: 221, max: 999, rateEA: 11.90, label: "360 Días Coltefinanciera" },
    ],
  },
  {
    presetId: "mibanco",
    name: "Mibanco Colombia",
    currency: "COP",
    dayBase: 360,
    tiers: [
      { min: 1, max: 120, rateEA: 10.50, label: "90 Días Mibanco" },
      { min: 121, max: 220, rateEA: 11.20, label: "180 Días Mibanco" },
      { min: 221, max: 999, rateEA: 11.70, label: "360 Días Mibanco" },
    ],
  },
  {
    presetId: "pichincha",
    name: "Banco Pichincha",
    currency: "COP",
    dayBase: 360,
    tiers: [
      { min: 1, max: 120, rateEA: 10.40, label: "90 Días Pichincha" },
      { min: 121, max: 220, rateEA: 11.10, label: "180 Días Pichincha" },
      { min: 221, max: 999, rateEA: 11.60, label: "360 Días Pichincha" },
    ],
  },
  {
    presetId: "confiar",
    name: "Confiar Cooperativa",
    currency: "COP",
    dayBase: 360,
    tiers: [
      { min: 1, max: 120, rateEA: 10.50, label: "90 Días CDAT" },
      { min: 121, max: 220, rateEA: 11.20, label: "180 Días CDAT" },
      { min: 221, max: 999, rateEA: 11.50, label: "360 Días CDAT" },
    ],
  },
  {
    presetId: "bancoomeva",
    name: "Bancoomeva",
    currency: "COP",
    dayBase: 360,
    tiers: [
      { min: 1, max: 120, rateEA: 10.20, label: "90 Días Bancoomeva" },
      { min: 121, max: 220, rateEA: 10.90, label: "180 Días Bancoomeva" },
      { min: 221, max: 999, rateEA: 11.40, label: "360 Días Bancoomeva" },
    ],
  },
  {
    presetId: "finandina",
    name: "Banco Finandina",
    currency: "COP",
    dayBase: 365,
    tiers: [
      { min: 1, max: 45, rateEA: 9.50, label: "30 Días Digital" },
      { min: 46, max: 120, rateEA: 10.20, label: "90 Días Digital" },
      { min: 121, max: 220, rateEA: 10.80, label: "180 Días Digital" },
      { min: 221, max: 999, rateEA: 11.20, label: "360 Días Digital" },
    ],
  },
  {
    presetId: "nu",
    name: "Nu Colombia",
    currency: "COP",
    dayBase: 365,
    tiers: [
      { min: 60, max: 89, rateEA: 9.40, label: "60 Días" },
      { min: 90, max: 119, rateEA: 9.50, label: "90 Días" },
      { min: 120, max: 179, rateEA: 9.60, label: "120 Días" },
      { min: 180, max: 269, rateEA: 10.50, label: "180 Días" },
      { min: 270, max: 359, rateEA: 10.70, label: "270 Días" },
      { min: 360, max: 539, rateEA: 11.00, label: "1 Año (360d)" },
      { min: 540, max: 719, rateEA: 11.30, label: "1.5 Años (540d)" },
      { min: 720, max: 1079, rateEA: 11.30, label: "2 Años (720d)" },
      { min: 1080, max: 1080, rateEA: 11.00, label: "3 Años (1080d)" },
    ],
  },
  {
    presetId: "falabella",
    name: "Banco Falabella",
    currency: "COP",
    dayBase: 360,
    tiers: [
      { min: 1, max: 120, rateEA: 10.20, label: "90 Días" },
      { min: 121, max: 220, rateEA: 10.90, label: "180 Días" },
      { min: 221, max: 999, rateEA: 11.20, label: "360 Días" },
    ],
  },
  {
    presetId: "bancamia",
    name: "Bancamía",
    currency: "COP",
    dayBase: 360,
    tiers: [
      { min: 1, max: 120, rateEA: 10.10, label: "90 Días Bancamía" },
      { min: 121, max: 220, rateEA: 10.80, label: "180 Días Bancamía" },
      { min: 221, max: 999, rateEA: 11.10, label: "360 Días Bancamía" },
    ],
  },
  {
    presetId: "bbva",
    name: "BBVA Colombia",
    currency: "COP",
    dayBase: 360,
    tiers: [
      { min: 1, max: 120, rateEA: 10.10, label: "90 Días Online" },
      { min: 121, max: 220, rateEA: 10.70, label: "180 Días Online" },
      { min: 221, max: 999, rateEA: 11.00, label: "360 Días Online" },
    ],
  },
  {
    presetId: "davivienda",
    name: "Davivienda",
    currency: "COP",
    dayBase: 360,
    tiers: [
      { min: 1, max: 120, rateEA: 10.00, label: "90 Días Digital" },
      { min: 121, max: 220, rateEA: 10.70, label: "180 Días Digital" },
      { min: 221, max: 999, rateEA: 11.00, label: "360 Días Digital" },
    ],
  },
  {
    presetId: "cajasocial",
    name: "Banco Caja Social",
    currency: "COP",
    dayBase: 360,
    tiers: [
      { min: 1, max: 120, rateEA: 10.00, label: "90 Días Tasa Fija" },
      { min: 121, max: 220, rateEA: 10.60, label: "180 Días Tasa Fija" },
      { min: 221, max: 999, rateEA: 10.90, label: "360 Días Tasa Fija" },
    ],
  },
  {
    presetId: "popular",
    name: "Banco Popular",
    currency: "COP",
    dayBase: 360,
    tiers: [
      { min: 1, max: 120, rateEA: 9.90, label: "90 Días Popular" },
      { min: 121, max: 220, rateEA: 10.60, label: "180 Días Popular" },
      { min: 221, max: 999, rateEA: 10.80, label: "360 Días Popular" },
    ],
  },
  {
    presetId: "bancolombia",
    name: "Bancolombia",
    currency: "COP",
    dayBase: 360,
    tiers: [
      { min: 1, max: 120, rateEA: 9.80, label: "90 Días Tu360" },
      { min: 121, max: 220, rateEA: 10.50, label: "180 Días Tu360" },
      { min: 221, max: 999, rateEA: 10.80, label: "360 Días Tu360" },
    ],
  },
  {
    presetId: "bogota",
    name: "Banco de Bogotá",
    currency: "COP",
    dayBase: 360,
    tiers: [
      { min: 1, max: 120, rateEA: 9.80, label: "90 Días Digital" },
      { min: 121, max: 220, rateEA: 10.50, label: "180 Días Digital" },
      { min: 221, max: 999, rateEA: 10.80, label: "360 Días Digital" },
    ],
  },
  {
    presetId: "occidente",
    name: "Banco de Occidente",
    currency: "COP",
    dayBase: 360,
    tiers: [
      { min: 1, max: 120, rateEA: 9.80, label: "90 Días Tradicional" },
      { min: 121, max: 220, rateEA: 10.50, label: "180 Días Tradicional" },
      { min: 221, max: 999, rateEA: 10.80, label: "360 Días Tradicional" },
    ],
  },
  {
    presetId: "villas",
    name: "Banco AV Villas",
    currency: "COP",
    dayBase: 360,
    tiers: [
      { min: 1, max: 120, rateEA: 9.80, label: "90 Días Digital" },
      { min: 121, max: 220, rateEA: 10.50, label: "180 Días Digital" },
      { min: 221, max: 999, rateEA: 10.70, label: "360 Días Digital" },
    ],
  },
  {
    presetId: "scotiabank",
    name: "Scotiabank Colpatria",
    currency: "COP",
    dayBase: 360,
    tiers: [
      { min: 1, max: 120, rateEA: 9.70, label: "90 Días Digital" },
      { min: 121, max: 220, rateEA: 10.40, label: "180 Días Digital" },
      { min: 221, max: 999, rateEA: 10.70, label: "360 Días Digital" },
    ],
  },
  {
    presetId: "itau",
    name: "Banco Itaú",
    currency: "COP",
    dayBase: 360,
    tiers: [
      { min: 1, max: 120, rateEA: 9.60, label: "90 Días Itaú" },
      { min: 121, max: 220, rateEA: 10.30, label: "180 Días Itaú" },
      { min: 221, max: 999, rateEA: 10.60, label: "360 Días Itaú" },
    ],
  },
  {
    presetId: "bancoagrario",
    name: "Banco Agrario de Colombia",
    currency: "COP",
    dayBase: 360,
    tiers: [
      { min: 1, max: 120, rateEA: 9.50, label: "90 Días Agropecuario" },
      { min: 121, max: 220, rateEA: 10.20, label: "180 Días Agropecuario" },
      { min: 221, max: 999, rateEA: 10.50, label: "360 Días Agropecuario" },
    ],
  },
  {
    presetId: "plenti",
    name: "Plenti (Ahorros)",
    currency: "USD",
    dayBase: 365,
    tiers: [
      { min: 30, max: 89, rateEA: 5.50, label: "30 Días Plenti Lock" },
      { min: 90, max: 365, rateEA: 8.00, label: "90+ Días Plenti Lock" },
    ],
  },
  {
    presetId: "ibkr",
    name: "Interactive Brokers",
    currency: "USD",
    dayBase: 365,
    tiers: [
      { min: 1, max: 999, rateEA: 4.60, label: "US Treasury Bills" },
    ],
  },
];

export { BUILTIN_CDT_BENCHMARKS };

/**
 * Calculates net compound yield on a CDT / term deposit investment.
 * Formula: Interés Bruto = Capital * ((1 + rEA)^(days / dayBase) - 1)
 */
export function calculateCdtYield(capital, rateEA, termDays, reteFuentePct = 4.0, dayBase = 365) {
  const cap = Number(capital) || 0;
  const r = Number(rateEA) || 0;
  const d = Number(termDays) || 180;
  const rete = Number(reteFuentePct ?? 4.0);
  const base = Number(dayBase) || 365;

  if (cap <= 0 || r <= 0 || d <= 0) {
    return {
      grossYield: 0,
      reteFuenteAmount: 0,
      netYield: 0,
      totalPayout: cap,
    };
  }

  const factor = Math.pow(1 + r / 100, d / base) - 1;
  const grossYield = cap * factor;
  const reteFuenteAmount = grossYield * (rete / 100);
  const netYield = Math.max(0, grossYield - reteFuenteAmount);
  const totalPayout = cap + netYield;

  return {
    grossYield,
    reteFuenteAmount,
    netYield,
    totalPayout,
  };
}

/**
 * Returns a sorted ranking of CDT rates across Colombian & USD institutions for a given term.
 *
 * @param {number} termDays Desired investment horizon in days (e.g. 90, 180, 360).
 * @param {number} capital Investment capital for net yield simulation.
 * @param {object} historicalRates The historical rates database from the store.
 * @param {Array} portfolioEntities Entities already existing in the user's portfolio.
 * @param {string} currencyFilter 'COP' | 'USD' | 'ALL'
 */
export function getRankedCDTRates(
  termDays = 180,
  capital = 1000000,
  historicalRates = null,
  portfolioEntities = [],
  currencyFilter = "COP"
) {
  const term = Number(termDays) || 180;
  const simCapital = Number(capital) > 0 ? Number(capital) : 1000000;
  const entitiesDb = historicalRates?.entities || {};

  const bankEntries = [];

  const findTier = (tiers) => {
    if (!Array.isArray(tiers) || tiers.length === 0) return null;
    return tiers.find((t) => {
      const min = t.termDaysMin !== undefined ? t.termDaysMin : (t.min !== undefined ? t.min : 1);
      const max = t.termDaysMax !== undefined ? t.termDaysMax : (t.max !== undefined ? t.max : 9999);
      return term >= min && term <= max;
    }) || tiers[tiers.length - 1];
  };

  const seenCanonicalIds = new Set();

  const pushEntry = ({ rawId, nameHint, tiers, currencyHint, dayBaseHint }) => {
    const matchedTier = findTier(tiers);
    if (!matchedTier || !matchedTier.rateEA) return;

    const cleanId = String(rawId || "").replace(/^ent_|^preset_/, "");
    const presetById = getBankPreset(cleanId);
    const bp = presetById.id !== "generic" ? presetById : getBankPreset(nameHint || cleanId);
    const canonicalId = bp.id !== "generic" ? bp.id : cleanId;

    if (seenCanonicalIds.has(canonicalId)) return;
    seenCanonicalIds.add(canonicalId);

    const currency = currencyHint || bp?.currency || "COP";
    if (currencyFilter && currencyFilter !== "ALL" && currency !== currencyFilter) return;

    const existingEnt = portfolioEntities.find((e) => {
      const ePreset = getBankPreset(e.name);
      return (
        e.id === rawId ||
        e.id === `ent_${canonicalId}` ||
        (ePreset.id !== "generic" && ePreset.id === canonicalId) ||
        (e.name && bp?.name && e.name.toLowerCase() === bp.name.toLowerCase())
      );
    });

    const bankName = bp?.id !== "generic" ? bp.name : (nameHint || cleanId);
    const rateEA = Number(matchedTier.rateEA);
    const dayBase = dayBaseHint || getDefaultCdtDayBase(canonicalId);
    const calc = calculateCdtYield(simCapital, rateEA, term, 4.0, dayBase);

    bankEntries.push({
      key: `${canonicalId}_${rawId}`,
      entityId: existingEnt ? existingEnt.id : `preset_${canonicalId}`,
      isPreset: !existingEnt,
      inPortfolio: Boolean(existingEnt),
      bankName,
      currency,
      dayBase,
      tierLabel: matchedTier.label || `${term} Días`,
      rateEA,
      logoSvg: bp?.logoSvg || null,
      logoUrl: existingEnt?.logoUrl || (bp?.logoSvg ? svgToDataUri(bp.logoSvg) : null),
      color: existingEnt?.color || bp?.color || "#f59e0b",
      icon: existingEnt?.icon || bp?.icon || "🏦",
      suggestedName: `CDT ${bankName} ${term} Días`,
      netYield: calc.netYield,
      grossYield: calc.grossYield,
      totalPayout: calc.totalPayout,
      capital: simCapital,
      termDays: term,
    });
  };

  // 1. Process from historicalRates if available
  Object.entries(entitiesDb).forEach(([rawId, entData]) => {
    const cdtTiers = entData?.cdt_term_rates || [];
    if (cdtTiers.length === 0) return;
    pushEntry({
      rawId,
      nameHint: entData.name,
      tiers: cdtTiers,
      currencyHint: entData.currency,
      dayBaseHint: entData.dayBase,
    });
  });

  // 2. Add builtin benchmarks for banks not yet in historicalRates
  BUILTIN_CDT_BENCHMARKS.forEach((benchmark) => {
    pushEntry({
      rawId: benchmark.presetId,
      nameHint: benchmark.name,
      tiers: benchmark.tiers,
      currencyHint: benchmark.currency,
      dayBaseHint: benchmark.dayBase,
    });
  });

  // 3. Sort descending by rateEA
  bankEntries.sort((a, b) => b.rateEA - a.rateEA);

  // 4. Assign visual ranks & medals
  const ranked = bankEntries.map((item, index) => {
    let medal = null;
    if (index === 0) medal = "🥇";
    else if (index === 1) medal = "🥈";
    else if (index === 2) medal = "🥉";

    return {
      ...item,
      rank: index + 1,
      medal,
    };
  });

  return {
    termDays: term,
    capital: simCapital,
    rankedList: ranked,
    top3: ranked.slice(0, 3),
    bestOption: ranked[0] || null,
  };
}
