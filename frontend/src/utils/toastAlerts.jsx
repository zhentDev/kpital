import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";

/**
 * Modern In-App Modal Dialog Portal (Replaces native browser window.confirm and floating toasts).
 * Mounts directly into document.body with zIndex: 999999999 so it can NEVER be occluded
 * by any modal, header or backdrop.
 * Matches Kpital Design System with full Dark & Light theme support.
 */

function ConfirmDialog({ message, onClose }) {
  const [isLight, setIsLight] = useState(() => {
    return typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "light";
  });

  const confirmBtnRef = useRef(null);

  useEffect(() => {
    // Focus confirmation button immediately
    if (confirmBtnRef.current) {
      confirmBtnRef.current.focus();
    }

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        onClose(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose(false);
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999999999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        background: "rgba(5, 10, 25, 0.72)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        animation: "kpitalFadeIn 0.18s ease-out",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{
          width: "100%",
          maxWidth: 440,
          background: isLight ? "#ffffff" : "#0f172a",
          color: isLight ? "#0f172a" : "#f8fafc",
          border: isLight ? "1px solid rgba(0, 0, 0, 0.12)" : "1px solid rgba(0, 212, 255, 0.35)",
          borderRadius: 16,
          padding: "24px 22px 20px 22px",
          boxShadow: isLight
            ? "0 25px 60px rgba(0, 0, 0, 0.22), 0 0 1px rgba(0, 0, 0, 0.1)"
            : "0 25px 65px rgba(0, 0, 0, 0.85), 0 0 25px rgba(0, 212, 255, 0.15)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          animation: "kpitalScaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: isLight ? "rgba(2, 132, 199, 0.1)" : "rgba(0, 212, 255, 0.12)",
              color: isLight ? "#0284c7" : "#00d4ff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.2rem",
              flexShrink: 0,
            }}
          >
            🤝
          </div>
          <div style={{ flex: 1 }}>
            <h4
              style={{
                margin: "0 0 6px 0",
                fontSize: "0.96rem",
                fontWeight: 700,
                color: isLight ? "#0f172a" : "#f8fafc",
              }}
            >
              Confirmar Acción
            </h4>
            <div
              style={{
                fontSize: "0.86rem",
                lineHeight: 1.5,
                color: isLight ? "#334155" : "#cbd5e1",
                whiteSpace: "pre-line",
                wordBreak: "break-word",
              }}
            >
              {message}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
          <button
            type="button"
            onClick={() => onClose(false)}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              fontSize: "0.8rem",
              fontWeight: 700,
              cursor: "pointer",
              background: isLight ? "#f1f5f9" : "rgba(255, 255, 255, 0.08)",
              color: isLight ? "#475569" : "#94a3b8",
              border: isLight ? "1px solid #cbd5e1" : "1px solid rgba(255, 255, 255, 0.12)",
              transition: "all 0.15s ease",
            }}
          >
            Cancelar
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={() => onClose(true)}
            style={{
              padding: "8px 20px",
              borderRadius: 8,
              fontSize: "0.8rem",
              fontWeight: 800,
              cursor: "pointer",
              background: "linear-gradient(135deg, #00d4ff 0%, #0284c7 100%)",
              color: "#0a0f1d",
              border: "none",
              boxShadow: "0 3px 12px rgba(0, 212, 255, 0.35)",
              transition: "all 0.15s ease",
            }}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

function PromptDialog({ message, defaultValue = "", onClose }) {
  const [val, setVal] = useState(defaultValue);
  const [isLight, setIsLight] = useState(() => {
    return typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "light";
  });

  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onClose(val);
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose(null);
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999999999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        background: "rgba(5, 10, 25, 0.72)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        animation: "kpitalFadeIn 0.18s ease-out",
      }}
    >
      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        style={{
          width: "100%",
          maxWidth: 440,
          background: isLight ? "#ffffff" : "#0f172a",
          color: isLight ? "#0f172a" : "#f8fafc",
          border: isLight ? "1px solid rgba(0, 0, 0, 0.12)" : "1px solid rgba(0, 212, 255, 0.35)",
          borderRadius: 16,
          padding: "24px 22px 20px 22px",
          boxShadow: isLight
            ? "0 25px 60px rgba(0, 0, 0, 0.22), 0 0 1px rgba(0, 0, 0, 0.1)"
            : "0 25px 65px rgba(0, 0, 0, 0.85), 0 0 25px rgba(0, 212, 255, 0.15)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          animation: "kpitalScaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: isLight ? "rgba(2, 132, 199, 0.1)" : "rgba(0, 212, 255, 0.12)",
              color: isLight ? "#0284c7" : "#00d4ff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.2rem",
              flexShrink: 0,
            }}
          >
            ✏️
          </div>
          <div style={{ flex: 1 }}>
            <h4
              style={{
                margin: "0 0 6px 0",
                fontSize: "0.96rem",
                fontWeight: 700,
                color: isLight ? "#0f172a" : "#f8fafc",
              }}
            >
              Ingresar Información
            </h4>
            <div
              style={{
                fontSize: "0.86rem",
                lineHeight: 1.5,
                color: isLight ? "#334155" : "#cbd5e1",
                whiteSpace: "pre-line",
              }}
            >
              {message}
            </div>
          </div>
        </div>

        <input
          ref={inputRef}
          type="text"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          style={{
            width: "100%",
            boxSizing: "border-box",
            background: isLight ? "#f8fafc" : "rgba(0, 0, 0, 0.35)",
            color: isLight ? "#0f172a" : "#f8fafc",
            border: isLight ? "1px solid #cbd5e1" : "1px solid rgba(255, 255, 255, 0.16)",
            borderRadius: 8,
            padding: "9px 12px",
            fontSize: "0.86rem",
            outline: "none",
          }}
        />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
          <button
            type="button"
            onClick={() => onClose(null)}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              fontSize: "0.8rem",
              fontWeight: 700,
              cursor: "pointer",
              background: isLight ? "#f1f5f9" : "rgba(255, 255, 255, 0.08)",
              color: isLight ? "#475569" : "#94a3b8",
              border: isLight ? "1px solid #cbd5e1" : "1px solid rgba(255, 255, 255, 0.12)",
            }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            style={{
              padding: "8px 20px",
              borderRadius: 8,
              fontSize: "0.8rem",
              fontWeight: 800,
              cursor: "pointer",
              background: "linear-gradient(135deg, #00d4ff 0%, #0284c7 100%)",
              color: "#0a0f1d",
              border: "none",
              boxShadow: "0 3px 12px rgba(0, 212, 255, 0.35)",
            }}
          >
            Guardar
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * Modern In-App Modal Dialog Confirmation (Replaces native browser window.confirm).
 * Returns a Promise that resolves to true (confirmed) or false (cancelled).
 */
export const toastConfirm = (message) => {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(false);
      return;
    }

    const container = document.createElement("div");
    container.setAttribute("data-kpital-dialog-root", "true");
    document.body.appendChild(container);

    const root = createRoot(container);

    const cleanup = (result) => {
      try {
        root.unmount();
      } catch (err) {
        console.error("Error unmounting confirm root:", err);
      }
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
      resolve(result);
    };

    root.render(<ConfirmDialog message={message} onClose={cleanup} />);
  });
};

/**
 * Modern In-App Modal Dialog Prompt (Replaces native browser window.prompt).
 * Returns a Promise that resolves to string (value) or null (cancelled).
 */
export const toastPrompt = (message, defaultValue = "") => {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(null);
      return;
    }

    const container = document.createElement("div");
    container.setAttribute("data-kpital-dialog-root", "true");
    document.body.appendChild(container);

    const root = createRoot(container);

    const cleanup = (result) => {
      try {
        root.unmount();
      } catch (err) {
        console.error("Error unmounting prompt root:", err);
      }
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
      resolve(result);
    };

    root.render(<PromptDialog message={message} defaultValue={defaultValue} onClose={cleanup} />);
  });
};
