import React, { useState } from "react";
import toast from "react-hot-toast";
import { LEGAL_DOCS, SITE_INFO } from "../../data/publicGuidesData";

export function PublicInfoDocument({ docKey }) {
  const doc = LEGAL_DOCS[docKey];
  if (!doc) return null;

  return (
    <article className="public-card public-article">
      <h1 style={{ margin: "0 0 8px", fontSize: "1.6rem", color: "var(--text-primary)" }}>
        {doc.title}
      </h1>
      {(doc.subtitle || doc.updated) && (
        <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginBottom: 18 }}>
          {doc.subtitle || doc.updated}
        </p>
      )}
      {doc.sections.map((sec) => (
        <section key={sec.heading} style={{ marginBottom: 16 }}>
          <h2>{sec.heading}</h2>
          {sec.body.map((paragraph, idx) => (
            <p key={idx}>{paragraph}</p>
          ))}
        </section>
      ))}
    </article>
  );
}

export function PublicContactView() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState("Consulta sobre calculadoras o tasas");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) return;
    setSubmitted(true);
    toast.success("Mensaje preparado correctamente en la plataforma.");
  };

  return (
    <div className="public-grid-2">
      <section className="public-card public-article">
        <h1 style={{ margin: "0 0 8px", fontSize: "1.55rem", color: "var(--text-primary)" }}>
          Contacto y Soporte Editorial
        </h1>
        <p>
          ¿Encontraste un cambio reciente en tasas de CDTs en Colombia, quieres sugerir una nueva
          calculadora o necesitas soporte relacionado con privacidad, términos de uso o tu cuenta en
          Kpital?
        </p>
        <p>
          Escríbenos mediante el formulario adjunto o consulta nuestros documentos oficiales de
          transparencia y código abierto.
        </p>

        <div className="public-formula-box">
          <strong>Canales del Publicador ({SITE_INFO.publisher}):</strong>
          <ul style={{ margin: "8px 0 0 18px", padding: 0 }}>
            <li>
              Sitio oficial: <a href={SITE_INFO.domain}>{SITE_INFO.domain}</a>
            </li>
            <li>
              Repositorio y reportes técnicos:{" "}
              <a href={SITE_INFO.githubUrl} target="_blank" rel="noopener noreferrer">
                {SITE_INFO.githubUrl}
              </a>
            </li>
            <li>
              Versión estática directa: <a href="./contacto.html">contacto.html</a>
            </li>
          </ul>
        </div>
      </section>

      <section className="public-card">
        <h2 style={{ margin: "0 0 12px", fontSize: "1.15rem" }}>Enviar un Mensaje</h2>
        {submitted ? (
          <div className="public-formula-box" style={{ borderLeftColor: "var(--gain)" }}>
            <strong>¡Gracias por tu mensaje, {name}!</strong>
            <p style={{ margin: "8px 0 12px" }}>
              Hemos registrado los detalles de tu consulta sobre <em>{topic}</em>. Si deseas además
              abrir un ticket técnico directo en el repositorio oficial, puedes hacerlo aquí:
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a
                href={`${SITE_INFO.githubUrl}/issues/new?title=${encodeURIComponent(`[Contacto Web] ${topic}`)}&body=${encodeURIComponent(`De: ${name} (${email})\n\n${message}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="public-login-btn"
                style={{ textDecoration: "none" }}
              >
                Abrir ticket directo en GitHub ↗
              </a>
              <button
                type="button"
                className="public-theme-btn"
                onClick={() => {
                  setSubmitted(false);
                  setMessage("");
                }}
              >
                Enviar otro mensaje
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="public-field">
              <label htmlFor="c-name">Nombre completo</label>
              <input
                id="c-name"
                type="text"
                required
                className="public-input"
                placeholder="Tu nombre"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="public-field">
              <label htmlFor="c-email">Correo electrónico de respuesta</label>
              <input
                id="c-email"
                type="email"
                required
                className="public-input"
                placeholder="tu@correo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="public-field">
              <label htmlFor="c-topic">Motivo de contacto</label>
              <select
                id="c-topic"
                className="public-select"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              >
                <option value="Consulta sobre calculadoras o tasas">
                  Consulta sobre calculadoras o tasas CDT
                </option>
                <option value="Sugerencia editorial o corrección de guía">
                  Sugerencia editorial o corrección de guía
                </option>
                <option value="Privacidad, datos personales o AdSense">
                  Privacidad, datos personales o AdSense
                </option>
                <option value="Soporte de cuenta en Terminal Privada">
                  Soporte de cuenta en Terminal Privada
                </option>
              </select>
            </div>
            <div className="public-field">
              <label htmlFor="c-msg">Mensaje</label>
              <textarea
                id="c-msg"
                required
                rows={4}
                className="public-textarea"
                placeholder="Cuéntanos en qué te podemos ayudar..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
            <button type="submit" className="public-login-btn">
              Enviar Consulta
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
