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
