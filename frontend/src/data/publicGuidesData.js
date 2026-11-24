/**
 * Biblioteca editorial pública y textos legales de Kpital (https://zhent.homes/).
 * Fuente única compartida entre la SPA pública y las páginas HTML estáticas indexables.
 */

export const SITE_INFO = {
  brand: "Kpital",
  domain: "https://zhent.homes",
  publisher: "Zhent · Kpital Inteligencia Financiera",
  adsenseClient: "ca-pub-5026153133538836",
  githubUrl: "https://github.com/zhentDev/kpital",
  updatedAt: "2026-11-11",
};

export const PUBLIC_GUIDES = [
  {
    slug: "guia-cdt-retefuente-colombia.html",
    id: "cdt-colombia",
    category: "Renta Fija & CDTs",
    readTime: "7 min de lectura",
    title: "Cómo funciona un CDT en Colombia: Tasa E.A., ReteFuente del 4% y Rentabilidad Real",
    summary:
      "Aprende a calcular la ganancia exacta de un Certificado de Depósito a Término en base 365, descontar la retención en la fuente del 4% y medir si realmente superas la inflación.",
    keywords:
      "CDT Colombia, tasa efectiva anual E.A., ReteFuente 4%, comparar CDT, rentabilidad real IPC",
    highlights: [
      "Conversión exacta de Tasa Efectiva Anual (E.A.) al plazo en días.",
      "Impacto real de la Retención en la Fuente (4%) sobre los intereses.",
      "Comparación entre rentabilidad nominal bancaria y poder adquisitivo real (IPC).",
    ],
    sections: [
      {
        heading: "¿Qué es un CDT y cómo expresan las tasas los bancos en Colombia?",
        paragraphs: [
          "Un Certificado de Depósito a Término (CDT) es un instrumento de renta fija emitido por establecimientos bancarios, compañías de financiamiento y cooperativas vigiladas en Colombia (con cobertura del seguro de depósitos FOGAFIN hasta $50 millones COP por depositante en entidades inscritas). A cambio de inmovilizar tu capital durante un plazo pactado —usualmente entre 30 y 1.080 días—, la entidad garantiza una tasa de interés fija desde el día de apertura.",
          "En Colombia, por regulación de transparencia financiera, los CDTs digitales y tradicionales cotizan principalmente en Tasa Efectiva Anual (E.A.). A diferencia de una tasa nominal simple, la tasa E.A. ya incorpora el efecto de la capitalización anual, permitiendo comparar directamente ofertas a 90, 180, 360 o 540 días sin importar la periodicidad interna con la que el banco liquide los intereses.",
        ],
      },
      {
        heading: "Fórmula matemática exacta del rendimiento bruto en días",
        paragraphs: [
          "Para calcular cuánto genera un capital inicial C colocado a una tasa efectiva anual r_EA durante un plazo de d días exactos (convención calendario 365 días), se aplica interés compuesto exponencial fraccionado:",
          "Interés Bruto = Capital × [ (1 + E.A.)^(días / 365) − 1 ]",
          "Por ejemplo, si inviertes $10.000.000 COP en un CDT a 180 días con una tasa del 11.50% E.A., el factor del período es (1.115)^(180/365) − 1 ≈ 0.055188 (5.5188% efectivo semestral). Eso produce $551.880 COP de interés bruto antes de impuestos.",
        ],
        formula: "Interés Bruto = C × ((1 + r_EA)^(d / 365) − 1)",
      },
      {
        heading: "Descuento tributario: Retención en la Fuente del 4%",
        paragraphs: [
          "Sobre los rendimientos financieros de CDTs y cuentas de ahorro en Colombia aplica por regla general una Retención en la Fuente del 4% calculada exclusivamente sobre los intereses ganados (nunca sobre el capital invertido).",
          "Siguiendo el ejemplo anterior: sobre los $551.880 COP de ganancia bruta, el banco descuenta 4% ($22.075 COP) por concepto de ReteFuente al vencimiento o en cada abono periódico de intereses. Tu rendimiento neto acreditado en cuenta será de $529.805 COP, para un desembolso total de $10.529.805 COP. Esto equivale a una tasa efectiva anual neta aproximada de 11.03% E.A.",
          "Nota práctica: si el CDT paga rendimientos mensuales o trimestrales en lugar de capitalizarlos al vencimiento, el flujo llega antes a tu caja disponible pero pierdes el interés compuesto dentro del título si no reinviertes manualmente cada cupón.",
        ],
      },
      {
        heading: "El paso que casi nadie hace: comparar tu CDT contra la inflación (IPC)",
        paragraphs: [
          "Una tasa de 11.5% E.A. suena atractiva en términos nominales, pero lo que determina si tu ahorro gana poder de compra es la tasa real obtenida después de impuestos e inflación (IPC anual). Usando la ecuación de Fisher exacta: r_real = (1 + r_neta) / (1 + inflación) − 1.",
          "Con una inflación anual de 5.2% y una rentabilidad neta equivalente de 11.03% E.A., tu ganancia real sobre el poder adquisitivo es (1.1103 / 1.052) − 1 ≈ +5.54% real anual. En escenarios donde una cuenta tradicional ofrece 2% E.A. mientras la inflación es 5.2%, tu dinero pierde más de 3% de capacidad de compra cada año aunque el saldo en pesos suba ligeramente.",
        ],
      },
      {
        heading: "Criterios prácticos antes de abrir un CDT",
        paragraphs: [
          "1. Evalúa tu necesidad real de liquidez: la mayoría de los CDTs no permiten redención anticipada sin penalización o requieren endoso en mercado secundario. Si puedes necesitar el dinero en menos de 60 días, una cuenta de alto rendimiento (cajitas/bolsillos remunerados sin permanencia) suele ser más eficiente aunque pague 1% menos.",
          "2. Compara neto vs. 4x1000 (GMF): si mueves dinero desde una cuenta no exenta hacia otro banco para abrir un CDT a corto plazo (30–60 días), el 0.4% del Gravamen a los Movimientos Financieros puede consumir más de un mes de rentabilidad neta. Prioriza cuentas marcadas como exentas de 4x1000 o transferencias dentro de la misma entidad.",
        ],
      },
    ],
    faq: [
      {
        q: "¿La Retención en la Fuente del 4% se cobra sobre todo mi dinero?",
        a: "No. Se aplica únicamente sobre los intereses generados (la ganancia), jamás sobre el capital depositado inicialmente.",
      },
      {
        q: "¿Es mejor un CDT a 180 días o renovar uno de 90 días dos veces?",
        a: "Si anticipas que las tasas de interés del Banco de la República van a bajar en los próximos meses, amarrar una tasa alta a 180 o 360 días protege tu rendimiento. Si esperas subidas de tasas, plazos cortos de 90 días te dan flexibilidad para renovar más arriba.",
      },
      {
        q: "¿Cómo comparo un CDT tradicional vs. una cajita remunerada?",
        a: "Resta primero el 4% de ReteFuente sobre los intereses esperados y evalúa la penalización por iliquidez. Un CDT solo compensa si supera de forma clara la tasa líquida diaria disponible tras costos de transferencia.",
      },
    ],
  },
  {
    slug: "guia-inflacion-rentabilidad-real.html",
    id: "inflacion-real",
    category: "Macroeconomía & Divisas",
    readTime: "6 min de lectura",
    title:
      "Rentabilidad Nominal vs. Real: Cómo la Inflación y el USD/COP Transforman tu Portafolio",
    summary:
      "Por qué una ganancia nominal positiva puede esconder pérdida de poder adquisitivo y cómo aplicar el deflactor IPC junto con el tipo de cambio USD/COP en inversiones internacionales.",
    keywords:
      "rentabilidad real, ecuación de Fisher, deflactación por inflación, USD COP inversiones, poder adquisitivo",
    highlights: [
      "Diferencia entre retorno nominal, retorno en moneda local y retorno real deflactado.",
      "Ecuación de Fisher paso a paso sin aproximaciones engañosas.",
      "Efecto cambiario (FX) al invertir desde Colombia en ETFs en dólares.",
    ],
    sections: [
      {
        heading: "La ilusión monetaria en los extractos financieros",
        paragraphs: [
          "Casi todas las aplicaciones bancarias y brókers muestran un único número: la variación nominal en la moneda del instrumento (por ejemplo, +10% en USD o +9% en COP). Sin embargo, el dinero no vale por su cifra impresa, sino por los bienes y servicios que puede comprar en el momento en que decides utilizarlo.",
          "Si durante un año tu portafolio creció 8% nominal, pero el nivel general de precios (IPC) aumentó 7%, tu riqueza real apenas avanzó cerca de 0.93%, no 1%. Confundir ambos conceptos genera decisiones erróneas de retiro y sobreestima el crecimiento patrimonial de largo plazo.",
        ],
      },
      {
        heading: "Cómo calcular la rentabilidad real exacta (Ecuación de Fisher)",
        paragraphs: [
          "Muchos inversionistas cometen el error de hacer una resta simple: retorno nominal menos inflación. Aunque sirve como estimado rápido cuando las tasas son bajas, la fórmula financiera exacta es multiplicativa y se conoce como la ecuación de Fisher:",
          "1 + r_real = (1 + r_nominal) / (1 + π)",
          "Despejando, obtenemos r_real = [ (1 + r_nominal) / (1 + π) ] − 1. Por ejemplo, con un rendimiento de +18% anual y una inflación acumulada del 6%: (1.18 / 1.06) − 1 = +11.32% real (mientras que la resta simple habría dicho erróneamente 12%). En períodos multianuales de 5 o 10 años, esta diferencia compuesta se amplía significativamente.",
        ],
        formula: "r_real = ((1 + r_nominal) / (1 + IPC)) − 1",
      },
      {
        heading: "La tercera dimensión para inversionistas en LATAM: Tipo de Cambio (USD/COP)",
        paragraphs: [
          "Cuando resides o gastas principalmente en pesos colombianos (COP) pero inviertes en acciones o ETFs estadounidenses denominados en dólares (USD), tu rentabilidad real doméstica pasa por una cadena de tres eslabones:",
          "Primero, el retorno del activo en USD. Segundo, la variación del tipo de cambio TRM USD/COP entre la fecha de compra y la fecha de valoración. Tercero, la deflactación contra el IPC colombiano acumulado en el mismo período.",
          "Si el S&P 500 sube +12% en USD durante un año en el que el peso colombiano se fortalece 8% frente al dólar (es decir, el USD/COP cae de 4.200 a 3.864), tu retorno convertido a COP será (1.12 × 0.92) − 1 = +3.04% nominal en COP. Si la inflación en Colombia fue 5.2%, tu rentabilidad real medida en capacidad de compra local habría sido negativa (−2.05%) pese al buen año de Wall Street.",
        ],
      },
      {
        heading: "Estrategia para medir ambos mundos sin entrar en pánico",
        paragraphs: [
          "Medir tus inversiones tanto en USD puros como en COP deflactado te protege de dos sesgos opuestos: el sesgo de exceso de optimismo cuando el dólar sube temporalmente por pánico local (disfrazando una mala selección de activos), y el sesgo de pánico cuando el USD baja temporalmente aunque tus empresas sigan componiendo beneficios sólidos en moneda dura.",
          "En Kpital recomendamos analizar cada portafolio en sus tres niveles: Nominal en moneda origen (USD), Convertido a moneda local (FX) y Real ajustado por inflación acumulada.",
        ],
      },
    ],
    faq: [
      {
        q: "¿Qué IPC debo usar si invierto en dólares pero vivo en Colombia?",
        a: "Si el destino final de tu patrimonio es financiar gastos o retiro en Colombia, debes deflactar la valoración convertida a COP usando el IPC colombiano. Si planeas gastar en dólares, deflacta la serie en USD usando el CPI de Estados Unidos.",
      },
      {
        q: "¿Por qué la ecuación de Fisher da un resultado distinto a restar directamente?",
        a: "Porque la inflación también erode el poder adquisitivo de los intereses o ganancias nuevas que generaste durante el período, no únicamente el capital inicial.",
      },
    ],
  },
  {
    slug: "guia-interes-compuesto-etfs-dca.html",
    id: "interes-compuesto-dca",
    category: "Renta Variable & ETFs",
    readTime: "7 min de lectura",
    title: "Interés Compuesto, Dollar-Cost Averaging (DCA) y Métricas de Riesgo en ETFs",
    summary:
      "Cómo construir patrimonio sistemático con aportes periódicos en índices globales (S&P 500, Nasdaq-100) y evaluar la calidad del retorno usando Sharpe Ratio, Alfa y Drawdown.",
    keywords:
      "interés compuesto, Dollar Cost Averaging DCA, ETF S&P 500 CSPX, Sharpe Ratio, drawdown máximo",
    highlights: [
      "Matemática del DCA mensual vs. intentar adivinar el piso del mercado.",
      "Por qué las tasas de retorno y comisiones (TER) alteran el resultado a 15–20 años.",
      "Cómo leer Sharpe Ratio, Volatilidad y Drawdown sin ser analista cuantitativo.",
    ],
    sections: [
      {
        heading: "El verdadero motor del interés compuesto: tiempo + constancia",
        paragraphs: [
          "La mayoría de las personas subestima el crecimiento exponencial porque durante los primeros 3 a 5 años casi todo el saldo proviene de los aportes realizados de tu bolsillo. Sin embargo, a partir de la segunda década, los rendimientos generados sobre rendimientos previos superan con creces tu contribución mensual.",
          "Considera un ejemplo conservador con aportes de $200 USD mensuales a una tasa anual compuesta esperada del 9.5% durante 20 años: habrás aportado $48.000 USD en efectivo, pero el capital acumulado superará los $130.000 USD nominales. Más del 63% del patrimonio final proviene únicamente de la capitalización acumulada.",
        ],
        formula: "VF = P(1 + r)^n + A × [ ((1 + r)^n − 1) / r ]",
      },
      {
        heading: "¿Por qué aplicar Dollar-Cost Averaging (DCA) semanal o mensual?",
        paragraphs: [
          "El Dollar-Cost Averaging consiste en invertir una suma fija en fechas predefinidas (por ejemplo cada semana o cada quincena) sin intentar predecir si el mercado está caro o barato ese día. Este hábito elimina el bloqueo emocional que paraliza a la mayoría cuando las bolsas caen.",
          "Matemáticamente, al aportar un monto constante en dinero, compras automáticamente más participaciones o acciones fraccionadas cuando el precio baja y menos participaciones cuando el precio está alto. Con el tiempo, tu precio promedio ponderado de adquisición se suaviza sin depender de acertar momentos perfectos de entrada.",
        ],
      },
      {
        heading: "Métricas institucionales clave más allá del % de retorno total",
        paragraphs: [
          "Dos portafolios pueden ganar +15% en un año y tener riesgos radicalmente distintos. Por eso la gestión patrimonial cuantitativa complementa el rendimiento con tres indicadores esenciales:",
          "1. Sharpe Ratio (Retorno ajustado por riesgo): mide cuánta rentabilidad extra obtienes por encima de la tasa libre de riesgo por cada unidad de volatilidad asumida. Un Sharpe superior a 1.0 indica eficiencia sólida; por debajo de 0.5 sugiere que estás asumiendo turbulencia excesiva para el premio obtenido.",
          "2. Máximo Drawdown (Caída máxima pico-a-valle): refleja el peor retroceso porcentual que sufrió la curva de capital antes de volver a un nuevo máximo histórico. Conocer si una cartera cayó −15% o −45% en crisis anteriores evita vender en pánico cuando llegue la siguiente corrección.",
          "3. Alfa (α) contra Benchmark: mide la rentabilidad excedente respecto a un índice de referencia comparable (como S&P 500 o Nasdaq-100). Si asumes el riesgo de seleccionar acciones individuales y obtienes Alfa negativo consistente frente a un ETF acumulativo de bajo costo (TER ~0.07% como CSPX.L), un fondo indexado habría sido más rentable y tranquilo.",
        ],
      },
    ],
    faq: [
      {
        q: "¿Importa empezar con montos pequeños como $20 o $100 USD?",
        a: "Sí. Con acceso a acciones fraccionadas y ETFs de bajo costo, el hábito sistemático desde temprano tiene mucho mayor impacto matemático que esperar varios años a juntar una suma grande mientras pierdes años de capitalización.",
      },
      {
        q: "¿Qué son los ETFs acumulativos irlandeses (UCITS) como CSPX o CNDX?",
        a: "Son fondos indexados domiciliados en Irlanda que reinvierten automáticamente los dividendos de las empresas dentro del mismo fondo sin distribuir efectivo cada trimestre, reduciendo fricción operativa y retenciones en dividendos estadounidenses para inversionistas no residentes en EE.UU.",
      },
    ],
  },
  {
    slug: "guia-nomina-colombia-presupuesto.html",
    id: "nomina-presupuesto",
    category: "Flujo de Caja & Nómina CO",
    readTime: "8 min de lectura",
    title: "Nómina Legal en Colombia (Dependiente vs. Independiente) y Método 50/30/20",
    summary:
      "Desglose claro de aportes obligatorios de Salud, Pensión, Fondo de Solidaridad Pensional (FSP), Auxilio de Transporte, planilla PILA sobre el 40% (IBC) y distribución inteligente del neto.",
    keywords:
      "liquidación nómina Colombia, PILA independiente 40% IBC, Fondo de Solidaridad Pensional, regla 50 30 20",
    highlights: [
      "Deducciones reales en contrato laboral: 4% Salud, 4% Pensión y escalas de FSP.",
      "Cálculo exacto de PILA para contratistas por prestación de servicios (IBC 40%).",
      "Cómo convertir tu neto disponible en un presupuesto equilibrado 50/30/20.",
    ],
    sections: [
      {
        heading: "Contrato laboral (Dependiente): qué te descuentan y qué recibes",
        paragraphs: [
          "En Colombia, el salario pactado en un contrato laboral no es el monto que llega intacto a tu cuenta bancaria cada mes. Sobre el salario base devengado se descuentan legalmente dos aportes obligatorios a cargo del trabajador: 4% para Salud y 4% para Pensión (el empleador asume adicionalmente porcentajes mayores de seguridad social y parafiscales).",
          "Si tu salario mensual supera 4 Salarios Mínimos Legales Mensuales Vigentes (SMLMV), aplica además el aporte al Fondo de Solidaridad Pensional (FSP), que inicia en 1% entre 4 y 16 SMLMV y escala progresivamente hasta 2% por encima de 20 SMLMV.",
          "En el extremo opuesto, quienes devengan hasta 2 SMLMV tienen derecho legal al Auxilio de Transporte vigente, que se suma al pago neto de bolsillo (y no hace base para descuentos de salud/pensión).",
        ],
      },
      {
        heading: "Prestación de Servicios (Independiente): cómo calcular el IBC del 40% y la PILA",
        paragraphs: [
          "Cuando trabajas como independiente o freelance bajo contrato de prestación de servicios, eres responsable directo del pago de tu seguridad social mediante la planilla PILA antes de recibir o legalizar honorarios.",
          "La ley colombiana establece que el Ingreso Base de Cotización (IBC) corresponde al 40% del valor mensual bruto de tus honorarios (sin IVA), con un piso mínimo equivalente a 1 SMLMV. Sobre ese IBC calculado del 40% debes liquidar:",
          "• Salud: 12.5% del IBC (equivale al 5.0% efectivo sobre tus honorarios brutos). • Pensión: 16.0% del IBC (equivale al 6.4% efectivo sobre honorarios brutos). • ARL (Riesgos Laborales): entre 0.522% (Riesgo I oficina) y 6.960% (Riesgo V alto riesgo) sobre el IBC.",
          "Sumando salud, pensión y ARL Riesgo I, la carga mínima de PILA ronda el ~11.6% de los honorarios brutos antes de retenciones tributarias (como ReteFuente o ReteICA municipal si aplican).",
        ],
        formula: "IBC = max(SMLMV, Honorarios × 0.40) | PILA = IBC × (0.125 + 0.16 + ARL)",
      },
      {
        heading: "Convertir el flujo neto en patrimonio con la regla 50 / 30 / 20",
        paragraphs: [
          "Conocer exactamente tu ingreso neto real en caja evita presupuestar sobre ingresos brutos ilusorios. A partir del salario neto efectivo en banco, la regla clásica 50/30/20 propone dividir tu flujo mensual en tres pilares:",
          "• 50% Necesidades esenciales: arriendo o cuota hipotecaria, servicios públicos, alimentación base, transporte, salud complementaria y obligaciones financieras mínimas.",
          "• 30% Estilo de vida y deseos: entretenimiento, restaurantes, viajes, suscripciones y compras discrecionales. Mantener este tope controlado evita que el aumento de ingresos se transforme automáticamente en inflación de estilo de vida.",
          "• 20% Riqueza futura (Inversión y Fondo de Emergencia): transferencias automáticas a cuentas remuneradas para tu colchón de 3–6 meses de runway y compras periódicas en portafolios de renta fija o renta variable.",
        ],
      },
    ],
    faq: [
      {
        q: "¿Si soy independiente con honorarios por debajo de 2.5 SMLMV sobre qué pago PILA?",
        a: "Como el 40% de tus honorarios sería inferior a 1 SMLMV, la ley fija automáticamente el IBC mínimo en 1 SMLMV completo para la liquidación de Salud, Pensión y ARL.",
      },
      {
        q: "¿Cómo adapto el 50/30/20 si mis gastos fijos superan hoy el 50%?",
        a: "Puedes empezar con una variante temporal realista (por ejemplo 60/25/15 o 65/25/10) automatizando primero ese 10%–15% de ahorro apenas recibas tu nómina, mientras reduces costos fijos recurrentes o incrementas ingresos.",
      },
    ],
  },
  {
    slug: "guia-cuentas-alto-rendimiento-vs-cdt-colombia.html",
    id: "cuentas-remuneradas-vs-cdt",
    category: "Liquidez & Bancos Digitales",
    readTime: "8 min de lectura",
    title:
      "Cuentas de Alto Rendimiento (Cajitas y Bolsillos Remunerados) vs. CDTs en Colombia: Liquidez, 4x1000 y Tasa Real",
    summary:
      "Análisis matemático comparativo entre cuentas de ahorro remuneradas con liquidación diaria (Nu, Pibank, Lulo, RappiPay, Ualá) y Certificados de Depósito a Término (CDTs) según horizonte, impuestos y riesgo de tasa.",
    keywords:
      "cajitas remuneradas Colombia, cuenta alto rendimiento vs CDT, Nu Colombia Pibank Lulo, liquidez diaria E.A., 4x1000 ahorros",
    highlights: [
      "Por qué una tasa variable diaria tiene un riesgo de reinversión distinto a la tasa fija garantizada de un CDT.",
      "Cálculo del punto de equilibrio en días cuando el traslado entre bancos genera cobro de 4x1000 (GMF).",
      "Arquitectura híbrida recomendada: Liquidez operativa en bolsillos remunerados + tramos fijos en CDTs.",
    ],
    sections: [
      {
        heading: "¿Cómo capitalizan intereses las cuentas de alto rendimiento en Colombia?",
        paragraphs: [
          "En los últimos años el ecosistema bancario colombiano transformó el ahorro a la vista mediante cuentas y bolsillos remunerados (conocidos popularmente como cajitas o bolsillos de rendimiento) que ofrecen tasas entre el 8% y el 12% Efectivo Anual (E.A.) sin exigir plazo mínimo de permanencia. Matemáticamente, la entidad toma la tasa E.A. vigente ese día y calcula el factor diario equivalente mediante la raíz 365:",
          "Tasa Diaria Equivalente = (1 + E.A.)^(1 / 365) − 1",
          "Por ejemplo, a una tasa del 10.0% E.A., el factor diario es (1.10)^(1/365) − 1 ≈ 0.026116% por día ($2.611,6 COP brutos diarios por cada $10.000.000 COP ahorrados). Al igual que en los CDTs, cuando los intereses diarios superan la base mínima diaria gravable o se abonan mensualmente, aplica la Retención en la Fuente del 4% únicamente sobre el rendimiento generado.",
        ],
        formula: "Interés Diario Bruto = Saldo × [ (1 + r_EA)^(1 / 365) − 1 ]",
      },
      {
        heading: "La diferencia crítica: Tasa Variable a la Vista vs. Tasa Fija Garantizada (CDT)",
        paragraphs: [
          "El error más frecuente entre ahorradores consiste en asumir que una cuenta de ahorro que hoy anuncia 10% E.A. pagará ese mismo 10% durante los próximos 12 meses. Las cuentas de ahorro tienen tasa variable: cuando la Junta Directiva del Banco de la República recorta su tasa de intervención porque la inflación cede, los neobancos y compañías de financiamiento ajustan a la baja las tasas de sus bolsillos con pocos días de preaviso.",
          "Un CDT, por el contrario, constituye un contrato de tasa fija inmodificable durante todo el plazo pactado (90, 180, 360 o 540 días). En ciclos de bajadas de tasas de interés, asegurar un CDT a 180 o 360 días con 10.5% o 11.2% E.A. blinda tu flujo futuro frente a recortes sucesivos en las cuentas a la vista.",
        ],
      },
      {
        heading: "El costo oculto del 4x1000 (GMF) al cambiar de entidad por 0.5% extra de tasa",
        paragraphs: [
          "En Colombia solo puedes marcar una única cuenta de ahorros como exenta del Gravamen a los Movimientos Financieros (4x1000) hasta el tope mensual legal de 350 UVT (o repartir el tope bajo las reglas de marcación abierta vigentes cuando la infraestructura interbancaria lo aplica). Si retiras $20.000.000 COP de una cuenta no exenta para trasladarlos a otro banco que ofrece +0.8% E.A. adicional, pagarás de entrada $80.000 COP en 4x1000 (0.4% sobre el capital total).",
          "Recuperar ese 0.4% inicial de capital mediante un diferencial de tasa de apenas +0.8% E.A. neto toma aproximadamente 185 días (medio año). Si el dinero iba a permanecer menos de 6 meses, el traslado destruyó valor neto. Por eso nunca debes mover capital entre entidades no exentas sin calcular primero los días de amortización del GMF.",
        ],
        formula: "Días para recuperar 4x1000 ≈ (0.004 / Diferencial_Tasa_Neta_Anual) × 365",
      },
      {
        heading: "Matriz de decisión: ¿Cuándo elegir Cajita Remunerada y cuándo CDT?",
        paragraphs: [
          "1. Capital que podrías necesitar entre hoy y 90 días (pago de impuestos, matrícula, arriendo, fondo de imprevistos inmediatos): 100% en Cuenta de Alto Rendimiento con disponibilidad 24/7.",
          "2. Capital con fecha conocida entre 180 y 540 días (compra programada, cuota inicial, reserva de largo plazo) en un entorno donde se proyectan recortes de tasas del Banco de la República: CDT con cobertura FOGAFIN para congelar la tasa alta durante todo el horizonte.",
        ],
      },
    ],
    faq: [
      {
        q: "¿Las cuentas de alto rendimiento como Nu, Pibank, Lulo o Ualá tienen seguro FOGAFIN?",
        a: "Sí, siempre que la entidad opere bajo licencia de establecimiento bancario o compañía de financiamiento vigilada por la Superintendencia Financiera de Colombia (SFC) e inscrita en FOGAFIN, el seguro de depósitos cubre hasta $50.000.000 COP por persona y por entidad.",
      },
      {
        q: "¿Se cobra 4x1000 al mover dinero entre la cuenta principal y los bolsillos o cajitas del mismo banco?",
        a: "No. Los traslados internos entre el saldo disponible de tu cuenta de ahorros y sus propios bolsillos o cajitas dentro de la misma cuenta y titularidad no constituyen disposición hacia terceros y no causan 4x1000.",
      },
    ],
  },
  {
    slug: "guia-etfs-acumulativos-ucits-colombia-irlanda.html",
    id: "etfs-ucits-irlanda",
    category: "Inversión Global & Fiscalidad",
    readTime: "9 min de lectura",
    title:
      "ETFs Acumulativos UCITS (Irlanda) vs. ETFs de EE.UU. para Inversionistas en Latinoamérica: Dividendos y Retención 15% vs. 30%",
    summary:
      "Guía técnica sobre por qué los ETFs domiciliados en Irlanda (como CSPX.L, VUAA.L, CNDX.L o IWDA.L) reducen la retención tributaria de dividendos estadounidenses del 30% al 15% y automatizan la reinversión compuesta.",
    keywords:
      "ETF acumulativo UCITS Irlanda, CSPX vs VOO Colombia, retención dividendos W-8BEN 30% 15%, invertir S&P 500 desde Colombia, Mercado Global Colombiano",
    highlights: [
      "Por qué un residente fiscal en Colombia sin tratado de doble tributación con EE.UU. sufre una retención del 30% sobre dividendos en VOO o SPY.",
      "Ventaja del tratado Irlanda–EE.UU. (15% de retención interna) y del mecanismo de acumulación (Acc) sin distribución de caja.",
      "Protección frente al impuesto sucesoral estadounidense (Estate Tax sobre activos US-situated mayores a $60.000 USD).",
    ],
    sections: [
      {
        heading: "El problema fiscal oculto al comprar VOO, SPY o QQQ desde Colombia",
        paragraphs: [
          "Cuando un inversionista residente en Colombia (o en la mayoría de países de Sudamérica que no poseen Tratado de Doble Tributación vigente con Estados Unidos) compra directamente un ETF domiciliado en EE.UU. como VOO, IVV, SPY o QQQ a través de un bróker internacional, firma el formulario W-8BEN para certificar que no es residente fiscal estadounidense.",
          "Gracias al W-8BEN, las ganancias de capital por vender la acción más cara no sufren retención en EE.UU.; sin embargo, cada vez que el ETF reparte dividendos trimestrales, el fisco estadounidense (IRS) aplica una retención automática en la fuente del 30% sobre el dividendo bruto. Además, ese dividendo neto recibido puede generar obligación de reporte y tributación adicional en la declaración de renta local.",
        ],
      },
      {
        heading: "Cómo funcionan los ETFs UCITS domiciliados en Irlanda (CSPX, VUAA, CNDX, EIMI)",
        paragraphs: [
          "Los ETFs regulados bajo la directiva europea UCITS y domiciliados en Irlanda (que cotizan en la Bolsa de Londres en USD como CSPX.L, VUAA.L, CNDX.L o IWDA.L, y muchos de los cuales también están listados en el Mercado Global Colombiano de la BVC) aprovechan el tratado tributario bilateral entre Irlanda y Estados Unidos.",
          "Bajo dicho tratado, cuando las empresas del S&P 500 (Apple, Microsoft, Nvidia, etc.) pagan dividendos al fondo irlandés, la retención interna en EE.UU. se reduce del 30% al 15%. Posteriormente, Irlanda no aplica ninguna retención adicional al inversionista extranjero no residente en Irlanda.",
        ],
        formula: "Fuga Fiscal Anual en Dividendos: ETF USA (30% × Yield) vs. ETF Irlanda UCITS (15% × Yield)",
      },
      {
        heading: "Acumulación (Acc) vs. Distribución (Dist): interés compuesto sin fricción",
        paragraphs: [
          "Los ETFs UCITS suelen ofrecer dos clases de participaciones: Distributing (Dist), que pagan los dividendos en efectivo a la cuenta del bróker, y Accumulating (Acc), que reinvierten automáticamente los dividendos netos dentro del valor liquidativo (NAV) del propio fondo comprando más acciones del índice sin intervención del usuario.",
          "Para un inversionista en etapa de construcción patrimonial, un ETF Acumulativo (como CSPX.L o VUAA.L para el S&P 500) ofrece tres ventajas simultáneas: 1) ahorra el 50% de la retención en origen de EE.UU. (15% vs 30%), 2) evita pagar comisiones de compra o spreads cambiarios por reinvertir pequeños dividendos trimestrales, y 3) difiere el evento de flujo de caja hasta el momento en que el inversionista decida vender participaciones años después.",
        ],
      },
      {
        heading: "Impuesto Sucesoral en EE.UU. (US Estate Tax): el límite de los $60.000 USD",
        paragraphs: [
          "Existe un segundo factor patrimonial crítico para portafolios medianos y grandes: Estados Unidos aplica un impuesto federal a las herencias (Estate Tax) de hasta el 40% sobre activos considerados 'US-situated' (acciones individuales de empresas estadounidenses y ETFs domiciliados en EE.UU. como VOO/SPY) que pertenezcan a extranjeros no residentes (Non-Resident Aliens) en la parte que supere apenas $60.000 USD al momento del fallecimiento.",
          "Los ETFs UCITS domiciliados en Irlanda, aunque inviertan el 100% de su cartera en acciones del S&P 500, son jurídicamente fondos irlandeses (non-US situs assets), por lo que no computan dentro de la base de $60.000 USD del impuesto sucesoral estadounidense.",
        ],
      },
    ],
    faq: [
      {
        q: "¿Un ETF acumulativo como CSPX.L tiene mayor comisión (TER) que VOO?",
        a: "El TER de CSPX.L es 0.07% anual frente al 0.03% de VOO (una diferencia de 0.04%). Sin embargo, con un dividend yield del S&P 500 cercano al 1.4%, el ahorro del 15% en retención de dividendos representa ~0.21% anual a favor de CSPX.L, superando más de cinco veces la pequeña diferencia en comisión de administración.",
      },
      {
        q: "¿En qué moneda cotizan CSPX.L o CNDX.L en la Bolsa de Londres?",
        a: "Aunque coticen en el London Stock Exchange (.L), las series principales como CSPX.L (S&P 500), CNDX.L (Nasdaq-100) e IWDA.L (MSCI World) cotizan y se liquidan directamente en dólares estadounidenses (USD).",
      },
    ],
  },
  {
    slug: "guia-4x1000-gmf-exenciones-colombia.html",
    id: "gmf-4x1000-colombia",
    category: "Impuestos & Banca CO",
    readTime: "7 min de lectura",
    title:
      "Gravamen a los Movimientos Financieros (4x1000 / GMF) en Colombia: Topes en UVT, Cuentas Exentas y Costo en Inversiones",
    summary:
      "Explicación normativa y matemática del impuesto del 4x1000 (0.4%) en Colombia, cómo opera el límite mensual de 350 UVT y cómo evitar que erosione la rentabilidad de tus CDTs y cuentas de ahorro.",
    keywords:
      "4x1000 Colombia GMF, tope 350 UVT 4x1000, exención 4x1000 cuentas de ahorro, impacto 4x1000 en CDT",
    highlights: [
      "Matemática exacta del 4x1000: por qué cobrar 0.4% al salir y 0.4% al regresar destruye casi un mes de intereses.",
      "Tope legal de 350 UVT mensuales en cuentas de ahorro y de 65 UVT en depósitos de bajo monto.",
      "Exenciones especiales en traslados entre cuentas de un mismo titular dentro de la misma entidad y reinversión de CDTs.",
    ],
    sections: [
      {
        heading: "¿Qué es el GMF (4x1000) y cuándo se causa legalmente?",
        paragraphs: [
          "El Gravamen a los Movimientos Financieros (GMF), conocido como 4x1000, es un impuesto nacional indirecto regulado en el Estatuto Tributario colombiano (Artículos 870 y siguientes) que grava con una tarifa del 0.4% ($4 pesos por cada $1.000 pesos) la disposición de recursos depositados en cuentas corrientes, cuentas de ahorro y depósitos electrónicos.",
          "Es fundamental entender que el 4x1000 se causa en el momento de la salida o retiro del dinero (transferencias a otros bancos, pagos a terceros, retiros en cajero), no cuando recibes ingresos o consignaciones en tu cuenta.",
        ],
        formula: "Impuesto GMF = Monto Retirado Sujeto a Gravamen × 0.004",
      },
      {
        heading: "El tope mensual de 350 UVT y los depósitos de bajo monto (65 UVT)",
        paragraphs: [
          "La legislación tributaria permite que toda persona natural goce de una exención de 4x1000 hasta por un monto acumulado de retiros mensuales de 350 Unidades de Valor Tributario (UVT). Tomando como referencia una UVT de $49.799 COP, 350 UVT equivalen a aproximadamente $17.429.650 COP mensuales libres del impuesto.",
          "Adicionalmente, los depósitos electrónicos o cuentas de trámite simplificado / bajo monto (como billeteras digitales específicas mientras conserven dicha categoría regulatoria) cuentan con un tope exento independiente de hasta 65 UVT mensuales (~$3.236.935 COP) sin consumir la marcación principal de 350 UVT de tu cuenta bancaria tradicional.",
        ],
      },
      {
        heading: "Operaciones de inversión exentas del 4x1000 que debes conocer",
        paragraphs: [
          "1. Traslados entre cuentas de ahorro y/o corrientes de un mismo y único titular abiertas dentro de la misma entidad vigilada: si tienes tu cuenta de nómina y otra cuenta de ahorro o bolsillo en el mismo banco a tu nombre, mover fondos entre ellas está exento.",
          "2. Apertura y cancelación/renovación de CDTs o Fondos de Inversión Colectiva (FIC) vinculados a tu cuenta en la misma entidad financiera bajo las causales de exención del Artículo 879 del Estatuto Tributario. Siempre verifica con tu entidad que el abono al vencimiento regrese a tu cuenta registrada del mismo titular para no causar un descuento innecesario.",
        ],
      },
    ],
    faq: [
      {
        q: "¿Qué pasa si en el mes retiro más del tope de 350 UVT en mi cuenta exenta?",
        a: "Los primeros 350 UVT retirados en el mes calendario tendrán cobro de $0 por GMF. Únicamente sobre el excedente que supere los 350 UVT se aplicará el 0.4% hasta que inicie el siguiente mes calendario.",
      },
      {
        q: "¿Pagar mi tarjeta de crédito causa 4x1000?",
        a: "Si pagas tu tarjeta de crédito debitando desde una cuenta de ahorros que NO está exenta (o si ya superaste el tope mensual de 350 UVT), el débito de la cuenta de ahorros sí causa 4x1000. En cambio, las compras que realizas directamente con el cupo de la tarjeta de crédito no causan 4x1000.",
      },
    ],
  },
  {
    slug: "guia-fondo-emergencia-liquidez-escalera-cdts.html",
    id: "fondo-emergencia-escalera-cdts",
    category: "Arquitectura Patrimonial",
    readTime: "8 min de lectura",
    title:
      "Cómo Construir un Fondo de Emergencia y una Escalera de CDTs (Bond Ladder) sin Perder Liquidez ni Rentabilidad",
    summary:
      "Metodología paso a paso para dimensionar tu colchón de seguridad de 3 a 6 meses de gastos esenciales y estructurar una escalera rotativa de CDTs que vence cada mes o trimestre.",
    keywords:
      "fondo de emergencia Colombia, escalera de CDTs bond ladder, cuántos meses de gastos ahorrar, liquidez patrimonial",
    highlights: [
      "Por qué el fondo de emergencia se calcula sobre gastos esenciales (50% Necesidades) y no sobre el salario bruto.",
      "Estructura en dos anillos: Anillo 1 en cuenta remunerada a la vista (meses 1–2) y Anillo 2 en escalera de CDTs (meses 3–6).",
      "Cómo funciona una Escalera de CDTs trimestral para capturar tasas altas de 360 días teniendo liquidez cada 90 días.",
    ],
    sections: [
      {
        heading: "¿Cuánto dinero debe tener exactamente tu Fondo de Emergencia?",
        paragraphs: [
          "Un fondo de emergencia no es dinero para invertir en acciones ni para aprovechar ofertas comerciales; es un seguro de continuidad operativa para tu hogar frente a pérdida de empleo, incapacidad médica, averías críticas o retrasos en el pago de clientes si eres independiente.",
          "La métrica correcta se denomina Runway (Pista de Aterrizaje) y se mide en meses de Costos Fijos Esenciales (arriendo/hipoteca, alimentación básica, servicios públicos, salud/PILA y cuotas mínimas de deuda). Para un empleado con contrato a término indefinido, el estándar técnico es de 3 a 4 meses de gastos esenciales; para un trabajador independiente o con ingresos variables, de 6 a 9 meses.",
        ],
        formula: "Meta Fondo Emergencia = Gastos Fijos Esenciales Mensuales × Meses de Runway (3 a 6)",
      },
      {
        heading: "Arquitectura en 2 Anillos de Liquidez (Cajita + Escalera de CDTs)",
        paragraphs: [
          "Ninguna emergencia real exige gastar los 6 meses de reserva en un solo día; si pierdes tu fuente principal de ingresos, consumirás tu reserva mes a mes a lo largo de medio año. Por tanto, mantener los 6 meses completos inmovilizados en una sola cuenta o en un solo CDT largo es ineficiente.",
          "La solución institucional consiste en dividir el fondo en dos anillos: • Anillo 1 (Liquidez Inmediata T+0, equivalente a 1.5–2 meses de gastos): depositado en una cuenta de ahorro de alto rendimiento exenta o de retiro inmediato. • Anillo 2 (Reserva Escalonada, equivalente a los meses 3 a 6): distribuido en una Escalera de CDTs (CDT Ladder).",
        ],
      },
      {
        heading: "¿Cómo armar una Escalera de CDTs (CDT Ladder) de 4 peldaños?",
        paragraphs: [
          "Supongamos que tu Anillo 2 suma $12.000.000 COP. En lugar de abrir un único CDT por los $12 millones a 360 días (lo que te dejaría sin acceso al dinero durante un año entero), divides el capital en 4 CDTs de $3.000.000 COP cada uno con vencimientos escalonados:",
          "• Peldaño 1: $3.000.000 a 90 días. • Peldaño 2: $3.000.000 a 180 días. • Peldaño 3: $3.000.000 a 270 días. • Peldaño 4: $3.000.000 a 360 días.",
          "Cuando vence el Peldaño 1 a los 90 días, si no tuviste ninguna emergencia, lo renuevas a 360 días (capturando la tasa larga). A los 180 días vence el Peldaño 2 y también lo renuevas a 360 días. A partir del primer ciclo, todos tus CDTs ganarán la tasa superior de 360 días, pero tendrás un título de $3.000.000 + intereses liberándose en efectivo cada 90 días.",
        ],
      },
    ],
    faq: [
      {
        q: "¿Debo invertir en acciones o ETFs antes de completar mi fondo de emergencia?",
        a: "Es recomendable construir al menos el Anillo 1 (1 a 2 meses de gastos esenciales en cuenta remunerada líquida) antes de invertir en renta variable. Sin colchón de liquidez, cualquier imprevisto doméstico te obligará a malvender tus acciones en el peor momento del mercado.",
      },
      {
        q: "¿Dónde debo guardar el fondo de emergencia frente a la inflación?",
        a: "Siempre en instrumentos de renta fija en tu moneda de gasto local (COP) que rindan por encima del IPC anual (cuentas de alto rendimiento y CDTs cubiertos por FOGAFIN), para que el colchón no pierda poder adquisitivo con el paso de los años.",
      },
    ],
  },
  {
    slug: "guia-tarjetas-credito-tasa-usura-cuotas-colombia.html",
    id: "tarjetas-credito-usura-colombia",
    category: "Crédito & Deuda Inteligente",
    readTime: "8 min de lectura",
    title:
      "Matemática de las Tarjetas de Crédito en Colombia: Tasa de Usura SFC, Compras a 1 Cuota vs. Diferidos y Efecto Bola de Nieve",
    summary:
      "Cómo la Superintendencia Financiera certifica el interés bancario corriente y la tasa de usura, por qué diferir compras de consumo destruye tu flujo de caja y cómo usar tarjetas al 0% E.A. real.",
    keywords:
      "tasa de usura Colombia SFC, intereses tarjeta de crédito E.A. a M.V., compras a 1 cuota sin interés, método avalancha vs bola de nieve deudas",
    highlights: [
      "Conversión exacta de la tasa Efectiva Anual (E.A.) de una tarjeta a Tasa Mensual Vencida (M.V.).",
      "Por qué pagar a 1 cuota con cuota de manejo $0 te apalanca gratis hasta 45 días mientras tu nómina rinde en una cajita.",
      "Comparación matemática entre el Método Avalancha (mayor tasa E.A. primero) y Bola de Nieve para salir de deudas.",
    ],
    sections: [
      {
        heading: "De Tasa Efectiva Anual (E.A.) a Tasa Mensual Vencida (M.V.) en tarjetas",
        paragraphs: [
          "En Colombia, la Superintendencia Financiera (SFC) certifica mensualmente el Interés Bancario Corriente para la modalidad de crédito de consumo y ordinario; la Tasa de Usura (el techo máximo legal que puede cobrar cualquier banco) equivale a 1.5 veces dicho interés bancario corriente.",
          "Cuando un banco informa que tu tarjeta de crédito tiene una tasa del 26.0% E.A., no divide 26% entre 12 para cobrarte el mes. Utiliza la conversión exponencial inversa a Tasa Mensual Vencida (M.V.):",
          "Tasa Mensual (M.V.) = (1 + E.A.)^(1 / 12) − 1",
          "Para un 26.0% E.A., la tasa mensual aplicada sobre el saldo financiado es (1.26)^(1/12) − 1 ≈ 1.9445% mensual. Además, en la mayoría de los bancos tradicionales, cualquier compra diferida a 2 o más cuotas empieza a causar intereses corrientes desde el propio día de la compra, no desde la fecha de corte.",
        ],
        formula: "r_mensual = (1 + r_EA)^(1 / 12) − 1",
      },
      {
        heading: "La regla de oro del arbitraje positivo: 1 Cuota (0% interés) + Cajita Remunerada",
        paragraphs: [
          "Casi todas las tarjetas de crédito en Colombia otorgan una tasa del 0% de interés corriente cuando programas la compra a 1 sola cuota y pagas el 100% del saldo facturado antes de la fecha límite de pago (con excepción de avances en efectivo o tarjetas específicas que cobran interés diario desde el día 1, las cuales debes evitar).",
          "Si realizas tus gastos presupuestados del mes a 1 cuota con una tarjeta sin cuota de manejo mientras mantienes el efectivo de tu nómina rentando al 9%–10% E.A. en un bolsillo remunerado hasta el día de pago de la factura, obtienes entre 20 y 45 días de rendimiento financiero gratuito más cashback o puntos, sin pagar un solo peso en intereses.",
        ],
      },
      {
        heading: "Cómo liquidar deudas existentes: Método Avalancha vs. Bola de Nieve",
        paragraphs: [
          "Si ya tienes deuda rotativa acumulada en tarjetas o créditos de consumo al 24%–28% E.A., ningún CDT ni portafolio de acciones conservador superará de forma segura el costo garantizado de esa deuda después de impuestos. Por tanto, abonar a capital de una deuda al 26% E.A. equivale matemáticamente a obtener una rentabilidad libre de riesgo del +26% E.A.",
          "• Método Avalancha (Óptimo Matemático): pagas la cuota mínima obligatoria en todas tus obligaciones y destinas el 100% de tu excedente de liquidez a la deuda con mayor tasa Efectiva Anual (E.A.). Minimiza el total de intereses pagados. • Método Bola de Nieve (Impulso Conductual): priorizas liquidar primero la deuda de menor saldo nominal para liberar flujo mensual rápido.",
        ],
      },
    ],
    faq: [
      {
        q: "¿Conviene romper un CDT o usar ahorros al 9% E.A. para pagar una tarjeta al 25% E.A.?",
        a: "Sí, siempre que preserves tu fondo mínimo de emergencia (1 a 2 meses de gastos básicos). Mantener ahorros rentando al 9% E.A. bruto (8.64% neto tras ReteFuente) mientras pagas 25% E.A. en tarjeta genera una pérdida neta garantizada superior al 16% anual sobre ese monto.",
      },
      {
        q: "¿Qué diferencia hay entre Fecha de Corte y Fecha Límite de Pago?",
        a: "La Fecha de Corte cierra las compras del ciclo que entrarán en tu extracto actual (las compras hechas al día siguiente del corte pasan al extracto del mes siguiente, dándote ~45 días de plazo). La Fecha Límite de Pago ocurre unos 15–20 días después del corte y es el último día para pagar sin intereses de mora.",
      },
    ],
  },
  {
    slug: "guia-declaracion-renta-inversiones-uvt-colombia.html",
    id: "tributacion-inversiones-uvt-colombia",
    category: "Impuestos & Patrimonio CO",
    readTime: "9 min de lectura",
    title:
      "Tributación Básica de Inversiones en Colombia: Componente Inflacionario en Renta Fija, Dividendos, Ganancia Ocasional y UVT",
    summary:
      "Conceptos tributarios fundamentales para ahorradores en Colombia: topes en UVT para declarar renta, beneficio del componente inflacionario en CDTs/cuentas y diferencia entre renta ordinaria y ganancia ocasional.",
    keywords:
      "componente inflacionario CDT declaración de renta, topes declaración de renta UVT Colombia, ganancia ocasional acciones 2 años, impuestos inversiones Colombia",
    highlights: [
      "Topes estándar en UVT (Patrimonio Bruto, Ingresos, Consumos con Tarjeta y Consignaciones) que obligan a presentar declaración.",
      "Qué es el Componente Inflacionario de los rendimientos financieros y por qué reduce la base gravable de tus CDTs.",
      "Diferencia fiscal entre vender un activo antes de 2 años (Renta Ordinaria) vs. mantenerlo 2 años o más (Ganancia Ocasional).",
    ],
    sections: [
      {
        heading: "Declarar renta no siempre significa pagar impuesto: los topes en UVT",
        paragraphs: [
          "En Colombia, la obligación formal de presentar declaración del Impuesto sobre la Renta para personas naturales se mide cada año gravable en Unidades de Valor Tributario (UVT). Quedas obligado a declarar si durante el año calendario superas cualquiera de estos umbrales principales:",
          "• Patrimonio bruto al 31 de diciembre superior a 4.500 UVT. • Ingresos brutos anuales iguales o superiores a 1.400 UVT. • Consumos mediante tarjeta de crédito superiores a 1.400 UVT. • Valor total acumulado de compras y consumos superior a 1.400 UVT. • Valor total acumulado de consignaciones bancarias, depósitos o inversiones financieras superior a 1.400 UVT.",
          "Importante: renovar un CDT varias veces en el año (por ejemplo, abrir un CDT de $40 millones a 90 días y renovarlo 4 veces) suma $160 millones en movimientos/inversiones acumuladas en los reportes de información exógena bancaria, lo cual suele activar el tope de 1.400 UVT para declarar, aunque tu patrimonio real siga siendo de $40 millones.",
        ],
      },
      {
        heading: "El Componente Inflacionario en CDTs y Cuentas de Ahorro",
        paragraphs: [
          "Uno de los beneficios tributarios más importantes para las personas naturales no obligadas a llevar contabilidad que invierten en CDTs, cuentas de ahorro remuneradas o fondos de renta fija en Colombia es el Componente Inflacionario (Artículos 38, 39 y 40-1 del Estatuto Tributario).",
          "Cada año el Gobierno Nacional expide un decreto fijando qué porcentaje de los rendimientos financieros obtenidos en el año correspondió simplemente a compensar la inflación. Esa proporción certificada se declara como Ingreso No Constitutivo de Renta ni Ganancia Ocasional (INCRNGO). Además, el 4% de Retención en la Fuente que el banco ya te descontó sobre los intereses del CDT se resta como anticipo/retención a tu favor en la liquidación del impuesto.",
        ],
      },
      {
        heading: "Acciones y ETFs: Tenencia menor a 2 años vs. 2 años o más (Ganancia Ocasional)",
        paragraphs: [
          "En inversiones de capital (acciones, ETFs o bienes raíces), el Estatuto Tributario colombiano distingue dos regímenes según el tiempo de tenencia del activo fijo antes de su enajenación (venta):",
          "1. Si vendes el activo habiéndolo mantenido menos de dos (2) años: la utilidad obtenida entra a tu cédula general como Renta Ordinaria, sumándose a tus demás ingresos y tributando a tu tarifa marginal progresiva (que puede ir del 0% al 39% según tu nivel de renta líquida en UVT). 2. Si mantienes el activo durante dos (2) años o más antes de venderlo: la utilidad se clasifica como Ganancia Ocasional, sujeta a una tarifa fija independiente (actualmente 15% bajo la normativa vigente), salvo las exenciones específicas para acciones listadas en la Bolsa de Valores de Colombia (BVC) que cumplan los requisitos del Artículo 36-1 del Estatuto Tributario.",
        ],
      },
    ],
    faq: [
      {
        q: "¿Si el banco ya me descontó el 4% de ReteFuente en mi CDT, ese dinero se pierde?",
        a: "No se pierde: si estás obligado a presentar declaración de renta, ese 4% retenido por el banco aparece en tu certificado tributario anual y se descuenta peso a peso del impuesto a cargo que resulte en tu declaración (o aumenta tu saldo a favor).",
      },
      {
        q: "¿Por qué renovar CDTs a 30 o 60 días puede obligarme a declarar renta?",
        a: "Porque los bancos reportan a la DIAN la suma de todas las aperturas/inversiones del año. Si reinviertes el mismo capital 6 veces en CDTs bimestrales, el monto reportado en exógena se multiplica por 6, superando fácilmente el tope de 1.400 UVT de inversiones/consignaciones.",
      },
    ],
  },
  {
    slug: "guia-rebalanceo-portafolio-acciones-renta-fija.html",
    id: "rebalanceo-portafolio-multiactivo",
    category: "Gestión de Portafolios",
    readTime: "8 min de lectura",
    title:
      "Estrategias de Rebalanceo de Portafolio (Renta Fija COP + Acciones USD): Bandas de Tolerancia, Correlación y Control de Riesgo",
    summary:
      "Cómo combinar Renta Fija en pesos (CDTs y cuentas de alto rendimiento) con Renta Variable en dólares (ETFs y acciones) y aplicar bandas de rebalanceo cuantitativo para comprar barato y asegurar ganancias.",
    keywords:
      "rebalanceo de portafolio, asignación de activos asset allocation, renta fija COP vs acciones USD, bandas de rebalanceo 5%",
    highlights: [
      "Por qué la asignación estratégica de activos (Asset Allocation) explica más del 85% de la volatilidad de tu patrimonio.",
      "Cálculo práctico de rebalanceo por calendario vs. rebalanceo por bandas de desviación (±5%).",
      "Cómo usar los nuevos aportes mensuales (flujo de caja e intereses de CDTs) para rebalancear sin vender ni pagar impuestos.",
    ],
    sections: [
      {
        heading: "¿Por qué un portafolio sin rebalanceo se vuelve cada vez más riesgoso?",
        paragraphs: [
          "Supongamos que defines una estructura patrimonial objetivo de 60% en Renta Variable en USD (ETFs globales y acciones de crecimiento) y 40% en Renta Fija en COP (CDTs y cuentas remuneradas). Tras un ciclo alcista fuerte en bolsa o una subida de la TRM USD/COP, la parte de acciones puede crecer hasta representar el 78% de tu patrimonio total, mientras la renta fija cae al 22%.",
          "Si no haces nada, tu portafolio ahora tiene casi cuatro quintas partes expuestas a una corrección bursátil justo cuando las valoraciones están más altas. Rebalancear consiste en restaurar los pesos originales (60% / 40%), lo cual te obliga disciplinadamente a tomar ganancias parciales en lo que subió demasiado o a dirigir liquidez hacia lo que quedó rezagado.",
        ],
      },
      {
        heading: "Rebalanceo por Bandas de Tolerancia (±5%) vs. Calendario Fijo",
        paragraphs: [
          "Existen dos metodologías clásicas utilizadas por gestores institucionales: 1) Rebalanceo por Calendario (por ejemplo, revisar una vez cada semestre o cada año), y 2) Rebalanceo por Bandas de Tolerancia (Threshold Rebalancing), donde solo intervienes cuando una clase de activo se desvía más de ±5 puntos porcentuales de su peso objetivo (por ejemplo, si el bloque del 60% supera el 65% o cae por debajo del 55%).",
          "Estudios empíricos sobre carteras multiactivo demuestran que las bandas de ±5% capturan mejor los picos de volatilidad que una fecha arbitraria del calendario y evitan operar innecesariamente en mercados laterales.",
        ],
        formula: "Desviación de Peso = | (Valor_Clase_Activo / Patrimonio_Total) − Peso_Objetivo |",
      },
      {
        heading: "El método más eficiente en impuestos: Rebalanceo por Flujo de Caja (Cash-Flow Rebalancing)",
        paragraphs: [
          "Vender activos ganadores para comprar activos rezagados puede generar costos de comisión, spreads cambiarios e impuestos sobre ganancias de capital. Para patrimonios en fase de acumulación que reciben ahorro mensual de nómina y cupones/vencimientos de CDTs, existe una alternativa superior:",
          "En lugar de vender el activo que subió, simplemente diriges el 100% de tus nuevos aportes mensuales (el 20% de ahorro de tu regla 50/30/20 más los intereses cobrados) hacia la clase de activo que se encuentre por debajo de su peso objetivo hasta que la proporción regrese a equilibrio.",
        ],
      },
    ],
    faq: [
      {
        q: "¿Cómo actúa el dólar (TRM USD/COP) como amortiguador en un portafolio colombiano?",
        a: "Históricamente, en episodios de aversión global al riesgo o incertidumbre fiscal local, el dólar estadounidense tiende a fortalecerse frente al peso colombiano (sube la TRM). Mantener una fracción estructural del patrimonio en activos productivos en USD y otra en renta fija alta en COP reduce la volatilidad medida en poder de compra total.",
      },
      {
        q: "¿Cada cuánto tiempo debo revisar los pesos de mi portafolio?",
        a: "Una revisión mensual o trimestral coincidiendo con el cierre de tu ciclo de presupuesto o el vencimiento de un peldaño de tu escalera de CDTs es más que suficiente para un inversionista de largo plazo.",
      },
    ],
  },
  {
    slug: "guia-libertad-financiera-tasa-retiro-swr-inflacion.html",
    id: "libertad-financiera-regla-4-swr",
    category: "Retiro & Independencia Financiera",
    readTime: "8 min de lectura",
    title:
      "Matemática del Retiro Patrimonial y la Regla del 4% (SWR) Adaptada a la Inflación y Tasas Reales en Latinoamérica",
    summary:
      "Análisis cuantitativo del Estudio Trinity (Safe Withdrawal Rate del 4%), el riesgo de secuencia de retornos y cómo calcular tu Número de Independencia Financiera (FI Number) usando rentabilidad real neta.",
    keywords:
      "regla del 4 por ciento retiro Colombia, Safe Withdrawal Rate SWR inflación, número de libertad financiera 25x gastos, riesgo de secuencia de retornos",
    highlights: [
      "De dónde sale la regla de acumular 25 veces tus gastos anuales (1 / 0.04 = 25x).",
      "Qué es el Riesgo de Secuencia de Retornos (Sequence of Returns Risk) en los primeros 5 años de retiro.",
      "Cómo adaptar la tasa de retiro segura en Colombia combinando renta real de CDTs/Bonos con ETFs globales.",
    ],
    sections: [
      {
        heading: "¿Qué dice realmente la Regla del 4% (Estudio Trinity) y la fórmula 25x?",
        paragraphs: [
          "El concepto de Tasa de Retiro Segura (Safe Withdrawal Rate o SWR), popularizado por William Bengen y el Estudio Trinity sobre series históricas de acciones y bonos, determinó que un portafolio diversificado (50%–75% acciones y 25%–50% renta fija) podía sostener retiros anuales equivalentes al 4% del capital inicial —ajustados cada año subsiguiente por la inflación— durante al menos 30 años sin agotar el capital en el 95%+ de los períodos históricos.",
          "Al despejar matemáticamente la ecuación (Patrimonio × 0.04 = Gasto Anual), surge el famoso multiplicador de 25 veces tus gastos anuales (o 300 veces tu gasto mensual). Si tus gastos mensuales totales son de $4.000.000 COP ($48.000.000 COP al año), tu capital objetivo bajo una tasa del 4% real anual es de $1.200.000.000 COP.",
        ],
        formula: "Patrimonio Objetivo (FI Number) = Gasto Anual Deseado / Tasa de Retiro Real Segura (SWR)",
      },
      {
        heading: "El mayor peligro al vivir de tus inversiones: Riesgo de Secuencia de Retornos",
        paragraphs: [
          "Dos portafolios pueden promediar exactamente +8% real anual durante 20 años y tener destinos opuestos si estás retirando dinero para vivir. Si sufres una caída bursátil del −30% durante los primeros dos años de tu retiro y sigues vendiendo acciones deprimidas cada mes para pagar tus gastos fijos, descapitalizas la base de unidades de tal forma que el portafolio no logra recuperarse cuando llega el rebote.",
          "Para neutralizar el Riesgo de Secuencia de Retornos, se utiliza un 'Buffer o Colchón de Renta Fija' de 2 a 3 años de gastos de vida en CDTs y cuentas de alto rendimiento en moneda local (COP). Cuando la bolsa global atraviesa un mercado bajista (Drawdown > 15%), financias tus gastos mensuales consumiendo los vencimientos e intereses reales de tus CDTs sin tocar una sola acción a precios de liquidación.",
        ],
      },
      {
        heading: "Cálculo conservador con Tasa Real Neta (3.5% – 4.0% real)",
        paragraphs: [
          "En economías emergentes como Colombia, donde tanto las tasas nominales de los CDTs como la inflación (IPC) son más altas y volátiles que en Estados Unidos o Europa, nunca debes confundir la tasa nominal de un CDT (ej. 10.5% E.A.) con tu tasa de retiro disponible.",
          "Si retiras y gastas el 10.5% completo que te pagó el CDT en un año donde la inflación fue 5.5% y la ReteFuente se llevó el 0.42%, tu capital principal habrá perdido un 5.5% de poder de compra real cada año; en 12 años tu renta comprará apenas la mitad de bienes. Solo puedes retirar la Rentabilidad Real Neta (el excedente por encima del IPC y los impuestos), reinvirtiendo siempre la porción equivalente a la inflación para preservar intacto el poder adquisitivo del capital base.",
        ],
      },
    ],
    faq: [
      {
        q: "¿Es más seguro usar una tasa de retiro del 3.5% (28.5x gastos) si planeo un retiro de más de 35 años?",
        a: "Sí. Para horizontes de retiro temprano superiores a 35–40 años, los estudios actuariales recomiendan una SWR del 3.5% real anual (multiplicar tu gasto anual por 28.5 o tu gasto mensual por 342) junto con flexibilidad para reducir gastos discrecionales en años de recesión.",
      },
      {
        q: "¿Cómo ayuda nuestra Calculadora de Interés Compuesto e Inflación a planear esta meta?",
        a: "Nuestra calculadora proyecta la columna 'Poder de Compra Real' deflactada año tras año en pesos o dólares de hoy, permitiéndote verificar exactamente en qué año tu patrimonio real cruza el umbral de 25x a 28.5x tus gastos anuales.",
      },
    ],
  },
];

export const FINANCIAL_GLOSSARY = [
  {
    term: "Tasa Efectiva Anual (E.A.)",
    category: "Renta Fija & Banca",
    definition:
      "Indicador estandarizado en Colombia que expresa el rendimiento o costo real de un producto financiero en un período de 365 días incluyendo la reinversión (capitalización) de intereses. Permite comparar en igualdad de condiciones CDTs, cuentas de ahorro y créditos sin importar si liquidan intereses diario, mensual o trimestral.",
    formula: "E.A. = (1 + r_periódica)^(365 / días) − 1",
  },
  {
    term: "Ecuación de Fisher (Rentabilidad Real)",
    category: "Macroeconomía",
    definition:
      "Relación matemática exacta que descuenta el efecto de la inflación (IPC) sobre una tasa de rendimiento nominal para revelar cuánto creció o disminuyó realmente el poder adquisitivo del capital.",
    formula: "r_real = [ (1 + r_nominal_neta) / (1 + IPC) ] − 1",
  },
  {
    term: "Retención en la Fuente sobre Rendimientos (4%)",
    category: "Tributación CO",
    definition:
      "Recaudo tributario anticipado del 4% que las entidades financieras en Colombia descuentan automáticamente sobre los intereses ganados en CDTs y cuentas de ahorro. Nunca se aplica sobre el capital inicial aportado.",
    formula: "Interés Neto = Interés Bruto × (1 − 0.04)",
  },
  {
    term: "GMF / 4x1000 (Gravamen a los Movimientos Financieros)",
    category: "Tributación CO",
    definition:
      "Impuesto nacional del 0.4% ($4 por cada $1.000 COP) que se causa al retirar o transferir recursos desde cuentas bancarias no exentas o cuando se supera el tope mensual exento de 350 UVT.",
    formula: "GMF = Monto Gravado × 0.004",
  },
  {
    term: "UVT (Unidad de Valor Tributario)",
    category: "Tributación CO",
    definition:
      "Unidad de medida reajustada anualmente por la DIAN según la variación del IPC para estandarizar topes de declaración de renta, exenciones de 4x1000 (350 UVT), tramos de retención y sanciones tributarias en Colombia.",
    formula: "Valor en COP = Cantidad de UVT × Valor UVT del Año Gravable",
  },
  {
    term: "Seguro de Depósitos FOGAFIN",
    category: "Renta Fija & Banca",
    definition:
      "Garantía pública administrada por el Fondo de Garantías de Instituciones Financieras en Colombia que protege los ahorros (cuentas y CDTs) en bancos y compañías de financiamiento inscritas hasta por $50.000.000 COP por titular y por entidad en caso de liquidación forzosa.",
    formula: "Cobertura Máxima = $50.000.000 COP por depositante / entidad inscrita",
  },
  {
    term: "IBC (Ingreso Base de Cotización - 40%)",
    category: "Nómina & Seguridad Social",
    definition:
      "Porción del ingreso bruto sobre la cual se calculan los aportes obligatorios a Salud, Pensión y ARL en Colombia. Para trabajadores independientes por prestación de servicios corresponde al 40% de los honorarios brutos mensuales, sin que pueda ser inferior a 1 SMLMV.",
    formula: "IBC Independiente = máx(1 SMLMV, Honorarios Brutos × 0.40)",
  },
  {
    term: "FSP (Fondo de Solidaridad Pensional)",
    category: "Nómina & Seguridad Social",
    definition:
      "Aporte solidario obligatorio en Colombia destinado a subsidiar pensiones de grupos vulnerables. Se descuenta a trabajadores y contratistas cuyo IBC iguala o supera 4 Salarios Mínimos (SMLMV), iniciando en 1.0% y escalando hasta 2.0%.",
    formula: "Aporte FSP = IBC × Tarifa Escalonada (1.0% a 2.0% si IBC ≥ 4 SMLMV)",
  },
  {
    term: "Dollar-Cost Averaging (DCA / Promedio de Costo)",
    category: "Renta Variable & ETFs",
    definition:
      "Estrategia de inversión sistemática que consiste en aportar una suma fija de dinero en intervalos regulares (semanal o mensual) en un ETF o portafolio, comprando automáticamente más unidades cuando los precios caen y menos cuando suben.",
    formula: "Costo Medio Ponderado = Total Invertido / Suma Total de Unidades Adquiridas",
  },
  {
    term: "ETF Acumulativo UCITS (Domicilio Irlanda)",
    category: "Renta Variable & ETFs",
    definition:
      "Fondo cotizado regulado en la Unión Europea (ej. CSPX.L, VUAA.L, CNDX.L) que beneficia a inversionistas latinoamericanos con una retención reducida del 15% sobre dividendos de EE.UU. y reinvierte automáticamente dichos dividendos dentro del valor del fondo sin generar flujo gravable inmediato.",
    formula: "Retención Interna Dividendos US = 15% (vs. 30% en ETFs domiciliados en EE.UU.)",
  },
  {
    term: "Ratio de Sharpe (Sharpe Ratio)",
    category: "Métricas Cuantitativas",
    definition:
      "Medida institucional de eficiencia que calcula el exceso de rentabilidad de un portafolio por encima de la tasa libre de riesgo dividido entre su volatilidad anualizada (desviación estándar). Un Sharpe > 1.0 refleja buena relación retorno/riesgo.",
    formula: "Sharpe = (Retorno_Portafolio − Tasa_Libre_Riesgo) / Volatilidad_Anual",
  },
  {
    term: "Máximo Drawdown (Caída Pico-a-Valle)",
    category: "Métricas Cuantitativas",
    definition:
      "Mayor caída porcentual registrada por un portafolio desde su punto máximo histórico (pico) hasta su punto mínimo posterior (valle) antes de marcar un nuevo máximo. Mide la tolerancia al dolor requerida por la estrategia.",
    formula: "Max Drawdown = (Valor_Valle − Valor_Pico) / Valor_Pico",
  },
  {
    term: "Alfa de Jensen (α contra Benchmark)",
    category: "Métricas Cuantitativas",
    definition:
      "Rentabilidad diferencial positiva o negativa que obtiene una estrategia activa frente a su índice de referencia comparable (como el S&P 500 o Nasdaq-100).",
    formula: "Alfa Simple = Retorno_Portafolio (%) − Retorno_Benchmark (%)",
  },
  {
    term: "Tasa de Usura y Conversión a Tasa Mensual Vencida (M.V.)",
    category: "Crédito & Deuda",
    definition:
      "Techo máximo legal certificado por la Superintendencia Financiera de Colombia (1.5 veces el interés bancario corriente) que puede cobrarse en créditos de consumo y tarjetas. Su aplicación mensual se obtiene por radicación doceava.",
    formula: "Tasa Mensual (M.V.) = (1 + Tasa_EA)^(1 / 12) − 1",
  },
  {
    term: "Componente Inflacionario de Rendimientos Financieros",
    category: "Tributación CO",
    definition:
      "Porcentaje certificado anualmente en Colombia sobre los intereses de CDTs y cuentas de ahorro de personas naturales que se declara como ingreso no constitutivo de renta ni ganancia ocasional por corresponder a la reposición de la inflación.",
    formula: "Ingreso Gravable Neto = Intereses Recibidos × (1 − % Componente Inflacionario)",
  },
  {
    term: "Tasa de Retiro Segura (SWR / Regla del 4%)",
    category: "Retiro Patrimonial",
    definition:
      "Porcentaje anual del patrimonio invertido que puede retirarse de forma sostenible ajustado por inflación sin agotar el capital principal en horizontes de 30+ años. Equivale a acumular entre 25 y 28.5 veces el gasto anual deseado.",
    formula: "Capital Libertad Financiera = Gasto Anual / 0.04 = 25 × Gasto Anual",
  },
];

export const NORMATIVE_PARAMETERS_TABLE = [
  {
    concept: "Retención en la Fuente en CDTs y Cuentas de Ahorro",
    referenceValue: "4.0% sobre intereses brutos",
    legalBasis: "Estatuto Tributario de Colombia (Rendimientos Financieros)",
    practicalImpact: "Reduce un CDT del 11.00% E.A. bruto a ~10.56% E.A. neto antes de inflación.",
  },
  {
    concept: "Gravamen a los Movimientos Financieros (GMF / 4x1000)",
    referenceValue: "0.4% ($4 por cada $1.000 COP) · Exento hasta 350 UVT/mes",
    legalBasis: "Artículos 870 a 879 del Estatuto Tributario",
    practicalImpact: "Mover capital entre cuentas no exentas cuesta ~15 a 20 días de intereses de un CDT.",
  },
  {
    concept: "Seguro de Depósitos FOGAFIN",
    referenceValue: "Hasta $50.000.000 COP por titular y entidad inscrita",
    legalBasis: "Ley Fogafín · Entidades vigiladas SFC",
    practicalImpact: "Protege el capital e intereses causados en bancos y compañías de financiamiento inscritas.",
  },
  {
    concept: "Cotización Seguridad Social Dependiente (Empleado)",
    referenceValue: "4.0% Salud + 4.0% Pensión (+ 1% a 2% FSP si ≥ 4 SMLMV)",
    legalBasis: "Ley 100 de 1993 y reformas pensionales vigentes",
    practicalImpact: "Descuento mínimo del 8% sobre el salario base; Auxilio de Transporte aplica hasta 2 SMLMV.",
  },
  {
    concept: "Cotización PILA Independiente (Prestación de Servicios)",
    referenceValue: "IBC = 40% de honorarios (mín. 1 SMLMV) · Salud 12.5% + Pensión 16% + ARL",
    legalBasis: "normativa PILA / UGPP para trabajadores independientes",
    practicalImpact: "Representa una carga efectiva cercana al ~11.6% sobre los honorarios brutos en Riesgo I.",
  },
  {
    concept: "Retención Dividendos Acciones/ETFs EE.UU. vs. Irlanda UCITS",
    referenceValue: "30% en ETFs domiciliados en EE.UU. (W-8BEN) vs. 15% en ETFs UCITS Irlanda",
    legalBasis: "IRC EE.UU. (NRA Withholding) y Tratado Tributario Irlanda–EE.UU.",
    practicalImpact: "Los ETFs acumulativos irlandeses (CSPX.L, VUAA.L, CNDX.L) ahorran la mitad del impuesto al dividendo.",
  },
];

export const LEGAL_DOCS = {
  about: {
    title: "Acerca de Kpital",
    subtitle:
      "Plataforma educativa de ingeniería financiera, calculadoras de renta fija y análisis cuantitativo patrimonial.",
    sections: [
      {
        heading: "Nuestra Misión",
        body: [
          "Kpital nació con un propósito claro: democratizar herramientas de análisis patrimonial y matemática financiera transparente para ahorradores e inversionistas de habla hispana, especialmente en Colombia y Latinoamérica.",
          "En lugar de ofrecer reglas vagas o estimaciones opacas, Kpital combina simuladores gratuitos abiertos al público (CDTs con cálculo de ReteFuente del 4%, deflactación real por inflación IPC, liquidación legal de nómina dependiente e independiente y proyección de interés compuesto/DCA) con guías técnicas que explican cada fórmula paso a paso.",
        ],
      },
      {
        heading: "Metodología y Transparencia Matemática",
        body: [
          "Cada cálculo publicado en nuestra plataforma aplica convenciones financieras estándar y verificables: base calendario 365 para títulos de renta fija E.A., ecuación de Fisher para tasas reales deflactadas, aportes normativos de seguridad social colombiana (Salud, Pensión, FSP, Auxilio de Transporte e IBC del 40%) y métricas institucionales de riesgo-retorno.",
          "Adicionalmente, los usuarios registrados que deseen llevar un seguimiento privado de sus propios portafolios, lotes bursátiles y flujo de caja disponen de una Terminal Privada cifrada bajo autenticación de sesión, completamente separada del contenido educativo público.",
        ],
      },
      {
        heading: "Independencia Editorial",
        body: [
          "Kpital (Zhent) es un proyecto independiente de software financiero y divulgación educativa. No somos una entidad bancaria, sociedad comisionista de bolsa ni asesor financiero regulado. Las comparativas de tasas de CDTs o cuentas de alto rendimiento sirven únicamente como referencia orientativa pública.",
        ],
      },
    ],
  },
  privacy: {
    title: "Política de Privacidad",
    updated: "Última actualización: 11 de noviembre de 2026",
    sections: [
      {
        heading: "1. Información General",
        body: [
          "En Kpital (https://zhent.homes/), operado por Zhent, respetamos la privacidad de nuestros visitantes y usuarios. Esta Política de Privacidad describe qué información se recopila al navegar por nuestras calculadoras públicas, guías educativas o al acceder a la Terminal Privada autenticado.",
        ],
      },
      {
        heading: "2. Publicidad de Google AdSense y Cookies de Terceros",
        body: [
          "Este sitio utiliza Google AdSense para mostrar anuncios relevantes y sostener gratuitamente las herramientas educativas y simuladores financieros.",
          "• Terceros proveedores, incluido Google, utilizan cookies (como la cookie DART o identificadores publicitarios equivalentes) para mostrar anuncios basados en las visitas anteriores de un usuario a este sitio web o a otros sitios de Internet.",
          "• El uso de cookies de publicidad permite a Google y a sus socios mostrar anuncios basados en los intereses y navegación del usuario en la web.",
          "• Los usuarios pueden inhabilitar la publicidad personalizada en cualquier momento visitando Configuración de Anuncios de Google (https://www.google.com/settings/ads) o el portal de exclusión de la Network Advertising Initiative / Digital Advertising Alliance (https://www.aboutads.info/choices/).",
        ],
      },
      {
        heading: "3. Calculadoras Públicas y Almacenamiento Local",
        body: [
          "Las calculadoras abiertas de CDT, Interés Compuesto e Inflación, Nómina Colombia y Presupuesto 50/30/20 se ejecutan directamente en tu navegador web. Los números que introduces en estos simuladores públicos NO se transmiten ni venden a terceros.",
          "Almacenamos únicamente preferencias locales mínimas de interfaz en tu navegador (localStorage), como el modo visual Diurno o Nocturno (kpital_theme), para recordar tu elección entre visitas.",
        ],
      },
      {
        heading: "4. Terminal Privada (Usuarios Registrados)",
        body: [
          "Si decides crear una cuenta o iniciar sesión en la Terminal Privada mediante correo electrónico o Google OAuth a través de nuestro proveedor de base de datos e identidad (Supabase), tu dirección de correo y los registros personales que tú mismo guardes quedan aislados por usuario bajo conexiones cifradas HTTPS/TLS.",
          "Nunca compartimos, vendemos ni alquilamos tus portafolios personales, ingresos o transacciones privadas con anunciantes ni redes publicitarias.",
        ],
      },
      {
        heading: "5. Enlaces Externos y Derechos del Usuario",
        body: [
          "Nuestras guías y comparadores pueden incluir enlaces de referencia informativos hacia entidades financieras externas o documentación pública. Cada sitio externo posee sus propias políticas de privacidad fuera de nuestro control. Puedes solicitar aclaración, corrección o eliminación de cuenta registrada comunicándote mediante la sección de Contacto.",
        ],
      },
    ],
  },
  terms: {
    title: "Términos de Uso y Descargo Financiero",
    updated: "Última actualización: 11 de noviembre de 2026",
    sections: [
      {
        heading: "1. Carácter Estrictamente Educativo e Informativo",
        body: [
          "Toda la información, tasas de referencia, simuladores de CDTs, cálculos de nómina, métricas bursátiles y artículos publicados en Kpital (https://zhent.homes/) tienen fines exclusivamente educativos, matemáticos e informativos.",
          "Nada de lo contenido en este sitio web constituye asesoría financiera, jurídica, tributaria o contable personalizada, ni recomendación o solicitud de compra o venta de valores, criptoactivos o instrumentos financieros.",
        ],
      },
      {
        heading: "2. Exactitud de Tasas, Normativa e Impuestos",
        body: [
          "Las tasas E.A. de referencia bancaria, valores del SMLMV, UVT, auxilio de transporte o porcentajes tributarios (como la Retención en la Fuente del 4% o el 4x1000) pueden variar según cambios regulatorios, fechas de vigencia o condiciones particulares de cada entidad financiera.",
          "Antes de tomar decisiones de inversión, endeudamiento o liquidación laboral/tributaria, verifica siempre las condiciones contractuales directas vigentes con tu entidad financiera, contador público o autoridad oficial.",
        ],
      },
      {
        heading: "3. Propiedad Intelectual y Uso Aceptable",
        body: [
          "El diseño de la interfaz, los textos educativos originales y el software de Kpital pertenecen a su autor (Zhent) o se ofrecen bajo sus licencias declaradas. Se permite compartir enlaces directos a nuestras guías y calculadoras citando la fuente.",
          "Queda prohibido el uso automatizado abusivo (scraping masivo), intentos de acceso no autorizado a datos de otros usuarios o redistribución comercial sin autorización escrita.",
        ],
      },
      {
        heading: "4. Limitación de Responsabilidad",
        body: [
          "El usuario asume total responsabilidad por cualquier decisión financiera derivada de los cálculos realizados en la plataforma. Kpital no será responsable por pérdidas económicas directas o indirectas derivadas de variaciones de mercado, errores de entrada manual del usuario o interrupciones externas de proveedores de datos.",
        ],
      },
    ],
  },
};
