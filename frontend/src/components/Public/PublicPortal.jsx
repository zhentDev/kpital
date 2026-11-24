import React, { useEffect, useState } from "react";
import { useTheme } from "../../context/ThemeContext";
import {
  FINANCIAL_GLOSSARY,
  NORMATIVE_PARAMETERS_TABLE,
  PUBLIC_GUIDES,
  SITE_INFO,
} from "../../data/publicGuidesData";
import AuthWall from "../AuthWall";
import PublicCalculators from "./PublicCalculators";
import PublicGuides from "./PublicGuides";
import { PublicContactView, PublicInfoDocument } from "./PublicLegalViews";
import "./PublicPortal.css";

const VIEW_HASH_MAP = {
  "#guias": "guides",
  "#glosario": "glossary",
  "#acerca": "about",
  "#privacidad": "privacy",
  "#terminos": "terms",
  "#contacto": "contact",
};

const COOKIE_CONSENT_KEY = "kpital_cookie_consent_v1";

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
  const [cookieAccepted, setCookieAccepted] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(COOKIE_CONSENT_KEY) === "accepted";
    }
    return true;
  });

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

  const handleAcceptCookies = () => {
    setCookieAccepted(true);
    try {
      localStorage.setItem(COOKIE_CONSENT_KEY, "accepted");
    } catch {
      // Ignore storage restrictions
    }
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
              Guías ({PUBLIC_GUIDES.length})
            </button>
            <button
              type="button"
              className={`public-nav-btn ${activeView === "glossary" ? "active" : ""}`}
              onClick={() => navigateView("glossary")}
            >
              Glosario & Normativa
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
                Verificando...
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
              <span>💾</span>
              <span>Mi Portafolio</span>
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
                <span>Portal Educativo Abierto · Matemática Financiera para Colombia y Mercados Globales</span>
              </div>
              <h1>Calculadoras de Renta Fija, Inflación Real, Nómina Legal y Biblioteca Patrimonial</h1>
              <p>
                Simula Certificados de Depósito a Término (CDTs) en Colombia con descuento exacto de
                Retención en la Fuente del 4% en base calendario 365, evalúa el impacto de la
                inflación (IPC) sobre tu ahorro mediante la ecuación de Fisher, proyecta interés
                compuesto con aportes periódicos (DCA) en ETFs globales y liquida tu salario o
                planilla PILA (IBC 40%) con distribución presupuestal 50/30/20. Incluye{" "}
                <strong>{PUBLIC_GUIDES.length} guías técnicas completas</strong> y glosario
                normativo verificable de acceso 100% libre.
              </p>
            </section>

            <PublicCalculators />

            <PublicGuides compact onOpenGuideHtml={handleOpenGuideInApp} />

            {/* ── Crawlable Normative & Tax Reference Table on Homepage ─── */}
            <section className="public-card" style={{ marginTop: 28 }} aria-label="Tabla normativa financiera de Colombia">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                  flexWrap: "wrap",
                  gap: 10,
                  marginBottom: 12,
                }}
              >
                <div>
                  <h2 style={{ margin: "0 0 4px", fontSize: "1.25rem" }}>
                    Parámetros Normativos, Tributarios y de Renta Fija en Colombia
                  </h2>
                  <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.88rem" }}>
                    Síntesis técnica de las reglas legales aplicadas en nuestras calculadoras y
                    artículos educativos (Estatuto Tributario, FOGAFIN, PILA y retenciones internacionales).
                  </p>
                </div>
                <a
                  href="./glosario-financiero-colombia.html"
                  style={{
                    color: "var(--accent-primary)",
                    fontWeight: 700,
                    fontSize: "0.85rem",
                    textDecoration: "none",
                  }}
                >
                  Abrir Glosario Completo →
                </a>
              </div>

              <div className="public-table-wrap">
                <table className="public-table">
                  <thead>
                    <tr>
                      <th>Concepto / Parámetro</th>
                      <th>Tarifa o Tope de Referencia</th>
                      <th>Base Normativa</th>
                      <th>Impacto Patrimonial Práctico</th>
                    </tr>
                  </thead>
                  <tbody>
                    {NORMATIVE_PARAMETERS_TABLE.map((row) => (
                      <tr key={row.concept}>
                        <td>
                          <strong>{row.concept}</strong>
                        </td>
                        <td>{row.referenceValue}</td>
                        <td style={{ color: "var(--text-secondary)", fontSize: "0.82rem" }}>
                          {row.legalBasis}
                        </td>
                        <td style={{ color: "var(--text-secondary)", fontSize: "0.83rem" }}>
                          {row.practicalImpact}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ── Crawlable Financial Math Glossary Preview on Homepage ─── */}
            <section className="public-card" style={{ marginTop: 28 }} aria-label="Glosario de matemática financiera">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                  flexWrap: "wrap",
                  gap: 10,
                  marginBottom: 14,
                }}
              >
                <div>
                  <h2 style={{ margin: "0 0 4px", fontSize: "1.25rem" }}>
                    Glosario Técnico de Matemática Financiera e Inversión ({FINANCIAL_GLOSSARY.length} Conceptos)
                  </h2>
                  <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.88rem" }}>
                    Definiciones rigurosas y fórmulas verificables para comprender tasas efectivas,
                    deflactación por IPC, métricas de riesgo bursátil y seguridad social.
                  </p>
                </div>
                <button
                  type="button"
                  className="public-tab-btn"
                  onClick={() => navigateView("glossary")}
                >
                  Ver todos los términos →
                </button>
              </div>

              <div className="public-grid-2">
                {FINANCIAL_GLOSSARY.slice(0, 8).map((item) => (
                  <article
                    key={item.term}
                    style={{
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      padding: "14px 16px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        color: "var(--accent-primary)",
                        textTransform: "uppercase",
                        marginBottom: 4,
                      }}
                    >
                      {item.category}
                    </div>
                    <h3 style={{ margin: "0 0 6px", fontSize: "0.98rem" }}>{item.term}</h3>
                    <p
                      style={{
                        margin: "0 0 8px",
                        fontSize: "0.85rem",
                        color: "var(--text-secondary)",
                        lineHeight: 1.55,
                      }}
                    >
                      {item.definition}
                    </p>
                    <div
                      style={{
                        fontSize: "0.78rem",
                        padding: "6px 10px",
                        borderRadius: 6,
                        background: "rgba(16, 185, 129, 0.08)",
                        border: "1px solid rgba(16, 185, 129, 0.22)",
                        fontFamily: "monospace",
                      }}
                    >
                      {item.formula}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}

        {activeView === "guides" && <PublicGuides initialGuideId={selectedGuideId} />}

        {activeView === "glossary" && (
          <section className="public-card public-article" aria-label="Glosario financiero completo">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 10,
                marginBottom: 10,
              }}
            >
              <span
                style={{
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  color: "var(--accent-primary)",
                  textTransform: "uppercase",
                }}
              >
                Referencia Metodológica & Normativa · {FINANCIAL_GLOSSARY.length} Términos
              </span>
              <a
                href="./glosario-financiero-colombia.html"
                style={{
                  fontSize: "0.82rem",
                  color: "var(--accent-primary)",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Abrir versión HTML estática (glosario-financiero-colombia.html) ↗
              </a>
            </div>

            <h1 style={{ margin: "0 0 10px", fontSize: "1.6rem" }}>
              Glosario de Matemática Financiera, Renta Fija, Tributación y ETFs
            </h1>
            <p style={{ color: "var(--text-secondary)", marginBottom: 20 }}>
              Compendio técnico con definiciones claras y fórmulas exactas aplicadas en la
              evaluación de inversiones en pesos colombianos (COP) y dólares estadounidenses (USD).
            </p>

            <div className="public-grid-2">
              {FINANCIAL_GLOSSARY.map((item) => (
                <article
                  key={item.term}
                  style={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    padding: "14px 16px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      color: "var(--accent-primary)",
                      textTransform: "uppercase",
                      marginBottom: 4,
                    }}
                  >
                    {item.category}
                  </div>
                  <h2 style={{ margin: "0 0 6px", fontSize: "1.02rem" }}>{item.term}</h2>
                  <p style={{ margin: "0 0 10px", fontSize: "0.87rem", lineHeight: 1.55 }}>
                    {item.definition}
                  </p>
                  <div className="public-formula-box" style={{ margin: 0, padding: "8px 10px" }}>
                    <code>{item.formula}</code>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {activeView === "about" && <PublicInfoDocument docKey="about" />}
        {activeView === "privacy" && <PublicInfoDocument docKey="privacy" />}
        {activeView === "terms" && <PublicInfoDocument docKey="terms" />}
        {activeView === "contact" && <PublicContactView />}
      </main>

      {/* ── Crawl-friendly Semantic Footer ───────────────────────────────── */}
      <footer className="public-footer">
        <div className="public-footer-inner">
          <div className="public-footer-links" aria-label="Enlaces legales y educativos">
            <a href="./guias.html">Biblioteca de Guías ({PUBLIC_GUIDES.length})</a>
            <a href="./glosario-financiero-colombia.html">Glosario & Normativa</a>
            {PUBLIC_GUIDES.map((g) => (
              <a key={g.slug} href={`./${g.slug}`}>
                {g.title.split(":")[0]}
              </a>
            ))}
            <a href="./acerca.html">Acerca de Kpital</a>
            <a href="./privacidad.html">Política de Privacidad</a>
            <a href="./terminos.html">Términos de Uso y Descargo</a>
            <a href="./contacto.html">Contacto</a>
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
            © {new Date().getFullYear()} {SITE_INFO.publisher} ({SITE_INFO.domain}). Contenido
            estrictamente educativo e informativo sobre matemática financiera; no constituye asesoría
            financiera personalizada ni captación de recursos.
          </div>
        </div>
      </footer>

      {/* ── Cookie & Privacy Transparency Notice ─────────────────────────── */}
      {!cookieAccepted && (
        <div
          role="region"
          aria-label="Aviso de privacidad y cookies"
          style={{
            position: "fixed",
            bottom: 14,
            left: 14,
            right: 14,
            maxWidth: 920,
            margin: "0 auto",
            zIndex: 9990,
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "12px 16px",
            boxShadow: "0 12px 32px rgba(0, 0, 0, 0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            fontSize: "0.82rem",
          }}
        >
          <div style={{ flex: "1 1 520px", color: "var(--text-secondary)", lineHeight: 1.45 }}>
            🍪 <strong>Transparencia de Cookies y Privacidad:</strong> Utilizamos almacenamiento local
            para recordar tu tema visual y cookies de terceros (Google AdSense) para ofrecer nuestras
            calculadoras y guías financieras de forma 100% gratuita. Consulta nuestra{" "}
            <a href="./privacidad.html" style={{ color: "var(--accent-primary)", fontWeight: 700 }}>
              Política de Privacidad
            </a>
            .
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="public-login-btn"
              onClick={handleAcceptCookies}
              style={{ padding: "6px 14px", fontSize: "0.8rem" }}
            >
              Entendido y Aceptar
            </button>
          </div>
        </div>
      )}

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
