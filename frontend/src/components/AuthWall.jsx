import React, { useState } from "react";
import toast from "react-hot-toast";
import { useAuthStore } from "../store/authStore";
import { useTheme } from "../context/ThemeContext";

export default function AuthWall() {
  const { login, register, isLoading } = useAuthStore();
  const { theme, toggleTheme } = useTheme();

  const [tab, setTab] = useState("login"); // 'login' | 'register'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (tab === "login") {
      await login(email, password);
    } else {
      await register(email, password, name);
    }
  };

  const handleGoogleOAuth = () => {
    if (window.google?.accounts?.id) {
      window.google.accounts.id.prompt();
      return;
    }
    toast(
      "Para usar el popup de Google se requiere configurar un Google Client ID. Puedes acceder directamente con tu correo y contraseña.",
      { icon: "ℹ️", duration: 5000 }
    );
    setTab("register");
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--bg-main)",
        color: "var(--text-primary)",
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
      }}
    >
      {/* ── Top Bar ───────────────────────────────────────── */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "16px 28px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-card)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: "8px",
              background: "linear-gradient(135deg, var(--accent-primary) 0%, #3b82f6 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#000",
              fontWeight: 900,
              fontSize: "1.1rem",
              boxShadow: "0 0 15px rgba(0, 229, 255, 0.3)",
            }}
          >
            ⚡
          </div>
          <div>
            <div
              style={{
                fontSize: "1.1rem",
                fontWeight: 800,
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
              }}
            >
              Kpital<span style={{ color: "var(--accent-primary)" }}>Tech</span>
            </div>
            <div
              style={{
                fontSize: "0.65rem",
                color: "var(--text-muted)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              Private Financial Terminal
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
            padding: "8px 14px",
            borderRadius: "var(--radius-sm, 6px)",
            fontSize: "0.82rem",
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
          title={theme === "light" ? "Cambiar a Modo Nocturno" : "Cambiar a Modo Diurno"}
        >
          {theme === "light" ? "🌙 Nocturno" : "☀️ Diurno"}
        </button>
      </header>

      {/* ── Main Content / Gate Card ──────────────────────── */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 20px",
          maxWidth: 960,
          margin: "0 auto",
          width: "100%",
        }}
      >
        {/* Security Badge & Headers */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "rgba(0, 229, 255, 0.1)",
              border: "1px solid rgba(0, 229, 255, 0.25)",
              color: "var(--accent-primary)",
              padding: "4px 12px",
              borderRadius: 20,
              fontSize: "0.75rem",
              fontWeight: 700,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              marginBottom: 14,
            }}
          >
            <span>🛡️</span>
            <span>Sistema Financiero Privado</span>
          </div>

          <h1
            style={{
              fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              margin: "0 0 10px 0",
              color: "var(--text-primary)",
            }}
          >
            Bienvenido a tu Terminal Privada
          </h1>
          <p
            style={{
              fontSize: "0.95rem",
              color: "var(--text-secondary)",
              maxWidth: 580,
              margin: "0 auto",
              lineHeight: 1.5,
            }}
          >
            Tus portafolios, compras bursátiles, cuentas de renta fija y flujo de caja están
            protegidos bajo autenticación privada. Inicia sesión para desbloquear tu información.
          </p>
        </div>

        {/* Auth Form Box */}
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg, 12px)",
            width: "100%",
            maxWidth: 440,
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.15)",
            overflow: "hidden",
            marginBottom: 36,
          }}
        >
          {/* Tabs */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              borderBottom: "1px solid var(--border)",
              background: "var(--bg-surface)",
            }}
          >
            <button
              type="button"
              onClick={() => setTab("login")}
              style={{
                padding: "14px 16px",
                fontWeight: tab === "login" ? 700 : 500,
                color: tab === "login" ? "var(--accent-primary)" : "var(--text-muted)",
                borderBottom: tab === "login" ? "2px solid var(--accent-primary)" : "2px solid transparent",
                background: "transparent",
                borderTop: "none",
                borderLeft: "none",
                borderRight: "none",
                cursor: "pointer",
                fontSize: "0.9rem",
                transition: "all 0.15s ease",
              }}
            >
              🔑 Iniciar Sesión
            </button>
            <button
              type="button"
              onClick={() => setTab("register")}
              style={{
                padding: "14px 16px",
                fontWeight: tab === "register" ? 700 : 500,
                color: tab === "register" ? "var(--accent-primary)" : "var(--text-muted)",
                borderBottom: tab === "register" ? "2px solid var(--accent-primary)" : "2px solid transparent",
                background: "transparent",
                borderTop: "none",
                borderLeft: "none",
                borderRight: "none",
                cursor: "pointer",
                fontSize: "0.9rem",
                transition: "all 0.15s ease",
              }}
            >
              ✨ Crear Cuenta
            </button>
          </div>

          <div style={{ padding: "24px" }}>
            {/* Google OAuth Button */}
            <button
              type="button"
              onClick={handleGoogleOAuth}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                padding: "11px 16px",
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm, 6px)",
                color: "var(--text-primary)",
                fontWeight: 600,
                fontSize: "0.875rem",
                cursor: "pointer",
                transition: "all 0.15s ease",
                marginBottom: 20,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Continuar con Google</span>
            </button>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                margin: "18px 0",
                color: "var(--text-muted)",
                fontSize: "0.78rem",
              }}
            >
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              <span>O con tu correo registrado</span>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            </div>

            {/* Email & Password Form */}
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {tab === "register" && (
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      color: "var(--text-secondary)",
                      marginBottom: 6,
                    }}
                  >
                    Nombre Completo
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Juan Pérez"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm, 6px)",
                      color: "var(--text-primary)",
                      fontSize: "0.875rem",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              )}

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                    marginBottom: 6,
                  }}
                >
                  Correo Electrónico
                </label>
                <input
                  type="email"
                  required
                  placeholder="tu@correo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm, 6px)",
                    color: "var(--text-primary)",
                    fontSize: "0.875rem",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                    marginBottom: 6,
                  }}
                >
                  Contraseña
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm, 6px)",
                    color: "var(--text-primary)",
                    fontSize: "0.875rem",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                style={{
                  marginTop: 6,
                  padding: "12px",
                  background: "var(--accent-primary)",
                  color: "#000",
                  border: "none",
                  borderRadius: "var(--radius-sm, 6px)",
                  fontWeight: 700,
                  fontSize: "0.9rem",
                  cursor: isLoading ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  transition: "opacity 0.15s ease",
                  opacity: isLoading ? 0.7 : 1,
                }}
              >
                {isLoading ? (
                  <span>Verificando credenciales...</span>
                ) : tab === "login" ? (
                  <span>Desbloquear Terminal 🔓</span>
                ) : (
                  <span>Crear Cuenta & Vincular 🚀</span>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Feature Highlights (Institutional preview) */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 16,
            width: "100%",
          }}
        >
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm, 8px)",
              padding: "16px",
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
            }}
          >
            <div style={{ fontSize: "1.3rem" }}>📈</div>
            <div>
              <strong style={{ fontSize: "0.85rem", display: "block", marginBottom: 4 }}>
                Portafolios & Bolsa
              </strong>
              <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
                Seguimiento lote a lote en USD/COP, ajuste por inflación real y rebalanceo sistemático.
              </span>
            </div>
          </div>

          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm, 8px)",
              padding: "16px",
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
            }}
          >
            <div style={{ fontSize: "1.3rem" }}>🏦</div>
            <div>
              <strong style={{ fontSize: "0.85rem", display: "block", marginBottom: 4 }}>
                Bóveda Renta Fija
              </strong>
              <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
                Control de cuentas Nu, Lulo, Pibank, CDTs con ReteFuente y cálculo de interés compuesto.
              </span>
            </div>
          </div>

          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm, 8px)",
              padding: "16px",
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
            }}
          >
            <div style={{ fontSize: "1.3rem" }}>💧</div>
            <div>
              <strong style={{ fontSize: "0.85rem", display: "block", marginBottom: 4 }}>
                Flujo & Presupuesto
              </strong>
              <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
                Diagrama Sankey interactivo, tarjetas de crédito y radar de runway de emergencia.
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* ── Footer ────────────────────────────────────────── */}
      <footer
        style={{
          textAlign: "center",
          padding: "16px",
          borderTop: "1px solid var(--border)",
          fontSize: "0.75rem",
          color: "var(--text-muted)",
        }}
      >
        Kpital Financial Terminal · Conexión Cifrada SSL · Supabase Cloud Engine Privado
      </footer>
    </div>
  );
}
