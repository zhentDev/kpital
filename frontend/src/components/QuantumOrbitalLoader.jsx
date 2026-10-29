import { useEffect, useRef, useState } from "react";
import { useTheme } from "../context/ThemeContext";

/**
 * Quantum Orbital States Definition: (n, l, m)
 * Sampled probability density clouds |ψ_nlm|^2
 */
const ORBITALS = [
  {
    name: "1s (Estado Fundamental)",
    formula: "n=1, l=0, m=0",
    colorA: "#ffd166",
    colorB: "#f77f00",
    energy: "-13.60 eV",
    sampler: (u1, u2, u3) => {
      // Exponential distribution for 1s: P(r) ~ r^2 e^(-2r)
      const r = -Math.log(1 - u1 * 0.99) * 0.9;
      const theta = Math.acos(2 * u2 - 1);
      const phi = 2 * Math.PI * u3;
      return [
        r * Math.sin(theta) * Math.cos(phi),
        r * Math.cos(theta),
        r * Math.sin(theta) * Math.sin(phi),
        1, // phase
      ];
    },
  },
  {
    name: "2s (Primer Nivel Excitado)",
    formula: "n=2, l=0, m=0",
    colorA: "#06d6a0",
    colorB: "#118ab2",
    energy: "-3.40 eV",
    sampler: (u1, u2, u3) => {
      // 2s has radial node: (2 - r) e^(-r/2). Two concentric shells
      const isInner = u1 < 0.25;
      const r = isInner ? 0.6 + u1 * 1.4 : 2.2 + u1 * 2.8;
      const theta = Math.acos(2 * u2 - 1);
      const phi = 2 * Math.PI * u3;
      return [
        r * Math.sin(theta) * Math.cos(phi),
        r * Math.cos(theta),
        r * Math.sin(theta) * Math.sin(phi),
        isInner ? 1 : -1,
      ];
    },
  },
  {
    name: "2p_z (Orbital Lobular)",
    formula: "n=2, l=1, m=0",
    colorA: "#00f5d4",
    colorB: "#7b2cbf",
    energy: "-3.40 eV",
    sampler: (u1, u2, u3) => {
      // 2p_z ~ z * e^(-r/2). Two lobes along Z (up and down)
      const r = (1.2 + u1 * 2.8);
      const sign = u2 > 0.5 ? 1 : -1;
      const cosTheta = sign * Math.sqrt(Math.abs(2 * u2 - 1));
      const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
      const phi = 2 * Math.PI * u3;
      return [
        r * sinTheta * Math.cos(phi) * 0.85,
        r * cosTheta * 1.3,
        r * sinTheta * Math.sin(phi) * 0.85,
        sign,
      ];
    },
  },
  {
    name: "3s (Nivel con Doble Nodo Radial)",
    formula: "n=3, l=0, m=0",
    colorA: "#ff7b00",
    colorB: "#ffd166",
    energy: "-1.51 eV",
    sampler: (u1, u2, u3) => {
      // 3s has two spherical radial nodes: 3 concentric spherical shells
      let r;
      let phase;
      if (u1 < 0.15) {
        r = 0.5 + u1 * 1.5; // inner shell
        phase = 1;
      } else if (u1 < 0.55) {
        r = 1.6 + (u1 - 0.15) * 2.8; // middle shell
        phase = -1;
      } else {
        r = 3.0 + (u1 - 0.55) * 2.4; // outer diffuse shell
        phase = 1;
      }
      const theta = Math.acos(2 * u2 - 1);
      const phi = 2 * Math.PI * u3;
      return [
        r * Math.sin(theta) * Math.cos(phi),
        r * Math.cos(theta),
        r * Math.sin(theta) * Math.sin(phi),
        phase,
      ];
    },
  },
  {
    name: "3p_z (Lóbulo con Capa Radial Interna)",
    formula: "n=3, l=1, m=0",
    colorA: "#06d6a0",
    colorB: "#a78bfa",
    energy: "-1.51 eV",
    sampler: (u1, u2, u3) => {
      // 3p has 1 radial node: inner small dumbbell + outer large dumbbell
      const isInner = u1 < 0.22;
      const r = isInner ? 0.7 + u1 * 2.2 : 2.2 + u1 * 2.6;
      const sign = u2 > 0.5 ? 1 : -1;
      const cosTheta = sign * Math.sqrt(Math.abs(2 * u2 - 1));
      const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
      const phi = 2 * Math.PI * u3;
      return [
        r * sinTheta * Math.cos(phi) * 0.8,
        r * cosTheta * 1.25,
        r * sinTheta * Math.sin(phi) * 0.8,
        isInner ? -sign : sign,
      ];
    },
  },
  {
    name: "3d_z² (Orbital Toroide)",
    formula: "n=3, l=2, m=0",
    colorA: "#ff006e",
    colorB: "#ffbe0b",
    energy: "-1.51 eV",
    sampler: (u1, u2, u3) => {
      // 3d_z^2 has two polar lobes along Z and a torus in xy plane
      const isRing = u1 < 0.45;
      if (isRing) {
        const ringR = 2.0 + u2 * 1.5;
        const ringPhi = 2 * Math.PI * u3;
        const ringZ = (Math.random() - 0.5) * 0.6;
        return [
          ringR * Math.cos(ringPhi),
          ringZ,
          ringR * Math.sin(ringPhi),
          -1,
        ];
      }
      const r = 1.4 + u2 * 3.2;
      const sign = u3 > 0.5 ? 1 : -1;
      const cosTheta = sign * Math.pow(Math.abs(2 * u3 - 1), 0.35);
      const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
      const phi = 2 * Math.PI * Math.random();
      return [
        r * sinTheta * Math.cos(phi) * 0.65,
        r * cosTheta * 1.4,
        r * sinTheta * Math.sin(phi) * 0.65,
        1,
      ];
    },
  },
  {
    name: "3d_xy (Orbital Trébol Cuádruple)",
    formula: "n=3, l=2, m=2",
    colorA: "#3a86ff",
    colorB: "#ffbe0b",
    energy: "-1.51 eV",
    sampler: (u1, u2, u3) => {
      // Cloverleaf: 4 lobes in xy plane: sin^2(2*phi)
      const r = 1.2 + u1 * 3.0;
      const lobe = Math.floor(u2 * 4);
      const lobeCenter = (lobe * Math.PI) / 2 + Math.PI / 4;
      const dPhi = (Math.random() - 0.5) * 0.65;
      const phi = lobeCenter + dPhi;
      const z = (Math.random() - 0.5) * 0.8;
      const sign = lobe % 2 === 0 ? 1 : -1;
      return [
        r * Math.cos(phi) * 1.2,
        z,
        r * Math.sin(phi) * 1.2,
        sign,
      ];
    },
  },
  {
    name: "4d_xz (Lóbulos Diagonales 3D)",
    formula: "n=4, l=2, m=1",
    colorA: "#38bdf8",
    colorB: "#ec4899",
    energy: "-0.85 eV",
    sampler: (u1, u2, u3) => {
      // 4 lobes pointing along x=z and x=-z diagonals
      const r = 1.3 + u1 * 3.0;
      const quadrant = Math.floor(u2 * 4);
      const angle = (quadrant * Math.PI) / 2 + Math.PI / 4 + (Math.random() - 0.5) * 0.5;
      const y = (u3 - 0.5) * 0.7;
      const sign = quadrant % 2 === 0 ? 1 : -1;
      return [
        r * Math.cos(angle) * 1.15,
        y,
        r * Math.sin(angle) * 1.15,
        sign,
      ];
    },
  },
  {
    name: "4f_xyz (Octaedro Cúbico 8 Lóbulos)",
    formula: "n=4, l=3, m=2",
    colorA: "#f43f5e",
    colorB: "#8b5cf6",
    energy: "-0.85 eV",
    sampler: (u1, u2, u3) => {
      // 8 lobes located in each of the 8 octants: xyz > 0, etc.
      const r = 1.4 + u1 * 2.8;
      const octant = Math.floor(u2 * 8);
      const sx = (octant & 1) ? 1 : -1;
      const sy = (octant & 2) ? 1 : -1;
      const sz = (octant & 4) ? 1 : -1;
      const spread = 0.55;
      const dx = (Math.random() - 0.5) * spread;
      const dy = (Math.random() - 0.5) * spread;
      const dz = (Math.random() - 0.5) * spread;
      const vx = sx + dx;
      const vy = sy + dy;
      const vz = sz + dz;
      const norm = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
      const sign = (sx * sy * sz) > 0 ? 1 : -1;
      return [
        (vx / norm) * r * 1.25,
        (vy / norm) * r * 1.25,
        (vz / norm) * r * 1.25,
        sign,
      ];
    },
  },
  {
    name: "4f (Roseta Cuántica)",
    formula: "n=4, l=3, m=1",
    colorA: "#c77dff",
    colorB: "#00b4d8",
    energy: "-0.85 eV",
    sampler: (u1, u2, u3) => {
      // 6 rosette lobes in alternating directions
      const r = 1.4 + u1 * 3.2;
      const lobe = Math.floor(u2 * 6);
      const phi = (lobe * Math.PI) / 3 + (Math.random() - 0.5) * 0.5;
      const theta = Math.PI / 2 + (u3 > 0.5 ? 0.45 : -0.45) + (Math.random() - 0.5) * 0.3;
      const sign = (lobe + (u3 > 0.5 ? 1 : 0)) % 2 === 0 ? 1 : -1;
      return [
        r * Math.sin(theta) * Math.cos(phi) * 1.1,
        r * Math.cos(theta) * 1.2,
        r * Math.sin(theta) * Math.sin(phi) * 1.1,
        sign,
      ];
    },
  },
  {
    name: "5g_z⁴ (Hexadecapolo Cuántico Exótico)",
    formula: "n=5, l=4, m=0",
    colorA: "#00f0ff",
    colorB: "#ff007f",
    energy: "-0.54 eV",
    sampler: (u1, u2, u3) => {
      // 5g state has multi-toroidal ring structure with 2 polar lobes and 2 concentric rings
      const mode = Math.floor(u1 * 3);
      if (mode === 0) {
        // High-latitude torus rings
        const ringR = 1.6 + u2 * 1.2;
        const ringPhi = 2 * Math.PI * u3;
        const ringZ = (u3 > 0.5 ? 1 : -1) * (0.9 + Math.random() * 0.4);
        return [ringR * Math.cos(ringPhi), ringZ, ringR * Math.sin(ringPhi), -1];
      } else if (mode === 1) {
        // Outer equatorial torus
        const ringR = 2.8 + u2 * 1.5;
        const ringPhi = 2 * Math.PI * u3;
        const ringZ = (Math.random() - 0.5) * 0.4;
        return [ringR * Math.cos(ringPhi), ringZ, ringR * Math.sin(ringPhi), 1];
      } else {
        // Extreme polar sharp lobes
        const r = 1.8 + u2 * 2.8;
        const sign = u3 > 0.5 ? 1 : -1;
        const cosTheta = sign * Math.pow(Math.abs(2 * u3 - 1), 0.2);
        const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
        const phi = 2 * Math.PI * Math.random();
        return [
          r * sinTheta * Math.cos(phi) * 0.5,
          r * cosTheta * 1.45,
          r * sinTheta * Math.sin(phi) * 0.5,
          1,
        ];
      }
    },
  },
  {
    name: "sp³ Híbrido (Superposición Coherente)",
    formula: "|ψ⟩ = ½(|2s⟩ + |2px⟩ + |2py⟩ + |2pz⟩)",
    colorA: "#10b981",
    colorB: "#f59e0b",
    energy: "Enlace Tetraédrico",
    sampler: (u1, u2, u3) => {
      // 4 directional tetrahedral lobes pointing to vertices of a regular tetrahedron
      const r = 1.0 + u1 * 3.2;
      const lobe = Math.floor(u2 * 4);
      // Vertices of tetrahedron
      const dirs = [
        [1, 1, 1],
        [-1, -1, 1],
        [-1, 1, -1],
        [1, -1, -1],
      ];
      const d = dirs[lobe];
      const norm = Math.sqrt(3);
      const spread = 0.5;
      const vx = d[0] / norm + (Math.random() - 0.5) * spread;
      const vy = d[1] / norm + (Math.random() - 0.5) * spread;
      const vz = d[2] / norm + (Math.random() - 0.5) * spread;
      const vLen = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
      return [
        (vx / vLen) * r * 1.25,
        (vy / vLen) * r * 1.25,
        (vz / vLen) * r * 1.25,
        lobe % 2 === 0 ? 1 : -1,
      ];
    },
  },
];

const NUM_PARTICLES = 1400;

export default function QuantumOrbitalLoader({
  message = "Cargando simulación cuántica…",
  height = 360,
  width = "100%",
  submessage = null,
  compact = false,
  showHud = true,
  style = {},
  cycleDuration = 1.8,
}) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [currentInfo, setCurrentInfo] = useState({
    from: ORBITALS[0],
    to: ORBITALS[1],
    progress: 0,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId;
    let isRunning = true;
    let canvasWidth = canvas.clientWidth || (typeof width === "number" ? width : 600);
    let canvasHeight = canvas.clientHeight || height || 360;

    // Handle canvas dimensions safely using ResizeObserver
    const updateDimensions = (w, h) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const minW = compact ? 50 : 200;
      const minH = compact ? 50 : 200;
      const safeW = Math.max(minW, Math.floor(w || containerRef.current?.clientWidth || (typeof width === 'number' ? width : 600)));
      const safeH = Math.max(minH, Math.floor(h || containerRef.current?.clientHeight || (typeof height === 'number' ? height : 360)));
      canvasWidth = safeW;
      canvasHeight = safeH;

      if (canvas) {
        const targetW = Math.floor(safeW * dpr);
        const targetH = Math.floor(safeH * dpr);
        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW;
          canvas.height = targetH;
        }
      }
    };

    updateDimensions(containerRef.current?.clientWidth, containerRef.current?.clientHeight);

    let resizeObserver = null;
    const observedEl = containerRef.current || canvas;
    if (typeof ResizeObserver !== "undefined" && observedEl) {
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width: w, height: h } = entry.contentRect;
          if (w > 0 && h > 0) {
            updateDimensions(w, h);
          }
        }
      });
      resizeObserver.observe(observedEl);
    }

    // Precompute cloud positions for each orbital state
    const statesData = ORBITALS.map((orb) => {
      const pts = [];
      for (let i = 0; i < NUM_PARTICLES; i++) {
        const u1 = Math.random();
        const u2 = Math.random();
        const u3 = Math.random();
        const [x, y, z, phase] = orb.sampler(u1, u2, u3);
        pts.push({ x, y, z, phase });
      }
      return pts;
    });

    let startTime = performance.now();
    let rotY = 0;
    let rotX = 0.25;
    let lastCycleIndex = -1;

    const render = (now) => {
      if (!isRunning) return;

      const elapsedSec = (now - startTime) / 1000;
      const CYCLE_DURATION = cycleDuration || 1.8;
      const totalStates = ORBITALS.length || 1;
      const rawCycle = Math.floor(elapsedSec / CYCLE_DURATION);
      const cycleIndex = Math.max(0, isNaN(rawCycle) ? 0 : rawCycle);
      const fromIdx = Math.abs(cycleIndex) % totalStates;
      const toIdx = (Math.abs(cycleIndex) + 1) % totalStates;
      const t = (elapsedSec % CYCLE_DURATION) / CYCLE_DURATION;

      // Smooth cosine easing
      const ease = 0.5 - 0.5 * Math.cos(t * Math.PI);

      const fromOrb = ORBITALS[fromIdx] || ORBITALS[0];
      const toOrb = ORBITALS[toIdx] || ORBITALS[1] || ORBITALS[0];

      // Only trigger React re-renders when orbital transition step changes (zero re-render spam)
      if (cycleIndex !== lastCycleIndex) {
        lastCycleIndex = cycleIndex;
        setCurrentInfo({
          from: fromOrb,
          to: toOrb,
          progress: 0,
        });
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvasWidth;
      const currentH = canvasHeight;

      // Reset canvas context transformation and blend state cleanly
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1.0;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Apply DPR scaling
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Rotation angles
      rotY += 0.012;
      rotX = 0.35 + Math.sin(elapsedSec * 0.8) * 0.1;

      const cx = width / 2;
      // Position center slightly above midpoint to give generous room for bottom HUD (or center vertically in compact mode)
      const cy = compact ? currentH * 0.5 : currentH * 0.44;
      // Scale carefully: max orbital radius is ~4.5
      const baseScale = compact
        ? Math.max(8, Math.min(width * 0.11, currentH * 0.11))
        : Math.max(30, Math.min(width * 0.095, currentH * 0.092));
      const fov = compact ? 260 : 380;

      const fromPts = statesData[fromIdx] || statesData[0];
      const toPts = statesData[toIdx] || statesData[0];
      const fromColor = fromOrb.colorA || "#ffd166";
      const toColor = toOrb.colorA || "#06d6a0";

      // Blending mode: lighter in dark mode for additive neon glow, multiply/source-over in light mode
      ctx.globalCompositeOperation = isLight ? "multiply" : "lighter";

      // Render quantum core / nucleus glow
      const nucleusPulse = 1 + Math.sin(elapsedSec * 4) * 0.2;
      const coreR = compact
        ? Math.max(6, 12 * nucleusPulse)
        : Math.max(15, 28 * nucleusPulse);
      const radGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
      if (isLight) {
        radGrad.addColorStop(0, "rgba(2, 132, 199, 0.95)");
        radGrad.addColorStop(0.35, "rgba(56, 189, 248, 0.5)");
        radGrad.addColorStop(0.75, "rgba(168, 85, 247, 0.2)");
        radGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
      } else {
        radGrad.addColorStop(0, "rgba(255, 255, 255, 0.95)");
        radGrad.addColorStop(0.25, "rgba(0, 229, 255, 0.7)");
        radGrad.addColorStop(0.7, "rgba(168, 85, 247, 0.25)");
        radGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
      }
      ctx.fillStyle = radGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.fill();

      // Project and render all particles
      for (let i = 0; i < NUM_PARTICLES; i++) {
        const p1 = fromPts[i];
        const p2 = toPts[i];

        // Quantum transition flutter: micro-vibration during jump
        const flutter = Math.sin(now * 0.01 + i) * Math.sin(t * Math.PI) * 0.15;

        const x = p1.x * (1 - ease) + p2.x * ease + flutter;
        const y = p1.y * (1 - ease) + p2.y * ease + flutter;
        const z = p1.z * (1 - ease) + p2.z * ease + flutter;

        // 3D rotation around Y and X
        const cosY = Math.cos(rotY);
        const sinY = Math.sin(rotY);
        const xRot = x * cosY - z * sinY;
        const zRot = x * sinY + z * cosY;

        const cosX = Math.cos(rotX);
        const sinX = Math.sin(rotX);
        const yRot = y * cosX - zRot * sinX;
        const zFinal = y * sinX + zRot * cosX;

        // Perspective projection with safe denominator
        const denom = Math.max(30, fov + zFinal * baseScale * 0.7);
        const pScale = fov / denom;
        const screenX = cx + xRot * baseScale * pScale;
        const screenY = cy + yRot * baseScale * pScale;

        // Particle size & depth fade
        const depthAlpha = Math.max(0.2, Math.min(0.95, (zFinal + 4) / 8));
        const radius = Math.max(1.1, 1.8 * pScale);

        // Phase color blend with contrast adjustment in light mode
        ctx.fillStyle = i % 2 === 0 ? fromColor : toColor;
        ctx.globalAlpha = isLight ? Math.min(1.0, depthAlpha * 1.1) : depthAlpha * 0.85;

        ctx.beginPath();
        ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      isRunning = false;
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [height, cycleDuration, isLight]);

  const bgStyle = isLight
    ? "radial-gradient(ellipse at center, #ffffff 0%, #f1f5f9 100%)"
    : "radial-gradient(ellipse at center, rgba(13, 17, 23, 0.95) 0%, rgba(5, 7, 12, 0.98) 100%)";

  const borderColor = isLight ? "rgba(2, 132, 199, 0.25)" : "rgba(0, 229, 255, 0.2)";
  const shadowColor = isLight
    ? "inset 0 0 25px rgba(2, 132, 199, 0.06), 0 4px 16px rgba(0, 0, 0, 0.06)"
    : compact
    ? "inset 0 0 15px rgba(0, 229, 255, 0.1), 0 4px 12px rgba(0,0,0,0.3)"
    : "inset 0 0 40px rgba(0, 229, 255, 0.05)";

  const hudBg = isLight ? "rgba(255, 255, 255, 0.88)" : "rgba(10, 15, 25, 0.8)";
  const hudBorder = isLight ? "1px solid rgba(2, 132, 199, 0.25)" : "1px solid rgba(0, 229, 255, 0.25)";
  const hudShadow = isLight ? "0 4px 15px rgba(0, 0, 0, 0.08)" : "0 4px 15px rgba(0, 0, 0, 0.4)";
  const titleColor = isLight ? "#0f172a" : "#e2e8f0";
  const subTextColor = isLight ? "#475569" : "var(--text-muted)";

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: width,
        minHeight: typeof height === "number" ? height : 280,
        height: height === "100%" ? "100%" : (height || "100%"),
        flex: 1,
        background: bgStyle,
        borderRadius: compact ? "12px" : "var(--radius-lg, 12px)",
        overflow: "hidden",
        border: `1px solid ${borderColor}`,
        boxShadow: shadowColor,
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          display: "block",
          pointerEvents: "none",
        }}
      />

      {/* Futuristic HUD overlay */}
      {showHud && (
        <div
          style={{
            position: "absolute",
            bottom: compact ? 6 : 16,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: compact ? 2 : 6,
            background: hudBg,
            backdropFilter: "blur(10px)",
            padding: compact ? "4px 8px" : "8px 18px",
            borderRadius: compact ? "10px" : "20px",
            border: hudBorder,
            boxShadow: hudShadow,
            pointerEvents: "none",
            maxWidth: "92%",
          }}
        >
          {compact ? (
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.68rem" }}>
              <span
                style={{
                  display: "inline-block",
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  backgroundColor: isLight ? "#0284c7" : "#00e5ff",
                  boxShadow: isLight ? "0 0 6px #0284c7" : "0 0 6px #00e5ff",
                }}
              />
              <span style={{ color: currentInfo?.to?.colorA || (isLight ? "#0284c7" : "#00e5ff"), fontWeight: 700, fontFamily: "monospace" }}>
                {currentInfo?.to?.name?.split(" ")[0]}
              </span>
              <span style={{ color: isLight ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.4)" }}>•</span>
              <span style={{ color: subTextColor, fontSize: "0.62rem" }}>{currentInfo?.to?.energy}</span>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.82rem" }}>
                <span
                  style={{
                    display: "inline-block",
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor: isLight ? "#0284c7" : "#00e5ff",
                    boxShadow: isLight ? "0 0 8px #0284c7" : "0 0 8px #00e5ff",
                    animation: "pulse 1s infinite alternate",
                  }}
                />
                <span style={{ color: titleColor, fontWeight: 700, letterSpacing: "0.02em" }}>
                  {message}
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.72rem", color: subTextColor, flexWrap: "wrap", justifyContent: "center" }}>
                <span style={{ color: currentInfo?.from?.colorA || "#d97706", fontFamily: "var(--font-mono, monospace)", fontWeight: 700 }}>
                  {currentInfo?.from?.name || "1s"} [{currentInfo?.from?.energy || "-13.6 eV"}]
                </span>
                <span style={{ color: isLight ? "#0284c7" : "#00e5ff", fontWeight: 800 }}>➔</span>
                <span style={{ color: currentInfo?.to?.colorA || "#059669", fontFamily: "var(--font-mono, monospace)", fontWeight: 700 }}>
                  {currentInfo?.to?.name || "2s"} [{currentInfo?.to?.energy || "-3.4 eV"}]
                </span>
                <span style={{ color: isLight ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.4)" }}>•</span>
                <span style={{ color: subTextColor }}>Salto Cuántico de Schrödinger</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}