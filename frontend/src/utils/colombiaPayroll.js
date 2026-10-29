/**
 * Colombia Payroll & Parafiscales Financial Calculator
 * Exact computations for Contrato Laboral (Dependiente) and Prestación de Servicios (Independiente).
 */

export const COLOMBIA_CONSTANTS = {
  SMLMV_2025: 1423500, // Salario Mínimo Legal Mensual Vigente Colombia 2025
  AUX_TRANSPORTE_2025: 200000, // Auxilio de transporte legal 2025
  UVT_2025: 49799, // Unidad de Valor Tributario
};

/**
 * Calculates net salary for a dependent employee under Colombian labor law
 */
export function calculateNetSalaryDependent({
  grossSalary = 0,
  smlmv = COLOMBIA_CONSTANTS.SMLMV_2025,
  auxTransporte = COLOMBIA_CONSTANTS.AUX_TRANSPORTE_2025,
  hasAuxTransporte = null, // auto-detected if null (<= 2 SMLMV)
  withholdingTax = 0, // Retención en la fuente manual u opcional
  otherDeductions = 0, // Préstamos, libranzas, etc.
}) {
  const gross = Math.max(0, Number(grossSalary) || 0);

  // 1. Salud: 4% del salario bruto
  const healthDeduction = gross * 0.04;

  // 2. Pensión: 4% del salario bruto
  const pensionDeduction = gross * 0.04;

  // 3. Fondo de Solidaridad Pensional (FSP): 1% si > 4 SMLMV, hasta 2% si > 16 SMLMV
  let fspPct = 0;
  if (gross > 4 * smlmv && gross <= 16 * smlmv) {
    fspPct = 0.01;
  } else if (gross > 16 * smlmv && gross <= 17 * smlmv) {
    fspPct = 0.012;
  } else if (gross > 17 * smlmv && gross <= 18 * smlmv) {
    fspPct = 0.014;
  } else if (gross > 18 * smlmv && gross <= 19 * smlmv) {
    fspPct = 0.016;
  } else if (gross > 19 * smlmv && gross <= 20 * smlmv) {
    fspPct = 0.018;
  } else if (gross > 20 * smlmv) {
    fspPct = 0.02;
  }
  const fspDeduction = gross * fspPct;

  // 4. Auxilio de transporte: Por ley si devenga hasta 2 SMLMV
  const receivesAux = hasAuxTransporte !== null ? hasAuxTransporte : gross > 0 && gross <= 2 * smlmv;
  const auxTransporteAmount = receivesAux ? auxTransporte : 0;

  // 5. Total Deducciones de Ley
  const totalLegalDeductions = healthDeduction + pensionDeduction + fspDeduction + Number(withholdingTax) + Number(otherDeductions);

  // 6. Salario Neto Liquidado que entra a cuenta bancaria
  const netSalary = Math.max(0, gross - totalLegalDeductions + auxTransporteAmount);

  return {
    grossSalary: Math.round(gross),
    healthDeduction: Math.round(healthDeduction),
    pensionDeduction: Math.round(pensionDeduction),
    fspDeduction: Math.round(fspDeduction),
    fspPct: (fspPct * 100).toFixed(1),
    withholdingTax: Math.round(Number(withholdingTax) || 0),
    otherDeductions: Math.round(Number(otherDeductions) || 0),
    auxTransporteAmount: Math.round(auxTransporteAmount),
    totalLegalDeductions: Math.round(totalLegalDeductions),
    netSalary: Math.round(netSalary),
    effectiveDeductionPct: gross > 0 ? ((totalLegalDeductions / gross) * 100).toFixed(1) : "0.0",
  };
}

/**
 * Calculates net income for an independent contractor (Prestación de Servicios / Freelance)
 */
export function calculateNetIncomeIndependent({
  grossFees = 0,
  smlmv = COLOMBIA_CONSTANTS.SMLMV_2025,
  arlRiskLevel = 1, // 1: 0.522%, 2: 1.044%, 3: 2.436%, 4: 4.350%, 5: 6.960%
  withholdingTax = 0, // Retención en la fuente (ej. 10% u 11%)
  reteIca = 0, // ReteICA municipal (ej. 0.966%)
}) {
  const gross = Math.max(0, Number(grossFees) || 0);

  // 1. Ingreso Base de Cotización (IBC): 40% de los honorarios brutos, no menor a 1 SMLMV
  const rawIbc = gross * 0.4;
  const ibc = gross > 0 ? Math.max(smlmv, rawIbc) : 0;

  // 2. Salud Independiente: 12.5% del IBC
  const healthPila = ibc * 0.125;

  // 3. Pensión Independiente: 16% del IBC
  const pensionPila = ibc * 0.16;

  // 4. ARL según nivel de riesgo
  const ARL_RATES = {
    1: 0.00522,
    2: 0.01044,
    3: 0.02436,
    4: 0.0435,
    5: 0.0696,
  };
  const arlRate = ARL_RATES[arlRiskLevel] || 0.00522;
  const arlPila = ibc * arlRate;

  // 5. Total Planilla PILA (Seguridad Social)
  const totalPila = healthPila + pensionPila + arlPila;

  // 6. Retenciones Tributarias
  const totalTaxes = Number(withholdingTax) + Number(reteIca);

  // 7. Neto Real en Bolsillo
  const netIncome = Math.max(0, gross - totalPila - totalTaxes);

  return {
    grossFees: Math.round(gross),
    ibc: Math.round(ibc),
    healthPila: Math.round(healthPila),
    pensionPila: Math.round(pensionPila),
    arlPila: Math.round(arlPila),
    totalPila: Math.round(totalPila),
    totalTaxes: Math.round(totalTaxes),
    netIncome: Math.round(netIncome),
    effectiveDeductionPct: gross > 0 ? (((totalPila + totalTaxes) / gross) * 100).toFixed(1) : "0.0",
  };
}
