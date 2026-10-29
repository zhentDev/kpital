/**
 * xtbParser.js
 * Utility to parse xStation 5 (XTB) open positions copied as HTML or plain text.
 * Resilient to browser HTML5 parser foster-parenting of custom Angular elements.
 */

function cleanNumber(val) {
  if (val == null) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const s = String(val)
    .replace(/[$€£%]/g, '')
    .replace(/\s+/g, '')
    .replace(/,/g, '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function cleanTicker(raw) {
  if (!raw) return '';
  return raw
    .trim()
    .toUpperCase()
    .replace(/\.US$/, '')
    .replace(/_US$/, '')
    .replace(/\.PL$/, '')
    .replace(/_PL$/, '')
    .replace(/\.UK$/, '')
    .replace(/_UK$/, '')
    .replace(/\.DE$/, '')
    .replace(/_DE$/, '')
    .replace(/\.ES$/, '')
    .replace(/_ES$/, '');
}

export function extractXtbDate(chunkOrRow, fallbackDate = "") {
  const defaultDateStr = fallbackDate || new Date().toISOString().slice(0, 10);
  if (!chunkOrRow) {
    return { date: defaultDateStr, time: "", isAutoDetected: false };
  }

  const raw = typeof chunkOrRow === "string"
    ? chunkOrRow
    : chunkOrRow.innerHTML || chunkOrRow.textContent || "";

  // 1. Prioritize specific xStation date-time containers or attributes
  const specificPatterns = [
    /(?:data-testid="(?:open-time|time|date|open-date)"[^>]*>|<xs6-date-renderer[^>]*>)([\s\S]*?)(?:<\/td>|<\/xs6-tablet-item-value-renderer>|<\/xs6-date-renderer>|<\/div>)/i,
    /class="[^"]*(?:open-time|trade-time|order-time|time-column)[^"]*"[^>]*>([\s\S]*?)(?:<\/td>|<\/div>)/i,
    /title="([^"]*(?:20\d\d|\d{2}[/.-]\d{2}[/.-]\d{4})[^"]*)"/i,
  ];

  let priorityText = "";
  for (const pat of specificPatterns) {
    const m = raw.match(pat);
    if (m && m[1]) {
      priorityText = m[1].replace(/<[^>]+>/g, " ").trim();
      break;
    }
  }

  const textToScan = priorityText || raw.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");

  // 2. Format DD/MM/YYYY or DD.MM.YYYY or DD-MM-YYYY (with optional HH:MM or HH:MM:SS)
  const dmy = textToScan.match(/\b([0-3]?\d)[/.-]([01]?\d)[/.-](20\d{2})\b(?:\s+([0-2]?\d:[0-5]\d(?::[0-5]\d)?))?/);
  if (dmy) {
    const day = dmy[1].padStart(2, "0");
    const month = dmy[2].padStart(2, "0");
    const year = dmy[3];
    const time = dmy[4] || "";

    const mNum = parseInt(month, 10);
    const dNum = parseInt(day, 10);
    if (mNum >= 1 && mNum <= 12 && dNum >= 1 && dNum <= 31) {
      return {
        date: `${year}-${month}-${day}`,
        time: time ? (time.length === 5 ? `${time}:00` : time) : "",
        isAutoDetected: true,
      };
    }
  }

  // 3. Format YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD (with optional HH:MM or HH:MM:SS)
  const ymd = textToScan.match(/\b(20\d{2})[/.-]([01]?\d)[/.-]([0-3]?\d)\b(?:\s+([0-2]?\d:[0-5]\d(?::[0-5]\d)?))?/);
  if (ymd) {
    const year = ymd[1];
    const month = ymd[2].padStart(2, "0");
    const day = ymd[3].padStart(2, "0");
    const time = ymd[4] || "";

    const mNum = parseInt(month, 10);
    const dNum = parseInt(day, 10);
    if (mNum >= 1 && mNum <= 12 && dNum >= 1 && dNum <= 31) {
      return {
        date: `${year}-${month}-${day}`,
        time: time ? (time.length === 5 ? `${time}:00` : time) : "",
        isAutoDetected: true,
      };
    }
  }

  return {
    date: defaultDateStr,
    time: "",
    isAutoDetected: false,
  };
}

export function parseXtbTrades(rawInput, defaultDate = '') {
  if (!rawInput || typeof rawInput !== 'string') {
    return { success: false, trades: [], error: 'El contenido proporcionado está vacío.' };
  }

  const trimmed = rawInput.trim();
  const fallbackDate = defaultDate || new Date().toISOString().split('T')[0];

  const isHtmlLike = trimmed.includes('<') && (
    trimmed.includes('xs6-') ||
    trimmed.includes('data-testid') ||
    trimmed.includes('logos.xtb.com') ||
    trimmed.includes('<tr') ||
    trimmed.includes('<table') ||
    trimmed.includes('pds-')
  );

  // ── STRATEGY 1: Regex Chunk Extraction (100% immune to HTML5 foster-parenting) ──
  if (isHtmlLike) {
    const regexResult = parseWithRegex(trimmed, fallbackDate);
    if (regexResult.success && regexResult.trades.length > 0) {
      return regexResult;
    }

    // ── STRATEGY 2: DOMParser with transformed tags ──
    const domResult = parseWithDom(trimmed, fallbackDate);
    if (domResult.success && domResult.trades.length > 0) {
      return domResult;
    }
  }

  // ── STRATEGY 3: Plain text / tab-separated parsing ──
  return parseFromText(trimmed, fallbackDate);
}

function parseWithRegex(html, fallbackDate) {
  // Extract custom trade rows and child position rows in document order
  const chunkRegex = /(?:<xs6-my-trades-table-row\b[\s\S]*?<\/xs6-my-trades-table-row>|<xs6-open-table-position-row\b[\s\S]*?<\/xs6-open-table-position-row>|<tr\b[^>]*data-testid="(?:group-row|child-row)"[\s\S]*?<\/tr>)/gi;
  let rowChunks = html.match(chunkRegex) || [];

  // Fallback: match any tr
  if (rowChunks.length === 0) {
    rowChunks = html.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
  }

  // Fallback 2: split by <xs6-my-trades-table-row or <xs6-open-table-position-row
  if (rowChunks.length === 0 && (html.includes('<xs6-my-trades-table-row') || html.includes('<xs6-open-table-position-row'))) {
    rowChunks = html.split(/(?=<xs6-my-trades-table-row|<xs6-open-table-position-row)/i).slice(1);
  }

  if (rowChunks.length === 0) {
    return { success: false, trades: [] };
  }

  const extractField = (chunk, testid) => {
    // Primary: data-testid="X" followed by label-value, pds-value-text__value, or row-column
    const reg = new RegExp(`data-testid="${testid}"[\\s\\S]*?(?:<p[^>]*class="[^"]*label-value[^"]*"[^>]*>|<span[^>]*class="[^"]*pds-value-text__value[^"]*"[^>]*>|\\bclass="[^"]*row-column[^"]*"[^>]*>)\\s*([\\d\\.,]+)`, 'i');
    const m = chunk.match(reg);
    if (m && m[1]) return cleanNumber(m[1]);

    // Secondary: data-testid="X" followed directly by number inside tags
    const broadReg = new RegExp(`data-testid="${testid}"[^>]*>[\\s\\S]*?([\\d\\.,]+)`, 'i');
    const m2 = chunk.match(broadReg);
    if (m2 && m2[1]) return cleanNumber(m2[1]);

    return 0;
  };

  const groups = [];
  let currentGroup = null;

  for (const chunk of rowChunks) {
    const isChild = chunk.includes('xs6-open-table-position-row') ||
                    chunk.includes('data-testid="child-row"') ||
                    chunk.includes('position-renderer') ||
                    chunk.includes('class="child-row');

    if (!isChild) {
      // 1. Group row
      let ticker = '';
      const logoMatch = chunk.match(/logos\.xtb\.com\/([a-zA-Z0-9_]+?)(?:_us|_eu|_uk|_pl|_de|_es)?\.(?:png|svg|webp)/i);
      if (logoMatch && logoMatch[1]) {
        ticker = cleanTicker(logoMatch[1]);
      }

      if (!ticker) {
        const symMatch = chunk.match(/data-testid="instrument-name"[^>]*>[\s\S]*?\b([A-Z0-9]{1,6})(?:\.US)?\b/i);
        if (symMatch && symMatch[1]) {
          ticker = cleanTicker(symMatch[1]);
        }
      }

      if (!ticker) {
        const textSym = chunk.match(/\b([A-Z]{2,6})\.US\b/i);
        if (textSym && textSym[1]) {
          ticker = cleanTicker(textSym[1]);
        }
      }

      let name = ticker;
      const nameMatch = chunk.match(/class="[^"]*pds-element-name-value__element-name[^"]*"[^>]*>\s*([^<]+)/i) ||
                        chunk.match(/class="[^"]*pds-interactive-underline[^"]*"[^>]*>\s*([^<]+)/i);
      if (nameMatch && nameMatch[1]) {
        name = nameMatch[1].trim();
      }

      let shares = extractField(chunk, 'volume');
      let purchasePrice = extractField(chunk, 'open-price');
      let investedAmount = extractField(chunk, 'open-value');
      let currentPrice = extractField(chunk, 'current-price');

      if (investedAmount === 0 && shares > 0 && purchasePrice > 0) {
        investedAmount = Number((shares * purchasePrice).toFixed(2));
      } else if (shares === 0 && investedAmount > 0 && purchasePrice > 0) {
        shares = Number((investedAmount / purchasePrice).toFixed(4));
      } else if (purchasePrice === 0 && investedAmount > 0 && shares > 0) {
        purchasePrice = Number((investedAmount / shares).toFixed(2));
      }

      const { date: tradeDate, time: tradeTime, isAutoDetected: isDateAutoDetected } = extractXtbDate(chunk, fallbackDate);

      currentGroup = {
        ticker,
        name: name || ticker,
        shares,
        purchasePrice: purchasePrice || (shares > 0 ? Number((investedAmount / shares).toFixed(2)) : 0),
        investedAmount,
        currentPrice: currentPrice > 0 ? currentPrice : purchasePrice,
        date: tradeDate,
        purchaseTime: tradeTime,
        isDateAutoDetected,
        children: []
      };
      groups.push(currentGroup);
    } else if (currentGroup) {
      // 2. Child position row belonging to currentGroup
      let shares = extractField(chunk, 'volume');
      let purchasePrice = extractField(chunk, 'open-price');
      let investedAmount = extractField(chunk, 'open-value');
      let currentPrice = extractField(chunk, 'current-price') || currentGroup.currentPrice;

      if (investedAmount === 0 && shares > 0 && purchasePrice > 0) {
        investedAmount = Number((shares * purchasePrice).toFixed(2));
      } else if (shares === 0 && investedAmount > 0 && purchasePrice > 0) {
        shares = Number((investedAmount / purchasePrice).toFixed(4));
      } else if (purchasePrice === 0 && investedAmount > 0 && shares > 0) {
        purchasePrice = Number((investedAmount / shares).toFixed(2));
      }

      const { date: tradeDate, time: tradeTime, isAutoDetected: isDateAutoDetected } = extractXtbDate(chunk, fallbackDate);

      if (shares > 0 || investedAmount > 0) {
        currentGroup.children.push({
          ticker: currentGroup.ticker,
          name: currentGroup.name,
          shares,
          purchasePrice: purchasePrice || (shares > 0 ? Number((investedAmount / shares).toFixed(2)) : 0),
          investedAmount,
          currentPrice: currentPrice > 0 ? currentPrice : purchasePrice,
          date: tradeDate,
          purchaseTime: tradeTime,
          isDateAutoDetected,
        });
      }
    }
  }

  // Flatten: if an instrument row was expanded into children, use the individual child purchases!
  // Otherwise use the summary group row.
  const trades = [];
  const seenTrades = new Set();
  let idx = 0;

  for (const g of groups) {
    if (!g.ticker) continue;
    if (g.children.length > 0) {
      for (const c of g.children) {
        const dedupeKey = `${c.ticker}_${c.shares}_${c.purchasePrice}_${c.date}_${c.purchaseTime}`;
        if (!seenTrades.has(dedupeKey)) {
          seenTrades.add(dedupeKey);
          trades.push({
            id: `xtb_${Date.now()}_${idx++}_${c.ticker}`,
            ...c
          });
        }
      }
    } else if (g.shares > 0 || g.investedAmount > 0) {
      const dedupeKey = `${g.ticker}_${g.shares}_${g.purchasePrice}`;
      if (!seenTrades.has(dedupeKey)) {
        seenTrades.add(dedupeKey);
        trades.push({
          id: `xtb_${Date.now()}_${idx++}_${g.ticker}`,
          ticker: g.ticker,
          name: g.name,
          shares: g.shares,
          purchasePrice: g.purchasePrice,
          investedAmount: g.investedAmount,
          currentPrice: g.currentPrice,
          date: g.date,
          purchaseTime: g.purchaseTime,
          isDateAutoDetected: g.isDateAutoDetected,
        });
      }
    }
  }

  return { success: trades.length > 0, trades };
}

function parseWithDom(html, fallbackDate) {
  if (typeof window === 'undefined' || !window.DOMParser) {
    return { success: false, trades: [] };
  }

  // Sanitize tags so browser HTML5 parser does not discard custom tags or foster-parent rows
  const sanitizedHtml = html
    .replace(/<\/?table\b/gi, '<div class="table-container"')
    .replace(/<\/?tbody\b/gi, '<div class="tbody-container"')
    .replace(/<\/?thead\b/gi, '<div class="thead-container"');

  const parser = new DOMParser();
  const doc = parser.parseFromString(sanitizedHtml, 'text/html');

  const elements = Array.from(
    doc.querySelectorAll('xs6-my-trades-table-row, xs6-open-table-position-row, [data-testid="group-row"], [data-testid="child-row"], .group-row, tr')
  );

  const groups = [];
  let currentGroup = null;

  elements.forEach((row) => {
    const isChild = row.matches('xs6-open-table-position-row, [data-testid="child-row"], .child-row');

    const getTestIdValue = (testid) => {
      const el = row.querySelector(`[data-testid="${testid}"] .label-value, [data-testid="${testid}"].row-column, [data-testid="${testid}"]`);
      if (!el) return 0;
      return cleanNumber(el.textContent);
    };

    if (!isChild) {
      let ticker = '';
      const logoImg = row.querySelector('img[src*="logos.xtb.com"], img.logo-icon, img');
      if (logoImg && logoImg.src) {
        const match = logoImg.src.match(/logos\.xtb\.com\/([a-zA-Z0-9_]+?)(?:_us|_eu|_uk|_pl|_de|_es)?\.(?:png|svg|webp)/i);
        if (match && match[1]) {
          ticker = cleanTicker(match[1]);
        }
      }

      if (!ticker) {
        const instrumentEl = row.querySelector('[data-testid="instrument-name"], .pds-element-name');
        if (instrumentEl) {
          const text = instrumentEl.textContent.trim();
          const symbolMatch = text.match(/\b([A-Z0-9]{1,6})(?:\.US)?\b/);
          if (symbolMatch) {
            ticker = cleanTicker(symbolMatch[1]);
          }
        }
      }

      let name = '';
      const nameEl = row.querySelector('.pds-element-name-value__element-name, .pds-interactive-underline, [data-testid="instrument-name"]');
      if (nameEl) {
        name = nameEl.textContent.trim();
      }

      let shares = getTestIdValue('volume');
      let purchasePrice = getTestIdValue('open-price');
      let investedAmount = getTestIdValue('open-value');
      let currentPrice = getTestIdValue('current-price');

      if (investedAmount === 0 && shares > 0 && purchasePrice > 0) {
        investedAmount = Number((shares * purchasePrice).toFixed(2));
      } else if (shares === 0 && investedAmount > 0 && purchasePrice > 0) {
        shares = Number((investedAmount / purchasePrice).toFixed(4));
      } else if (purchasePrice === 0 && investedAmount > 0 && shares > 0) {
        purchasePrice = Number((investedAmount / shares).toFixed(2));
      }

      const { date: tradeDate, time: tradeTime, isAutoDetected: isDateAutoDetected } = extractXtbDate(row, fallbackDate);

      currentGroup = {
        ticker,
        name: name || ticker,
        shares,
        purchasePrice,
        investedAmount,
        currentPrice: currentPrice > 0 ? currentPrice : purchasePrice,
        date: tradeDate,
        purchaseTime: tradeTime,
        isDateAutoDetected,
        children: []
      };
      if (ticker) {
        groups.push(currentGroup);
      }
    } else if (currentGroup) {
      let shares = getTestIdValue('volume');
      let purchasePrice = getTestIdValue('open-price');
      let investedAmount = getTestIdValue('open-value');
      let currentPrice = getTestIdValue('current-price') || currentGroup.currentPrice;

      if (investedAmount === 0 && shares > 0 && purchasePrice > 0) {
        investedAmount = Number((shares * purchasePrice).toFixed(2));
      } else if (shares === 0 && investedAmount > 0 && purchasePrice > 0) {
        shares = Number((investedAmount / purchasePrice).toFixed(4));
      } else if (purchasePrice === 0 && investedAmount > 0 && shares > 0) {
        purchasePrice = Number((investedAmount / shares).toFixed(2));
      }

      const { date: tradeDate, time: tradeTime, isAutoDetected: isDateAutoDetected } = extractXtbDate(row, fallbackDate);

      if (shares > 0 || investedAmount > 0) {
        currentGroup.children.push({
          ticker: currentGroup.ticker,
          name: currentGroup.name,
          shares,
          purchasePrice: purchasePrice || (shares > 0 ? Number((investedAmount / shares).toFixed(2)) : 0),
          investedAmount,
          currentPrice: currentPrice > 0 ? currentPrice : purchasePrice,
          date: tradeDate,
          purchaseTime: tradeTime,
          isDateAutoDetected,
        });
      }
    }
  });

  const trades = [];
  const seenTrades = new Set();
  let idx = 0;

  for (const g of groups) {
    if (!g.ticker) continue;
    if (g.children.length > 0) {
      for (const c of g.children) {
        const dedupeKey = `${c.ticker}_${c.shares}_${c.purchasePrice}_${c.date}_${c.purchaseTime}`;
        if (!seenTrades.has(dedupeKey)) {
          seenTrades.add(dedupeKey);
          trades.push({
            id: `xtb_${Date.now()}_${idx++}_${c.ticker}`,
            ...c
          });
        }
      }
    } else if (g.shares > 0 || g.investedAmount > 0) {
      const dedupeKey = `${g.ticker}_${g.shares}_${g.purchasePrice}`;
      if (!seenTrades.has(dedupeKey)) {
        seenTrades.add(dedupeKey);
        trades.push({
          id: `xtb_${Date.now()}_${idx++}_${g.ticker}`,
          ticker: g.ticker,
          name: g.name,
          shares: g.shares,
          purchasePrice: g.purchasePrice,
          investedAmount: g.investedAmount,
          currentPrice: g.currentPrice,
          date: g.date,
          purchaseTime: g.purchaseTime,
          isDateAutoDetected: g.isDateAutoDetected,
        });
      }
    }
  }

  return { success: trades.length > 0, trades };
}

function parseFromText(text, fallbackDate) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const trades = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Tab-separated values
    if (line.includes('\t')) {
      const parts = line.split('\t').map(p => p.trim()).filter(Boolean);
      if (parts.length >= 3) {
        const potentialTicker = cleanTicker(parts[0]);
        const num1 = cleanNumber(parts[1]);
        const num2 = cleanNumber(parts[2]);
        const num3 = parts.length > 3 ? cleanNumber(parts[3]) : 0;
        const num4 = parts.length > 4 ? cleanNumber(parts[4]) : 0;

        if (potentialTicker && potentialTicker.length <= 6 && num1 > 0) {
          let shares = num1;
          let purchasePrice = num2;
          let investedAmount = num3;
          let currentPrice = num4;

          if (investedAmount === 0 && shares > 0 && purchasePrice > 0) {
            investedAmount = Number((shares * purchasePrice).toFixed(2));
          }

          const { date: tradeDate, time: tradeTime, isAutoDetected: isDateAutoDetected } = extractXtbDate(line, fallbackDate);

          trades.push({
            id: `xtb_${Date.now()}_${i}_${potentialTicker}`,
            ticker: potentialTicker,
            name: potentialTicker,
            shares,
            purchasePrice,
            investedAmount,
            currentPrice: currentPrice || purchasePrice,
            date: tradeDate,
            purchaseTime: tradeTime,
            isDateAutoDetected,
          });
        }
      }
    }
  }

  // Regex scan across plain text
  if (trades.length === 0) {
    const rowRegex = /([A-Z0-9.]{1,8})\s+(?:Acci[oó]n|ETF|ETC|Stock)?\s*([\d\.,]+)\s+([\d\.,]+)\s+([\d\.,]+)/gi;
    let match;
    let matchIdx = 0;
    while ((match = rowRegex.exec(text)) !== null) {
      const sym = cleanTicker(match[1]);
      const v1 = cleanNumber(match[2]);
      const v2 = cleanNumber(match[3]);
      const v3 = cleanNumber(match[4]);
      if (sym && v1 > 0 && v2 > 0) {
        const { date: tradeDate, time: tradeTime, isAutoDetected: isDateAutoDetected } = extractXtbDate(match[0], fallbackDate);
        trades.push({
          id: `xtb_${Date.now()}_${matchIdx++}_${sym}`,
          ticker: sym,
          name: sym,
          shares: v1,
          purchasePrice: v2,
          investedAmount: v3 > 0 ? v3 : Number((v1 * v2).toFixed(2)),
          currentPrice: v2,
          date: tradeDate,
          purchaseTime: tradeTime,
          isDateAutoDetected,
        });
      }
    }
  }

  if (trades.length === 0) {
    return {
      success: false,
      trades: [],
      error: 'No se detectaron compras en el texto pegado. Asegúrate de copiar la tabla de xStation (con clic derecho o inspeccionar).'
    };
  }

  return { success: true, trades };
}
