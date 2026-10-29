import React, { useState } from "react";
import { useTheme } from "../../context/ThemeContext";
import { REFERRAL_LINKS } from "../../utils/referralLinks";

export default function AffiliateBanner({ style = {}, type = "stock" }) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  // Banner variants: stock (IBKR/Wall Street) vs fixed_income (Nu / Rappi / Plenti / ARQ)
  if (type === "fixed_income") {
    return (
      <div
        className="fade-up"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 16,
          padding: "14px 20px",
          margin: "16px 0 20px 0",
          borderRadius: "var(--radius)",
          boxSizing: "border-box",
          maxWidth: "100%",
          background: isLight
            ? "linear-gradient(135deg, rgba(130, 10, 209, 0.1) 0%, rgba(255, 68, 31, 0.1) 50%, rgba(16, 185, 129, 0.12) 100%)"
            : "linear-gradient(135deg, rgba(130, 10, 209, 0.22) 0%, rgba(255, 68, 31, 0.18) 50%, rgba(16, 185, 129, 0.18) 100%)",
          border: `1.5px solid ${isLight ? "rgba(130, 10, 209, 0.35)" : "rgba(130, 10, 209, 0.55)"}`,
          boxShadow: isLight
            ? "0 6px 20px rgba(130, 10, 209, 0.1)"
            : "0 6px 26px rgba(130, 10, 209, 0.25), 0 0 16px rgba(16, 185, 129, 0.15)",
          ...style,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, flex: "1 1 240px", minWidth: 0 }}>
          <div
            style={{
              fontSize: "1.6rem",
              width: 44,
              height: 44,
              borderRadius: 12,
              background: isLight ? "rgba(130, 10, 209, 0.12)" : "rgba(130, 10, 209, 0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            🎁
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: "0.92rem",
                fontWeight: 700,
                color: isLight ? "#0f172a" : "#f1f5f9",
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <span>Maximiza tus Rendimientos de Renta Fija</span>
              <span
                style={{
                  fontSize: "0.65rem",
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: "rgba(16, 185, 129, 0.2)",
                  color: isLight ? "#059669" : "#34d399",
                  fontWeight: 800,
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                Tasas hasta 14% E.A.
              </span>
            </div>
            <div
              style={{
                fontSize: "0.78rem",
                color: isLight ? "#475569" : "var(--text-secondary)",
                marginTop: 2,
              }}
            >
              Abre tu cuenta con beneficios de bienvenida en <strong>Nu</strong>, <strong>RappiPay</strong>, <strong>Plenti</strong> o <strong>ARQ</strong> y empieza a generar rentabilidad diaria.
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <a
            href={REFERRAL_LINKS.nu.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              textDecoration: "none",
              fontSize: "0.75rem",
              padding: "6px 12px",
              fontWeight: 700,
              borderRadius: 8,
              background: "#820ad1",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            💜 Nu
          </a>
          <a
            href={REFERRAL_LINKS.rappi.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              textDecoration: "none",
              fontSize: "0.75rem",
              padding: "6px 12px",
              fontWeight: 700,
              borderRadius: 8,
              background: "#ff441f",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            🧡 RappiPay
          </a>
          <a
            href={REFERRAL_LINKS.plenti.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              textDecoration: "none",
              fontSize: "0.75rem",
              padding: "6px 12px",
              fontWeight: 700,
              borderRadius: 8,
              background: "#7c3aed",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            🟣 Plenti
          </a>
          <a
            href={REFERRAL_LINKS.arq.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              textDecoration: "none",
              fontSize: "0.75rem",
              padding: "6px 12px",
              fontWeight: 700,
              borderRadius: 8,
              background: "#059669",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            💳 ARQ
          </a>
          <a
            href={REFERRAL_LINKS.lemon.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              textDecoration: "none",
              fontSize: "0.75rem",
              padding: "6px 12px",
              fontWeight: 700,
              borderRadius: 8,
              background: "#65a30d",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            🍋 Lemon
          </a>

          <button
            onClick={() => setDismissed(true)}
            style={{
              background: "transparent",
              border: "none",
              color: isLight ? "#94a3b8" : "#64748b",
              fontSize: "1.1rem",
              cursor: "pointer",
              padding: "4px 8px",
              lineHeight: 1,
            }}
            title="Ocultar anuncio"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  // Default: Stock / Trading banner
  return (
    <div
      className="fade-up"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 16,
        padding: "14px 20px",
        margin: "18px 0",
        borderRadius: "var(--radius)",
        boxSizing: "border-box",
        maxWidth: "100%",
        background: isLight
          ? "linear-gradient(135deg, rgba(2, 132, 199, 0.08) 0%, rgba(16, 185, 129, 0.08) 100%)"
          : "linear-gradient(135deg, rgba(2, 132, 199, 0.15) 0%, rgba(16, 185, 129, 0.12) 100%)",
        border: `1px solid ${isLight ? "rgba(2, 132, 199, 0.25)" : "rgba(0, 229, 255, 0.25)"}`,
        boxShadow: isLight
          ? "0 4px 14px rgba(0, 0, 0, 0.04)"
          : "0 4px 20px rgba(0, 229, 255, 0.06)",
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, flex: "1 1 240px", minWidth: 0 }}>
        <div
          style={{
            fontSize: "1.8rem",
            width: 44,
            height: 44,
            borderRadius: 12,
            background: isLight ? "rgba(2, 132, 199, 0.12)" : "rgba(0, 229, 255, 0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          🚀
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: "0.92rem",
              fontWeight: 700,
              color: isLight ? "#0f172a" : "#f1f5f9",
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span>Invierte en Wall Street sin comisiones</span>
            <span
              style={{
                fontSize: "0.65rem",
                padding: "2px 6px",
                borderRadius: 4,
                background: "rgba(16, 185, 129, 0.2)",
                color: isLight ? "#059669" : "#34d399",
                fontWeight: 800,
                textTransform: "uppercase",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              0% Comisión
            </span>
          </div>
          <div
            style={{
              fontSize: "0.78rem",
              color: isLight ? "#475569" : "var(--text-secondary)",
              marginTop: 2,
              wordBreak: "break-word",
            }}
          >
            Abre tu cuenta de inversión internacional en Interactive Brokers o XTB y opera ETFs y acciones de Kpital Zhent.
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", flexShrink: 0 }}>
        <a
          href={REFERRAL_LINKS.ibkr.url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary"
          style={{
            textDecoration: "none",
            fontSize: "0.8rem",
            padding: "8px 16px",
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          <span>Abrir Cuenta →</span>
        </a>
        <button
          onClick={() => setDismissed(true)}
          style={{
            background: "transparent",
            border: "none",
            color: isLight ? "#94a3b8" : "#64748b",
            fontSize: "1.1rem",
            cursor: "pointer",
            padding: "4px 8px",
            lineHeight: 1,
          }}
          title="Ocultar anuncio"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
