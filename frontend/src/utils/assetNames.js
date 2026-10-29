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
};

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
