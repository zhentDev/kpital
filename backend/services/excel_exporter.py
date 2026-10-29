"""
Export service for generating multi-tab professional Excel spreadsheets.
Tabs:
1. Resumen Ejecutivo (KPIs, rendimientos, alfas, Sharpe, Drawdown)
2. Evolución Diaria (Timeline diario: cada acción activa, su precio, peso, valor y subidas/caídas)
3. Posiciones Históricas & Rebalanceos (Histórico de rebalanceos y operaciones cerradas)
"""

import io
from datetime import datetime
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.chart import PieChart, BarChart, LineChart, AreaChart, Reference


def generate_portfolio_excel(
    nav_result: dict,
    investment: float,
    strategy_name: str = "Titanes Tecnológicos",
    comparison_data: list = None,
) -> io.BytesIO:
    wb = openpyxl.Workbook()
    # Remove default sheet
    default_sheet = wb.active
    wb.remove(default_sheet)

    # Styles & Palette (Dark Slate Theme matching Titanes UI)
    font_family = "Segoe UI"
    header_fill = PatternFill(start_color="0F172A", end_color="0F172A", fill_type="solid")
    sub_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    accent_fill = PatternFill(start_color="0284C7", end_color="0284C7", fill_type="solid")
    
    header_font = Font(name=font_family, size=11, bold=True, color="FFFFFF")
    title_font = Font(name=font_family, size=16, bold=True, color="0F172A")
    subtitle_font = Font(name=font_family, size=10, italic=True, color="64748B")
    bold_font = Font(name=font_family, size=10, bold=True, color="0F172A")
    regular_font = Font(name=font_family, size=10, color="0F172A")
    green_font = Font(name=font_family, size=10, bold=True, color="16A34A")
    red_font = Font(name=font_family, size=10, bold=True, color="DC2626")

    thin_border = Border(
        left=Side(style="thin", color="E2E8F0"),
        right=Side(style="thin", color="E2E8F0"),
        top=Side(style="thin", color="E2E8F0"),
        bottom=Side(style="thin", color="E2E8F0"),
    )

    summary = nav_result.get("summary", {})
    holdings = nav_result.get("holdings", [])
    closed_holdings = nav_result.get("closed_holdings", [])
    nav_series = nav_result.get("nav", [])
    sp500_series = nav_result.get("sp500", [])
    nasdaq_series = nav_result.get("nasdaq", [])

    # Map dates to benchmarks
    sp500_map = {pt["date"]: pt["value"] for pt in sp500_series}
    nasdaq_map = {pt["date"]: pt["value"] for pt in nasdaq_series}

    # ─────────────────────────────────────────────────────────────
    # HOJA 1: RESUMEN EJECUTIVO
    # ─────────────────────────────────────────────────────────────
    ws1 = wb.create_sheet(title="Resumen Ejecutivo")
    ws1.views.sheetView[0].showGridLines = True

    # Title Banner
    ws1["A1"] = f"REPORTE GENERAL - {strategy_name.upper()}"
    ws1["A1"].font = title_font
    ws1["A2"] = f"Generado el {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} | ProPicks AI Tracker"
    ws1["A2"].font = subtitle_font

    # Section 1: Métricas de Rendimiento
    ws1["A4"] = "MÉTRICA CLAVE"
    ws1["B4"] = "VALOR"
    for col in ["A4", "B4"]:
        ws1[col].fill = header_fill
        ws1[col].font = header_font
        ws1[col].alignment = Alignment(horizontal="left", vertical="center")

    kpis = [
        ("Capital Inicial Configurado", f"${summary.get('start_value', investment):,.2f}"),
        ("Capital Activo en Acciones", f"${summary.get('active_invested', 0):,.2f}"),
        ("Valor Actual del Portafolio", f"${summary.get('active_stock_value', summary.get('end_value', 0)):,.2f}"),
        ("Liquidez / Cash Reservado", f"${summary.get('cash_reserved', 0):,.2f}"),
        ("Rendimiento Activo Total (%)", f"{summary.get('active_return_pct', 0):+.2f}%"),
        ("Rendimiento Activo Total ($)", f"${summary.get('active_return', 0):+,.2f}"),
        ("Alfa vs S&P 500 (%)", f"{summary.get('alpha_sp500', 0):+.2f}%"),
        ("Alfa vs NASDAQ (%)", f"{summary.get('alpha_nasdaq', 0):+.2f}%"),
        ("Ratio de Sharpe", f"{summary.get('sharpe_ratio', 'N/A')}"),
        ("Ratio de Sortino", f"{summary.get('sortino_ratio', 'N/A')}"),
        ("Beta vs S&P 500", f"{summary.get('beta_sp500', 'N/A')}"),
        ("Beta vs NASDAQ", f"{summary.get('beta_nasdaq', 'N/A')}"),
        ("Volatilidad Anualizada", f"{summary.get('annualized_vol_pct', 0):.2f}%"),
        ("Tasa de Acierto (Win Rate)", f"{summary.get('win_rate_pct', 0):.1f}%"),
        ("Drawdown Máximo (%)", f"{summary.get('max_drawdown_pct', 0):.2f}%"),
        ("Posiciones Activas Actuales", f"{summary.get('num_holdings', len(holdings))}"),
        ("Posiciones Cerradas / Rotadas", f"{summary.get('closed_count', len(closed_holdings))}"),
    ]

    r_idx = 5
    for name, val in kpis:
        c1 = ws1.cell(row=r_idx, column=1, value=name)
        c2 = ws1.cell(row=r_idx, column=2, value=val)
        c1.font = bold_font
        c2.font = regular_font
        c1.border = thin_border
        c2.border = thin_border
        if "Rendimiento" in name or "Alfa" in name:
            if "+" in val:
                c2.font = green_font
            elif "-" in val:
                c2.font = red_font
        r_idx += 1

    # Section 2: Posiciones Actuales Snapshot
    ws1["D4"] = "TICKER"
    ws1["E4"] = "EMPRESA"
    ws1["F4"] = "SECTOR"
    ws1["G4"] = "ACCIONES"
    ws1["H4"] = "P. ENTRADA"
    ws1["I4"] = "P. ACTUAL"
    ws1["J4"] = "VALOR HOY"
    ws1["K4"] = "RETORNO (%)"
    ws1["L4"] = "RETORNO ($)"

    for col in ["D4", "E4", "F4", "G4", "H4", "I4", "J4", "K4", "L4"]:
        ws1[col].fill = sub_fill
        ws1[col].font = header_font
        ws1[col].alignment = Alignment(horizontal="center", vertical="center")

    h_row = 5
    for h in holdings:
        ws1.cell(row=h_row, column=4, value=h.get("ticker")).font = bold_font
        ws1.cell(row=h_row, column=5, value=h.get("name", h.get("ticker"))).font = regular_font
        ws1.cell(row=h_row, column=6, value=h.get("sector", "Tecnología")).font = regular_font
        ws1.cell(row=h_row, column=7, value=round(h.get("shares", 0), 4)).font = regular_font
        
        c_pstart = ws1.cell(row=h_row, column=8, value=round(h.get("start_price", 0), 2))
        c_pstart.font = regular_font
        c_pstart.number_format = "$#,##0.00"
        
        c_pcurr = ws1.cell(row=h_row, column=9, value=round(h.get("current_price", 0), 2))
        c_pcurr.font = regular_font
        c_pcurr.number_format = "$#,##0.00"
        
        c_val = ws1.cell(row=h_row, column=10, value=round(h.get("current_value", 0), 2))
        c_val.font = bold_font
        c_val.number_format = "$#,##0.00"
        
        ret_pct = round(h.get("return_pct", 0), 2)
        c_pct = ws1.cell(row=h_row, column=11, value=ret_pct)
        c_pct.font = green_font if ret_pct >= 0 else red_font
        c_pct.number_format = "+0.00%;-0.00%;0.00%"
        
        ret_usd = round(h.get("return_usd", 0), 2)
        c_usd = ws1.cell(row=h_row, column=12, value=ret_usd)
        c_usd.font = green_font if ret_usd >= 0 else red_font
        c_usd.number_format = "+$#,##0.00;-$#,##0.00;$0.00"

        for col_i in range(4, 13):
            ws1.cell(row=h_row, column=col_i).border = thin_border
        h_row += 1

    # Inyección de Gráficas Profesionales en Hoja 1 (Resumen Ejecutivo)
    if holdings and len(holdings) > 0:
        max_h_row = max(h_row - 1, 5)

        # Gráfica 1: Distribución / Asset Allocation (Donut / Pie Chart)
        pie = PieChart()
        pie.title = "Distribución de Capital Activo por Acción"
        pie.width = 17
        pie.height = 10
        data_pie = Reference(ws1, min_col=10, min_row=4, max_row=max_h_row)
        labels_pie = Reference(ws1, min_col=4, min_row=5, max_row=max_h_row)
        pie.add_data(data_pie, titles_from_data=True)
        pie.set_categories(labels_pie)
        ws1.add_chart(pie, "N4")

        # Gráfica 2: Retorno Individual por Posición (Bar Chart)
        bar = BarChart()
        bar.title = "Rendimiento Individual por Acción Activa (%)"
        bar.style = 10
        bar.width = 17
        bar.height = 10
        bar.y_axis.title = "Rendimiento (%)"
        bar.x_axis.title = "Ticker"
        bar.legend = None
        data_bar = Reference(ws1, min_col=11, min_row=4, max_row=max_h_row)
        bar.add_data(data_bar, titles_from_data=True)
        bar.set_categories(labels_pie)
        ws1.add_chart(bar, "N22")


    # ─────────────────────────────────────────────────────────────
    # HOJA 2: COMPORTAMIENTO DIARIO (TIMELINE INTEGRAL)
    # ─────────────────────────────────────────────────────────────
    ws2 = wb.create_sheet(title="Comportamiento Diario")
    ws2.views.sheetView[0].showGridLines = True

    # Preparamos las columnas dinámicas: Fecha, NAV Total, Rendimiento Día %, S&P500, NASDAQ, y para cada ticker: P.Cierre, Variación Día %
    active_tickers = [h.get("ticker") for h in holdings]
    
    # Extraemos fechas únicas ordenadas de nav_series
    dates = [pt["date"] for pt in nav_series]

    # Preparamos mapas de precios diarios por ticker y su fecha de entrada real en el portafolio
    ticker_history_map = {}
    ticker_entry_map = {}
    for h in holdings:
        t = h.get("ticker")
        ticker_history_map[t] = {}
        # Entry date exacta cuando se abrió la posición
        entry_d = str(h.get("entry_date", ""))[:10]
        ticker_entry_map[t] = entry_d

        s_price = h.get("start_price", 1.0)
        for hist_pt in h.get("history", []):
            d = str(hist_pt.get("date", ""))[:10]
            f = hist_pt.get("factor", 1.0)
            ticker_history_map[t][d] = s_price * f

    # Headers fila 1
    ws2["A1"] = "FECHA"
    ws2["B1"] = "VALOR PORTAFOLIO ($)"
    ws2["C1"] = "VARIACIÓN DÍA (%)"
    ws2["D1"] = "S&P 500 BENCHMARK ($)"
    ws2["E1"] = "NASDAQ BENCHMARK ($)"
    ws2["F1"] = "DRAWDOWN (%)"
    
    base_headers = ["A1", "B1", "C1", "D1", "E1", "F1"]
    for bh in base_headers:
        ws2[bh].fill = header_fill
        ws2[bh].font = header_font
        ws2[bh].alignment = Alignment(horizontal="center", vertical="center")

    curr_col = 7
    ticker_col_map = {}
    for t in active_tickers:
        col_letter_p = get_column_letter(curr_col)
        col_letter_v = get_column_letter(curr_col + 1)
        entry_tag = f" [Desde {ticker_entry_map.get(t, '')}]" if ticker_entry_map.get(t) else ""
        
        ws2[f"{col_letter_p}1"] = f"{t} Precio ($){entry_tag}"
        ws2[f"{col_letter_v}1"] = f"{t} Cambio Día (%)"
        
        ws2[f"{col_letter_p}1"].fill = sub_fill
        ws2[f"{col_letter_p}1"].font = header_font
        ws2[f"{col_letter_v}1"].fill = sub_fill
        ws2[f"{col_letter_v}1"].font = header_font

        ticker_col_map[t] = (curr_col, curr_col + 1)
        curr_col += 2

    # Llenamos datos diarios
    row_num = 2
    prev_val = None
    peak_val = 0.0
    prev_ticker_prices = {}

    for pt in nav_series:
        d = str(pt["date"])[:10]
        val = round(float(pt.get("value", 0)), 2)
        
        # Rendimiento diario del portafolio
        daily_chg = round(((val - prev_val) / prev_val * 100), 2) if (prev_val and prev_val > 0) else 0.0
        prev_val = val

        # Cálculo de Drawdown histórico (%)
        if val > peak_val:
            peak_val = val
        dd_pct = round(((val - peak_val) / peak_val * 100), 2) if peak_val > 0 else 0.0

        ws2.cell(row=row_num, column=1, value=d).font = bold_font
        
        c_val = ws2.cell(row=row_num, column=2, value=val)
        c_val.font = bold_font
        c_val.number_format = "$#,##0.00"
        
        c_chg = ws2.cell(row=row_num, column=3, value=daily_chg)
        c_chg.font = green_font if daily_chg >= 0 else red_font
        c_chg.number_format = "+0.00%;-0.00%;0.00%"

        sp_val = sp500_map.get(d)
        c_sp = ws2.cell(row=row_num, column=4, value=round(float(sp_val), 2) if sp_val is not None else "")
        c_sp.font = regular_font
        if sp_val is not None:
            c_sp.number_format = "$#,##0.00"
        
        nd_val = nasdaq_map.get(d)
        c_nd = ws2.cell(row=row_num, column=5, value=round(float(nd_val), 2) if nd_val is not None else "")
        c_nd.font = regular_font
        if nd_val is not None:
            c_nd.number_format = "$#,##0.00"

        c_dd = ws2.cell(row=row_num, column=6, value=dd_pct)
        c_dd.font = red_font if dd_pct < 0 else regular_font
        c_dd.number_format = "0.00%"

        # Tickers individuales: SOLO graficar y registrar a partir de su fecha de entrada efectiva
        for t in active_tickers:
            col_p, col_v = ticker_col_map[t]
            entry_d = ticker_entry_map.get(t, "")
            
            # Si el día actual es anterior a la fecha de compra/rebalanceo de este ticker, se deja en blanco
            if entry_d and d < entry_d:
                ws2.cell(row=row_num, column=col_p, value="").font = regular_font
                ws2.cell(row=row_num, column=col_v, value="").font = regular_font
                continue

            t_price = ticker_history_map[t].get(d)
            if t_price is not None:
                t_price_clean = round(float(t_price), 2)
                c_tp = ws2.cell(row=row_num, column=col_p, value=t_price_clean)
                c_tp.font = regular_font
                c_tp.number_format = "$#,##0.00"

                prev_p = prev_ticker_prices.get(t)
                t_chg = round(((t_price_clean - prev_p) / prev_p * 100), 2) if (prev_p and prev_p > 0) else 0.0
                prev_ticker_prices[t] = t_price_clean

                # Si es el primer día de compra, marcar como Entrada
                if prev_p is None:
                    c_tchg = ws2.cell(row=row_num, column=col_v, value="Entrada")
                    c_tchg.font = bold_font
                else:
                    c_tchg = ws2.cell(row=row_num, column=col_v, value=t_chg)
                    c_tchg.font = green_font if t_chg >= 0 else red_font
                    c_tchg.number_format = "+0.00%;-0.00%;0.00%"
            else:
                ws2.cell(row=row_num, column=col_p, value="").font = regular_font
                ws2.cell(row=row_num, column=col_v, value="").font = regular_font

        for c_i in range(1, curr_col):
            ws2.cell(row=row_num, column=c_i).border = thin_border

        row_num += 1

    # Inyección de Gráficas Profesionales en Hoja 2 (Comportamiento Diario)
    if nav_series and len(nav_series) > 1:
        max_d_row = row_num - 1

        # Gráfica 3: Evolución Histórica NAV vs Benchmarks (Line Chart)
        chart_line = LineChart()
        chart_line.title = f"Evolución Histórica NAV vs Benchmarks ({strategy_name})"
        chart_line.style = 13
        chart_line.width = 24
        chart_line.height = 12
        chart_line.y_axis.title = "Valor de la Cartera ($)"
        chart_line.x_axis.title = "Fecha"
        
        # Series: Col 2 (NAV), Col 4 (S&P 500), Col 5 (NASDAQ)
        # Add NAV
        nav_data = Reference(ws2, min_col=2, min_row=1, max_row=max_d_row)
        dates_cat = Reference(ws2, min_col=1, min_row=2, max_row=max_d_row)
        chart_line.add_data(nav_data, titles_from_data=True)
        
        # Add Benchmarks if they have data
        if any(sp500_map.values()):
            sp_data = Reference(ws2, min_col=4, min_row=1, max_row=max_d_row)
            chart_line.add_data(sp_data, titles_from_data=True)
        if any(nasdaq_map.values()):
            nd_data = Reference(ws2, min_col=5, min_row=1, max_row=max_d_row)
            chart_line.add_data(nd_data, titles_from_data=True)

        chart_line.set_categories(dates_cat)
        ws2.add_chart(chart_line, f"{get_column_letter(curr_col + 1)}2")

        # Gráfica 4: Curva Underwater / Drawdown Histórico (Area Chart)
        chart_dd = AreaChart()
        chart_dd.title = "Curva Underwater: Drawdown Histórico (%)"
        chart_dd.style = 13
        chart_dd.width = 24
        chart_dd.height = 10
        chart_dd.y_axis.title = "Drawdown (%)"
        chart_dd.x_axis.title = "Fecha"
        chart_dd.legend = None

        dd_data = Reference(ws2, min_col=6, min_row=1, max_row=max_d_row)
        chart_dd.add_data(dd_data, titles_from_data=True)
        chart_dd.set_categories(dates_cat)
        ws2.add_chart(chart_dd, f"{get_column_letter(curr_col + 1)}26")


    # ─────────────────────────────────────────────────────────────
    # HOJA 3: POSICIONES CERRADAS & ROTACIONES
    # ─────────────────────────────────────────────────────────────
    ws3 = wb.create_sheet(title="Posiciones Cerradas")
    ws3.views.sheetView[0].showGridLines = True

    c_headers = [
        "TICKER", "EMPRESA", "FECHA ENTRADA", "P. ENTRADA ($)", 
        "FECHA SALIDA", "P. SALIDA ($)", "ACCIONES", "COSTO TOTAL ($)", 
        "VALOR FINAL ($)", "PNL REALIZADO ($)", "RETORNO (%)", "DÍAS HOLDING"
    ]
    for idx, h_text in enumerate(c_headers, start=1):
        cell = ws3.cell(row=1, column=idx, value=h_text)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")

    c_row = 2
    if closed_holdings:
        for c in closed_holdings:
            ws3.cell(row=c_row, column=1, value=c.get("ticker")).font = bold_font
            ws3.cell(row=c_row, column=2, value=c.get("name", c.get("ticker"))).font = regular_font
            ws3.cell(row=c_row, column=3, value=c.get("entry_date", "")).font = regular_font
            ws3.cell(row=c_row, column=4, value=f"${c.get('entry_price', 0):,.2f}").font = regular_font
            ws3.cell(row=c_row, column=5, value=c.get("exit_date", "")).font = regular_font
            ws3.cell(row=c_row, column=6, value=f"${c.get('exit_price', 0):,.2f}").font = regular_font
            ws3.cell(row=c_row, column=7, value=round(c.get("shares", 0), 4)).font = regular_font
            ws3.cell(row=c_row, column=8, value=f"${c.get('cost_basis', 0):,.2f}").font = regular_font
            ws3.cell(row=c_row, column=9, value=f"${c.get('exit_value', 0):,.2f}").font = regular_font
            
            pnl = c.get("realized_pnl", 0)
            c_pnl = ws3.cell(row=c_row, column=10, value=f"${pnl:+,.2f}")
            c_pnl.font = green_font if pnl >= 0 else red_font
            
            pnl_pct = c.get("realized_return_pct", 0)
            c_ret = ws3.cell(row=c_row, column=11, value=f"{pnl_pct:+.2f}%")
            c_ret.font = green_font if pnl_pct >= 0 else red_font

            ws3.cell(row=c_row, column=12, value=c.get("holding_days", 0)).font = regular_font

            for col_i in range(1, 13):
                ws3.cell(row=c_row, column=col_i).border = thin_border
            c_row += 1
    else:
        ws3.cell(row=2, column=1, value="No se registran posiciones cerradas aún.").font = subtitle_font

    # ─────────────────────────────────────────────────────────────
    # HOJA 4: COMPARATIVA REAL VS SIMULADAS
    # ─────────────────────────────────────────────────────────────
    sheets_to_adjust = [ws1, ws2, ws3]
    if comparison_data and len(comparison_data) > 0:
        ws4 = wb.create_sheet(title="Comparativa Real vs Simulada")
        ws4.views.sheetView[0].showGridLines = True
        sheets_to_adjust.append(ws4)

        ws4["A1"] = "COMPARATIVA DE ESTRATEGIAS: REALES VS SIMULADAS"
        ws4["A1"].font = title_font
        ws4["A2"] = "Análisis de rendimiento, retorno activo, alfa vs S&P 500 y posiciones cerradas"
        ws4["A2"].font = subtitle_font

        comp_headers = [
            "TIPO", "ESTRATEGIA", "PAÍS", "SLOTS", "CAPITAL ($)", 
            "ACTIVO ACCIONES ($)", "VALOR ACTUAL ($)", "RETORNO ($)", 
            "RETORNO (%)", "ALFA S&P 500 (%)", "SHARPE", "WIN RATE (%)", "CERRADAS"
        ]
        for idx, h_text in enumerate(comp_headers, start=1):
            cell = ws4.cell(row=4, column=idx, value=h_text)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center")

        c_row_comp = 5
        for item in comparison_data:
            s_type = "REAL 💵" if item.get("is_real_money") else "SIMULADA 🧪"
            c_type = ws4.cell(row=c_row_comp, column=1, value=s_type)
            c_type.font = bold_font
            if item.get("is_real_money"):
                c_type.fill = PatternFill(start_color="D1FAE5", end_color="D1FAE5", fill_type="solid")
            else:
                c_type.fill = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")

            ws4.cell(row=c_row_comp, column=2, value=item.get("name", "")).font = bold_font
            ws4.cell(row=c_row_comp, column=3, value=item.get("country", "🌎")).font = regular_font
            ws4.cell(row=c_row_comp, column=4, value=item.get("num_slots", 20)).font = regular_font
            
            c_cap = ws4.cell(row=c_row_comp, column=5, value=round(float(item.get('capital', 0)), 2))
            c_cap.font = regular_font
            c_cap.number_format = "$#,##0.00"
            
            c_act = ws4.cell(row=c_row_comp, column=6, value=round(float(item.get('active_invested', 0)), 2))
            c_act.font = regular_font
            c_act.number_format = "$#,##0.00"
            
            c_end = ws4.cell(row=c_row_comp, column=7, value=round(float(item.get('end_value', 0)), 2))
            c_end.font = bold_font
            c_end.number_format = "$#,##0.00"

            ret_usd = round(float(item.get("active_return", 0)), 2)
            c_ret_usd = ws4.cell(row=c_row_comp, column=8, value=ret_usd)
            c_ret_usd.font = green_font if ret_usd >= 0 else red_font
            c_ret_usd.number_format = "+$#,##0.00;-$#,##0.00;$0.00"

            ret_pct = round(float(item.get("active_return_pct", 0)), 2)
            c_ret_pct = ws4.cell(row=c_row_comp, column=9, value=ret_pct)
            c_ret_pct.font = green_font if ret_pct >= 0 else red_font
            c_ret_pct.number_format = "+0.00%;-0.00%;0.00%"

            alpha = round(float(item.get("alpha_sp500", 0)), 2)
            c_alpha = ws4.cell(row=c_row_comp, column=10, value=alpha)
            c_alpha.font = green_font if alpha >= 0 else red_font
            c_alpha.number_format = "+0.00%;-0.00%;0.00%"

            ws4.cell(row=c_row_comp, column=11, value=str(item.get("sharpe_ratio", "N/A"))).font = regular_font
            
            c_wr = ws4.cell(row=c_row_comp, column=12, value=round(float(item.get('win_rate_pct', 0)), 1))
            c_wr.font = regular_font
            c_wr.number_format = "0.0%"
            
            ws4.cell(row=c_row_comp, column=13, value=item.get("closed_count", 0)).font = regular_font

            for col_i in range(1, 14):
                ws4.cell(row=c_row_comp, column=col_i).border = thin_border
            c_row_comp += 1

        # Inyección de Gráfica 5: Comparativa de Rendimiento y Alfa vs S&P 500
        if len(comparison_data) > 0:
            max_comp_row = c_row_comp - 1
            comp_chart = BarChart()
            comp_chart.title = "Comparativa de Rendimiento y Alfa vs S&P 500 (%)"
            comp_chart.style = 11
            comp_chart.width = 20
            comp_chart.height = 11
            comp_chart.y_axis.title = "Porcentaje (%)"
            comp_chart.x_axis.title = "Estrategia"
            
            # Series: Retorno (%) [Col 9] y Alfa S&P 500 (%) [Col 10]
            d_comp = Reference(ws4, min_col=9, min_row=4, max_col=10, max_row=max_comp_row)
            l_comp = Reference(ws4, min_col=2, min_row=5, max_row=max_comp_row)
            comp_chart.add_data(d_comp, titles_from_data=True)
            comp_chart.set_categories(l_comp)
            ws4.add_chart(comp_chart, f"O4")


    # Auto-ajuste de ancho de columnas para todas las hojas
    for ws in sheets_to_adjust:
        for col in ws.columns:
            max_len = 0
            col_letter = get_column_letter(col[0].column)
            for cell in col:
                val_str = str(cell.value or "")
                if "\n" in val_str:
                    val_str = max(val_str.split("\n"), key=len)
                if len(val_str) > max_len:
                    max_len = len(val_str)
            ws.column_dimensions[col_letter].width = max(max_len + 3, 12)

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output
