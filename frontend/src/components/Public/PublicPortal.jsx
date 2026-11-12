import React, { useEffect, useState } from "react";
import { useTheme } from "../../context/ThemeContext";
import { SITE_INFO } from "../../data/publicGuidesData";
import AuthWall from "../AuthWall";
import PublicCalculators from "./PublicCalculators";
import PublicGuides from "./PublicGuides";
import { PublicContactView, PublicInfoDocument } from "./PublicLegalViews";
import "./PublicPortal.css";

const VIEW_HASH_MAP = {
  "#guias": "guides",
  "#acerca": "about",
  "#privacidad": "privacy",
  "#terminos": "terms",
  "#contacto": "contact",
};

export default function PublicPortal({ isCheckingSession = false }) {
  const { theme, toggleTheme } = useTheme();
  const [activeView, setActiveView] = useState(() => {
    if (typeof window !== "undefined") {
      return VIEW_HASH_MAP[window.location.hash] || "home";
    }
    return "home";
  });
  const [selectedGuideId, setSelectedGuideId] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") setShowAuthModal(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const navigateView = (view) => {
    setActiveView(view);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleOpenGuideInApp = (guideId) => {
    setSelectedGuideId(guideId);
    navigateView("guides");
  };

  return (
    <div className="public-portal">
      {/* ── Top Navigation Bar ───────────────────────────────────────────── */}
      <header className="public-header">
        <div className="public-header-inner">
          <button type="button" className="public-brand" onClick={() => navigateView("home")}>
            <span className="public-brand-icon">K</span>
            <div>
              <div style={{ fontSize: "1.05rem", fontWeight: 800, lineHeight: 1.1 }}>
                Kpital<span style={{ color: "var(--accent-primary)" }}> · Zhent</span>
              </div>
              <div
                style={{
                  fontSize: "0.66rem",
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Calculadoras & Educación Financiera
              </div>
            </div>
          </button>

          <nav className="public-nav" aria-label="Navegación principal">
            <button
              type="button"
              className={`public-nav-btn ${activeView === "home" ? "active" : ""}`}
              onClick={() => navigateView("home")}
            >
              Calculadoras
            </button>
            <button
              type="button"
              className={`public-nav-btn ${activeView === "guides" ? "active" : ""}`}
              onClick={() => navigateView("guides")}
            >
              Guías Financieras
            </button>
            <button
              type="button"
              className={`public-nav-btn ${activeView === "about" ? "active" : ""}`}
              onClick={() => navigateView("about")}
            >
              Acerca de
            </button>
            <button
              type="button"
              className={`public-nav-btn ${activeView === "privacy" ? "active" : ""}`}
              onClick={() => navigateView("privacy")}
            >
              Privacidad
            </button>
            <button
              type="button"
              className={`public-nav-btn ${activeView === "terms" ? "active" : ""}`}
              onClick={() => navigateView("terms")}
            >
              Términos
            </button>
            <button
              type="button"
              className={`public-nav-btn ${activeView === "contact" ? "active" : ""}`}
              onClick={() => navigateView("contact")}
            >
              Contacto
            </button>
          </nav>

          <div className="public-actions">
            {isCheckingSession && (
              <span
                style={{
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                  padding: "4px 8px",
                }}
              >
                Verificando sesión...
              </span>
            )}
            <button
              type="button"
              className="public-theme-btn"
              onClick={toggleTheme}
              title={theme === "light" ? "Cambiar a Modo Nocturno" : "Cambiar a Modo Diurno"}
            >
              {theme === "light" ? "🌙 Nocturno" : "☀️ Diurno"}
            </button>
            <button
              type="button"
              className="public-login-btn"
              onClick={() => setShowAuthModal(true)}
            >
              <span>🔐</span>
              <span>Iniciar Sesión</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Content ─────────────────────────────────────────────────── */}
      <main className="public-main">
        {activeView === "home" && (
          <>
            <section className="public-hero">
              <div className="public-hero-badge">
                <span>📊</span>
                <span>Herramientas Financieras Abiertas · Colombia y ETFs Globales</span>
              </div>
              <h1>Calculadoras de Renta Fija, Inflación Real y Patrimonio sin Registros</h1>
              <p>
                Simula CDTs en Colombia con descuento exacto de ReteFuente del 4%, evalúa el impacto
                de la inflación (IPC) sobre tu ahorro mediante la ecuación de Fisher, proyecta
                interés compuesto con aportes mensuales (DCA) y liquida tu salario o planilla PILA
                con presupuesto 50/30/20. Todo abierto al público, gratis y con metodología
                matemática transparente.
              </p>
            </section>

            <PublicCalculators />

            <PublicGuides compact onOpenGuideHtml={handleOpenGuideInApp} />

            <section className="public-card" style={{ marginTop: 28 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 16,
                }}
              >
                <div style={{ maxWidth: 740 }}>
                  <h2 style={{ margin: "0 0 6px", fontSize: "1.2rem" }}>
                    Terminal Privada Kpital para Seguimiento Personal Multiactivo
                  </h2>
                  <p
                    style={{
                      margin: 0,
                      color: "var(--text-secondary)",
                      fontSize: "0.9rem",
                      lineHeight: 1.55,
                    }}
                  >
                    Si además de usar nuestras calculadoras y guías gratuitas quieres guardar tus
                    propios lotes de acciones o ETFs, comparar cuentas remuneradas históricas (Nu,
                    Pibank, Lulo, RappiPay) y visualizar tu flujo de caja privado, puedes crear una
                    cuenta gratuita o acceder a tu terminal cifrada en la nube.
                  </p>
                </div>
                <button
                  type="button"
                  className="public-login-btn"
                  onClick={() => setShowAuthModal(true)}
                >
                  Abrir Terminal Privada →
                </button>
              </div>
            </section>
          </>
        )}

        {activeView === "guides" && <PublicGuides initialGuideId={selectedGuideId} />}
        {activeView === "about" && <PublicInfoDocument docKey="about" />}
        {activeView === "privacy" && <PublicInfoDocument docKey="privacy" />}
        {activeView === "terms" && <PublicInfoDocument docKey="terms" />}
        {activeView === "contact" && <PublicContactView />}
      </main>

      {/* ── Crawl-friendly Semantic Footer ───────────────────────────────── */}
      <footer className="public-footer">
        <div className="public-footer-inner">
          <div className="public-footer-links" aria-label="Enlaces legales y educativos">
            <a href="./guias.html">Biblioteca de Guías</a>
            <a href="./guia-cdt-retefuente-colombia.html">Guía CDT & ReteFuente 4%</a>
            <a href="./guia-inflacion-rentabilidad-real.html">Guía Inflación y Rentabilidad Real</a>
            <a href="./guia-interes-compuesto-etfs-dca.html">Guía Interés Compuesto & DCA</a>
            <a href="./guia-nomina-colombia-presupuesto.html">Guía Nómina Colombia & 50/30/20</a>
            <a href="./acerca.html">Acerca de Kpital</a>
            <a href="./privacidad.html">Política de Privacidad</a>
            <a href="./terminos.html">Términos de Uso y Descargo</a>
            <a href="./contacto.html">Contacto</a>
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
            © {new Date().getFullYear()} {SITE_INFO.publisher} ({SITE_INFO.domain}). Contenido
            estrictamente educativo e informativo; no constituye asesoría financiera ni
            recomendación de inversión.
          </div>
        </div>
      </footer>

      {/* ── On-Demand Login / Register Modal ─────────────────────────────── */}
      {showAuthModal && (
        <div
          className="public-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAuthModal(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setShowAuthModal(false);
          }}
        >
          <dialog
            open
            className="public-modal-shell"
            aria-label="Acceso a Kpital"
            style={{ padding: 0, border: "none", background: "transparent" }}
          >
            <AuthWall isModal onClose={() => setShowAuthModal(false)} />
          </dialog>
        </div>
      )}
    </div>
  );
}
