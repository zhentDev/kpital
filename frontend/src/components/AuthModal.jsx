import React, { useState } from "react";
import toast from "react-hot-toast";
import { useAuthStore } from "../store/authStore";

export default function AuthModal() {
  const {
    isAuthModalOpen,
    closeAuthModal,
    authModalTab,
    setAuthModalTab,
    login,
    register,
    loginWithOAuth,
    isLoading,
  } = useAuthStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  if (!isAuthModalOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (authModalTab === "login") {
      await login(email, password);
    } else {
      await register(email, password, name);
    }
  };

  const handleGoogleOAuth = async () => {
    if (window.google?.accounts?.id) {
      window.google.accounts.id.prompt();
      return;
    }
    toast("Para usar el popup oficial de Google se requiere configurar un Google Client ID. Puedes registrarte de forma rápida y directa con tu propio correo y contraseña.", {
      icon: "ℹ️",
      duration: 6000,
    });
    setAuthModalTab("register");
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeAuthModal();
      }}
    >
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          width: "100%",
          maxWidth: 440,
          boxShadow: "var(--shadow-card)",
          overflow: "hidden",
          animation: "fadeIn 0.2s ease-out",
        }}
      >
        {/* Header Tabs */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-card)",
          }}
        >
          <button
            type="button"
            style={{
              padding: "16px",
              fontWeight: authModalTab === "login" ? 700 : 500,
              color: authModalTab === "login" ? "var(--accent-primary)" : "var(--text-secondary)",
              borderBottom: authModalTab === "login" ? "2px solid var(--accent-primary)" : "2px solid transparent",
              background: "none",
              borderLeft: "none",
              borderRight: "none",
              borderTop: "none",
              cursor: "pointer",
              transition: "all 0.2s",
              fontSize: "0.95rem",
            }}
            onClick={() => setAuthModalTab("login")}
          >
            🔑 Iniciar Sesión
          </button>
          <button
            type="button"
            style={{
              padding: "16px",
              fontWeight: authModalTab === "register" ? 700 : 500,
              color: authModalTab === "register" ? "var(--accent-primary)" : "var(--text-secondary)",
              borderBottom: authModalTab === "register" ? "2px solid var(--accent-primary)" : "2px solid transparent",
              background: "none",
              borderLeft: "none",
              borderRight: "none",
              borderTop: "none",
              cursor: "pointer",
              transition: "all 0.2s",
              fontSize: "0.95rem",
            }}
            onClick={() => setAuthModalTab("register")}
          >
            ✨ Registrarme
          </button>
        </div>

        <div style={{ padding: 24 }}>
          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {authModalTab === "register" && (
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: 6 }}>
                  Nombre completo
                </label>
                <input
                  type="text"
                  required
                  placeholder="Tu nombre"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                    fontSize: "0.9rem",
                    outline: "none",
                  }}
                />
              </div>
            )}

            <div>
              <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: 6 }}>
                Correo electrónico
              </label>
              <input
                type="email"
                required
                placeholder="ejemplo@correo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                  fontSize: "0.9rem",
                  outline: "none",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: 6 }}>
                Contraseña
              </label>
              <input
                type="password"
                required
                minLength={4}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                  fontSize: "0.9rem",
                  outline: "none",
                }}
              />
            </div>

            {authModalTab === "register" && (
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "var(--text-secondary)",
                  background: "rgba(0, 229, 255, 0.06)",
                  border: "1px solid var(--border-accent)",
                  borderRadius: 6,
                  padding: "8px 12px",
                  lineHeight: 1.4,
                }}
              >
                🛡️ <strong>Aislamiento y Protección:</strong> Tu cuenta aislará tus portafolios, movimientos de caja y cuentas bancarias. Toda tu información previa se vinculará automáticamente.
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "var(--radius-sm)",
                background: "var(--accent-primary)",
                color: "#080c18",
                fontWeight: 700,
                border: "none",
                cursor: isLoading ? "not-allowed" : "pointer",
                fontSize: "0.95rem",
                marginTop: 4,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                transition: "opacity 0.2s",
              }}
            >
              {isLoading ? "Procesando..." : authModalTab === "login" ? "Ingresar al Portafolio" : "Crear mi Cuenta"}
            </button>
          </form>

          {/* Divider */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              margin: "20px 0",
              gap: 12,
              color: "var(--text-muted)",
              fontSize: "0.8rem",
            }}
          >
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            <span>o continuar con</span>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>

          {/* OAuth Button */}
          <button
            type="button"
            onClick={handleGoogleOAuth}
            disabled={isLoading}
            style={{
              width: "100%",
              padding: "10px 16px",
              borderRadius: "var(--radius-sm)",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
              fontWeight: 600,
              cursor: "pointer",
              fontSize: "0.9rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              transition: "background 0.2s, border-color 0.2s",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
              />
            </svg>
            <span>Continuar con Google (OAuth2)</span>
          </button>

          {/* Close button */}
          <div style={{ marginTop: 20, textAlign: "center" }}>
            <button
              type="button"
              onClick={closeAuthModal}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                fontSize: "0.8rem",
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Cerrar y continuar sin iniciar sesión
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
