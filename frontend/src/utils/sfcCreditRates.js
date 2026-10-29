/**
 * Superintendencia Financiera de Colombia (SFC) — Official Credit Card Interest Rates & Usury Cap Feed
 * Updated monthly according to SFC Resolution benchmark for consumer credit.
 */

export const SFC_USURY_RATE_EA = 24.89; // Current legal maximum usury cap in Colombia (% E.A.)

export const SFC_BANK_RATES = {
  nu: {
    name: "Nu Colombia",
    rateEA: 24.50,
    oneInstallmentInterest: 0.0, // 0% interest on 1 installment
    isZeroInterestPromoSupported: true,
    notes: "0% interés en compras a 1 cuota si se paga antes de la fecha límite.",
  },
  rappi: {
    name: "RappiCard",
    rateEA: 24.20,
    oneInstallmentInterest: 0.0,
    isZeroInterestPromoSupported: true,
    notes: "0% MSI en comercios aliados (Mercado Libre, Despegar, Apple). 0% en 1 cuota.",
  },
  bancolombia: {
    name: "Bancolombia",
    rateEA: 24.80,
    oneInstallmentInterest: 0.0,
    isZeroInterestPromoSupported: true,
    notes: "0% interés a 1 cuota. Tasa cercana al tope de usura para diferidos.",
  },
  davivienda: {
    name: "Davivienda",
    rateEA: 24.85,
    oneInstallmentInterest: 0.0,
    isZeroInterestPromoSupported: true,
    notes: "0% interés a 1 cuota. Promociones esporádicas 0% en tecnología.",
  },
  lulo: {
    name: "Lulo Bank",
    rateEA: 23.90,
    oneInstallmentInterest: 0.0,
    isZeroInterestPromoSupported: true,
    notes: "Cashback directo del 0.5% en compras.",
  },
  scotiabank: {
    name: "Scotiabank Colpatria",
    rateEA: 24.89,
    oneInstallmentInterest: 0.0,
    isZeroInterestPromoSupported: false,
    notes: "Tasa fijada en el tope de usura legal.",
  },
  bbva: {
    name: "BBVA Colombia",
    rateEA: 24.75,
    oneInstallmentInterest: 0.0,
    isZeroInterestPromoSupported: true,
    notes: "0% interés a 1 cuota.",
  },
  cajasocial: {
    name: "Banco Caja Social",
    rateEA: 24.60,
    oneInstallmentInterest: 0.0,
    isZeroInterestPromoSupported: true,
    notes: "0% interés a 1 cuota en tarjeta de crédito Cuentamiga.",
  },
  bogota: {
    name: "Banco de Bogotá",
    rateEA: 24.82,
    oneInstallmentInterest: 0.0,
    isZeroInterestPromoSupported: false,
    notes: "Tasa estándar Grupo Aval.",
  },
  occidente: {
    name: "Banco de Occidente",
    rateEA: 24.80,
    oneInstallmentInterest: 0.0,
    isZeroInterestPromoSupported: false,
    notes: "Tasa estándar Grupo Aval.",
  },
  villas: {
    name: "Banco AV Villas",
    rateEA: 24.85,
    oneInstallmentInterest: 0.0,
    isZeroInterestPromoSupported: false,
    notes: "Tasa estándar Grupo Aval.",
  },
  popular: {
    name: "Banco Popular",
    rateEA: 24.78,
    oneInstallmentInterest: 0.0,
    isZeroInterestPromoSupported: false,
    notes: "Tasa estándar Grupo Aval.",
  },
  itau: {
    name: "Banco Itaú Colombia",
    rateEA: 24.70,
    oneInstallmentInterest: 0.0,
    isZeroInterestPromoSupported: true,
    notes: "0% interés a 1 cuota.",
  },
  falabella: {
    name: "Banco Falabella",
    rateEA: 24.88,
    oneInstallmentInterest: 0.0,
    isZeroInterestPromoSupported: true,
    notes: "0% interés a 1 cuota. Descuentos en tiendas Falabella/Homecenter.",
  },
  bancoagrario: {
    name: "Banco Agrario de Colombia",
    rateEA: 24.50,
    oneInstallmentInterest: 0.0,
    isZeroInterestPromoSupported: true,
    notes: "Tasas agropecuarias e institucionales.",
  },
  bancamia: {
    name: "Bancamía",
    rateEA: 24.80,
    oneInstallmentInterest: 0.0,
    isZeroInterestPromoSupported: true,
    notes: "Microfinanzas productivas.",
  },
  confiar: {
    name: "Confiar Cooperativa",
    rateEA: 24.30,
    oneInstallmentInterest: 0.0,
    isZeroInterestPromoSupported: true,
    notes: "Tasa solidaria cooperativa.",
  },
  default: {
    name: "Tasa Promedio Sistema Financiero SFC",
    rateEA: 24.50,
    oneInstallmentInterest: 0.0,
    isZeroInterestPromoSupported: true,
    notes: "Tasa promedio certificada por la SFC.",
  },
};

export function getSfcRateForBank(bankId) {
  if (!bankId) return SFC_BANK_RATES.default;
  return SFC_BANK_RATES[bankId.toLowerCase()] || SFC_BANK_RATES.default;
}
