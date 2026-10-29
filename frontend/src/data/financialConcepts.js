/**
 * Diccionario de conceptos financieros y cuantitativos del proyecto Kpital.
 * Utilizado por InfoTooltip y modales explicativos a lo largo de la app.
 */

export const FINANCIAL_CONCEPTS = {
  nav: {
    title: "NAV (Net Asset Value / Valor Liquidativo)",
    tag: "Métrica Base",
    tagColor: "var(--accent-primary)",
    explanation:
      "Representa el valor patrimonial total de la estrategia en cada instante de tiempo. Se calcula sumando el valor de mercado de todas las acciones activas en sus slots correspondientes más la liquidez disponible en caja.",
    rule: "Permite ver el crecimiento o decrecimiento real del portafolio comenzando desde el capital inicial depositado.",
  },
  active_invested: {
    title: "Capital Activo & Slots de Inversión",
    tag: "Arquitectura",
    tagColor: "#38bdf8",
    explanation:
      "El capital total se divide equitativamente en N 'slots' o casillas fijas (por defecto 15 o 20). Si la estrategia tiene asignadas menos acciones que el total de slots, el dinero sobrante queda en 'Cash Reservado' sin riesgo de mercado.",
    rule: "Cada posición tiene asignado exactamente (Capital Total / N Slots), garantizando estricta diversificación equiponderada.",
  },
  alpha_sp500: {
    title: "Alfa vs S&P 500 (α)",
    tag: "Rendimiento Excedente",
    tagColor: "var(--gain)",
    explanation:
      "Es el exceso de rentabilidad porcentual o monetario que genera el portafolio Kpital comparado con el índice S&P 500 durante el mismo período exacto.",
    rule: "Un Alfa positivo (+3.5%) significa que las selecciones algorítmicas batieron al mercado general.",
  },
  alpha_nasdaq: {
    title: "Alfa vs NASDAQ 100 (α)",
    tag: "Rendimiento Excedente",
    tagColor: "#c084fc",
    explanation:
      "Mide si la estrategia tecnológica superó al índice tecnológico de referencia (QQQ/NASDAQ). Al ser un benchmark de alto crecimiento, batir al NASDAQ demuestra alta efectividad de selección de acciones.",
    rule: "Alfa > 0 indica que la cartera generó más rendimiento que invertir pasivamente en las 100 mayores tecnológicas.",
  },
  sharpe_ratio: {
    title: "Sharpe Ratio (Riesgo / Retorno)",
    tag: "Riesgo Institucional",
    tagColor: "#00e5ff",
    explanation:
      "Mide cuánta rentabilidad adicional genera la cartera por cada unidad de volatilidad total asumida frente a un activo libre de riesgo (tasa de bonos del tesoro).",
    rule: "> 1.0 es bueno (grado institucional), > 2.0 es excepcional. Indica que las ganancias no se deben solo a tomar riesgos desmedidos.",
  },
  sortino_ratio: {
    title: "Sortino Ratio (Volatilidad a la Baja)",
    tag: "Riesgo Institucional",
    tagColor: "#10b981",
    explanation:
      "Variante del Sharpe que únicamente penaliza la volatilidad negativa o caídas (Downside Deviation). La volatilidad alcista se considera positiva y no resta puntuación.",
    rule: "Ideal para estrategias de crecimiento donde los picos hacia arriba no deben ser castigados como 'riesgo perjudicial'.",
  },
  beta_sp500: {
    title: "Beta vs Mercado (β)",
    tag: "Sensibilidad Sistemática",
    tagColor: "#f59e0b",
    explanation:
      "Coeficiente que mide qué tan sensible es la cartera a los movimientos del índice S&P 500 o NASDAQ.",
    rule: "Beta = 1.0 se mueve igual al mercado. Beta > 1 (ej: 1.2) amplifica un 20% los movimientos tanto al alza como a la baja. Beta < 1 es más defensiva.",
  },
  annualized_vol: {
    title: "Volatilidad Anualizada (σ)",
    tag: "Dispersión",
    tagColor: "#f43f5e",
    explanation:
      "Desviación estándar de los retornos diarios multiplicada por la raíz de 252 días de negociación. Mide la oscilación o turbulencia de precios del portafolio.",
    rule: "Valores entre 12% y 18% son normales para carteras tecnológicas. Menos de 12% es muy conservador; más de 25% indica alta oscilación.",
  },
  win_rate: {
    title: "Win Rate (Tasa de Acierto)",
    tag: "Consistencia",
    tagColor: "#34d399",
    explanation:
      "Porcentaje de posiciones individuales o de tranches de rebalanceo que han cerrado con retorno positivo acumulado.",
    rule: "Una tasa superior al 60% indica alta consistencia estadística en la toma de posiciones.",
  },
  max_drawdown: {
    title: "Max Drawdown (Máxima Pérdida Registrada)",
    tag: "Estrés Histórico",
    tagColor: "var(--loss)",
    explanation:
      "La mayor caída porcentual desde el punto más alto histórico (Peak) hasta el punto más bajo (Trough) antes de que la cartera comience a recuperarse.",
    rule: "Permite evaluar la resiliencia psicológica y el peor escenario soportado en el período analizado.",
  },
  cash_reserved: {
    title: "Cash Reservado (Q)",
    tag: "Gestión de Liquidez",
    tagColor: "#94a3b8",
    explanation:
      "Dinero no asignado a ningún activo de renta variable en el rebalanceo actual. Si hay 15 slots y solo 10 empresas seleccionadas, 5 slots quedan en liquidez líquida libre de riesgo.",
    rule: "Protege la cartera en fases de mercado bajista y otorga liquidez inmediata para el próximo rebalanceo.",
  },
  monte_carlo: {
    title: "Simulación Monte Carlo (95% Confianza)",
    tag: "Proyección Estocástica",
    tagColor: "#a855f7",
    explanation:
      "Algoritmo que ejecuta miles de iteraciones simulando caminos aleatorios futuros basados en el Drift (retorno medio) y la Volatilidad histórica de los activos actuales a un horizonte de 90 días.",
    rule: "Bull 95% = Escenario alcista (solo 5% de probabilidad de superarlo). Bear 5% = Piso de estrés bajista defensivo.",
  },
  quant_radar: {
    title: "Radar Cuantitativo 360°",
    tag: "Factores Smart Beta",
    tagColor: "#00e5ff",
    explanation:
      "Evaluación poligonal de 6 factores clave de la cartera: Momentum, Volatilidad, Sharpe, Win Rate, Concentración y Liquidez en comparación relativa con el Benchmark.",
    rule: "Un área azul más amplia que la línea punteada gris indica superioridad factorial integral.",
  },
  real_return: {
    title: "Poder Adquisitivo Real (Ajustado por Inflación)",
    tag: "Poder de Compra",
    tagColor: "#f59e0b",
    explanation:
      "Rentabilidad deflactada por la inflación acumulada del período (IPC / DANE) y convertida a la tasa de cambio local (TRM USD/COP si aplica).",
    rule: "Muestra si tu patrimonio creció en capacidad de compra real de bienes y servicios, o si solo creció numéricamente debido a la inflación.",
  },
  log_scale: {
    title: "Escala Logarítmica vs Lineal",
    tag: "Visualización",
    tagColor: "#38bdf8",
    explanation:
      "En escala logarítmica, distancias verticales iguales representan porcentajes de cambio iguales (un salto de $100 a $200 tiene la misma altura que uno de $1,000 a $2,000, ambos +100%).",
    rule: "Evita que estrategias con grandes montos de capital eclipsen visualmente a las carteras de menor capital comparativo.",
  },
  rebalance: {
    title: "Rebalanceo y Rotación Periódica",
    tag: "Estrategia Activa",
    tagColor: "#10b981",
    explanation:
      "Ajuste programado (mensual o trimestral) donde el algoritmo ProPicks reevalúa fundamentales, liquida acciones debilitadas e incorpora nuevas oportunidades equiponderando las posiciones.",
    rule: "Evita que una sola acción concentre demasiado peso por haber crecido y cristaliza ganancias periódicamente.",
  },
};
