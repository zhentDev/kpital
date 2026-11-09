/**
 * Dictionary of complete asset names, company names and ETFs.
 * Ensures every stock, ETF or ETC displays its official readable name across cards, charts and selects.
 */

export const TICKER_FULL_NAMES = {
  // ETFs & Materias Primas / Fondos
  "IPLT.L": "WisdomTree Physical Platinum",
  "IPLT": "WisdomTree Physical Platinum",
  "SMH.L": "VanEck Semiconductor UCITS ETF",
  "SMH": "VanEck Semiconductor ETF",
  "GDX.L": "VanEck Gold Miners UCITS ETF",
  "GDX": "VanEck Gold Miners ETF",
  "CSPX.L": "iShares Core S&P 500 UCITS ETF",
  "CSPX": "iShares Core S&P 500 ETF",
  "CNDX.L": "iShares NASDAQ 100 UCITS ETF",
  "CNDX": "iShares NASDAQ 100 ETF",
  "EMIM.L": "iShares Core MSCI Emerging Markets IMI UCITS ETF",
  "EMIM": "iShares Core MSCI Emerging Markets ETF",
  "CNYA.L": "iShares MSCI China A UCITS ETF",
  "CNYA": "iShares MSCI China A ETF",
  "KWEB.L": "KraneShares CSI China Internet UCITS ETF",
  "KWEB": "KraneShares CSI China Internet ETF",
  "3CP.F": "WisdomTree Physical Platinum (Xetra EUR)",
  "NNND.F": "iShares NASDAQ 100 UCITS ETF (Xetra EUR)",
  "SPCX": "CrossingBridge Pre-Merger SPAC ETF",
  "SPY": "SPDR S&P 500 ETF Trust",
  "QQQ": "Invesco QQQ Trust (NASDAQ 100)",
  "VOO": "Vanguard S&P 500 ETF",
  "IVV": "iShares Core S&P 500 ETF",
  "VTI": "Vanguard Total Stock Market ETF",
  "IJH": "iShares Core S&P Mid-Cap ETF",
  "PAXG-USD": "PAX Gold (Token Oro Físico)",
  "PAXG": "PAX Gold (Token Oro Físico)",
  "XAUT-USD": "Tether Gold (Token Oro Físico)",
  "XAUT": "Tether Gold (Token Oro Físico)",
  "BTC-USD": "Bitcoin (BTC)",
  "ETH-USD": "Ethereum (ETH)",

  // Tech Titans & Staples
  "NVDA": "NVIDIA Corporation",
  "AMD": "Advanced Micro Devices, Inc.",
  "AMAT": "Applied Materials, Inc.",
  "HPQ": "HP Inc.",
  "INTC": "Intel Corporation",
  "ON": "ON Semiconductor Corporation",
  "ORCL": "Oracle Corporation",
  "POWI": "Power Integrations, Inc.",
  "QCOM": "Qualcomm Incorporated",
  "TXN": "Texas Instruments Incorporated",
  "MRVL": "Marvell Technology, Inc.",
  "HIMX": "Himax Technologies, Inc.",
  "NTAP": "NetApp, Inc.",
  "KD": "Kyndryl Holdings, Inc.",
  "ARM": "Arm Holdings plc",
  "AAPL": "Apple Inc.",
  "MSFT": "Microsoft Corporation",
  "GOOGL": "Alphabet Inc. (Google)",
  "AMZN": "Amazon.com, Inc.",
  "META": "Meta Platforms, Inc.",
  "TSLA": "Tesla, Inc.",
  "NFLX": "Netflix, Inc.",
  "AVGO": "Broadcom Inc.",
  "ASML": "ASML Holding N.V.",
  "TSM": "Taiwan Semiconductor Manufacturing",

  // Mid-caps MM20
  "ARLP": "Alliance Resource Partners",
  "ACLS": "Axcelis Technologies, Inc.",
  "BHC": "Bausch Health Companies Inc.",
  "DIOD": "Diodes Incorporated",
  "HAE": "Haemonetics Corporation",
  "NSIT": "Insight Enterprises, Inc.",
  "VECO": "Veeco Instruments Inc.",
  "OSK": "Oshkosh Corporation",
  "SM": "SM Energy Company",

  // Mejores Acciones Cuantitativas
  "OSIS": "OSI Systems, Inc.",
  "MCK": "McKesson Corporation",
  "ENS": "EnerSys",
  "AYI": "Acuity Brands, Inc.",
  "ANF": "Abercrombie & Fitch Co.",
  "CRM": "Salesforce, Inc.",
  "CTSH": "Cognizant Technology Solutions",
  "EXPE": "Expedia Group, Inc.",
  "OPCH": "Option Care Health, Inc.",
  "ENB": "Enbridge Inc.",
  "PAYC": "Paycom Software, Inc.",
  "DK": "Delek US Holdings, Inc.",
  "HALO": "Halozyme Therapeutics, Inc.",
};

export const ASSET_SECTORS = {
  // Mejores Acciones Cuantitativas
  "OSIS": "Tecnología",
  "MCK": "Salud",
  "ENS": "Industrial",
  "AYI": "Industrial",
  "ANF": "Consumo Cíclico",
  "CRM": "Tecnología",
  "CTSH": "Tecnología",
  "EXPE": "Consumo Cíclico",
  "OPCH": "Salud",
  "ENB": "Energía",
  "PAYC": "Tecnología",
  "DK": "Energía",
  "HALO": "Salud",

  // MM20 Mid-caps
  "ARLP": "Energía",
  "ACLS": "Tecnología",
  "BHC": "Salud",
  "DIOD": "Tecnología",
  "HAE": "Salud",
  "NSIT": "Tecnología",
  "VECO": "Tecnología",
  "OSK": "Industrial",
  "SM": "Energía",

  // Tech Titans
  "NVDA": "Tecnología",
  "AMD": "Tecnología",
  "AMAT": "Tecnología",
  "HPQ": "Tecnología",
  "INTC": "Tecnología",
  "ON": "Tecnología",
  "ORCL": "Tecnología",
  "POWI": "Tecnología",
  "QCOM": "Tecnología",
  "TXN": "Tecnología",
  "MRVL": "Tecnología",
  "HIMX": "Tecnología",
  "NTAP": "Tecnología",
  "KD": "Tecnología",
  "ARM": "Tecnología",
  "AAPL": "Tecnología",
  "MSFT": "Tecnología",
  "GOOGL": "Tecnología",
  "AMZN": "Consumo Cíclico",
  "META": "Tecnología",
  "TSLA": "Consumo Cíclico",
  "NFLX": "Servicios de Comunicación",
  "AVGO": "Tecnología",
  "ASML": "Tecnología",
  "TSM": "Tecnología",

  // ETFs & Fondos
  "IPLT": "Materias Primas",
  "SMH": "Tecnología (ETF)",
  "GDX": "Metales Preciosos",
  "CSPX": "Índice (S&P 500)",
  "CNDX": "Índice (NASDAQ)",
  "EMIM": "Mercados Emergentes",
  "CNYA": "China A",
  "KWEB": "China Tech",
  "SPY": "Índice (S&P 500)",
  "QQQ": "Índice (NASDAQ)",
  "VOO": "Índice (S&P 500)",
  "IVV": "Índice (S&P 500)",
  "IWM": "Índice (Russell 2000)",
  "PAXG": "Oro Físico",
  "XAUT": "Oro Físico",
  "BTC": "Criptoactivo",
  "ETH": "Criptoactivo",
};

export const ASSET_FALLBACK_PRICES = {
  "OSIS": { price: 202.10, startPrice: 178.50, changePct: 2.92 },
  "MCK": { price: 1062.38, startPrice: 921.38, changePct: 0.15 },
  "ENS": { price: 152.80, startPrice: 139.20, changePct: 3.93 },
  "AYI": { price: 338.91, startPrice: 299.08, changePct: 4.66 },
  "ANF": { price: 153.18, startPrice: 147.50, changePct: 2.46 },
  "CRM": { price: 215.00, startPrice: 213.00, changePct: 0.70 },
  "CTSH": { price: 64.09, startPrice: 65.09, changePct: -0.97 },
  "EXPE": { price: 257.16, startPrice: 259.20, changePct: -0.80 },
  "OPCH": { price: 31.70, startPrice: 31.65, changePct: 0.13 },
  "ENB": { price: 47.52, startPrice: 47.00, changePct: 1.09 },
  "PAYC": { price: 185.40, startPrice: 168.00, changePct: 1.20 },
  "DK": { price: 21.30, startPrice: 23.50, changePct: -1.40 },
  "HALO": { price: 54.10, startPrice: 51.20, changePct: 0.85 },
};

export function getAssetSector(ticker, fallbackSector = "Tecnología") {
  if (!ticker) return fallbackSector;
  const tUpper = String(ticker).trim().toUpperCase().split(".")[0];
  return ASSET_SECTORS[tUpper] || fallbackSector;
}

export function getAssetInfo(ticker) {
  if (!ticker) return { name: "", sector: "Tecnología", price: 100, startPrice: 100, changePct: 0 };
  const tUpper = String(ticker).trim().toUpperCase();
  const baseTicker = tUpper.split(".")[0];
  const name = getAssetName(tUpper);
  const sector = ASSET_SECTORS[baseTicker] || ASSET_SECTORS[tUpper] || "Tecnología";
  const quote = ASSET_FALLBACK_PRICES[baseTicker] || { price: 100, startPrice: 100, changePct: 0 };
  return {
    name,
    sector,
    price: quote.price,
    startPrice: quote.startPrice,
    changePct: quote.changePct,
  };
}

/**
 * Returns the human-readable full company or ETF name.
 * If fallbackName is already a valid descriptive title (not just the ticker), it preserves it.
 */
export function getAssetName(ticker, fallbackName = null) {
  if (!ticker) return fallbackName || "";
  const tUpper = String(ticker).trim().toUpperCase();

  // If fallbackName is already a real descriptive title (different from ticker)
  if (
    fallbackName &&
    fallbackName.trim().toUpperCase() !== tUpper &&
    fallbackName.trim().length > 3
  ) {
    return fallbackName;
  }

  // Exact match
  if (TICKER_FULL_NAMES[tUpper]) {
    return TICKER_FULL_NAMES[tUpper];
  }

  // Match without exchange suffix (e.g. "SMH.L" -> "SMH")
  const baseTicker = tUpper.split(".")[0];
  if (TICKER_FULL_NAMES[baseTicker]) {
    const isLondon = tUpper.endsWith(".L");
    const isFrankfurt = tUpper.endsWith(".F");
    const suffix = isLondon ? " UCITS ETF" : isFrankfurt ? " (Xetra EUR)" : "";
    return `${TICKER_FULL_NAMES[baseTicker]}${suffix}`;
  }

  return fallbackName || ticker;
}
