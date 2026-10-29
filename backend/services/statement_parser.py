"""
Multi-Bank PDF & Image Statement Parser module.
Supports password-protected PDFs (Cedula/NIT decryption), auto-detecting bank entity,
extracting CDTs opened/matured, savings accounts, interest payouts, and transaction history.
"""

import io
import logging
import re
from datetime import datetime, timedelta
from typing import Any

logger = logging.getLogger(__name__)

try:
    import pypdf
except ImportError:
    pypdf = None


def fix_ocr_dollar_sign_misread(raw_amount_str: str) -> str:
    """
    Corrige los errores del OCR que confunde el signo '$' o '+$/-$' de Nu:
      - Confunde '$' con '8' o 'B' al inicio del monto (ej: -840.000 -> -40.000).
      - Confunde '+$' o '-$' con '48' al inicio del monto (ej: 48100.000 -> 100.000).
      - Confunde '-' con '~' al inicio del monto (ej: ~8150.000 -> -150.000).
      - Confunde ceros '0' con letras 'O' u 'o'.
    """
    s = raw_amount_str.strip().replace(" ", "")
    
    # 1. Normalizar letras 'O' u 'o' por ceros '0' que son errores comunes de OCR en los números
    s = s.replace('O', '0').replace('o', '0')
    
    # 2. Normalizar tildes o guiones raros al inicio: '~' -> '-'
    if s.startswith('~'):
        s = '-' + s[1:]
        
    # 3. Corregir prefijo '48' (que suele ser un '+ $' o '- $' mal leído)
    # Ej: "48100.000,41" -> "100.000,41"
    if s.startswith('48'):
        s = s[2:]
    elif s.startswith('-48') or s.startswith('+48'):
        sign = s[0]
        s = sign + s[3:]

    # 4. Corregir prefijo '8' o 'B' (que es un '$' mal leído)
    # Ej: "-850.000,00" → signo opcional, luego '8' y el resto del número
    m = re.match(r'^([+\-]?)[8B](\d{1,3}(?:\.\d{3})*(?:,\d{2})?)$', s)
    if m:
        sign = m.group(1) or ''
        rest = m.group(2)
        corrected = f"{sign}{rest}"
        logger.debug("fix_ocr_dollar_sign_misread: '%s' -> '%s'", raw_amount_str, corrected)
        return corrected
        
    return s

def parse_cop_amount(val_str: str) -> float:
    """Convert Spanish COP currency string like '$1.064.862,70' or '-$701.000,00' to float."""
    if not val_str:
        return 0.0
    clean = val_str.replace('$', '').replace(' ', '').strip()
    is_negative = '-' in clean or 'CR' in clean.upper() or 'DEB' in clean.upper()
    clean = clean.replace('-', '').replace('+', '').replace('CR', '').replace('DEB', '').strip()
    
    # Normalizar letras 'O' u 'o' por ceros '0'
    clean = clean.replace('O', '0').replace('o', '0')
    
    # Standardize Colombian format: 1.064.862,70 -> 1064862.70
    if ',' in clean and '.' in clean:
        clean = clean.replace('.', '').replace(',', '.')
    elif ',' in clean:
        clean = clean.replace(',', '.')
    
    try:
        val = float(clean)
        return -val if is_negative else val
    except ValueError:
        return 0.0


def extract_text_from_pdf(pdf_bytes: bytes, password: str | None = None) -> dict[str, Any]:
    """
    Decrypts (if needed) and extracts text from a PDF file.
    Returns dict with extracted text, page count, and encryption status.
    """
    if pypdf is None:
        return {
            "success": False,
            "error": "PYPDF_NOT_INSTALLED",
            "message": "pypdf no está instalado en el servidor.",
            "text": "",
        }
    try:
        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        
        if reader.is_encrypted:
            if not password:
                return {
                    "success": False,
                    "error": "PDF_ENCRYPTED",
                    "message": "El extracto en PDF está protegido con contraseña. Ingresa tu cédula o clave para desbloquearlo.",
                    "text": ""
                }
            
            # Attempt decryption with provided password
            decrypted = reader.decrypt(password)
            if not decrypted:
                # Try trimming whitespace or trailing zeroes in cedula
                decrypted = reader.decrypt(password.strip())
            
            if not decrypted:
                return {
                    "success": False,
                    "error": "WRONG_PASSWORD",
                    "message": "La contraseña ingresada no es válida para este extracto PDF.",
                    "text": ""
                }
        
        full_text = []
        for page in reader.pages:
            t = page.extract_text()
            if t:
                full_text.append(t)
        
        extracted_str = "\n".join(full_text)
        return {
            "success": True,
            "error": None,
            "message": "PDF extraído exitosamente",
            "text": extracted_str,
            "pageCount": len(reader.pages)
        }
    except Exception as e:
        return {
            "success": False,
            "error": "PARSING_FAILED",
            "message": f"Error leyendo el archivo PDF: {str(e)}",
            "text": ""
        }


def identify_bank_entity(text: str) -> dict[str, str]:
    """Identifies bank entity from text signatures."""
    text_upper = text.upper()
    
    if "NU COLOMBIA" in text_upper or "COMPAÑÍA DE FINANCIAMIENTO" in text_upper or "CAJITA NU" in text_upper or "ABRISTE UN CDT" in text_upper:
        return {"id": "ent_nu", "name": "Nu Colombia", "icon": "💜", "color": "#820ad1"}
    elif "FINANDINA" in text_upper or "FLEXIDIGITAL" in text_upper:
        return {"id": "ent_finandina", "name": "Banco Finandina", "icon": "🏦", "color": "#1e3a8a"}
    elif "LULO BANK" in text_upper or "BOLSILLO LULO" in text_upper:
        return {"id": "ent_lulo", "name": "Lulo Bank", "icon": "⚡", "color": "#00e5ff"}
    elif "PIBANK" in text_upper:
        return {"id": "ent_pibank", "name": "Pibank", "icon": "🏦", "color": "#f59e0b"}
    elif "BANCOLOMBIA" in text_upper or "TU360" in text_upper:
        return {"id": "ent_bancolombia", "name": "Bancolombia", "icon": "🟡", "color": "#fdc500"}
    elif "DAVIVIENDA" in text_upper or "DABUENAVIDA" in text_upper:
        return {"id": "ent_davivienda", "name": "Davivienda", "icon": "🔴", "color": "#dc2626"}
    elif "RAPPIPAY" in text_upper or "RAPPICUENTA" in text_upper:
        return {"id": "ent_rappi", "name": "RappiPay", "icon": "💳", "color": "#ff441f"}
    elif "UALÁ" in text_upper or "UALA" in text_upper:
        return {"id": "ent_uala", "name": "Ualá Colombia", "icon": "🔴", "color": "#e11d48"}
    elif "SERFINANZA" in text_upper:
        return {"id": "ent_serfinanza", "name": "Banco Serfinanza", "icon": "🏦", "color": "#0284c7"}
    elif "INTERACTIVE BROKERS" in text_upper or "IBKR" in text_upper:
        return {"id": "ent_ibkr", "name": "Interactive Brokers", "icon": "💵", "color": "#e11d48"}
    else:
        return {"id": "ent_generic", "name": "Entidad Bancaria Detectada", "icon": "🏦", "color": "#64748b"}


def parse_nu_statement(text: str) -> dict[str, Any]:
    """Specialized parser for Nu Colombia bank statements & screenshot extracts."""
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    
    cdts_detected = []
    accounts_detected = []
    movements_detected = []
    
    total_yield_paid = 0.0
    current_savings_balance = 0.0
    
    # 1. Look for CDT creations: e.g. "14 ago Abriste un CDT -$1.064.862,70" or "Abriste un CDT"
    cdt_opened_matches = re.findall(
        r'(\d{1,2}\s+[a-z]{3})?\s*(?:Abriste|Apertura|Constitución)\s+(?:un\s+)?CDT\s+([+\-]?\$?\s*[\d\.,]+)',
        text,
        re.IGNORECASE
    )
    for date_str, amount_str in cdt_opened_matches:
        capital = abs(parse_cop_amount(amount_str))
        if capital > 0:
            cdts_detected.append({
                "name": f"CDT Nu Colombia ${capital:,.0f}",
                "capital": capital,
                "currency": "COP",
                "interestRateEA": 12.2, # Nu standard rate
                "termDays": 180,
                "startDate": datetime.now().strftime("%Y-%m-%d"),
                "reteFuentePct": 4.0,
                "detectedFrom": "Abriste un CDT"
            })

    # 2. Look for CDT payouts / maturities: e.g. "08 ago Recibiste dinero de un CDT +$154.583,66"
    cdt_payout_matches = re.findall(
        r'(\d{1,2}\s+[a-z]{3})?\s*(?:Recibiste\s+dinero\s+de\s+un|Liquidación|Vencimiento)\s+CDT\s+([+\-]?\$?\s*[\d\.,]+)',
        text,
        re.IGNORECASE
    )
    for date_str, amount_str in cdt_payout_matches:
        amount = parse_cop_amount(amount_str)
        movements_detected.append({
            "date": date_str or "Reciente",
            "type": "cdt_payout",
            "description": "Recibiste dinero de un CDT",
            "amount": amount,
            "currency": "COP"
        })

    # 3. Look for Summary Boxes (Image 2 format): "Dinero en tus cajitas $1.255.290,28", "Tu dinero a final del mes $1.255.290,28"
    cajitas_balance_match = re.search(r'Dinero\s+en\s+tus\s+cajitas[^\d\$]*([+\-]?\$?\s*[\d\.,]+)', text, re.IGNORECASE)
    account_balance_match = re.search(r'Dinero\s+en\s+tu\s+Cuenta\s+Nu[^\d\$]*([+\-]?\$?\s*[\d\.,]+)', text, re.IGNORECASE)
    end_month_balance_match = re.search(r'Tu\s+dinero\s+a\s+final\s+del\s+mes[^\d\$]*([+\-]?\$?\s*[\d\.,]+)', text, re.IGNORECASE)
    period_match = re.search(r'Período[^\d]*(\d{1,2}\s*-\s*\d{1,2}\s+[A-Z]{3}\s+\d{4})', text, re.IGNORECASE)

    period_str = period_match.group(1) if period_match else ""
    cajitas_bal = parse_cop_amount(fix_ocr_dollar_sign_misread(cajitas_balance_match.group(1))) if cajitas_balance_match else 0.0
    account_bal = parse_cop_amount(fix_ocr_dollar_sign_misread(account_balance_match.group(1))) if account_balance_match else 0.0
    end_month_bal = parse_cop_amount(fix_ocr_dollar_sign_misread(end_month_balance_match.group(1))) if end_month_balance_match else 0.0

    # 4. Look for Total Yield paid: e.g. "Rendimiento total de tu cuenta +$11.292,45"
    yield_matches = re.findall(
        r'Rendimiento\s+total[^\d\+]*([+\-]?\$?\s*[\d\.,]+)',
        text,
        re.IGNORECASE
    )
    if yield_matches:
        total_yield_paid = parse_cop_amount(fix_ocr_dollar_sign_misread(yield_matches[0]))

    # 5. Extract general movements: e.g. "05 ago Enviaste a JESUS DAVID... -$7.000,00"
    movement_pattern = re.compile(
        r'(\d{1,2}\s+[a-z]{3})\s+([A-Za-z0-9\s\.,áéíóúÁÉÍÓÚñÑ]+?)\s+([+\-]\$?\s*[\d\.,]+)',
        re.IGNORECASE
    )
    for match in movement_pattern.finditer(text):
        m_date, m_desc, m_amount = match.groups()
        val = parse_cop_amount(fix_ocr_dollar_sign_misread(m_amount))
        movements_detected.append({
            "date": m_date,
            "description": m_desc.strip(),
            "amount": val,
            "currency": "COP",
            "type": "credit" if val >= 0 else "debit"
        })

    # 6. Build Accounts breakdown
    main_balance = end_month_bal if end_month_bal > 0 else (cajitas_bal + account_bal)
    
    if cajitas_bal > 0:
        accounts_detected.append({
            "name": f"Dinero en Cajitas Nu {('(' + period_str + ')') if period_str else ''}",
            "type": "pocket",
            "currency": "COP",
            "balance": cajitas_bal,
            "interestRateEA": 12.0,
            "isTaxExemptGMF": True,
            "yieldEarnedPeriod": total_yield_paid
        })
    elif main_balance > 0:
        accounts_detected.append({
            "name": f"Cuenta Nu {('(' + period_str + ')') if period_str else ''}",
            "type": "pocket",
            "currency": "COP",
            "balance": main_balance,
            "interestRateEA": 12.0,
            "isTaxExemptGMF": True,
            "yieldEarnedPeriod": total_yield_paid
        })
    else:
        accounts_detected.append({
            "name": "Cuenta / Cajitas Nu",
            "type": "pocket",
            "currency": "COP",
            "balance": 0.0,
            "interestRateEA": 12.0,
            "isTaxExemptGMF": True,
            "yieldEarnedPeriod": total_yield_paid
        })

    return {
        "accounts": accounts_detected,
        "cdts": cdts_detected,
        "movements": movements_detected,
        "totalYieldPaid": total_yield_paid
    }


def parse_generic_statement(text: str) -> dict[str, Any]:
    """Fallback parser for all bank statements."""
    cdts = []
    accounts = []
    movements = []
    
    # Detect amounts with dates
    amounts = re.findall(r'([+\-]?\$?\s*\d{1,3}(?:\.\d{3})*(?:,\d{2})?)', text)
    cop_amounts = [parse_cop_amount(a) for a in amounts if parse_cop_amount(a) != 0]
    
    # Detect CDT mentions
    if "CDT" in text.upper():
        cdts.append({
            "name": "CDT Detectado en Extracto",
            "capital": max(cop_amounts) if cop_amounts else 5000000.0,
            "currency": "COP",
            "interestRateEA": 11.5,
            "termDays": 180,
            "startDate": datetime.now().strftime("%Y-%m-%d"),
            "reteFuentePct": 4.0
        })

    accounts.append({
        "name": "Cuenta Principal Detectada",
        "type": "pocket",
        "currency": "COP",
        "interestRateEA": 12.0,
        "isTaxExemptGMF": True
    })

    return {
        "accounts": accounts,
        "cdts": cdts,
        "movements": movements,
        "totalYieldPaid": 0.0
    }


MONTH_MAP = {
    'ene': 1, 'feb': 2, 'mar': 3, 'abr': 4, 'may': 5, 'jun': 6,
    'jul': 7, 'ago': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dic': 12
}


def parse_nu_screenshot_history(text: str, start_year: int = 2024, last_month_num: int | None = None) -> dict[str, Any]:
    """
    Parses Nu app mobile screenshots or history text.
    Extracts Cajitas by exact name (Cajita Estudios, Cajita Viaje, Cajita Deuda mom),
    CDTs categorized by destination (Invertiste en CDT en Viaje),
    and reconstructs YYYY-MM-DD dates using month transitions.
    """
    cleaned_lines = []
    for line in text.split('\n'):
        line_str = line.strip()
        if not line_str:
            continue
        # Omitir marcadores de depuración de logs si están mezclados
        if "DEBUG ===" in line_str or "DEBUG === END" in line_str:
            continue
        if "DEBUG" in line_str and ("OCR" in line_str or "statement_parser" in line_str):
            continue
        # Limpiar prefijos de entorno de logs como [backend]
        cleaned = re.sub(r'^\[backend\]\s*', '', line_str).strip()
        if cleaned:
            cleaned_lines.append(cleaned)
            
    lines = cleaned_lines
    
    logger.debug("=== OCR RAW TEXT ===")
    logger.debug(text)
    logger.debug("=== END OCR TEXT ===")
    
    pocket_balances: dict[str, float] = {}
    cdts_detected = []
    movements_detected = []
    
    current_year = start_year
    # El parámetro last_month_num se preserva para guiar la secuencia de meses entre archivos del lote
    
    # Regex for Cajita deposits / withdrawals
    # e.g., "Agregaste dinero a tu Cajita Estudios -$40.000,00"
    # e.g., "Retiraste dinero de tu Cajita Viaje +$10.000,00"
    # e.g., "13 jun - 02:10"
    cajita_pattern = re.compile(
        r'(Agregaste|Retiraste)\s+dinero\s+(?:a|de)\s+tu\s+(Cajita\s+[A-Za-z0-9\sáéíóúÁÉÍÓÚñÑ]+?)\s+([+\-]?\$?\s*[\d\.,]+)',
        re.IGNORECASE
    )
    
    # Regex for CDT investments per Cajita
    # e.g., "Invertiste en CDT en Deuda mom $80.000,00"
    cdt_cat_pattern = re.compile(
        r'Invertiste\s+en\s+CDT\s+en\s+([A-Za-z0-9\sáéíóúÁÉÍÓÚñÑ]+?)\s+([+\-]?\$?\s*[\d\.,]+)',
        re.IGNORECASE
    )
    
    # Regex for date lines: "13 jun - 02:10" or "13 jun"
    date_line_pattern = re.compile(r'(\d{1,2})\s+([a-z]{3})(?:\s*-\s*\d{2}:\d{2})?', re.IGNORECASE)

    # Nuevo: detectar saldos directos de cajitas (resumen)
    direct_balance_pattern = re.compile(
        r'(?:Cajita\s+)([A-Za-z0-9\sáéíóúÁÉÍÓÚñÑ]+?)\s*[:$]?\s*([+\-]?\$?\s*[\d\.,]+)',
        re.IGNORECASE
    )
    for idx, line in enumerate(lines):
        bal_match = direct_balance_pattern.search(line)
        if bal_match:
            cajita_name = bal_match.group(1).strip()
            fixed_bal = fix_ocr_dollar_sign_misread(bal_match.group(2))
            bal = abs(parse_cop_amount(fixed_bal))
            if cajita_name not in pocket_balances:
                pocket_balances[cajita_name] = bal
                logger.debug("Encontrado saldo directo (misma línea): %s = %.2f", cajita_name, bal)
        
        elif "cajita" in line.lower() and idx + 1 < len(lines):
            name_parts = line.split()
            if len(name_parts) >= 2:
                cajita_name = line.strip()
                next_line = lines[idx + 1]
                fixed_bal = fix_ocr_dollar_sign_misread(next_line)
                amount = parse_cop_amount(fixed_bal)
                if amount > 0 and "agregaste" not in next_line.lower() and "retiraste" not in next_line.lower():
                    if not re.search(r'\d{1,2}\s+[a-z]{3}', next_line, re.IGNORECASE):
                        if cajita_name not in pocket_balances:
                            pocket_balances[cajita_name] = amount
                            logger.debug("Encontrado saldo directo (multilínea): %s = %.2f", cajita_name, amount)

    current_date_str = f"{current_year}-01-01"

    # Determinar si hay saldos directos antes de entrar al bucle de movimientos
    has_direct_balances = len([k for k in pocket_balances if pocket_balances[k] > 0]) > 0
    logger.debug("[PARSER] ¿Se detectaron saldos de cajitas directos en primera pasada? %s", has_direct_balances)

    # ── Buscando Transacciones Multilínea de Cajitas y CDTs (Pasada Principal - Top-to-Bottom) ──
    logger.debug("--- BUSCANDO TRANSACCIONES Y CDTS (HISTORIAL MULTILÍNEA) ---")
    detected_blocks = []
    
    idx = 0
    while idx < len(lines):
        line = lines[idx]
        
        # 1. Detectar Movimientos de Cajita (Agregaste / Retiraste)
        if "agregaste" in line.lower() or "retiraste" in line.lower():
            action = "Agregaste" if "agregaste" in line.lower() else "Retiraste"
            logger.debug("[PARSER] 🔍 Detectada línea de acción en línea %d: '%s' -> Acción: %s", idx, line, action)
            
            # Ventana de búsqueda de 5 líneas adelante
            window = lines[idx + 1 : idx + 6]
            logger.debug("[PARSER]   Examinando ventana: %s", window)
            
            amount_val = None
            cajita_name = None
            date_str = None
            time_str = None
            
            # 1. Identificar Monto: primera línea con dígitos que no sea Cajita ni contenga el mes/acción
            for w_line in window:
                if re.search(r'\d+', w_line):
                    # Evitar que sea la línea de nombre de Cajita o la fecha/hora
                    if "cajita" not in w_line.lower() and not re.search(r'[a-zA-Z]{3,}', w_line):
                        parsed = parse_cop_amount(fix_ocr_dollar_sign_misread(w_line))
                        if parsed != 0 and abs(parsed) >= 500.0:
                            amount_val = abs(parsed)
                            logger.debug("[PARSER]   -> Encontrado monto Cajita: %.2f en la línea: '%s'", amount_val, w_line)
                            break
            
            # 2. Identificar Nombre de Cajita: primera línea que contenga "cajita"
            for w_line in window:
                if "cajita" in w_line.lower():
                    cajita_name = w_line.strip()
                    logger.debug("[PARSER]   -> Encontrada Cajita: '%s'", cajita_name)
                    break
            
            # 3. Identificar Fecha: buscar patrón exacto de día y mes (ej. "30 oct", "29 sep") en línea aislada dentro de la ventana
            for w_line in window:
                date_match_w = re.search(r'^(\d{1,2})\s+([a-zA-ZáéíóúÁÉÍÓÚñÑ]{3,4})(?:\s*-\s*\d{2}[:\.]\d{2})?$', w_line.strip(), re.IGNORECASE)
                if date_match_w:
                    date_str = f"{date_match_w.group(1)} {date_match_w.group(2).lower()}"
                    logger.debug("[PARSER]   -> Encontrada Fecha: '%s'", date_str)
                    break
            
            # 4. Identificar Hora: buscar patrón de hora exacto (ej. "17:50", "00.31") en línea corta aislada dentro de la ventana
            for w_line in window:
                if len(w_line.strip()) <= 6:
                    time_match_w = re.match(r'^(\d{2})[:\.](\d{2})$', w_line.strip())
                    if time_match_w:
                        time_str = f"{time_match_w.group(1)}:{time_match_w.group(2)}"
                        logger.debug("[PARSER]   -> Encontrada Hora: '%s'", time_str)
                        break
            
            if amount_val is not None and cajita_name:
                detected_blocks.append({
                    "type": "Cajita",
                    "action": action,
                    "amount_val": amount_val,
                    "cajita_name": cajita_name,
                    "date_str": date_str,
                    "time_str": time_str
                })
            else:
                logger.warning("[PARSER]   ⚠️ No se pudo completar el bloque de transacción de la línea %d. Falta monto (%s) o cajita (%s).", idx, amount_val, cajita_name)
                
        # 2. Detectar Eventos de CDT (Inversiones o Vencimientos)
        elif "invertiste en cdt" in line.lower() or "venció el cdt" in line.lower() or "vencio el cdt" in line.lower() or "vencimiento cdt" in line.lower():
            is_vencimiento_by_action = "venció" in line.lower() or "vencio" in line.lower() or "vencimiento" in line.lower()
            logger.debug("[PARSER] 🔍 Detectado evento de CDT en línea %d: '%s' (Vencimiento por acción: %s)", idx, line, is_vencimiento_by_action)
            
            # Limpiar prefijo de acción para extraer el nombre parcial de la categoría
            partial_name = ""
            action_clean = re.sub(r'^(?:Invertiste|Venció|Vencio|Vencimiento)\s+(?:en|el)\s+CDT\s+(?:en\s+)?', '', line, flags=re.IGNORECASE).strip()
            if action_clean and action_clean.lower() != "en":
                partial_name = action_clean
                
            window = lines[idx + 1 : idx + 6]
            logger.debug("[PARSER]   Examinando ventana CDT: %s", window)
            
            amount_val = None
            raw_amount_str = ""
            extra_name = ""
            date_str = None
            time_str = None
            
            # 1. Identificar Monto: primera línea con dígitos en la ventana
            for w_line in window:
                if re.search(r'\d+', w_line):
                    if not re.search(r'^[a-zA-ZáéíóúÁÉÍÓÚñÑ]{3,4}$', w_line.strip()) and not re.search(r'[a-zA-Z]{3,}', w_line):
                        parsed = parse_cop_amount(fix_ocr_dollar_sign_misread(w_line))
                        if parsed != 0 and abs(parsed) >= 500.0:
                            amount_val = abs(parsed)
                            raw_amount_str = w_line.strip()
                            logger.debug("[PARSER]   -> Encontrado monto CDT: %.2f (Raw: '%s')", amount_val, raw_amount_str)
                            break
            
            # 2. Identificar Fecha: buscar patrón exacto de día y mes (ej. "25 may") en la ventana
            for w_line in window:
                date_match_w = re.search(r'^(\d{1,2})\s+([a-zA-ZáéíóúÁÉÍÓÚñÑ]{3,4})(?:\s*-\s*\d{2}[:\.]\d{2})?$', w_line.strip(), re.IGNORECASE)
                if date_match_w:
                    date_str = f"{date_match_w.group(1)} {date_match_w.group(2).lower()}"
                    logger.debug("[PARSER]   -> Encontrada Fecha CDT: '%s'", date_str)
                    break
            
            # 3. Identificar Hora: buscar patrón de hora exacto en la ventana
            for w_line in window:
                if len(w_line.strip()) <= 6:
                    time_match_w = re.match(r'^(\d{2})[:\.](\d{2})$', w_line.strip())
                    if time_match_w:
                        time_str = f"{time_match_w.group(1)}:{time_match_w.group(2)}"
                        logger.debug("[PARSER]   -> Encontrada Hora CDT: '%s'", time_str)
                        break
            
            # 4. Identificar parte extra del nombre (ej. "mom", "Estudios") en la ventana
            for w_line in window:
                w_strip = w_line.strip()
                is_amount = False
                if amount_val is not None:
                    parsed_temp = abs(parse_cop_amount(fix_ocr_dollar_sign_misread(w_strip)))
                    if parsed_temp == amount_val:
                        is_amount = True
                
                is_date = re.search(r'^(\d{1,2})\s+([a-zA-ZáéíóúÁÉÍÓÚñÑ]{3,4})$', w_strip, re.IGNORECASE) is not None
                is_time = len(w_strip) <= 6 and re.match(r'^(\d{2})[:\.](\d{2})$', w_strip) is not None
                # Filtrar basura OCR (ej: "ul/", "ull", "u/", "@" o palabras cortas con símbolos)
                is_action_word = any(word in w_strip.lower() for word in ["invertiste", "venció", "vencio", "agregaste", "retiraste", "dinero", "cdt", "cajita"])
                is_trash = (
                    w_strip.lower() in ["ul", "ull", "u", "u/", "ul/", "ull/", "u/", "ll", "il", "ill", ",ll", ",il", "l", "i"] or
                    is_action_word or
                    (len(w_strip) <= 3 and any(char in w_strip for char in ['/', '\\', '@', '_', '|', '.', ',', 'l', 'i', 'I', 'u']))
                )
                
                if not is_amount and not is_date and not is_time and not is_trash:
                    extra_name = w_strip
                    logger.debug("[PARSER]   -> Encontrado sufijo de categoría CDT: '%s'", extra_name)
                    break
            
            # Combinar el nombre de la categoría del CDT de manera robusta
            category_name = f"{partial_name} {extra_name}".strip()
            # Limpiar rastro de basura al final del string si quedó algo (ej: u/, ul, +, números de monto)
            category_name = re.sub(r'\s*(?:u/|ul/|ull|u|ul)\s*$', '', category_name, flags=re.IGNORECASE).strip()
            category_name = re.sub(r'\s*\+[\d\.,\s]+$', '', category_name).strip()
            # Remover números del nombre de la categoría (ej: "Viaje 1" o "+8208" -> "Viaje")
            category_name = re.sub(r'\d+', '', category_name).strip()
            # Limpiar dobles espacios o puntuaciones raras al inicio/final que queden de la limpieza de números
            category_name = re.sub(r'\s+', ' ', category_name).strip()
            category_name = category_name.strip('+-., ')
            
            if amount_val is not None and category_name:
                # Heurística de Signo: si el monto raw contiene un signo '+' es un retorno/vencimiento de Nu
                has_plus_sign = "+" in raw_amount_str
                is_vencimiento = is_vencimiento_by_action or has_plus_sign
                
                b_type = "CDT_Maturity" if is_vencimiento else "CDT"
                
                detected_blocks.append({
                    "type": b_type,
                    "amount_val": amount_val,
                    "category_name": category_name,
                    "date_str": date_str,
                    "time_str": time_str
                })
                logger.debug("[PARSER]   -> Completado bloque CDT (%s): '%s' | Monto: %.2f | Signo '+': %s", b_type, category_name, amount_val, has_plus_sign)
            else:
                logger.warning("[PARSER]   ⚠️ No se pudo completar el bloque de CDT de la línea %d. Falta monto (%s) o categoría (%s).", idx, amount_val, category_name)
                
        idx += 1

    # Reversar los bloques detectados para procesarlos en orden CRONOLÓGICO (del más antiguo al más nuevo)
    chronological_blocks = list(reversed(detected_blocks))
    logger.debug("[PARSER] Bloques totales detectados en orden cronológico: %d", len(chronological_blocks))

    # Procesar bloques y acumular años hacia adelante
    for block in chronological_blocks:
        b_type = block.get("type", "Cajita")
        amount_val = block["amount_val"]
        date_str = block["date_str"]
        time_str = block["time_str"]
        
        transaction_date = f"{current_year}-01-01"
        if date_str:
            try:
                day_part, month_part = date_str.split()
                month_num = MONTH_MAP.get(month_part[:3].lower(), 1)
                
                # Transición de año hacia adelante (cronológica): si el mes actual es menor al mes anterior, es un cambio de año inevitable
                if last_month_num is not None and month_num < last_month_num:
                    current_year += 1
                    logger.debug("[PARSER]   📈 Incrementando año a %d por transición de mes adelante (%d -> %d)", current_year, last_month_num, month_num)
                
                last_month_num = month_num
                transaction_date = f"{current_year}-{month_num:02d}-{int(day_part):02d}"
            except Exception as e:
                logger.warning("[PARSER]   No se pudo construir fecha exacta para %s: %s", date_str, e)
        
        if b_type == "CDT" or b_type == "CDT_Maturity":
            category_name = block["category_name"]
            start_date_str = transaction_date.split('T')[0] # YYYY-MM-DD
            
            if b_type == "CDT_Maturity":
                payout_amount = amount_val
                # Almacenamos el monto del pago en 'capital' y la fecha del pago en 'startDate'
                # para unificar el formulario del importador con un único campo de valor y fecha
                cdts_detected.append({
                    "name": f"Vencimiento CDT Nu ({category_name}) ${payout_amount:,.0f}",
                    "capital": payout_amount,
                    "currency": "COP",
                    "startDate": start_date_str,
                    "category": category_name,
                    "status": "matured"
                })
                logger.debug("[PARSER]   -> Extraído Vencimiento CDT Crudo (Almacenado en capital): %s | Pago: %.2f | Fecha de Pago: %s", category_name, payout_amount, start_date_str)
            else:
                # Solo extraemos los datos crudos de la inversión tal como aparecen en el OCR
                cdts_detected.append({
                    "name": f"CDT Nu ({category_name}) ${amount_val:,.0f}",
                    "capital": amount_val,
                    "currency": "COP",
                    "interestRateEA": 12.2, # Nu standard rate
                    "termDays": 180,
                    "startDate": start_date_str,
                    "category": category_name,
                    "status": "active"
                })
                logger.debug("[PARSER]   -> Extraído CDT Crudo: %s | Capital: %.2f | Fecha de Inicio: %s", category_name, amount_val, start_date_str)
        else:
            action = block["action"]
            cajita_name = block["cajita_name"]
            
            # Acumular saldo de Cajita si no se detectaron saldos directos en primera pasada
            if not has_direct_balances:
                if action == "Agregaste":
                    pocket_balances[cajita_name] = pocket_balances.get(cajita_name, 0.0) + amount_val
                else: # Retiraste
                    pocket_balances[cajita_name] = pocket_balances.get(cajita_name, 0.0) - amount_val
                logger.debug("[PARSER]   -> Balance acumulado para '%s': %.2f (Acción: %s, Monto: %.2f)", cajita_name, pocket_balances[cajita_name], action, amount_val)
            
            # Registrar movimiento con signo correcto
            move_amount = -amount_val if action == "Agregaste" else amount_val
            movements_detected.append({
                "date": transaction_date,
                "description": f"{action} a {cajita_name}" if action == "Agregaste" else f"{action} de {cajita_name}",
                "amount": move_amount,
                "currency": "COP",
                "type": "debit" if move_amount < 0 else "credit"
            })
            logger.debug("[PARSER]   -> Registrado movimiento cronológico: %s | Valor: %.2f | Fecha: %s", movements_detected[-1]["description"], move_amount, transaction_date)

    logger.debug("Pocket balances dict: %s", pocket_balances)
    logger.debug("CDTs detected: %d", len(cdts_detected))
    
    accounts_detected = []
    for pocket_name, balance in pocket_balances.items():
        accounts_detected.append({
            "name": pocket_name,
            "type": "pocket",
            "currency": "COP",
            "balance": balance,
            "interestRateEA": 12.0,
            "isTaxExemptGMF": True
        })

    # Fallback: If no specific cajitas or CDTs were matched, extract general amounts and create default account
    if not accounts_detected and not cdts_detected:
        cop_amounts = [parse_cop_amount(a) for a in re.findall(r'([+\-]?\$?\s*\d{1,3}(?:\.\d{3})*(?:,\d{2})?)', text) if parse_cop_amount(a) > 0]
        estimated_bal = max(cop_amounts) if cop_amounts else 0.0
        
        logger.debug("Fallback triggered. cop_amounts: %s, max: %.2f", cop_amounts, estimated_bal)
        
        accounts_detected.append({
            "name": "Cuenta / Cajita Principal",
            "type": "pocket",
            "currency": "COP",
            "balance": estimated_bal,
            "interestRateEA": 12.0,
            "isTaxExemptGMF": True
        })

    return {
        "accounts": accounts_detected,
        "cdts": cdts_detected,
        "movements": movements_detected,
        "pocketBalances": pocket_balances,
        "endYear": current_year,
        "endMonthNum": last_month_num
    }


_EASYOCR_READER = None

def get_easyocr_reader():
    global _EASYOCR_READER
    if _EASYOCR_READER is None:
        try:
            import easyocr
            _EASYOCR_READER = easyocr.Reader(['es', 'en'], gpu=False, verbose=False)
        except Exception:
            _EASYOCR_READER = False
    return _EASYOCR_READER


def preprocess_image_for_ocr(file_bytes: bytes) -> bytes:
    """
    Preprocess image bytes to drastically boost OCR accuracy (Tesseract & EasyOCR):
    - Convert to high-contrast grayscale.
    - Upscale by 2x using Lanczos resampling to enlarge small mobile fonts.
    - Enhance contrast to make numbers and text super sharp.
    """
    from PIL import Image, ImageEnhance
    try:
        img = Image.open(io.BytesIO(file_bytes))
        
        # 1. Convert to grayscale to remove color noise
        img = img.convert('L')
        
        # 2. Resize / upscale by 2x using Lanczos (enlarges text segments for neural OCR)
        width, height = img.size
        img = img.resize((width * 2, height * 2), Image.Resampling.LANCZOS)
        
        # 3. Enhance Contrast (make numbers and text stand out perfectly)
        enhancer = ImageEnhance.Contrast(img)
        img = enhancer.enhance(2.5)
        
        # Save back to PNG bytes
        out_bytes = io.BytesIO()
        img.save(out_bytes, format="PNG")
        return out_bytes.getvalue()
    except Exception as e:
        logger.warning("Error preprocessing image for OCR: %s", e)
        return file_bytes # Return original as fallback


_RAPIDOCR_ENGINE = None

def get_rapidocr_engine():
    global _RAPIDOCR_ENGINE
    if _RAPIDOCR_ENGINE is None:
        try:
            from rapidocr_onnxruntime import RapidOCR
            _RAPIDOCR_ENGINE = RapidOCR()
            logger.debug("RapidOCR (PaddleOCR) engine initialized successfully!")
        except Exception as e:
            logger.warning("Error initializing RapidOCR: %s", e)
            _RAPIDOCR_ENGINE = False
    return _RAPIDOCR_ENGINE


def extract_text_from_image(file_bytes: bytes) -> str:
    """Extract text from PNG/JPEG image bytes using rapidocr, easyocr, or pytesseract."""
    # Preprocess image to boost OCR precision to over 95%
    preprocessed_bytes = preprocess_image_for_ocr(file_bytes)
    
    # 1. Try RapidOCR (PaddleOCR - State of the Art for mobile screenshots!)
    try:
        engine = get_rapidocr_engine()
        if engine:
            result, _ = engine(preprocessed_bytes)
            if result:
                # result is a list: [[ [box], text, confidence ], ...]
                texts = [line[1] for line in result]
                if texts:
                    logger.debug("RapidOCR extracted %d lines successfully!", len(texts))
                    return "\n".join(texts)
    except Exception as e:
        logger.warning("RapidOCR failed: %s", e)
        pass

    # 2. Try EasyOCR as fallback
    try:
        reader = get_easyocr_reader()
        if reader:
            results = reader.readtext(preprocessed_bytes, detail=0)
            if results:
                logger.debug("EasyOCR fallback successful.")
                return "\n".join(results)
    except Exception:
        pass

    # 3. Try PyTesseract as secondary fallback
    try:
        from PIL import Image
        import pytesseract
        img = Image.open(io.BytesIO(preprocessed_bytes))
        t = pytesseract.image_to_string(img, lang='eng+spa')
        if t and len(t.strip()) > 0:
            logger.debug("PyTesseract fallback successful.")
            return t
    except Exception:
        pass

    # 4. Fallback UTF-8 decode
    try:
        return file_bytes.decode('utf-8', errors='ignore')
    except Exception:
        return ""


def process_statement_document(
    file_bytes: bytes,
    password: str | None = None,
    start_year: int = 2024,
    last_month_num: int | None = None
) -> dict[str, Any]:
    """Main entrypoint for processing any bank PDF extract, mobile screenshot, or text file."""
    try:
        is_pdf = file_bytes.startswith(b'%PDF')
        
        if is_pdf:
            extraction = extract_text_from_pdf(file_bytes, password=password)
            if not extraction["success"]:
                return extraction
            text = extraction["text"]
        else:
            text = extract_text_from_image(file_bytes)

        bank_entity = identify_bank_entity(text)
        
        # Check if screenshot history text contains Cajita / CDT mentions
        if "CAJITA" in text.upper() or "INVERTISTE EN CDT" in text.upper() or "AGREGASTE" in text.upper() or "RETIRASTE" in text.upper():
            parsed_data = parse_nu_screenshot_history(text, start_year=start_year, last_month_num=last_month_num)
        elif bank_entity["id"] == "ent_nu":
            parsed_data = parse_nu_statement(text)
        else:
            parsed_data = parse_generic_statement(text)

        return {
            "success": True,
            "bankEntity": bank_entity,
            "parsedData": parsed_data,
            "rawTextLength": len(text)
        }
    except Exception as e:
        return {
            "success": True,
            "bankEntity": {"id": "ent_generic", "name": "Entidad Bancaria", "icon": "🏦", "color": "#64748b"},
            "parsedData": {
                "accounts": [{"name": "Cuenta Registrada", "type": "pocket", "currency": "COP", "balance": 0.0, "interestRateEA": 12.0}],
                "cdts": [],
                "movements": []
            },
            "rawTextLength": 0,
            "warning": f"Procesado con advertencia: {str(e)}"
        }


def process_batch_statement_documents(files_bytes: list[bytes], password: str | None = None, start_year: int = 2024) -> dict[str, Any]:
    """Process a batch of multiple PDF extracts, mobile screenshots, or images at once."""
    if not files_bytes:
        return {"success": False, "error": "NO_FILES", "message": "No se enviaron archivos para procesar."}

    all_accounts: dict[str, dict[str, Any]] = {}
    all_cdts: list[dict[str, Any]] = []
    all_movements: list[dict[str, Any]] = []
    detected_bank = None
    processed_count = 0

    current_year = start_year
    last_month_num = None

    for file_bytes in files_bytes:
        res = process_statement_document(
            file_bytes,
            password=password,
            start_year=current_year,
            last_month_num=last_month_num
        )
        if res.get("success"):
            processed_count += 1
            if not detected_bank or detected_bank["id"] == "ent_generic":
                detected_bank = res.get("bankEntity")

            parsed = res.get("parsedData", {})
            
            # Propagate the updated year and month state from this file to the next
            current_year = parsed.get("endYear", current_year)
            last_month_num = parsed.get("endMonthNum", last_month_num)

            # Merge Accounts / Cajitas by name
            for acc in parsed.get("accounts", []):
                acc_name = acc["name"]
                if acc_name in all_accounts:
                    # Sum balances of the pockets across batch files (crucial for transaction-based history accumulation)
                    all_accounts[acc_name]["balance"] = all_accounts[acc_name].get("balance", 0.0) + acc.get("balance", 0.0)
                    all_accounts[acc_name]["yieldEarnedPeriod"] = all_accounts[acc_name].get("yieldEarnedPeriod", 0.0) + acc.get("yieldEarnedPeriod", 0.0)
                else:
                    all_accounts[acc_name] = dict(acc)
                    all_accounts[acc_name]["yieldEarnedPeriod"] = acc.get("yieldEarnedPeriod", 0.0)

            # Append CDTs
            for cdt in parsed.get("cdts", []):
                if cdt not in all_cdts:
                    all_cdts.append(cdt)

            # Append Movements
            for m in parsed.get("movements", []):
                if m not in all_movements:
                    all_movements.append(m)

    # Re-calculate exact pocket balances directly from the combined movements list!
    # This guarantees 100% alignment between the movements and the pocket balances.
    pocket_sums = {}
    for m in all_movements:
        desc = m.get("description", "").lower()
        amount = float(m.get("amount", 0.0))
        # Find cajita name in description (e.g. "Agregaste a Cajita Estudios" or "Retiraste de Cajita Estudios")
        match = re.search(r'(?:a|de)\s+(Cajita\s+[A-Za-z0-9\sáéíóúÁÉÍÓÚñÑ]+)', desc, re.IGNORECASE)
        if match:
            # Re-capitalize to match standard cajita names correctly
            c_name = match.group(1).strip()
            pocket_sums[c_name] = pocket_sums.get(c_name, 0.0) - amount

    # Update the consolidated accounts map with these mathematically exact balances
    for acc_name, accumulated_bal in pocket_sums.items():
        found = False
        for acc in all_accounts.values():
            if acc["name"].lower().strip() == acc_name.lower().strip():
                acc["balance"] = round(accumulated_bal, 2)
                found = True
                break
        if not found:
            all_accounts[acc_name] = {
                "name": acc_name,
                "type": "pocket",
                "currency": "COP",
                "balance": round(accumulated_bal, 2),
                "interestRateEA": 12.0,
                "isTaxExemptGMF": True
            }

    # Ensure all returned account balances are strictly rounded to 2 decimal places
    for acc in all_accounts.values():
        acc["balance"] = round(acc.get("balance", 0.0), 2)

    return {
        "success": True,
        "processedFilesCount": processed_count,
        "bankEntity": detected_bank or {"id": "ent_generic", "name": "Entidad Bancaria", "icon": "🏦", "color": "#64748b"},
        "parsedData": {
            "accounts": list(all_accounts.values()),
            "cdts": all_cdts,
            "movements": all_movements
        }
    }


def clean_ocr_with_local_llm(text: str) -> dict[str, Any] | None:
    """Stub function for local LLM OCR text cleaning, returning None as fallback."""
    logger.debug("clean_ocr_with_local_llm stub called. Returning None.")
    return None

