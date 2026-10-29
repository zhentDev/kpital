import React, { useMemo, useState } from "react";
import { useTheme } from "../../context/ThemeContext";
import { formatCashFlowMoneyWithCode, calculateEffectiveExpense } from "../../utils/cashFlowFormatters";
import "./CashFlow.css";

/**
 * Native SVG Sankey / Cash Waterfall Flow Chart
 * Distributed connection ports (no overlapping lines), smooth cubic Bézier ribbons,
 * dynamic canvas height, distinct line separation, and interactive node tooltips.
 */
export default function CashFlowSankey({
  inflows = [],
  needs = [],
  wants = [],
  wealth = [],
  expensesLog = [],
  debts = [],
  activePeriod,
  currency = "COP",
  fxRate = 4150,
  customRatios = { needs: 50, wants: 30, savings: 20 },
  onEditNode,
  isExpanded: controlledExpanded,
  onToggleExpand,
}) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const formatAmount = (val, cur = currency) => formatCashFlowMoneyWithCode(val, cur, fxRate);
  const [hoveredItem, setHoveredItem] = useState(null);
  const [internalExpanded, setInternalExpanded] = useState(true);
  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;
  const toggleExpand = onToggleExpand || (() => setInternalExpanded(!internalExpanded));
  const [viewOrientation, setViewOrientation] = useState("auto"); // 'auto' | 'horizontal' | 'vertical'

  // Detectar pantalla pequeña (< 900px)
  const [isSmallScreen, setIsSmallScreen] = useState(() => (typeof window !== "undefined" ? window.innerWidth < 900 : false));
  React.useEffect(() => {
    const handleResize = () => {
      setIsSmallScreen(window.innerWidth < 900);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const activeOrientation = viewOrientation === "auto" ? (isSmallScreen ? "vertical" : "horizontal") : viewOrientation;

  // ── 1. Calculate Aggregate Financial Values ──────────
  // Filtrar ingresos presupuestados reales (por defecto los 3 de siempre: Salario, Renta Fija y Renta Variable)
  // descartando micro-cobros o reintegros de préstamos a menos que se hayan marcado explícitamente como ingreso extra.
  const activeInflows = useMemo(() => {
    return inflows.filter((i) => {
      if ((Number(i.amount) || 0) <= 0) return false;
      const isReimb =
        i.category === "reimbursement" ||
        i.id?.startsWith("in_reimb_") ||
        i.id?.startsWith("in_cash_") ||
        i.id?.startsWith("in_wallet_") ||
        i.id?.startsWith("in_pocket_") ||
        (i.name || "").toLowerCase().includes("cobro préstamo") ||
        (i.name || "").toLowerCase().includes("reintegro préstamo");
      if (isReimb) {
        return Boolean(i.isExplicitBudgetIncome);
      }
      return true;
    });
  }, [inflows]);

  const totalInflow = useMemo(() => {
    return activeInflows.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  }, [activeInflows]);

  const totalNeeds = useMemo(() => {
    return needs.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  }, [needs]);

  const totalWants = useMemo(() => {
    return wants.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  }, [wants]);

  const totalWealth = useMemo(() => {
    return wealth.reduce((acc, curr) => acc + (Number(curr.monthlyContribution) || 0), 0);
  }, [wealth]);

  const totalAllocated = totalNeeds + totalWants + totalWealth;
  const freeCashFlow = Math.max(0, totalInflow - totalAllocated);

  // ── 2. Build SVG Nodes & Layout Coordinates ──────────
  const layout = useMemo(() => {
    const W = 1260;
    const paddingY = 40;
    const nodeWidth = 210;
    const nodeH = 54;
    const nodeGap = 16;

    const colX = [30, 370, 710, 1010]; // 4 Well-distributed columns

    // Column 0: Valid Inflow Sources (Preserva los 3 de siempre limpios)
    const validInflows = activeInflows;
    const col0Count = Math.max(1, validInflows.length);

    // Column 2: Pillars
    const pillars = [
      {
        id: "pillar_wealth",
        name: "🔵 Ahorro & Inversión",
        amount: totalWealth,
        color: isLight ? "#0284c7" : "#38bdf8",
      },
      {
        id: "pillar_needs",
        name: "🔴 Gastos Fijos (Needs)",
        amount: totalNeeds,
        color: "#f43f5e",
      },
      {
        id: "pillar_wants",
        name: "🟣 Estilo de Vida (Wants)",
        amount: totalWants,
        color: "#a855f7",
      },
    ];

    if (freeCashFlow > 0) {
      pillars.push({
        id: "pillar_fcf",
        name: "⚪ Flujo Libre",
        amount: freeCashFlow,
        color: isLight ? "#059669" : "#10b981",
      });
    }

    const col2Count = pillars.length;

    // Column 3: Specific Subcategory Destinations (Pockets)
    const validDestinations = [
      ...wealth.map((w) => ({
        ...w,
        amount: Number(w.monthlyContribution) || 0,
        pillarId: "pillar_wealth",
        pillarType: "wealth",
        color: isLight ? "#0284c7" : "#38bdf8",
      })),
      ...needs.map((n) => ({
        ...n,
        amount: Number(n.amount) || 0,
        pillarId: "pillar_needs",
        pillarType: "needs",
        color: "#f43f5e",
      })),
      ...wants.map((w) => ({
        ...w,
        amount: Number(w.amount) || 0,
        pillarId: "pillar_wants",
        pillarType: "wants",
        color: "#a855f7",
      })),
    ].filter((d) => d.amount > 0);

    const destCount = Math.max(1, validDestinations.length);

    // Compute dynamic Canvas Height H
    const maxRows = Math.max(col0Count, col2Count, destCount, 5);
    const totalContentH = maxRows * nodeH + (maxRows - 1) * nodeGap;
    const H = Math.max(520, totalContentH + paddingY * 2);
    const usableH = H - paddingY * 2;

    // ── Position Column 0 Nodes (Inflows) ──
    const inflowTotalBlockH = col0Count * nodeH + (col0Count - 1) * nodeGap;
    const inflowStartY = paddingY + (usableH - inflowTotalBlockH) / 2;

    const col0Nodes = validInflows.map((item, idx) => {
      const y = inflowStartY + idx * (nodeH + nodeGap);
      const amt = Number(item.amount) || 0;
      const pct = totalInflow > 0 ? ((amt / totalInflow) * 100).toFixed(1) : 0;
      return {
        id: item.id,
        rawItem: item,
        pillarType: "inflow",
        name: item.name,
        icon: item.icon || "💼",
        amount: amt,
        pct,
        col: 0,
        x: colX[0],
        y,
        width: nodeWidth,
        height: nodeH,
        color: item.isPassive
          ? (isLight ? "#0284c7" : "#00e5ff")
          : (isLight ? "#059669" : "#10b981"),
      };
    });

    // ── Position Column 1 Node (Central Net Income Hub) ──
    const hubH = Math.max(90, Math.min(140, col0Count * 42));
    const col1Node = {
      id: "net_income_hub",
      name: "Ingreso Neto Total",
      icon: "⚡",
      amount: totalInflow,
      pct: 100,
      col: 1,
      x: colX[1],
      y: paddingY + (usableH - hubH) / 2,
      width: nodeWidth + 15,
      height: hubH,
      color: isLight ? "#0284c7" : "#00e5ff",
    };

    // ── Position Column 3 Nodes (Destinations with Living Dynamic Tone & Glow) ──
    const destNodeH = 60;
    const destTotalBlockH = destCount * destNodeH + (destCount - 1) * nodeGap;
    const destStartY = paddingY + (usableH - destTotalBlockH) / 2;

    const col3Nodes = validDestinations.map((item, idx) => {
      const y = destStartY + idx * (destNodeH + nodeGap);
      const budgeted = Number(item.amount) || 0;
      const pct = totalInflow > 0 ? ((budgeted / totalInflow) * 100).toFixed(1) : 0;

      // Real execution matching from expensesLog with dynamic loan liberation
      const matchingTxs = (expensesLog || []).filter((tx) => {
        if (tx.period && activePeriod && tx.period !== activePeriod) return false;
        // Si está explícitamente asignado al rubro por su ID, siempre cuenta como ejecución
        if (tx.budgetItemId && tx.budgetItemId === item.id) return true;
        const desc = (tx.description || "").toLowerCase();
        const bName = (tx.budgetItemName || "").toLowerCase();
        const itemName = item.name.toLowerCase();
        if (bName && (bName.includes(itemName) || itemName.includes(bName))) return true;
        if (itemName.includes("emergencia") && (desc.includes("emergencia") || bName.includes("emergencia") || desc.includes("rappicuenta"))) return true;
        if (itemName.includes("arriendo") && (desc.includes("arriendo") || bName.includes("arriendo"))) return true;
        if (tx.type === "credit" || tx.budgetItemType === "income") return false;
        return false;
      });

      let spent = 0;
      let grossSpent = 0;
      let liberatedAmount = 0;
      let pendingLoanAmount = 0;
      let purePersonalSpent = 0;

      for (const tx of matchingTxs) {
        const eff = calculateEffectiveExpense(tx, debts);
        grossSpent += eff.grossAmount;
        spent += eff.effectiveSpent;
        liberatedAmount += eff.repaidAmount;
        pendingLoanAmount += eff.pendingLoan;
        purePersonalSpent += eff.purePersonalSpent;
      }

      const progressPct = budgeted > 0 ? (spent / budgeted) * 100 : 0;
      const remaining = Math.max(0, budgeted - spent);

      let statusLabel = "⏳ Pendiente";
      let statusColor = isLight ? "#94a3b8" : "#64748b";
      let statusBg = "rgba(100, 116, 139, 0.14)";
      let isPaid = false;
      let isExceeded = false;
      let isNearLimit = false;
      let isActive = false;
      let liquidColorStart = item.color;
      let liquidColorEnd = item.color;
      let dynamicNodeColor = item.color;

      if (spent > 0) {
        isActive = true;
        if (spent >= budgeted && (spent - budgeted) <= Math.max(1000, budgeted * 0.05)) {
          statusLabel = "✅ Pagado";
          statusColor = isLight ? "#059669" : "#00f5a0";
          statusBg = isLight ? "rgba(16, 185, 129, 0.18)" : "rgba(0, 245, 160, 0.2)";
          isPaid = true;
          dynamicNodeColor = isLight ? "#059669" : "#00f5a0";
          liquidColorStart = isLight ? "rgba(16, 185, 129, 0.26)" : "rgba(16, 185, 129, 0.42)";
          liquidColorEnd = isLight ? "rgba(5, 150, 105, 0.14)" : "rgba(0, 245, 160, 0.22)";
        } else if (spent > budgeted) {
          statusLabel = `🚨 +${Math.round((spent / budgeted - 1) * 100)}%`;
          statusColor = "#ff2a5f";
          statusBg = "rgba(255, 42, 95, 0.22)";
          isExceeded = true;
          dynamicNodeColor = "#ff2a5f";
          liquidColorStart = isLight ? "rgba(244, 63, 94, 0.26)" : "rgba(255, 42, 95, 0.44)";
          liquidColorEnd = isLight ? "rgba(225, 29, 72, 0.14)" : "rgba(244, 63, 94, 0.22)";
        } else if (progressPct >= 80) {
          statusLabel = `⚠️ ${progressPct.toFixed(0)}%`;
          statusColor = "#fbbf24";
          statusBg = "rgba(245, 158, 11, 0.22)";
          isNearLimit = true;
          dynamicNodeColor = "#f59e0b";
          liquidColorStart = isLight ? "rgba(245, 158, 11, 0.26)" : "rgba(245, 158, 11, 0.42)";
          liquidColorEnd = isLight ? "rgba(251, 191, 36, 0.14)" : "rgba(251, 191, 36, 0.22)";
        } else {
          statusLabel = `⚡ ${progressPct.toFixed(0)}%`;
          statusColor = isLight ? "#0284c7" : "#00e5ff";
          statusBg = "rgba(0, 229, 255, 0.18)";
          dynamicNodeColor = isLight ? "#0284c7" : "#00e5ff";
          liquidColorStart = isLight ? "rgba(2, 132, 199, 0.22)" : "rgba(0, 229, 255, 0.36)";
          liquidColorEnd = isLight ? "rgba(56, 189, 248, 0.12)" : "rgba(56, 189, 248, 0.18)";
        }
      }

      return {
        id: item.id,
        fillGradId: `node_fill_${String(item.id).replace(/[^a-zA-Z0-9]/g, "_")}`,
        rawItem: item,
        pillarType: item.pillarType,
        name: item.name,
        icon: item.icon || "🎯",
        amount: budgeted,
        spent,
        grossSpent,
        liberatedAmount,
        pendingLoanAmount,
        purePersonalSpent,
        remaining,
        progressPct,
        statusLabel,
        statusColor,
        statusBg,
        isPaid,
        isExceeded,
        isNearLimit,
        isActive,
        liquidColorStart,
        liquidColorEnd,
        pct,
        pillarId: item.pillarId,
        col: 3,
        x: colX[3],
        y,
        width: nodeWidth + 14,
        height: destNodeH,
        baseColor: item.color,
        color: dynamicNodeColor,
      };
    });

    // ── Position Column 2 Nodes (Pillars with Aggregate Real Execution) ──
    const pillarTotalBlockH = col2Count * (nodeH + 6) + (col2Count - 1) * 18;
    const pillarStartY = paddingY + (usableH - pillarTotalBlockH) / 2;

    const col2Nodes = pillars.map((p, idx) => {
      const y = pillarStartY + idx * (nodeH + 6 + 18);
      const pct = totalInflow > 0 ? ((p.amount / totalInflow) * 100).toFixed(1) : 0;
      const children = col3Nodes.filter((d) => d.pillarId === p.id);
      const pillarSpent = children.reduce((acc, c) => acc + (c.spent || 0), 0);
      const pillarProgressPct = p.amount > 0 ? Math.min(100, (pillarSpent / p.amount) * 100) : 0;

      return {
        ...p,
        fillGradId: `pillar_fill_${String(p.id).replace(/[^a-zA-Z0-9]/g, "_")}`,
        pct,
        spent: pillarSpent,
        progressPct: pillarProgressPct,
        isActive: pillarSpent > 0,
        col: 2,
        x: colX[2],
        y,
        width: nodeWidth + 10,
        height: nodeH + 6,
      };
    });

    // ── 3. Build Flow Links with Distributed Port Anchors ──
    const links = [];

    // Links Col 0 -> Col 1 (Inflow -> Net Hub)
    col0Nodes.forEach((src, idx) => {
      // Guaranteed visible minimum stroke width (min 4px, max 32px)
      const strokeW = totalInflow > 0 ? Math.max(4, (src.amount / totalInflow) * 32) : 4;
      const yTargetPort =
        col0Nodes.length === 1
          ? col1Node.y + col1Node.height / 2
          : col1Node.y + 14 + (idx / (col0Nodes.length - 1)) * (col1Node.height - 28);

      links.push({
        id: `link_${src.id}_to_hub`,
        gradId: `grad_${String(src.id).replace(/[^a-zA-Z0-9]/g, "_")}_hub`,
        sourceId: src.id,
        targetId: col1Node.id,
        source: { x: src.x + src.width, y: src.y + src.height / 2 },
        target: { x: col1Node.x, y: yTargetPort },
        colorStart: src.color,
        colorEnd: col1Node.color,
        amount: src.amount,
        name: `${src.name} ➔ Ingreso Neto`,
        strokeWidth: strokeW,
        isActive: true,
        streamColor: isLight ? "#0284c7" : "#67e8f9",
      });
    });

    // Links Col 1 -> Col 2 (Net Hub -> Pillars)
    col2Nodes.forEach((tgt, idx) => {
      const strokeW = totalInflow > 0 ? Math.max(4, (tgt.amount / totalInflow) * 36) : 4;
      const ySourcePort =
        col2Nodes.length === 1
          ? col1Node.y + col1Node.height / 2
          : col1Node.y + 14 + (idx / (col2Nodes.length - 1)) * (col1Node.height - 28);

      links.push({
        id: `link_hub_to_${tgt.id}`,
        gradId: `grad_hub_${String(tgt.id).replace(/[^a-zA-Z0-9]/g, "_")}`,
        sourceId: col1Node.id,
        targetId: tgt.id,
        source: { x: col1Node.x + col1Node.width, y: ySourcePort },
        target: { x: tgt.x, y: tgt.y + tgt.height / 2 },
        colorStart: col1Node.color,
        colorEnd: tgt.color,
        amount: tgt.amount,
        name: `Ingreso Neto ➔ ${tgt.name}`,
        strokeWidth: strokeW,
        isActive: tgt.isActive,
        streamColor: tgt.color,
      });
    });

    // Links Col 2 -> Col 3 (Pillars -> Pockets)
    col3Nodes.forEach((dest) => {
      const srcPillar = col2Nodes.find((p) => p.id === dest.pillarId);
      if (srcPillar) {
        const strokeW = totalInflow > 0 ? Math.max(3, (dest.amount / totalInflow) * 26) : 3;
        links.push({
          id: `link_${srcPillar.id}_to_${dest.id}`,
          gradId: `grad_${String(srcPillar.id).replace(/[^a-zA-Z0-9]/g, "_")}_${String(dest.id).replace(/[^a-zA-Z0-9]/g, "_")}`,
          sourceId: srcPillar.id,
          targetId: dest.id,
          source: { x: srcPillar.x + srcPillar.width, y: srcPillar.y + srcPillar.height / 2 },
          target: { x: dest.x, y: dest.y + dest.height / 2 },
          colorStart: dest.isPaid ? "#10b981" : dest.isExceeded ? "#f43f5e" : dest.isNearLimit ? "#f59e0b" : srcPillar.color,
          colorEnd: dest.color,
          amount: dest.amount,
          name: `${srcPillar.name} ➔ ${dest.name}`,
          strokeWidth: strokeW,
          isActive: dest.isActive,
          isPaid: dest.isPaid,
          isExceeded: dest.isExceeded,
          isNearLimit: dest.isNearLimit,
          isDormant: !dest.isActive,
          streamColor: dest.isPaid
            ? "#6ee7b7"
            : dest.isExceeded
            ? "#fda4af"
            : dest.isNearLimit
            ? "#fde68a"
            : "#7dd3fc",
        });
      }
    });

    return {
      nodes: [...col0Nodes, col1Node, ...col2Nodes, ...col3Nodes],
      col0Nodes,
      col1Node,
      col2Nodes,
      col3Nodes,
      links,
      W,
      H,
    };
  }, [inflows, needs, wants, wealth, totalInflow, totalNeeds, totalWants, totalWealth, freeCashFlow, expensesLog, debts, activePeriod, isLight]);

  return (
    <div className="cashflow-sankey-section">
      {/* Header & Legend */}
      <div
        className="cashflow-sankey-header"
        style={{ cursor: "pointer" }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", flexWrap: "wrap", gap: 10 }}>
          <h3 className="cashflow-sankey-title" style={{ margin: 0 }}>
            <span>🌊</span> Cascada Dinámica del Flujo de Capital (Sankey Flow)
          </h3>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Selector de Orientación: Horizontal vs Vertical (Árbol) */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                borderRadius: "8px",
                padding: "2px",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setViewOrientation("horizontal")}
                style={{
                  padding: "3px 8px",
                  borderRadius: "6px",
                  border: "none",
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  background: activeOrientation === "horizontal" ? "var(--accent-primary)" : "transparent",
                  color: activeOrientation === "horizontal" ? "#000" : "var(--text-muted)",
                  transition: "all 0.15s ease",
                }}
                title="Vista Horizontal clásica tipo Río / Sankey"
              >
                ↔ Horizontal
              </button>
              <button
                type="button"
                onClick={() => setViewOrientation("vertical")}
                style={{
                  padding: "3px 8px",
                  borderRadius: "6px",
                  border: "none",
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  background: activeOrientation === "vertical" ? "var(--accent-primary)" : "transparent",
                  color: activeOrientation === "vertical" ? "#000" : "var(--text-muted)",
                  transition: "all 0.15s ease",
                }}
                title="Vista Vertical optimizada para pantallas móviles / estrechas"
              >
                ↕ Vertical
              </button>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand();
              }}
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 6,
                padding: "3px 8px",
                color: "var(--text-muted)",
                fontSize: "0.72rem",
                cursor: "pointer",
              }}
            >
              {isExpanded ? "▲ Ocultar" : "▼ Desplegar"}
            </button>
          </div>
        </div>

        {isExpanded && (
          <div className="cashflow-sankey-legend" style={{ marginTop: 10 }}>
            <div className="cashflow-legend-item">
              <span className="cashflow-legend-dot" style={{ background: isLight ? "#059669" : "#10b981" }} />
              <span>Ingresos Activos</span>
            </div>
            <div className="cashflow-legend-item">
              <span className="cashflow-legend-dot" style={{ background: isLight ? "#0284c7" : "#00e5ff" }} />
              <span>Rendimientos Pasivos</span>
            </div>
            <div className="cashflow-legend-item">
              <span className="cashflow-legend-dot" style={{ background: isLight ? "#0284c7" : "#38bdf8" }} />
              <span>Ahorro & Inversión ({customRatios.savings}%)</span>
            </div>
            <div className="cashflow-legend-item">
              <span className="cashflow-legend-dot" style={{ background: "#f43f5e" }} />
              <span>Gastos Fijos ({customRatios.needs}%)</span>
            </div>
            <div className="cashflow-legend-item">
              <span className="cashflow-legend-dot" style={{ background: "#a855f7" }} />
              <span>Estilo de Vida ({customRatios.wants}%)</span>
            </div>
          </div>
        )}
      </div>

      {/* Responsive SVG Canvas or Vertical Tree Layout */}
      {isExpanded && (
        <>
        {activeOrientation === "vertical" ? (
          /* ── Cascada Vertical Inteligente (Mobile-First Waterfall) ── */
          <div
            className="cashflow-vertical-waterfall"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
              padding: "16px 12px",
              background: isLight ? "#f8fafc" : "radial-gradient(circle at 50% 50%, rgba(13, 18, 38, 0.9) 0%, rgba(8, 12, 24, 0.98) 100%)",
              borderRadius: "16px",
              border: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            {/* 1. Fuentes de Ingreso (Inflows) */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                1. Fuentes de Ingreso
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 8 }}>
                {layout.col0Nodes.map((node) => (
                  <div
                    key={node.id}
                    onClick={() => onEditNode && onEditNode(node.rawItem, "inflow")}
                    style={{
                      background: isLight ? "#ffffff" : "rgba(17, 24, 39, 0.9)",
                      border: `1.5px solid ${node.color}`,
                      borderRadius: "12px",
                      padding: "10px 12px",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>
                        {node.icon} {node.name}
                      </span>
                      <span style={{ fontSize: "0.72rem", color: node.color, fontWeight: 700 }}>
                        {node.pct}%
                      </span>
                    </div>
                    <div style={{ fontSize: "0.95rem", fontWeight: 800, color: node.color, fontFamily: "var(--font-mono, monospace)" }}>
                      {formatAmount(node.amount, currency)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Flecha divisoria */}
            <div style={{ textAlign: "center", color: "var(--accent-primary)", fontSize: "1.1rem", lineHeight: 1 }}>
              ▼
            </div>

            {/* 2. Hub Central: Ingreso Neto */}
            <div
              style={{
                background: isLight ? "#ffffff" : "rgba(0, 229, 255, 0.08)",
                border: "2px solid var(--accent-primary)",
                borderRadius: "14px",
                padding: "12px 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                boxShadow: "0 4px 16px rgba(0, 229, 255, 0.2)",
              }}
            >
              <div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>
                  ⚡ Hub Central
                </div>
                <div style={{ fontSize: "1rem", fontWeight: 800, color: "var(--text-primary)" }}>
                  Ingreso Neto Total
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--accent-primary)", fontFamily: "var(--font-mono, monospace)" }}>
                  {formatAmount(totalInflow, currency)}
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>100% de la capacidad</div>
              </div>
            </div>

            {/* Flecha divisoria */}
            <div style={{ textAlign: "center", color: "var(--accent-primary)", fontSize: "1.1rem", lineHeight: 1 }}>
              ▼
            </div>

            {/* 3. Distribución por Pilares & Destinos Detallados */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                2. Distribución Presupuestaria & Destinos
              </div>

              {layout.col2Nodes.map((pillar) => {
                const destinationsOfPillar = layout.col3Nodes.filter((d) => d.pillarId === pillar.id);
                return (
                  <div
                    key={pillar.id}
                    style={{
                      background: isLight ? "#ffffff" : "rgba(17, 24, 39, 0.8)",
                      border: `1.5px solid ${pillar.color}`,
                      borderRadius: "14px",
                      padding: "12px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    {/* Header del Pilar */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 6 }}>
                      <span style={{ fontSize: "0.92rem", fontWeight: 800, color: pillar.color }}>
                        {pillar.name}
                      </span>
                      <span style={{ fontSize: "1rem", fontWeight: 800, color: pillar.color, fontFamily: "var(--font-mono, monospace)" }}>
                        {formatAmount(pillar.amount, currency)}{" "}
                        <span style={{ fontSize: "0.75rem", opacity: 0.85 }}>({pillar.pct}%)</span>
                      </span>
                    </div>

                    {/* Subcategorías o bolsillos dentro de este pilar */}
                    {destinationsOfPillar.length > 0 ? (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 6 }}>
                        {destinationsOfPillar.map((dest) => {
                          const clampedPct = Math.min(100, Math.max(0, dest.progressPct || 0));
                          const baseBg = isLight ? "#f8fafc" : "rgba(15, 23, 42, 0.72)";
                          const dynamicBg = dest.isPaid
                            ? isLight
                              ? "linear-gradient(135deg, rgba(16, 185, 129, 0.22) 0%, rgba(5, 150, 105, 0.08) 100%)"
                              : "linear-gradient(135deg, rgba(16, 185, 129, 0.36) 0%, rgba(0, 245, 160, 0.14) 100%)"
                            : dest.isExceeded
                            ? isLight
                              ? "linear-gradient(135deg, rgba(244, 63, 94, 0.22) 0%, rgba(225, 29, 72, 0.08) 100%)"
                              : "linear-gradient(135deg, rgba(255, 42, 95, 0.38) 0%, rgba(244, 63, 94, 0.14) 100%)"
                            : dest.isActive
                            ? `linear-gradient(90deg, ${dest.liquidColorStart} 0%, ${dest.liquidColorEnd} ${clampedPct}%, ${baseBg} ${Math.min(100, clampedPct + 4)}%)`
                            : baseBg;

                          return (
                            <div
                              key={dest.id}
                              onClick={() => onEditNode && onEditNode(dest.rawItem, dest.pillarType)}
                              style={{
                                background: dynamicBg,
                                border: dest.isPaid
                                  ? `1.5px solid ${isLight ? "#059669" : "#00f5a0"}`
                                  : dest.isExceeded
                                  ? "1.5px solid #ff2a5f"
                                  : dest.isNearLimit
                                  ? "1.5px solid #f59e0b"
                                  : dest.isActive
                                  ? `1.5px solid ${dest.color}`
                                  : isLight
                                  ? "1px solid rgba(0,0,0,0.08)"
                                  : "1px solid rgba(255, 255, 255, 0.08)",
                                borderRadius: "10px",
                                padding: "8px 10px",
                                cursor: "pointer",
                                opacity: dest.isActive ? 1 : 0.65,
                                boxShadow: dest.isPaid
                                  ? "0 0 14px rgba(16, 185, 129, 0.3)"
                                  : dest.isExceeded
                                  ? "0 0 14px rgba(244, 63, 94, 0.32)"
                                  : dest.isNearLimit
                                  ? "0 0 12px rgba(245, 158, 11, 0.25)"
                                  : dest.isActive
                                  ? "0 0 10px rgba(0, 229, 255, 0.18)"
                                  : "none",
                                transition: "all 0.25s ease",
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                                <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {dest.icon} {dest.name}
                                </div>
                                {dest.statusLabel && (
                                  <span style={{ fontSize: "0.66rem", fontWeight: 700, padding: "1px 5px", borderRadius: 4, color: dest.statusColor, background: dest.statusBg }}>
                                    {dest.statusLabel}
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: "0.85rem", fontWeight: 800, color: dest.isPaid ? (isLight ? "#059669" : "#00f5a0") : dest.color, fontFamily: "var(--font-mono, monospace)", marginTop: 2 }}>
                                {formatAmount(dest.amount, currency)}{" "}
                                <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>({dest.pct}%)</span>
                              </div>
                              {dest.spent > 0 && (
                                <div style={{ fontSize: "0.68rem", color: dest.statusColor, fontWeight: 700, marginTop: 2 }}>
                                  Ejecutado: {formatAmount(dest.spent, currency)}
                                </div>
                              )}
                              {dest.liberatedAmount > 0 && (
                                <div style={{ fontSize: "0.65rem", color: "#10b981", fontWeight: 600, marginTop: 1 }}>
                                  🌱 +{formatAmount(dest.liberatedAmount, currency)} liberados
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontStyle: "italic" }}>
                        Sin asignaciones específicas registradas
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* ── Modo Horizontal Clásico (Sankey SVG) ── */
          <div className="cashflow-sankey-svg-wrapper" style={{ position: "relative", overflowX: "auto" }}>
          <svg
            viewBox={`0 0 ${layout.W} ${layout.H}`}
            style={{ width: "100%", height: "auto", display: "block" }}
          >
            <defs>
              {/* Dynamic Link Gradients */}
              {layout.links.map((link) => (
                <linearGradient
                  key={link.gradId}
                  id={link.gradId}
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="0%"
                >
                  <stop offset="0%" stopColor={link.colorStart} stopOpacity={link.isDormant ? (isLight ? "0.28" : "0.25") : (isLight ? "0.75" : "0.92")} />
                  <stop offset="100%" stopColor={link.colorEnd} stopOpacity={link.isDormant ? (isLight ? "0.28" : "0.25") : (isLight ? "0.82" : "0.96")} />
                </linearGradient>
              ))}

              {/* Dynamic Liquid Fill Gradients for Col 3 Destination Nodes */}
              {layout.col3Nodes.map((node) => {
                const baseCardBg = isLight ? "#ffffff" : "#111829";
                const dormantCardBg = isLight ? "#f8fafc" : "#0d1322";
                const clampedPct = Math.min(100, Math.max(0, node.progressPct || 0));

                if (!node.isActive) {
                  return (
                    <linearGradient key={node.fillGradId} id={node.fillGradId} x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor={dormantCardBg} stopOpacity="0.92" />
                      <stop offset="100%" stopColor={dormantCardBg} stopOpacity="0.92" />
                    </linearGradient>
                  );
                }

                if (node.isPaid || node.isExceeded) {
                  return (
                    <linearGradient key={node.fillGradId} id={node.fillGradId} x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor={node.liquidColorStart} />
                      <stop offset="100%" stopColor={node.liquidColorEnd} />
                    </linearGradient>
                  );
                }

                return (
                  <linearGradient key={node.fillGradId} id={node.fillGradId} x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor={node.liquidColorStart} />
                    <stop offset={`${clampedPct}%`} stopColor={node.liquidColorEnd} />
                    <stop offset={`${Math.min(100, clampedPct + 3)}%`} stopColor={baseCardBg} stopOpacity="0.96" />
                    <stop offset="100%" stopColor={baseCardBg} stopOpacity="0.96" />
                  </linearGradient>
                );
              })}

              {/* Dynamic Liquid Fill Gradients for Col 2 Pillar Nodes */}
              {layout.col2Nodes.map((p) => {
                const baseCardBg = isLight ? "#ffffff" : "#111829";
                const clampedPct = Math.min(100, Math.max(0, p.progressPct || 0));
                return (
                  <linearGradient key={p.fillGradId} id={p.fillGradId} x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor={p.color} stopOpacity={p.isActive ? (isLight ? "0.2" : "0.28") : "0.05"} />
                    <stop offset={`${clampedPct}%`} stopColor={p.color} stopOpacity={p.isActive ? (isLight ? "0.12" : "0.16") : "0.03"} />
                    <stop offset={`${Math.min(100, clampedPct + 3)}%`} stopColor={baseCardBg} stopOpacity="0.95" />
                    <stop offset="100%" stopColor={baseCardBg} stopOpacity="0.95" />
                  </linearGradient>
                );
              })}

              {/* Glowing Drop Shadows */}
              <filter id="glow-cyan" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

          {/* Render Flow Links (Bézier Curves + Animated Energy Streams) */}
          <g className="sankey-links-layer">
            {layout.links.map((link) => {
              const dx = (link.target.x - link.source.x) * 0.5;
              const pathD = `M ${link.source.x} ${link.source.y} C ${link.source.x + dx} ${link.source.y}, ${link.target.x - dx} ${link.target.y}, ${link.target.x} ${link.target.y}`;
              const isHovered =
                hoveredItem &&
                (hoveredItem.id === link.id ||
                  hoveredItem.id === link.sourceId ||
                  hoveredItem.id === link.targetId);

              const baseStrokeOpacity = isHovered
                ? 1.0
                : link.isDormant
                ? isLight ? 0.3 : 0.24
                : link.isPaid || link.isExceeded
                ? 0.95
                : isLight
                ? 0.85
                : 0.78;

              return (
                <g key={link.id}>
                  {/* Ambient Glowing Halo Track */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={link.colorEnd || link.colorStart}
                    strokeWidth={link.strokeWidth + (link.isPaid || link.isExceeded ? 8 : 4)}
                    strokeOpacity={
                      isHovered
                        ? 0.42
                        : link.isPaid || link.isExceeded
                        ? 0.25
                        : link.isActive
                        ? 0.14
                        : 0.04
                    }
                  />
                  {/* Main Gradient Ribbon */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={`url(#${link.gradId})`}
                    strokeWidth={isHovered ? link.strokeWidth * 1.3 + 2 : link.strokeWidth}
                    strokeOpacity={baseStrokeOpacity}
                    style={{
                      transition: "all 0.25s ease",
                      cursor: "pointer",
                    }}
                    onMouseEnter={() =>
                      setHoveredItem({
                        id: link.id,
                        name: link.name,
                        amount: link.amount,
                        pct: totalInflow > 0 ? ((link.amount / totalInflow) * 100).toFixed(1) : 0,
                      })
                    }
                    onMouseLeave={() => setHoveredItem(null)}
                  />
                  {/* Animated Living Energy Stream for Active / Paid / Exceeded Flows */}
                  {link.isActive && (
                    <path
                      d={pathD}
                      fill="none"
                      stroke={link.streamColor || "#67e8f9"}
                      strokeWidth={Math.max(2, Math.min(6, link.strokeWidth * 0.45))}
                      strokeLinecap="round"
                      strokeOpacity={isHovered ? 1.0 : link.isPaid || link.isExceeded ? 0.92 : 0.75}
                      className={`sankey-energy-stream ${link.isPaid || link.isExceeded ? "fast" : ""}`}
                    />
                  )}
                </g>
              );
            })}
          </g>

          {/* Render Flow Nodes */}
          <g className="sankey-nodes-layer">
            {layout.nodes.map((node) => {
              const isHovered = hoveredItem && hoveredItem.id === node.id;
              const displayName = node.name.length > 22 ? `${node.name.slice(0, 20)}...` : node.name;
              const isDormantDest = node.col === 3 && !node.isActive;
              const nodeOpacity = isHovered ? 1.0 : isDormantDest ? 0.58 : 1.0;

              const nodePulseClass =
                node.col === 3
                  ? node.isPaid
                    ? "sankey-node-paid"
                    : node.isExceeded
                    ? "sankey-node-exceeded"
                    : node.isNearLimit
                    ? "sankey-node-near-limit"
                    : ""
                  : "";

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  className={nodePulseClass}
                  style={{
                    cursor: node.rawItem && onEditNode ? "pointer" : "default",
                    opacity: nodeOpacity,
                    transition: "opacity 0.25s ease, filter 0.25s ease",
                  }}
                  onClick={() => {
                    if (node.rawItem && onEditNode) {
                      onEditNode(node.rawItem, node.pillarType);
                    }
                  }}
                  onMouseEnter={() => setHoveredItem(node)}
                  onMouseLeave={() => setHoveredItem(null)}
                >
                  {/* Solid Base Backdrop so SVG links behind the node don't bleed through */}
                  <rect
                    width={node.width}
                    height={node.height}
                    rx={12}
                    ry={12}
                    fill={isLight ? "#ffffff" : "#0f172a"}
                  />

                  {/* Dynamic Liquid Color Wash & Living Glow Card */}
                  <rect
                    width={node.width}
                    height={node.height}
                    rx={12}
                    ry={12}
                    fill={
                      node.fillGradId
                        ? `url(#${node.fillGradId})`
                        : node.col === 1
                        ? isLight
                          ? "rgba(2, 132, 199, 0.1)"
                          : "rgba(0, 229, 255, 0.14)"
                        : isLight
                        ? "#ffffff"
                        : "rgba(17, 24, 41, 0.95)"
                    }
                    stroke={node.color}
                    strokeWidth={
                      isHovered
                        ? 2.6
                        : node.isPaid || node.isExceeded
                        ? 2.2
                        : node.isNearLimit || node.isActive
                        ? 1.8
                        : 1.2
                    }
                    strokeOpacity={
                      isHovered
                        ? 1.0
                        : node.isPaid || node.isExceeded || node.isNearLimit
                        ? 1.0
                        : isDormantDest
                        ? 0.45
                        : isLight
                        ? 0.9
                        : 0.85
                    }
                    style={{
                      filter: isHovered
                        ? isLight
                          ? "drop-shadow(0 4px 16px rgba(2, 132, 199, 0.35))"
                          : `drop-shadow(0 0 18px ${node.color})`
                        : node.col === 1
                        ? "drop-shadow(0 0 14px rgba(0, 229, 255, 0.32))"
                        : node.isActive && !node.isPaid && !node.isExceeded && !node.isNearLimit
                        ? "drop-shadow(0 0 10px rgba(0, 229, 255, 0.28))"
                        : isLight
                        ? "drop-shadow(0 2px 8px rgba(0, 0, 0, 0.06))"
                        : "none",
                      transition: "all 0.25s ease",
                    }}
                  />

                  {/* Glowing Liquid Frontier Line for Partial Execution (1% - 99%) */}
                  {node.col === 3 && node.isActive && !node.isPaid && !node.isExceeded && node.progressPct > 2 && node.progressPct < 99 && (
                    <line
                      x1={(node.width * Math.min(98, node.progressPct)) / 100}
                      y1={2}
                      x2={(node.width * Math.min(98, node.progressPct)) / 100}
                      y2={node.height - 2}
                      stroke={node.statusColor}
                      strokeWidth={1.6}
                      strokeOpacity={0.75}
                      strokeDasharray="3 2"
                    />
                  )}

                  {/* Left Color Accent Bar */}
                  <rect
                    x={0}
                    y={0}
                    width={6}
                    height={node.height}
                    rx={3}
                    fill={node.color}
                  />

                  {/* Node Icon & Name */}
                  <text
                    x={13}
                    y={node.col === 3 ? 23 : node.height === 54 ? 22 : 30}
                    fill={isLight ? "#0f172a" : "#f8fafc"}
                    fontSize={node.col === 1 ? 14 : node.col === 3 ? 11.5 : 12.5}
                    fontWeight={700}
                    fontFamily="Inter, sans-serif"
                  >
                    {node.icon ? `${node.icon} ` : ""}
                    {node.col === 3 && node.name.length > 15 ? `${node.name.slice(0, 14)}…` : displayName}
                  </text>

                  {/* Destination Status Pill (Col 3) */}
                  {node.col === 3 && node.statusLabel && (
                    <g transform={`translate(${node.width - 82}, 8)`}>
                      <rect
                        width={74}
                        height={18}
                        rx={6}
                        fill={node.statusBg}
                        stroke={node.statusColor}
                        strokeWidth={node.isActive ? 1.1 : 0.7}
                      />
                      <text
                        x={37}
                        y={12.5}
                        textAnchor="middle"
                        fill={node.statusColor}
                        fontSize={9.5}
                        fontWeight={800}
                        fontFamily="Inter, sans-serif"
                      >
                        {node.statusLabel}
                      </text>
                    </g>
                  )}

                  {/* Node Amount & Executed Sub-label */}
                  <text
                    x={13}
                    y={node.col === 3 ? 44 : node.height === 54 ? 40 : 54}
                    fill={
                      node.col === 3 && node.isPaid
                        ? isLight ? "#047857" : "#00f5a0"
                        : node.col === 3 && node.isExceeded
                        ? "#ff2a5f"
                        : node.col === 3 && node.isNearLimit
                        ? isLight ? "#d97706" : "#fbbf24"
                        : node.color
                    }
                    fontSize={node.col === 1 ? 14 : 11.5}
                    fontWeight={800}
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {node.col === 3 && node.isActive && !node.isPaid
                      ? `${formatAmount(node.spent, currency)} / ${formatAmount(node.amount, currency)}`
                      : formatAmount(node.amount, currency)}
                    {node.pct && node.col !== 3 ? ` (${node.pct}%)` : ""}
                  </text>

                  {/* Node Port Anchor Dots */}
                  {node.col !== 0 && (
                    <circle
                      cx={0}
                      cy={node.height / 2}
                      r={node.isActive ? 4.2 : 3.2}
                      fill={node.color}
                    />
                  )}
                  {node.col !== 3 && (
                    <circle
                      cx={node.width}
                      cy={node.height / 2}
                      r={4}
                      fill={node.color}
                    />
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      )}

        {/* Floating Interactive Details Box */}
      {hoveredItem && (
        <div
          style={{
            position: "absolute",
            bottom: "20px",
            right: "28px",
            background: "var(--bg-card)",
            border: "1px solid var(--border-accent)",
            borderRadius: "12px",
            padding: "10px 16px",
            boxShadow: "var(--shadow-card)",
            pointerEvents: "none",
            backdropFilter: "blur(12px)",
            animation: "fadeIn 0.15s ease",
          }}
        >
          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Flujo Seleccionado:</div>
          <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)" }}>
            {hoveredItem.name}
          </div>
          <div
            style={{
              fontSize: "1.05rem",
              fontWeight: 700,
              color: isLight ? "#0284c7" : "#00e5ff",
              fontFamily: "JetBrains Mono, monospace",
              marginTop: "2px",
            }}
          >
            {formatAmount(hoveredItem.amount, currency)}{" "}
            <span style={{ fontSize: "0.8rem", color: isLight ? "#0369a1" : "#38bdf8" }}>
              ({hoveredItem.pct || "0"}% del ingreso)
            </span>
          </div>
          {hoveredItem.spent !== undefined && (
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: isLight ? "1px solid rgba(0,0,0,0.06)" : "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                Ejecutado Actual: <strong style={{ color: hoveredItem.statusColor || "#10b981" }}>{formatAmount(hoveredItem.spent, currency)}</strong> ({hoveredItem.progressPct?.toFixed(0)}%)
              </div>
              {hoveredItem.liberatedAmount > 0 && (
                <div style={{ fontSize: "0.76rem", color: "#10b981", marginTop: 3, display: "flex", alignItems: "center", gap: 4 }}>
                  <span>🌱 Liberado por cobros de deuda:</span>
                  <strong>+{formatAmount(hoveredItem.liberatedAmount, currency)}</strong>
                </div>
              )}
              {hoveredItem.pendingLoanAmount > 0 && (
                <div style={{ fontSize: "0.76rem", color: isLight ? "#b45309" : "#fbbf24", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                  <span>⏳ Pendiente por cobrar:</span>
                  <strong>{formatAmount(hoveredItem.pendingLoanAmount, currency)}</strong>
                </div>
              )}
              {hoveredItem.liberatedAmount > 0 && hoveredItem.purePersonalSpent !== undefined && (
                <div style={{ fontSize: "0.73rem", color: "var(--text-muted)", marginTop: 3, borderTop: isLight ? "1px dashed rgba(0,0,0,0.08)" : "1px dashed rgba(255,255,255,0.08)", paddingTop: 3 }}>
                  🎯 Gasto propio proyectado: <strong>{formatAmount(hoveredItem.purePersonalSpent, currency)}</strong>
                </div>
              )}
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 4 }}>
                Disponible Restante: <strong style={{ color: hoveredItem.remaining > 0 ? "#10b981" : "#f43f5e" }}>{formatAmount(hoveredItem.remaining, currency)}</strong>
              </div>
              <div style={{ fontSize: "0.76rem", color: hoveredItem.statusColor || "#10b981", fontWeight: 700, marginTop: 4 }}>
                Estado: {hoveredItem.statusLabel}
              </div>
            </div>
          )}
        </div>
      )}
      </>
      )}
    </div>
  );
}
