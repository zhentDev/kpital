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

// Fallback CDT tiers if historical_rates data is not loaded yet
const BUILTIN_CDT_BENCHMARKS = [
  {
    presetId: "pibank",
    name: "Pibank",
    tiers: [
      { min: 1, max: 120, rateEA: 11.00, label: "90 Días" },
      { min: 121, max: 220, rateEA: 11.50, label: "180 Días" },
      { min: 221, max: 999, rateEA: 13.00, label: "360 Días" },
    ],
  },
  {
    presetId: "mejorcdt",
    name: "MejorCDT (Aliados)",
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
    presetId: "finandina",
    name: "Banco Finandina",
    tiers: [
      { min: 1, max: 45, rateEA: 9.50, label: "30 Días Digital" },
      { min: 46, max: 120, rateEA: 10.20, label: "90 Días Digital" },
      { min: 121, max: 220, rateEA: 10.80, label: "180 Días Digital" },
      { min: 221, max: 999, rateEA: 11.20, label: "360 Días Digital" },
    ],
  },
  {
    presetId: "nu",
    name: "Nu Colombia (Congelada)",
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
    presetId: "serfinanza",
    name: "Banco Serfinanza",
    tiers: [
      { min: 1, max: 120, rateEA: 11.50, label: "90 Días Digital" },
      { min: 121, max: 220, rateEA: 12.30, label: "180 Días Digital" },
      { min: 221, max: 999, rateEA: 12.80, label: "360 Días Digital" },
    ],
  },
  {
    presetId: "lulo",
    name: "Lulo Bank",
    tiers: [
      { min: 1, max: 120, rateEA: 11.00, label: "90 Días" },
      { min: 121, max: 220, rateEA: 11.50, label: "180 Días" },
      { min: 221, max: 999, rateEA: 12.00, label: "360 Días" },
    ],
  },
  {
    presetId: "falabella",
    name: "Banco Falabella",
    tiers: [
      { min: 1, max: 120, rateEA: 10.20, label: "90 Días" },
      { min: 121, max: 220, rateEA: 10.90, label: "180 Días" },
      { min: 221, max: 999, rateEA: 11.20, label: "360 Días" },
    ],
  },
  {
    presetId: "cajasocial",
    name: "Banco Caja Social",
    tiers: [
      { min: 1, max: 120, rateEA: 10.00, label: "90 Días Tasa Fija" },
      { min: 121, max: 220, rateEA: 10.60, label: "180 Días Tasa Fija" },
      { min: 221, max: 999, rateEA: 10.90, label: "360 Días Tasa Fija" },
    ],
  },
  {
    presetId: "davivienda",
    name: "Davivienda",
    tiers: [
      { min: 1, max: 120, rateEA: 10.00, label: "90 Días Digital" },
      { min: 121, max: 220, rateEA: 10.70, label: "180 Días Digital" },
      { min: 221, max: 999, rateEA: 11.00, label: "360 Días Digital" },
    ],
  },
  {
    presetId: "bancolombia",
    name: "Bancolombia",
    tiers: [
      { min: 1, max: 120, rateEA: 9.80, label: "90 Días Tu360" },
      { min: 121, max: 220, rateEA: 10.50, label: "180 Días Tu360" },
      { min: 221, max: 999, rateEA: 10.80, label: "360 Días Tu360" },
    ],
  },
  {
    presetId: "bbva",
    name: "BBVA Colombia",
    tiers: [
      { min: 1, max: 120, rateEA: 10.10, label: "90 Días Online" },
      { min: 121, max: 220, rateEA: 10.70, label: "180 Días Online" },
      { min: 221, max: 999, rateEA: 11.00, label: "360 Días Online" },
    ],
  },
  {
    presetId: "confiar",
    name: "Confiar Cooperativa",
    tiers: [
      { min: 1, max: 120, rateEA: 10.50, label: "90 Días CDAT" },
      { min: 121, max: 220, rateEA: 11.20, label: "180 Días CDAT" },
      { min: 221, max: 999, rateEA: 11.50, label: "360 Días CDAT" },
    ],
  },
];

/**
 * Calculates net compound yield on a CDT investment in Colombia.
 * Formula: Interés Bruto = Capital * ((1 + rEA)^(days / 365) - 1)
 * ReteFuente = 4% on gross interest in Colombia.
 * Net Yield = Gross - ReteFuente.
 */
export function calculateCdtYield(capital, rateEA, termDays, reteFuentePct = 4.0) {
  const cap = Number(capital) || 0;
  const r = Number(rateEA) || 0;
  const d = Number(termDays) || 180;
  const rete = Number(reteFuentePct) || 4.0;

  if (cap <= 0 || r <= 0 || d <= 0) {
    return {
      grossYield: 0,
      reteFuenteAmount: 0,
      netYield: 0,
      totalPayout: cap,
    };
  }

  const factor = Math.pow(1 + r / 100, d / 365) - 1;
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
 * Returns a sorted ranking of CDT rates across Colombian institutions for a given term.
 *
 * @param {number} termDays Desired investment horizon in days (e.g. 90, 180, 360).
 * @param {number} capital Investment capital for net yield simulation.
 * @param {object} historicalRates The historical rates database from the store.
 * @param {Array} portfolioEntities Entities already existing in the user's portfolio.
 */
export function getRankedCDTRates(termDays = 180, capital = 1000000, historicalRates = null, portfolioEntities = []) {
  const term = Number(termDays) || 180;
  const simCapital = Number(capital) > 0 ? Number(capital) : 1000000;
  const entitiesDb = historicalRates?.entities || {};

  const bankEntries = [];

  // Helper to find matching tier for term
  const findTier = (tiers) => {
    if (!Array.isArray(tiers) || tiers.length === 0) return null;
    return tiers.find((t) => {
      const min = t.termDaysMin !== undefined ? t.termDaysMin : (t.min !== undefined ? t.min : 1);
      const max = t.termDaysMax !== undefined ? t.termDaysMax : (t.max !== undefined ? t.max : 9999);
      return term >= min && term <= max;
    }) || tiers[tiers.length - 1];
  };

  // 1. Process from historicalRates if available
  const seenPresetIds = new Set();

  Object.entries(entitiesDb).forEach(([rawId, entData]) => {
    const cdtTiers = entData.cdt_term_rates || [];
    if (cdtTiers.length === 0) return;

    const matchedTier = findTier(cdtTiers);
    if (!matchedTier || !matchedTier.rateEA) return;

    const cleanId = rawId.replace("ent_", "").replace("preset_", "");
    seenPresetIds.add(cleanId);

    const bp = getBankPreset(cleanId) || getBankPreset(entData.name);
    const existingEnt = portfolioEntities.find((e) =>
      e.id === rawId ||
      e.id === `ent_${cleanId}` ||
      (e.name && bp?.name && e.name.toLowerCase() === bp.name.toLowerCase())
    );

    const bankName = bp?.name || entData.name || cleanId;
    const rateEA = Number(matchedTier.rateEA);
    const calc = calculateCdtYield(simCapital, rateEA, term);

    bankEntries.push({
      key: rawId,
      entityId: existingEnt ? existingEnt.id : `preset_${bp?.id || cleanId}`,
      isPreset: !existingEnt,
      inPortfolio: Boolean(existingEnt),
      bankName,
      tierLabel: matchedTier.label || `${term} Días`,
      rateEA,
      logoSvg: bp?.logoSvg || null,
      logoUrl: existingEnt?.logoUrl || (bp?.logoSvg ? svgToDataUri(bp.logoSvg) : null),
      color: bp?.color || "#f59e0b",
      icon: bp?.icon || "🏦",
      suggestedName: `CDT ${bankName} ${term} Días`,
      netYield: calc.netYield,
      grossYield: calc.grossYield,
      totalPayout: calc.totalPayout,
      capital: simCapital,
      termDays: term,
    });
  });

  // 2. Add builtin benchmarks for banks not yet in historicalRates
  BUILTIN_CDT_BENCHMARKS.forEach((benchmark) => {
    if (seenPresetIds.has(benchmark.presetId)) return;

    const matchedTier = findTier(benchmark.tiers);
    if (!matchedTier) return;

    const bp = getBankPreset(benchmark.presetId);
    const existingEnt = portfolioEntities.find((e) =>
      e.id === `ent_${benchmark.presetId}` ||
      (e.name && bp?.name && e.name.toLowerCase() === bp.name.toLowerCase())
    );

    const bankName = bp?.name || benchmark.name;
    const rateEA = Number(matchedTier.rateEA);
    const calc = calculateCdtYield(simCapital, rateEA, term);

    bankEntries.push({
      key: `builtin_${benchmark.presetId}`,
      entityId: existingEnt ? existingEnt.id : `preset_${benchmark.presetId}`,
      isPreset: !existingEnt,
      inPortfolio: Boolean(existingEnt),
      bankName,
      tierLabel: matchedTier.label || `${term} Días`,
      rateEA,
      logoSvg: bp?.logoSvg || null,
      logoUrl: existingEnt?.logoUrl || (bp?.logoSvg ? svgToDataUri(bp.logoSvg) : null),
      color: bp?.color || "#f59e0b",
      icon: bp?.icon || "🏦",
      suggestedName: `CDT ${bankName} ${term} Días`,
      netYield: calc.netYield,
      grossYield: calc.grossYield,
      totalPayout: calc.totalPayout,
      capital: simCapital,
      termDays: term,
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
