import React, { useEffect, useMemo, useState } from "react";
import {
  STANDARD_CDT_TERMS,
  calculateCdtYield,
  getRankedCDTRates,
} from "../../utils/cdtComparator";
import {
  COLOMBIA_CONSTANTS,
  calculateNetIncomeIndependent,
  calculateNetSalaryDependent,
} from "../../utils/colombiaPayroll";

function formatCOP(val) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(val) || 0);
}

function formatNum(val, decimals = 0) {
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number(val) || 0);
}

export default function PublicCalculators({ initialTab = "cdt" }) {
  const [tab, setTab] = useState(initialTab);

  // ── 1. CDT & Real Return State ─────────────────────────────────────────────
  const [capital, setCapital] = useState(10000000);
  const [termDays, setTermDays] = useState(180);
  const [rateEA, setRateEA] = useState(11.5);
  const [reteFuente, setReteFuente] = useState(4.0);
  const [ipcInflation, setIpcInflation] = useState(5.2);
  const [selectedBankKey, setSelectedBankKey] = useState(null);
  const [historicalRates, setHistoricalRates] = useState(null);

  useEffect(() => {
    let active = true;
    fetch("./data/historical_rates.json")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data) setHistoricalRates(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const cdtResult = useMemo(
    () => calculateCdtYield(capital, rateEA, termDays, reteFuente),
    [capital, rateEA, termDays, reteFuente],
  );

  const cdtRealMetrics = useMemo(() => {
    const cap = Number(capital) || 0;
    const days = Math.max(1, Number(termDays) || 180);
    const inf = Number(ipcInflation) || 0;
    if (cap <= 0 || cdtResult.netYield <= 0) {
      return { netEA: 0, realEA: -inf, realProfit: 0 };
    }
    const netEA = ((1 + cdtResult.netYield / cap) ** (365 / days) - 1) * 100;
    const realEA = ((1 + netEA / 100) / (1 + inf / 100) - 1) * 100;
    const periodInflation = (1 + inf / 100) ** (days / 365) - 1;
    const realFinalPurchasingPower = cdtResult.totalPayout / (1 + periodInflation);
    return {
      netEA,
      realEA,
      realProfit: realFinalPurchasingPower - cap,
    };
  }, [capital, termDays, ipcInflation, cdtResult]);

  const cdtRanking = useMemo(
    () => getRankedCDTRates(termDays, capital, historicalRates, []),
    [termDays, capital, historicalRates],
  );

  // ── 2. Compound Interest, DCA & Inflation State ────────────────────────────
  const [initCap, setInitCap] = useState(2000);
  const [monthlyDca, setMonthlyDca] = useState(250);
  const [horizonYears, setHorizonYears] = useState(15);
  const [annualReturn, setAnnualReturn] = useState(9.5);
  const [annualInf, setAnnualInf] = useState(3.2);

  const compoundProjection = useMemo(() => {
    const yrs = Math.min(40, Math.max(1, Number(horizonYears) || 1));
    const start = Math.max(0, Number(initCap) || 0);
    const dca = Math.max(0, Number(monthlyDca) || 0);
    const rAnnual = Number(annualReturn) || 0;
    const inf = Number(annualInf) || 0;
    const rMonthly = (1 + rAnnual / 100) ** (1 / 12) - 1;

    const rows = [];
    let balance = start;
    let contributed = start;

    for (let y = 1; y <= yrs; y++) {
      for (let m = 0; m < 12; m++) {
        balance = balance * (1 + rMonthly) + dca;
        contributed += dca;
      }
      const realValue = balance / (1 + inf / 100) ** y;
      rows.push({
        year: y,
        contributed,
        nominal: balance,
        interest: Math.max(0, balance - contributed),
        real: realValue,
      });
    }

    const last = rows[rows.length - 1] || {
      contributed: start,
      nominal: start,
      interest: 0,
      real: start,
    };
    return { rows, summary: last };
  }, [initCap, monthlyDca, horizonYears, annualReturn, annualInf]);

  // ── 3. Colombia Payroll & 50/30/20 State ───────────────────────────────────
  const [contractType, setContractType] = useState("dependiente");
  const [grossSalary, setGrossSalary] = useState(3800000);
  const [arlRisk, setArlRisk] = useState(1);

  const payrollResult = useMemo(() => {
    if (contractType === "dependiente") {
      return calculateNetSalaryDependent({ grossSalary });
    }
    return calculateNetIncomeIndependent({
      grossFees: grossSalary,
      arlRiskLevel: Number(arlRisk),
    });
  }, [contractType, grossSalary, arlRisk]);

  const netIncome =
    contractType === "dependiente" ? payrollResult.netSalary : payrollResult.netIncome;

  return (
    <section className="public-card" aria-label="Calculadoras financieras públicas">
      <div className="public-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "cdt"}
          className={`public-tab-btn ${tab === "cdt" ? "active" : ""}`}
          onClick={() => setTab("cdt")}
        >
          🏦 Simulador CDT & Rentabilidad Real
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "compound"}
          className={`public-tab-btn ${tab === "compound" ? "active" : ""}`}
          onClick={() => setTab("compound")}
        >
          📈 Interés Compuesto, DCA & Inflación
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "payroll"}
          className={`public-tab-btn ${tab === "payroll" ? "active" : ""}`}
          onClick={() => setTab("payroll")}
        >
          🧾 Nómina Colombia & Regla 50/30/20
        </button>
      </div>

      {/* TAB 1: CDT */}
      {tab === "cdt" && (
        <div>
          <div className="public-grid-2">
            <div>
              <h2 style={{ marginTop: 0, fontSize: "1.15rem" }}>
                Calculadora CDT Colombia (Base 365 + ReteFuente 4%)
              </h2>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", marginBottom: 16 }}>
                Simula el retorno exacto neto tras Retención en la Fuente y compáralo frente a las
                tasas referenciales de bancos y cooperativas en Colombia.
              </p>

              <div className="public-field">
                <label htmlFor="cdt-capital">Capital a invertir (COP)</label>
                <input
                  id="cdt-capital"
                  type="number"
                  min={100000}
                  step={500000}
                  className="public-input"
                  value={capital}
                  onChange={(e) => setCapital(Math.max(0, Number(e.target.value)))}
                />
              </div>

              <div className="public-field">
                <label htmlFor="cdt-days">Plazo del CDT (días)</label>
                <div className="public-pill-row" style={{ marginBottom: 8 }}>
                  {STANDARD_CDT_TERMS.map((t) => (
                    <button
                      key={t.days}
                      type="button"
                      className={`public-pill ${Number(termDays) === t.days ? "active" : ""}`}
                      onClick={() => setTermDays(t.days)}
                    >
                      {t.shortLabel}
                    </button>
                  ))}
                </div>
                <input
                  id="cdt-days"
                  type="number"
                  min={30}
                  max={1800}
                  className="public-input"
                  value={termDays}
                  onChange={(e) => setTermDays(Math.max(1, Number(e.target.value)))}
                />
              </div>

              <div className="public-grid-3">
                <div className="public-field">
                  <label htmlFor="cdt-rate">Tasa (% E.A.)</label>
                  <input
                    id="cdt-rate"
                    type="number"
                    step={0.1}
                    min={0}
                    max={40}
                    className="public-input"
                    value={rateEA}
                    onChange={(e) => {
                      setRateEA(Math.max(0, Number(e.target.value)));
                      setSelectedBankKey(null);
                    }}
                  />
                </div>
                <div className="public-field">
                  <label htmlFor="cdt-rete">ReteFuente (%)</label>
                  <input
                    id="cdt-rete"
                    type="number"
                    step={0.5}
                    min={0}
                    max={20}
                    className="public-input"
                    value={reteFuente}
                    onChange={(e) => setReteFuente(Math.max(0, Number(e.target.value)))}
                  />
                </div>
                <div className="public-field">
                  <label htmlFor="cdt-ipc">Inflación IPC (%)</label>
                  <input
                    id="cdt-ipc"
                    type="number"
                    step={0.1}
                    min={0}
                    max={30}
                    className="public-input"
                    value={ipcInflation}
                    onChange={(e) => setIpcInflation(Math.max(0, Number(e.target.value)))}
                  />
                </div>
              </div>
            </div>

            <div>
              <div className="public-kpi-grid">
                <div className="public-kpi">
                  <div className="public-kpi-label">Interés Bruto</div>
                  <div className="public-kpi-value">{formatCOP(cdtResult.grossYield)}</div>
                </div>
                <div className="public-kpi">
                  <div className="public-kpi-label">ReteFuente ({reteFuente}%)</div>
                  <div className="public-kpi-value">-{formatCOP(cdtResult.reteFuenteAmount)}</div>
                </div>
                <div className="public-kpi">
                  <div className="public-kpi-label">Ganancia Neta</div>
                  <div className="public-kpi-value gain">+{formatCOP(cdtResult.netYield)}</div>
                </div>
                <div className="public-kpi">
                  <div className="public-kpi-label">Total al Vencimiento</div>
                  <div className="public-kpi-value accent">{formatCOP(cdtResult.totalPayout)}</div>
                </div>
                <div className="public-kpi">
                  <div className="public-kpi-label">Tasa Neta E.A.</div>
                  <div className="public-kpi-value">{cdtRealMetrics.netEA.toFixed(2)}% E.A.</div>
                </div>
                <div className="public-kpi">
                  <div className="public-kpi-label">Tasa Real vs IPC</div>
                  <div
                    className="public-kpi-value"
                    style={{ color: cdtRealMetrics.realEA >= 0 ? "var(--gain)" : "var(--loss)" }}
                  >
                    {cdtRealMetrics.realEA >= 0 ? "+" : ""}
                    {cdtRealMetrics.realEA.toFixed(2)}% Real
                  </div>
                </div>
              </div>

              <div className="public-formula-box">
                <strong>Metodología verificable:</strong> Interés Bruto = Capital × [(1 +
                E.A.)^(días/365) − 1]. Sobre los intereses se retiene el {reteFuente}% de
                ReteFuente. La rentabilidad real aplica la ecuación de Fisher{" "}
                <code>(1 + E.A._neta) / (1 + IPC) − 1</code> para reflejar poder adquisitivo
                efectivo ({cdtRealMetrics.realProfit >= 0 ? "+" : ""}
                {formatCOP(cdtRealMetrics.realProfit)} reales en el período).
              </div>
            </div>
          </div>

          <div style={{ marginTop: 22 }}>
            <h3 style={{ fontSize: "1rem", margin: "0 0 10px" }}>
              Comparador Referencial de CDTs en Colombia a {termDays} días (haz clic en una entidad
              para simular)
            </h3>
            <div className="public-table-wrap">
              <table className="public-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Entidad</th>
                    <th>Modalidad / Referencia</th>
                    <th>Tasa E.A.</th>
                    <th>Ganancia Neta</th>
                    <th>Desembolso Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(cdtRanking?.rankedList || []).slice(0, 10).map((item) => (
                    <tr
                      key={item.key}
                      className="clickable"
                      tabIndex={0}
                      style={{
                        background: selectedBankKey === item.key ? "var(--accent-glow)" : undefined,
                      }}
                      onClick={() => {
                        setRateEA(item.rateEA);
                        setSelectedBankKey(item.key);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setRateEA(item.rateEA);
                          setSelectedBankKey(item.key);
                        }
                      }}
                    >
                      <td>{item.medal || `#${item.rank}`}</td>
                      <td>
                        <strong>
                          {item.icon} {item.bankName}
                        </strong>
                      </td>
                      <td>{item.tierLabel}</td>
                      <td>
                        <strong>{item.rateEA.toFixed(2)}%</strong>
                      </td>
                      <td style={{ color: "var(--gain)", fontWeight: 700 }}>
                        +{formatCOP(item.netYield)}
                      </td>
                      <td>{formatCOP(item.totalPayout)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: COMPOUND INTEREST */}
      {tab === "compound" && (
        <div>
          <div className="public-grid-2">
            <div>
              <h2 style={{ marginTop: 0, fontSize: "1.15rem" }}>
                Simulador de Interés Compuesto, Aportes DCA e Inflación
              </h2>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", marginBottom: 16 }}>
                Proyecta cuánto crece un portafolio mediante aportes mensuales constantes
                (Dollar-Cost Averaging) comparando saldo nominal frente a poder de compra real en
                moneda constante.
              </p>

              <div className="public-grid-2">
                <div className="public-field">
                  <label htmlFor="cmp-init">Capital Inicial (USD o COP)</label>
                  <input
                    id="cmp-init"
                    type="number"
                    min={0}
                    className="public-input"
                    value={initCap}
                    onChange={(e) => setInitCap(Math.max(0, Number(e.target.value)))}
                  />
                </div>
                <div className="public-field">
                  <label htmlFor="cmp-dca">Aporte Mensual (DCA)</label>
                  <input
                    id="cmp-dca"
                    type="number"
                    min={0}
                    className="public-input"
                    value={monthlyDca}
                    onChange={(e) => setMonthlyDca(Math.max(0, Number(e.target.value)))}
                  />
                </div>
              </div>

              <div className="public-grid-3">
                <div className="public-field">
                  <label htmlFor="cmp-years">Horizonte (Años)</label>
                  <input
                    id="cmp-years"
                    type="number"
                    min={1}
                    max={40}
                    className="public-input"
                    value={horizonYears}
                    onChange={(e) =>
                      setHorizonYears(Math.min(40, Math.max(1, Number(e.target.value))))
                    }
                  />
                </div>
                <div className="public-field">
                  <label htmlFor="cmp-ret">Retorno Anual (% E.A.)</label>
                  <input
                    id="cmp-ret"
                    type="number"
                    step={0.5}
                    min={0}
                    max={35}
                    className="public-input"
                    value={annualReturn}
                    onChange={(e) => setAnnualReturn(Math.max(0, Number(e.target.value)))}
                  />
                </div>
                <div className="public-field">
                  <label htmlFor="cmp-inf">Inflación Anual (%)</label>
                  <input
                    id="cmp-inf"
                    type="number"
                    step={0.2}
                    min={0}
                    max={25}
                    className="public-input"
                    value={annualInf}
                    onChange={(e) => setAnnualInf(Math.max(0, Number(e.target.value)))}
                  />
                </div>
              </div>
            </div>

            <div>
              <div className="public-kpi-grid">
                <div className="public-kpi">
                  <div className="public-kpi-label">Total Aportado</div>
                  <div className="public-kpi-value">
                    ${formatNum(compoundProjection.summary.contributed, 0)}
                  </div>
                </div>
                <div className="public-kpi">
                  <div className="public-kpi-label">Interés Compuesto</div>
                  <div className="public-kpi-value gain">
                    +${formatNum(compoundProjection.summary.interest, 0)}
                  </div>
                </div>
                <div className="public-kpi">
                  <div className="public-kpi-label">Saldo Final Nominal</div>
                  <div className="public-kpi-value accent">
                    ${formatNum(compoundProjection.summary.nominal, 0)}
                  </div>
                </div>
                <div className="public-kpi">
                  <div className="public-kpi-label">Poder Adquisitivo Real</div>
                  <div className="public-kpi-value">
                    ${formatNum(compoundProjection.summary.real, 0)}
                  </div>
                </div>
              </div>

              <div className="public-formula-box">
                <strong>Capitalización mensual equivalente:</strong> Convertimos la tasa efectiva
                anual en tasa mensual equivalente <code>(1 + E.A.)^(1/12) − 1</code> y deflactamos
                cada año por <code>(1 + inflación)^t</code> para evitar la ilusión monetaria en
                horizontes largos.
              </div>
            </div>
          </div>

          <div
            className="public-table-wrap"
            style={{ marginTop: 18, maxHeight: 280, overflowY: "auto" }}
          >
            <table className="public-table">
              <thead>
                <tr>
                  <th>Año</th>
                  <th>Capital Aportado</th>
                  <th>Rendimientos Acumulados</th>
                  <th>Valor Nominal</th>
                  <th>Poder de Compra Real</th>
                </tr>
              </thead>
              <tbody>
                {compoundProjection.rows.map((r) => (
                  <tr key={r.year}>
                    <td>Año {r.year}</td>
                    <td>${formatNum(r.contributed, 0)}</td>
                    <td style={{ color: "var(--gain)" }}>+${formatNum(r.interest, 0)}</td>
                    <td>
                      <strong>${formatNum(r.nominal, 0)}</strong>
                    </td>
                    <td>${formatNum(r.real, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: COLOMBIA PAYROLL & 50/30/20 */}
      {tab === "payroll" && (
        <div>
          <div className="public-grid-2">
            <div>
              <h2 style={{ marginTop: 0, fontSize: "1.15rem" }}>
                Liquidador de Nómina Colombia (SMLMV {formatCOP(COLOMBIA_CONSTANTS.SMLMV_2025)}) &
                50/30/20
              </h2>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", marginBottom: 14 }}>
                Estima tus deducciones obligatorias de ley (Salud, Pensión, FSP, Auxilio de
                Transporte o PILA sobre IBC del 40%) y distribuye automáticamente tu ingreso neto.
              </p>

              <div className="public-pill-row" style={{ marginBottom: 14 }}>
                <button
                  type="button"
                  className={`public-pill ${contractType === "dependiente" ? "active" : ""}`}
                  onClick={() => setContractType("dependiente")}
                >
                  Contrato Laboral (Dependiente)
                </button>
                <button
                  type="button"
                  className={`public-pill ${contractType === "independiente" ? "active" : ""}`}
                  onClick={() => setContractType("independiente")}
                >
                  Prestación de Servicios (PILA)
                </button>
              </div>

              <div className="public-field">
                <label htmlFor="pay-gross">
                  {contractType === "dependiente"
                    ? "Salario Base Mensual Bruto (COP)"
                    : "Honorarios Mensuales Brutos (COP)"}
                </label>
                <input
                  id="pay-gross"
                  type="number"
                  min={0}
                  step={100000}
                  className="public-input"
                  value={grossSalary}
                  onChange={(e) => setGrossSalary(Math.max(0, Number(e.target.value)))}
                />
              </div>

              {contractType === "independiente" && (
                <div className="public-field">
                  <label htmlFor="pay-arl">Nivel de Riesgo ARL</label>
                  <select
                    id="pay-arl"
                    className="public-select"
                    value={arlRisk}
                    onChange={(e) => setArlRisk(Number(e.target.value))}
                  >
                    <option value={1}>Riesgo I — Oficina / Remoto (0.522%)</option>
                    <option value={2}>Riesgo II — Riesgo Bajo (1.044%)</option>
                    <option value={3}>Riesgo III — Riesgo Medio (2.436%)</option>
                    <option value={4}>Riesgo IV — Riesgo Alto (4.350%)</option>
                    <option value={5}>Riesgo V — Riesgo Máximo (6.960%)</option>
                  </select>
                </div>
              )}

              <div className="public-formula-box">
                {contractType === "dependiente" ? (
                  <>
                    <strong>Regla Laboral:</strong> Salud 4%, Pensión 4%, FSP progresivo si supera 4
                    SMLMV y Auxilio de Transporte (
                    {formatCOP(COLOMBIA_CONSTANTS.AUX_TRANSPORTE_2025)}) si devenga hasta 2 SMLMV.
                  </>
                ) : (
                  <>
                    <strong>Regla PILA Independiente:</strong> Base IBC = máx(1 SMLMV, 40% de
                    honorarios). Sobre el IBC se liquida Salud 12.5%, Pensión 16% y ARL según nivel
                    de riesgo.
                  </>
                )}
              </div>
            </div>

            <div>
              <div className="public-kpi-grid">
                <div className="public-kpi">
                  <div className="public-kpi-label">Neto Disponible en Caja</div>
                  <div className="public-kpi-value gain">{formatCOP(netIncome)}</div>
                </div>
                <div className="public-kpi">
                  <div className="public-kpi-label">Descuento Total Ley</div>
                  <div className="public-kpi-value">
                    -
                    {formatCOP(
                      contractType === "dependiente"
                        ? payrollResult.totalLegalDeductions
                        : payrollResult.totalPila,
                    )}
                  </div>
                </div>
                {contractType === "dependiente" ? (
                  <>
                    <div className="public-kpi">
                      <div className="public-kpi-label">Salud + Pensión (8%)</div>
                      <div className="public-kpi-value">
                        -{formatCOP(payrollResult.healthDeduction + payrollResult.pensionDeduction)}
                      </div>
                    </div>
                    <div className="public-kpi">
                      <div className="public-kpi-label">Aux. Transporte</div>
                      <div className="public-kpi-value accent">
                        +{formatCOP(payrollResult.auxTransporteAmount)}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="public-kpi">
                      <div className="public-kpi-label">IBC Calculado (40%)</div>
                      <div className="public-kpi-value">{formatCOP(payrollResult.ibc)}</div>
                    </div>
                    <div className="public-kpi">
                      <div className="public-kpi-label">Carga Efectiva PILA</div>
                      <div className="public-kpi-value">{payrollResult.effectiveDeductionPct}%</div>
                    </div>
                  </>
                )}
              </div>

              <h3 style={{ fontSize: "0.95rem", margin: "12px 0 8px" }}>
                Presupuesto Recomendado sobre tu Neto (Regla 50 / 30 / 20)
              </h3>
              <div className="public-grid-3">
                <div className="public-kpi">
                  <div className="public-kpi-label">50% Necesidades</div>
                  <div className="public-kpi-value">{formatCOP(netIncome * 0.5)}</div>
                </div>
                <div className="public-kpi">
                  <div className="public-kpi-label">30% Estilo de Vida</div>
                  <div className="public-kpi-value">{formatCOP(netIncome * 0.3)}</div>
                </div>
                <div className="public-kpi">
                  <div className="public-kpi-label">20% Ahorro / Inversión</div>
                  <div className="public-kpi-value gain">{formatCOP(netIncome * 0.2)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
