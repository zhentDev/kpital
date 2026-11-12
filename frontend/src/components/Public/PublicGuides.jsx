import React, { useEffect, useState } from "react";
import { PUBLIC_GUIDES } from "../../data/publicGuidesData";

export default function PublicGuides({ compact = false, initialGuideId = null, onOpenGuideHtml }) {
  const [selectedGuideId, setSelectedGuideId] = useState(
    compact ? null : initialGuideId || PUBLIC_GUIDES[0].id,
  );

  useEffect(() => {
    if (!compact && initialGuideId) {
      setSelectedGuideId(initialGuideId);
    }
  }, [compact, initialGuideId]);

  const selectedGuide = PUBLIC_GUIDES.find((g) => g.id === selectedGuideId) || null;

  if (compact) {
    return (
      <section aria-label="Guías educativas destacadas" style={{ marginTop: 28 }}>
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
            <h2 style={{ margin: "0 0 4px", fontSize: "1.3rem" }}>
              Guías de Educación Financiera y Metodología
            </h2>
            <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.9rem" }}>
              Artículos originales con fórmulas reales, ejemplos numéricos y preguntas frecuentes
              sobre inversión en Colombia y ETFs globales.
            </p>
          </div>
          <a
            href="./guias.html"
            style={{
              color: "var(--accent-primary)",
              fontWeight: 700,
              fontSize: "0.86rem",
              textDecoration: "none",
            }}
          >
            Ver biblioteca completa →
          </a>
        </div>

        <div className="public-grid-2">
          {PUBLIC_GUIDES.map((guide) => (
            <article key={guide.id} className="public-card">
              <div
                style={{
                  fontSize: "0.74rem",
                  fontWeight: 700,
                  color: "var(--accent-primary)",
                  textTransform: "uppercase",
                  marginBottom: 6,
                }}
              >
                {guide.category} · {guide.readTime}
              </div>
              <h3 style={{ margin: "0 0 8px", fontSize: "1.05rem", lineHeight: 1.35 }}>
                {guide.title}
              </h3>
              <p
                style={{
                  margin: "0 0 12px",
                  color: "var(--text-secondary)",
                  fontSize: "0.88rem",
                  lineHeight: 1.55,
                }}
              >
                {guide.summary}
              </p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  type="button"
                  className="public-tab-btn"
                  style={{ padding: "7px 12px", fontSize: "0.82rem" }}
                  onClick={() => onOpenGuideHtml?.(guide.id)}
                >
                  Leer guía completa
                </button>
                <a
                  href={`./${guide.slug}`}
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "0.8rem",
                    textDecoration: "none",
                  }}
                >
                  Versión web directa ↗
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Biblioteca de guías financieras">
      <div className="public-tabs">
        {PUBLIC_GUIDES.map((g) => (
          <button
            key={g.id}
            type="button"
            className={`public-tab-btn ${selectedGuide?.id === g.id ? "active" : ""}`}
            onClick={() => setSelectedGuideId(g.id)}
          >
            {g.category}
          </button>
        ))}
      </div>

      {selectedGuide && (
        <article className="public-card public-article">
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
              {selectedGuide.category} · {selectedGuide.readTime}
            </span>
            <a
              href={`./${selectedGuide.slug}`}
              style={{
                fontSize: "0.82rem",
                color: "var(--accent-primary)",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Abrir artículo independiente ({selectedGuide.slug}) ↗
            </a>
          </div>

          <h1 style={{ margin: "0 0 10px", fontSize: "1.6rem", color: "var(--text-primary)" }}>
            {selectedGuide.title}
          </h1>
          <p style={{ fontSize: "1rem", color: "var(--text-secondary)", marginBottom: 16 }}>
            {selectedGuide.summary}
          </p>

          <div className="public-formula-box" style={{ marginBottom: 20 }}>
            <strong>Puntos clave de esta guía:</strong>
            <ul style={{ margin: "8px 0 0 18px", padding: 0 }}>
              {selectedGuide.highlights.map((item) => (
                <li key={item} style={{ marginBottom: 4 }}>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {selectedGuide.sections.map((sec) => (
            <section key={sec.heading} style={{ marginBottom: 18 }}>
              <h2>{sec.heading}</h2>
              {sec.paragraphs.map((p, idx) => (
                <p key={idx}>{p}</p>
              ))}
              {sec.formula && (
                <div className="public-formula-box">
                  <strong>Fórmula de referencia:</strong> <code>{sec.formula}</code>
                </div>
              )}
            </section>
          ))}

          {selectedGuide.faq?.length > 0 && (
            <section
              style={{ marginTop: 26, borderTop: "1px solid var(--border)", paddingTop: 18 }}
            >
              <h2>Preguntas Frecuentes (FAQ)</h2>
              {selectedGuide.faq.map((item) => (
                <div
                  key={item.q}
                  style={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    padding: "12px 14px",
                    marginBottom: 10,
                  }}
                >
                  <strong
                    style={{ display: "block", color: "var(--text-primary)", marginBottom: 4 }}
                  >
                    {item.q}
                  </strong>
                  <span style={{ fontSize: "0.9rem" }}>{item.a}</span>
                </div>
              ))}
            </section>
          )}
        </article>
      )}
    </section>
  );
}
