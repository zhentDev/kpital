import React from "react";
import { useAuthStore } from "../store/authStore";

export default function StrategyPaywall({ onOpenAuth }) {
  const { user, openAuthModal } = useAuthStore();

  const handleCta = () => {
    if (!user) {
      if (onOpenAuth) onOpenAuth("register");
      else openAuthModal("register");
    } else {
      // In the future this opens Stripe / subscription checkout
      const subject = encodeURIComponent("Acceso Suscripción PRO - Estrategias Cuantitativas Kpital");
      const body = encodeURIComponent(
        `Hola Jesús,\n\nEstoy interesado en adquirir la suscripción PRO para acceder a las estrategias cuantitativas y señales algorítmicas de Kpital Tech.\n\nMi correo de cuenta: ${user.email}\n`
      );
      window.location.href = `mailto:caballerojesus703@hotmail.com?subject=${subject}&body=${body}`;
    }
  };

  return (
    <div
      style={{
        maxWidth: 880,
        margin: "24px auto 48px auto",
        padding: "0 16px",
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
      }}
    >
      <div
        style={{
          background: "linear-gradient(145deg, rgba(20, 24, 38, 0.95) 0%, rgba(13, 17, 28, 0.98) 100%)",
          border: "1px solid rgba(168, 85, 247, 0.35)",
          borderRadius: 20,
          padding: "44px 28px",
          textAlign: "center",
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.45), 0 0 40px rgba(168, 85, 247, 0.12)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Ambient Top Glow */}
        <div
          style={{
            position: "absolute",
            top: -80,
            left: "50%",
            transform: "translateX(-50%)",
            width: 320,
            height: 160,
            background: "radial-gradient(ellipse at center, rgba(168, 85, 247, 0.3) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />

        {/* Badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "rgba(168, 85, 247, 0.15)",
            border: "1px solid rgba(168, 85, 247, 0.4)",
            color: "#c084fc",
            padding: "6px 16px",
            borderRadius: 30,
            fontSize: "0.78rem",
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginBottom: 20,
          }}
        >
          <span>🔒</span>
          <span>Exclusivo para Suscriptores PRO</span>
        </div>

        {/* Title */}
        <h2
          style={{
            fontSize: "clamp(1.75rem, 3.5vw, 2.4rem)",
            fontWeight: 900,
            letterSpacing: "-0.03em",
            color: "#f8fafc",
            margin: "0 0 14px 0",
            lineHeight: 1.2,
          }}
        >
          Estrategias Cuantitativas & Algoritmos
        </h2>

        {/* Subtitle */}
        <p
          style={{
            fontSize: "0.98rem",
            color: "#94a3b8",
            maxWidth: 600,
            margin: "0 auto 32px auto",
            lineHeight: 1.6,
          }}
        >
          Este módulo contiene nuestros modelos cuantitativos institucionales, algoritmos de rebalanceo periódico sistemático, señales tácticas del mercado americano y métricas de backtest auditadas.
        </p>

        {/* Features Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
            textAlign: "left",
            marginBottom: 36,
          }}
        >
          <div
            style={{
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: 12,
              padding: "18px 16px",
            }}
          >
            <div style={{ fontSize: "1.4rem", marginBottom: 8 }}>⚡</div>
            <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#f1f5f9", marginBottom: 4 }}>
              Rebalanceos Automatizados
            </div>
            <div style={{ fontSize: "0.8rem", color: "#94a3b8", lineHeight: 1.4 }}>
              Acceso a las fechas exactas, tickets de entrada/salida y ponderación sistemática de cada rotación.
            </div>
          </div>

          <div
            style={{
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: 12,
              padding: "18px 16px",
            }}
          >
            <div style={{ fontSize: "1.4rem", marginBottom: 8 }}>🏆</div>
            <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#f1f5f9", marginBottom: 4 }}>
              Kpital Tech & Alpha
            </div>
            <div style={{ fontSize: "0.8rem", color: "#94a3b8", lineHeight: 1.4 }}>
              Estrategia propietaria con generación de Alpha consistente frente al S&P 500 y NASDAQ 100.
            </div>
          </div>

          <div
            style={{
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: 12,
              padding: "18px 16px",
            }}
          >
            <div style={{ fontSize: "1.4rem", marginBottom: 8 }}>📡</div>
            <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#f1f5f9", marginBottom: 4 }}>
              Live Tracker en Directo
            </div>
            <div style={{ fontSize: "0.8rem", color: "#94a3b8", lineHeight: 1.4 }}>
              Seguimiento intradiario de posiciones activas, volatilidad y alertas de cambio de régimen.
            </div>
          </div>
        </div>

        {/* CTA Banner */}
        <div
          style={{
            background: "rgba(168, 85, 247, 0.08)",
            border: "1px dashed rgba(168, 85, 247, 0.4)",
            borderRadius: 14,
            padding: "20px 24px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div style={{ fontSize: "0.9rem", color: "#e2e8f0", fontWeight: 600 }}>
            {user
              ? `Conectado como ${user.email} (Plan Gratuito)`
              : "Inicia sesión o regístrate para solicitar tu acceso PRO"}
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
            <button
              type="button"
              onClick={handleCta}
              style={{
                background: "linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "12px 24px",
                fontWeight: 700,
                fontSize: "0.92rem",
                cursor: "pointer",
                boxShadow: "0 4px 18px rgba(168, 85, 247, 0.4)",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                transition: "all 0.15s ease",
              }}
            >
              <span>⭐</span>
              <span>{user ? "Solicitar Membresía PRO" : "Crear Cuenta & Desbloquear"}</span>
            </button>
          </div>

          <div style={{ fontSize: "0.76rem", color: "#94a3b8" }}>
            💡 Tus herramientas de <strong>Renta Fija</strong>, <strong>Historial de Compras</strong> y <strong>Flujo de Caja</strong> continúan 100% disponibles y gratuitas en tu cuenta.
          </div>
        </div>
      </div>
    </div>
  );
}
