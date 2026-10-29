---
trigger: always_on
---

# Directriz de Diseño: Soporte Obligatorio Dual (Modo Claro & Modo Oscuro)

Este proyecto cuenta con un sistema de diseño dinámico dual con soporte activo para **Modo Claro (Light Theme)** y **Modo Oscuro (Dark Theme)** gestionado por `ThemeContext` y el atributo CSS `[data-theme="light"]`.

## Reglas Obligatorias para Cualquier Nuevo Componente, Modal o Vista:
1. **Nunca usar colores o fondos estáticos oscuros sin alternativa clara:**
   - Evitar `background: #111827`, `#0d1117` o textos `color: #fff` a menos que se adapten con `isLight` o variables CSS.
   - Usar variables CSS nativas del proyecto cuando estén disponibles:
     - `var(--bg-primary)`
     - `var(--bg-surface)`
     - `var(--bg-card)`
     - `var(--text-primary)`
     - `var(--text-secondary)`
     - `var(--text-muted)`
     - `var(--border)`
     - `var(--accent-primary)`
2. **Soporte condicional en JSX (`isLight`):**
   - Cuando se usen estilos inline o canvas (`lightweight-charts`), inyectar siempre `useTheme()`:
     ```jsx
     const { theme } = useTheme();
     const isLight = theme === "light";
     ```
   - Aplicar condicionales claros para contrastes adecuados:
     - Fondos: `isLight ? "#ffffff" : "rgba(13, 18, 38, 0.75)"`
     - Textos principales: `isLight ? "#0f172a" : "#f8fafc"`
     - Bordes: `isLight ? "1px solid rgba(0, 0, 0, 0.1)" : "1px solid rgba(255, 255, 255, 0.08)"`
3. **Reglas en archivos CSS:**
   - Todo selector nuevo con estilos de color o sombra debe incluir su variante bajo `[data-theme="light"]`:
     ```css
     .mi-componente {
       background: rgba(17, 24, 41, 0.8);
       color: #f1f5f9;
     }
     [data-theme="light"] .mi-componente {
       background: #ffffff;
       color: #0f172a;
       border-color: rgba(0, 0, 0, 0.1);
       box-shadow: 0 4px 16px rgba(0, 0, 0, 0.05);
     }
     ```
4. **Verificación de Contraste:**
   - Ningún texto secundario o badge debe volverse invisible en modo diurno (blanco sobre blanco) ni en modo nocturno (gris oscuro sobre negro).
