/**
 * Utilidad integral de Horarios de Mercado y Exchanges Mundiales
 * Permite conocer los horarios locales, la equivalencia en Hora Colombia (UTC-5),
 * el estado en tiempo real (Abierto/Cerrado/Almuerzo) y notas para brokers como XTB.
 */

export const MARKET_EXCHANGES = {
  US: {
    code: "US",
    name: "Wall Street (NYSE / NASDAQ)",
    country: "Estados Unidos 🇺🇸",
    flag: "🇺🇸",
    timezone: "America/New_York",
    localHours: "09:30 - 16:00 ET",
    colombiaHours: "08:30 - 15:00 Col (Verano EDT) / 09:30 - 16:00 (Invierno EST)",
    openHourET: 9.5,
    closeHourET: 16.0,
    hasLunchBreak: false,
    description: "Bolsas principales de Nueva York (NYSE, NASDAQ, AMEX y OTC/Pink Sheets).",
    brokerNotes: "En XTB y otros brokers, acciones como TCEHY (Tencent ADR) cotizan en este horario.",
  },
  HKG: {
    code: "HKG",
    name: "Bolsa de Hong Kong (HKEX)",
    country: "Hong Kong 🇭🇰",
    flag: "🇭🇰",
    timezone: "Asia/Hong_Kong",
    localHours: "09:30 - 12:00 y 13:00 - 16:00 HKT",
    colombiaHours: "20:30 - 23:00 (noche ant.) y 00:00 - 03:00 AM (madrugada) Col",
    hasLunchBreak: true,
    lunchStartHKT: 12.0,
    lunchEndHKT: 13.0,
    description: "Bolsa oficial de Hong Kong (tickers terminados en .HK como 0700.HK, 1810.HK).",
    brokerNotes: "XTB no suele dar acceso directo al parqué de HKEX. En XTB, Tencent se negocia en plazas europeas (NNND.DE) abiertas hasta las 10:30 AM Col.",
  },
  LSE: {
    code: "LSE",
    name: "Bolsa de Londres (London Stock Exchange)",
    country: "Reino Unido 🇬🇧",
    flag: "🇬🇧",
    timezone: "Europe/London",
    localHours: "08:00 - 16:30 BST/GMT",
    colombiaHours: "02:00 - 10:30 AM Col (BST) / 03:00 - 11:30 AM Col (GMT)",
    hasLunchBreak: false,
    description: "Mercado principal de Londres (tickers terminados en .L como CNYA.L, KWEB.L, CSPX.L).",
    brokerNotes: "Horario continuo matutino para Colombia; cierra a media mañana (10:30 AM).",
  },
  XETRA: {
    code: "XETRA",
    name: "Bolsa de Fráncfort / XETRA (Alemania)",
    country: "Alemania 🇩🇪",
    flag: "🇩🇪",
    timezone: "Europe/Berlin",
    localHours: "09:00 - 17:30 CEST/CET",
    colombiaHours: "02:00 - 10:30 AM Col (CEST) / 03:00 - 11:30 AM Col (CET)",
    hasLunchBreak: false,
    description: "Mercado europeo principal de acciones y ETFs (tickers .DE).",
    brokerNotes: "XTB utiliza este horario europeo (cierre a las 10:30 AM Col con pequeños breaks de mantenimiento a las 6h).",
  },
  BVC: {
    code: "BVC",
    name: "Bolsa de Valores de Colombia",
    country: "Colombia 🇨🇴",
    flag: "🇨🇴",
    timezone: "America/Bogota",
    localHours: "09:30 - 16:00 COT",
    colombiaHours: "09:30 - 16:00 Col",
    hasLunchBreak: false,
    description: "Mercado accionario local de Colombia (ECOPETROL, BANCOLOMBIA, etc.).",
    brokerNotes: "Opera en el mismo huso horario local de Colombia (UTC-5).",
  },
  CRYPTO: {
    code: "CRYPTO",
    name: "Criptomonedas / Derivados 24/7",
    country: "Global 🌐",
    flag: "🌐",
    timezone: "UTC",
    localHours: "24 horas / 7 días",
    colombiaHours: "24/7 Continuo",
    hasLunchBreak: false,
    description: "Mercado descentralizado de activos digitales y pares cripto.",
    brokerNotes: "Disponible permanentemente sin horario de cierre de bolsa.",
  },
};

/**
 * Detecta el exchange correspondiente a partir del ticker o código de exchange.
 */
export function detectExchangeKey(ticker = "", exchange = "") {
  const t = String(ticker).trim().toUpperCase();
  const e = String(exchange).trim().toUpperCase();

  if (
    e === "CRYPTO" ||
    e === "CCC" ||
    e === "CRYPTOCURRENCY" ||
    (t.includes("-USD") && (t.includes("BTC") || t.includes("ETH") || t.includes("XAUT") || t.includes("PAXG") || t.includes("SOL") || t.includes("ADA") || t.includes("USDT") || t.includes("USDC")))
  ) {
    return "CRYPTO";
  }
  if (t.endsWith(".HK") || ["HKG", "HKEX", "HONG KONG"].includes(e)) {
    return "HKG";
  }
  if (t.endsWith(".L") || ["LSE", "LON", "LONDON", "FTSE"].includes(e)) {
    return "LSE";
  }
  if (
    t.endsWith(".DE") ||
    t.endsWith(".F") ||
    t.endsWith(".BE") ||
    t.endsWith(".MU") ||
    t.endsWith(".DU") ||
    t.endsWith(".HM") ||
    t.endsWith(".HA") ||
    t.endsWith(".SG") ||
    t.endsWith(".PA") ||
    t.endsWith(".AS") ||
    t.endsWith(".MC") ||
    ["XETRA", "EURONEXT", "GER", "FRA", "BER", "MUN", "DUS", "HAM", "STU", "PARIS", "AMSTERDAM"].includes(e)
  ) {
    return "XETRA";
  }
  if (t.endsWith(".CL") || ["BVC", "COLOMBIA"].includes(e)) {
    return "BVC";
  }
  return "US";
}

/**
 * Retorna la hora oficial de apertura de mercado en formato HH:MM según el exchange del ticker.
 *  - LSE (.L): 08:00
 *  - XETRA / Fráncfort (.DE, .F, .PA, etc.): 09:00
 *  - HKG (.HK): 09:30
 *  - BVC (.CL): 09:30
 *  - CRYPTO (-USD): 00:00
 *  - US (NYSE / NASDAQ, default): 09:30
 */
export function getMarketOpenTime(ticker = "", exchange = "") {
  const key = detectExchangeKey(ticker, exchange);
  switch (key) {
    case "LSE":
      return "08:00";
    case "XETRA":
      return "09:00";
    case "HKG":
      return "09:30";
    case "BVC":
      return "09:30";
    case "CRYPTO":
      return "00:00";
    case "US":
    default:
      return "09:30";
  }
}

/**
 * Retorna la información completa de horario y estado en vivo para un ticker o exchange.
 */
export function getMarketSchedule(ticker = "", exchange = "") {
  const key = detectExchangeKey(ticker, exchange);
  const info = MARKET_EXCHANGES[key] || MARKET_EXCHANGES.US;

  if (key === "CRYPTO") {
    return {
      ...info,
      isOpen: true,
      statusText: "Abierto 24/7",
      statusColor: "#22c55e",
      currentLocalTime: new Date().toLocaleTimeString("es-CO", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" }),
    };
  }

  const now = new Date();

  // Obtener fecha y hora en el huso horario de la bolsa
  const tzString = now.toLocaleString("en-US", { timeZone: info.timezone });
  const localDate = new Date(tzString);
  const dayOfWeek = localDate.getDay(); // 0 = Domingo, 6 = Sábado
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  const hours = localDate.getHours();
  const minutes = localDate.getMinutes();
  const timeDec = hours + minutes / 60.0;

  let isOpen = false;
  let isLunch = false;
  let statusText = "Cerrado";
  let statusColor = "#ef4444";

  if (!isWeekend) {
    if (key === "HKG") {
      // 09:30 - 12:00 y 13:00 - 16:00
      if ((timeDec >= 9.5 && timeDec < 12.0) || (timeDec >= 13.0 && timeDec < 16.0)) {
        isOpen = true;
        statusText = "Abierto";
        statusColor = "#22c55e";
      } else if (timeDec >= 12.0 && timeDec < 13.0) {
        isLunch = true;
        statusText = "Receso Almuerzo (HK)";
        statusColor = "#f59e0b";
      } else {
        statusText = "Cerrado";
        statusColor = "#ef4444";
      }
    } else if (key === "LSE") {
      // 08:00 - 16:30
      if (timeDec >= 8.0 && timeDec < 16.5) {
        isOpen = true;
        statusText = "Abierto";
        statusColor = "#22c55e";
      } else {
        statusText = "Cerrado";
        statusColor = "#ef4444";
      }
    } else if (key === "XETRA") {
      // 09:00 - 17:30
      if (timeDec >= 9.0 && timeDec < 17.5) {
        isOpen = true;
        statusText = "Abierto";
        statusColor = "#22c55e";
      } else {
        statusText = "Cerrado";
        statusColor = "#ef4444";
      }
    } else if (key === "BVC") {
      // 09:30 - 16:00
      if (timeDec >= 9.5 && timeDec < 16.0) {
        isOpen = true;
        statusText = "Abierto";
        statusColor = "#22c55e";
      } else {
        statusText = "Cerrado";
        statusColor = "#ef4444";
      }
    } else {
      // US: 09:30 - 16:00
      if (timeDec >= 9.5 && timeDec < 16.0) {
        isOpen = true;
        statusText = "Abierto";
        statusColor = "#22c55e";
      } else {
        statusText = "Cerrado";
        statusColor = "#ef4444";
      }
    }
  } else {
    statusText = "Cerrado (Fin de Semana)";
  }

  const localTimeStr = localDate.toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const colTimeStr = now.toLocaleTimeString("es-CO", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  return {
    ...info,
    isOpen,
    isLunch,
    statusText,
    statusColor,
    currentLocalTime: localTimeStr,
    currentColombiaTime: colTimeStr,
  };
}

/**
 * Regiones y filtros de mercado disponibles para búsqueda de activos.
 */
export const MARKET_REGIONS = [
  { id: "ALL", label: "Todos", icon: "🌐" },
  { id: "CRYPTO", label: "Cripto / Oro", icon: "🪙", hint: "XAUT-USD, BTC-USD, ETH-USD (24/7)" },
  { id: "US", label: "EE.UU.", icon: "🇺🇸", hint: "NYSE / NASDAQ (Sin sufijo)" },
  { id: "GER", label: "Alemania", icon: "🇩🇪", hint: "Frankfurt .F / Xetra .DE (XTB: .DE)" },
  { id: "UK", label: "Londres", icon: "🇬🇧", hint: "LSE .L (XTB: .UK)" },
  { id: "EU", label: "Europa", icon: "🇪🇺", hint: "París .PA, Ámsterdam .AS, Madrid .MC" },
  { id: "HK", label: "Hong Kong", icon: "🇭🇰", hint: "HKEX .HK (ej. 0700.HK)" },
];

/**
 * Detecta y traduce sufijos de brokers como XTB o Interactive Brokers al estándar de Yahoo Finance.
 * Ejemplos:
 *  - "NNND.DE" -> sugerir "NNND.F" y "NNND.DE"
 *  - "CSPX.UK" -> sugerir "CSPX.L"
 *  - "VUAA.UK" -> sugerir "VUAA.L"
 *  - "VUSA.DE" -> sugerir "VUSA.F" o "VUSA.DE"
 */
export function translateBrokerTicker(rawInput = "") {
  const clean = rawInput.trim().toUpperCase();
  if (!clean) return { clean, suggestions: [] };

  const suggestions = [];

  if (clean === "XAUT" || clean === "PLENTI" || clean === "ORO") {
    suggestions.push({
      ticker: "XAUT-USD",
      note: "Tether Gold (XAUt - Plenti)",
      badge: "🪙 Oro Digital (24/7)",
    });
    suggestions.push({
      ticker: "PAXG-USD",
      note: "PAX Gold (PAXG)",
      badge: "🪙 Oro Digital (24/7)",
    });
  } else if (clean === "PAXG") {
    suggestions.push({
      ticker: "PAXG-USD",
      note: "PAX Gold (PAXG)",
      badge: "🪙 Oro Digital (24/7)",
    });
  } else if (clean === "BTC") {
    suggestions.push({
      ticker: "BTC-USD",
      note: "Bitcoin (Yahoo Finance)",
      badge: "🌐 Bitcoin (24/7)",
    });
  } else if (clean === "ETH") {
    suggestions.push({
      ticker: "ETH-USD",
      note: "Ethereum (Yahoo Finance)",
      badge: "🌐 Ethereum (24/7)",
    });
  } else if (clean.endsWith(".UK")) {
    const base = clean.slice(0, -3);
    suggestions.push({
      ticker: `${base}.L`,
      note: "Londres (LSE en Yahoo Finance)",
      badge: "🇬🇧 LSE (.L)",
    });
  } else if (clean.endsWith(".DE")) {
    const base = clean.slice(0, -3);
    suggestions.push({
      ticker: `${base}.F`,
      note: "Bolsa de Fráncfort (Yahoo Finance)",
      badge: "🇩🇪 Frankfurt (.F)",
    });
    suggestions.push({
      ticker: `${base}.DE`,
      note: "XETRA Alemania",
      badge: "🇩🇪 XETRA (.DE)",
    });
  } else if (clean.endsWith(".FR")) {
    const base = clean.slice(0, -3);
    suggestions.push({
      ticker: `${base}.PA`,
      note: "Euronext París (Yahoo Finance)",
      badge: "🇫🇷 París (.PA)",
    });
  } else if (clean.endsWith(".NL")) {
    const base = clean.slice(0, -3);
    suggestions.push({
      ticker: `${base}.AS`,
      note: "Euronext Ámsterdam (Yahoo Finance)",
      badge: "🇳🇱 Ámsterdam (.AS)",
    });
  } else if (clean.endsWith(".ES")) {
    const base = clean.slice(0, -3);
    suggestions.push({
      ticker: `${base}.MC`,
      note: "Bolsas y Mercados Españoles (BME)",
      badge: "🇪🇸 Madrid (.MC)",
    });
  }

  return { clean, suggestions };
}

/**
 * Retorna etiquetas de ayuda y equivalencia de brokers para un ticker o exchange dado.
 */
export function getBrokerEquivalenceInfo(ticker = "", exchange = "") {
  const t = String(ticker).trim().toUpperCase();
  const e = String(exchange).trim().toUpperCase();

  if (
    e === "CRYPTO" ||
    e === "CCC" ||
    e === "CRYPTOCURRENCY" ||
    (t.includes("-USD") && (t.includes("BTC") || t.includes("ETH") || t.includes("XAUT") || t.includes("PAXG") || t.includes("SOL") || t.includes("ADA")))
  ) {
    return {
      region: "CRYPTO",
      marketLabel: "Cripto / Oro Digital (24/7)",
      flag: "🪙",
      brokerTip: "Opera 24/7 sin cierre de mercado. Compatible con Plenti (XAUt) y exchanges cripto.",
    };
  }

  if (t.endsWith(".F")) {
    return {
      region: "GER",
      marketLabel: "Bolsa de Fráncfort (.F)",
      flag: "🇩🇪",
      brokerTip: "En XTB suele figurar con sufijo .DE (ej. NNND.DE o 3CP.DE). En Yahoo Finance se consulta como .F (la más líquida).",
    };
  }
  if (t.endsWith(".BE") || ["BER", "BERLIN"].includes(e)) {
    return {
      region: "GER",
      marketLabel: "Bolsa de Berlín (.BE)",
      flag: "🇩🇪",
      brokerTip: "Bolsa de Berlín. XTB enruta ciertas órdenes alemanas aquí bajo el código .DE. En Yahoo es .BE o su equivalente principal .F.",
    };
  }
  if (t.endsWith(".MU") || ["MUN", "MUNICH"].includes(e)) {
    return {
      region: "GER",
      marketLabel: "Bolsa de Múnich (.MU)",
      flag: "🇩🇪",
      brokerTip: "Bolsa regional de Múnich (Alemania). Cotiza en Euros (EUR).",
    };
  }
  if (t.endsWith(".DU") || ["DUS", "DUSSELDORF"].includes(e)) {
    return {
      region: "GER",
      marketLabel: "Bolsa de Düsseldorf (.DU)",
      flag: "🇩🇪",
      brokerTip: "Bolsa regional de Düsseldorf (Alemania). Cotiza en Euros (EUR).",
    };
  }
  if (t.endsWith(".HM") || t.endsWith(".HA") || ["HAM", "HAMBURG", "HANNOVER"].includes(e)) {
    return {
      region: "GER",
      marketLabel: "Bolsa de Hamburgo/Hanover (.HM)",
      flag: "🇩🇪",
      brokerTip: "Bolsa regional de Hamburgo / Hanover (Alemania). Cotiza en Euros (EUR).",
    };
  }
  if (t.endsWith(".DE") || ["XETRA", "GER"].includes(e)) {
    return {
      region: "GER",
      marketLabel: "Alemania XETRA (.DE)",
      flag: "🇩🇪",
      brokerTip: "En XTB se usa .DE como código genérico para Alemania (Fráncfort/Berlín). En Yahoo es .DE o .F.",
    };
  }
  if (t.endsWith(".L") || ["LSE", "LON", "LONDON"].includes(e)) {
    return {
      region: "UK",
      marketLabel: "Bolsa de Londres (.L)",
      flag: "🇬🇧",
      brokerTip: "En XTB suele figurar con sufijo .UK (ej. CSPX.UK). En Yahoo Finance siempre es .L (CSPX.L).",
    };
  }
  if (t.endsWith(".HK") || ["HKG", "HKEX"].includes(e)) {
    return {
      region: "HK",
      marketLabel: "Bolsa de Hong Kong (.HK)",
      flag: "🇭🇰",
      brokerTip: "HKEX opera en horario nocturno para América Latina (cierra de madrugada). En XTB las acciones chinas suelen negociarse vía Europa (.DE/.F) o EE.UU. (ADR).",
    };
  }
  if (t.endsWith(".PA") || t.endsWith(".AS") || t.endsWith(".MC") || ["EURONEXT", "PARIS", "AMSTERDAM"].includes(e)) {
    return {
      region: "EU",
      marketLabel: "Europa Continental (Euronext / BME)",
      flag: "🇪🇺",
      brokerTip: "Cotiza en Euros (EUR). Horario europeo (cierre aprox. 10:30 AM Colombia).",
    };
  }
  if (!t.includes(".") || ["NYSE", "NASDAQ", "AMEX", "US"].includes(e)) {
    return {
      region: "US",
      marketLabel: "Wall Street EE.UU. (NYSE / NASDAQ)",
      flag: "🇺🇸",
      brokerTip: "Activos estadounidenses sin sufijo (ej. AAPL, MSFT, SPY). Cotizan en USD de 08:30 a 15:00/16:00 Col.",
    };
  }

  return {
    region: "ALL",
    marketLabel: exchange || "Global",
    flag: "🌐",
    brokerTip: null,
  };
}
