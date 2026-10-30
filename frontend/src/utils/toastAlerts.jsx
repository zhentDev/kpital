import React from "react";
import toast from "react-hot-toast";

/**
 * Modern In-App Toast Confirmation Dialog (Replaces native browser window.confirm)
 * Matches Kpital Design System with full Dark & Light theme support.
 */
export const toastConfirm = (message) => {
  return new Promise((resolve) => {
    toast(
      (t) => {
        const isLight = typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "light";
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 260, maxWidth: 360 }}>
            <div style={{ fontSize: "0.86rem", fontWeight: 600, color: isLight ? "#0f172a" : "#f8fafc", lineHeight: 1.45, whiteSpace: "pre-line" }}>
              {message}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => {
                  toast.dismiss(t.id);
                  resolve(false);
                }}
                style={{
                  background: isLight ? "#f1f5f9" : "rgba(255, 255, 255, 0.08)",
                  color: isLight ? "#475569" : "#94a3b8",
                  border: isLight ? "1px solid #cbd5e1" : "1px solid rgba(255, 255, 255, 0.12)",
                  borderRadius: 6,
                  padding: "5px 12px",
                  fontSize: "0.76rem",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  toast.dismiss(t.id);
                  resolve(true);
                }}
                style={{
                  background: "#00d4ff",
                  color: "#0a0f1d",
                  border: "none",
                  borderRadius: 6,
                  padding: "5px 14px",
                  fontSize: "0.76rem",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Confirmar
              </button>
            </div>
          </div>
        );
      },
      {
        duration: 20000,
        position: "top-center",
        style: {
          background: typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "light" ? "#ffffff" : "#0f172a",
          border: "1px solid rgba(0, 212, 255, 0.4)",
          boxShadow: "0 10px 30px rgba(0, 0, 0, 0.35)",
          borderRadius: 12,
          padding: "12px 16px",
        },
      }
    );
  });
};

/**
 * Modern In-App Toast Prompt Dialog (Replaces native browser window.prompt)
 */
export const toastPrompt = (message, defaultValue = "") => {
  return new Promise((resolve) => {
    let inputVal = defaultValue;
    toast(
      (t) => {
        const isLight = typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "light";
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 280, maxWidth: 360 }}>
            <div style={{ fontSize: "0.86rem", fontWeight: 600, color: isLight ? "#0f172a" : "#f8fafc", lineHeight: 1.45 }}>
              {message}
            </div>
            <input
              type="text"
              defaultValue={defaultValue}
              onChange={(e) => { inputVal = e.target.value; }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  toast.dismiss(t.id);
                  resolve(inputVal);
                }
              }}
              autoFocus
              style={{
                width: "100%",
                background: isLight ? "#f8fafc" : "rgba(0,0,0,0.3)",
                color: isLight ? "#0f172a" : "#f8fafc",
                border: isLight ? "1px solid #cbd5e1" : "1px solid rgba(255,255,255,0.15)",
                borderRadius: 6,
                padding: "7px 10px",
                fontSize: "0.82rem",
                outline: "none",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => {
                  toast.dismiss(t.id);
                  resolve(null);
                }}
                style={{
                  background: isLight ? "#f1f5f9" : "rgba(255, 255, 255, 0.08)",
                  color: isLight ? "#475569" : "#94a3b8",
                  border: isLight ? "1px solid #cbd5e1" : "1px solid rgba(255, 255, 255, 0.12)",
                  borderRadius: 6,
                  padding: "5px 12px",
                  fontSize: "0.76rem",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  toast.dismiss(t.id);
                  resolve(inputVal);
                }}
                style={{
                  background: "#00d4ff",
                  color: "#0a0f1d",
                  border: "none",
                  borderRadius: 6,
                  padding: "5px 14px",
                  fontSize: "0.76rem",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Guardar
              </button>
            </div>
          </div>
        );
      },
      {
        duration: 30000,
        position: "top-center",
        style: {
          background: typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "light" ? "#ffffff" : "#0f172a",
          border: "1px solid rgba(0, 212, 255, 0.4)",
          boxShadow: "0 10px 30px rgba(0, 0, 0, 0.35)",
          borderRadius: 12,
          padding: "12px 16px",
        },
      }
    );
  });
};
