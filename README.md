# ◈ Titanes Tech — Portfolio Tracker

> Simula tu cartera de acciones tecnológicas como un ETF de igual peso.
> Compara contra S&P500 y NASDAQ. Modo histórico + modo live en tiempo real.

## Stack

| Capa | Tech | Por qué |
|------|------|---------|
| Frontend | React + Vite + **Bun** (⚡) | UI premium, hot-reload instantáneo |
| Linter/Format (Frontend) | **Biome** (Rust🦀) | Formateo y linter unificado ultra-rápido |
| Charts | TradingView Lightweight Charts | Pro-grade, el mismo de TradingView |
| Estado | Zustand | Ligero, persiste en localStorage |
| Backend | FastAPI | Async, auto-docs en /docs |
| Data engine | **Polars** (Rust🦀) | 5-10x más rápido que Pandas |
| Market data | yfinance | Gratis, sin API key |
| Python Tooling | **uv** + **ruff** (Rust🦀) | Gestión y linting instantáneo |

---

## Arrancar en desarrollo

### 1. Backend

```bash
cd backend

# 1. Instalar dependencias automáticamente y ejecutar servidor
uv run uvicorn main:app --reload --port 8000

# 2. Análisis y formato con Ruff
uv run ruff check --fix .
uv run ruff format .
```

API disponible en: http://localhost:8000  
Swagger docs en:  http://localhost:8000/docs  

### 2. Frontend

```bash
cd frontend

# Instalar dependencias con Bun
bun install

# Iniciar dev server (puerto 5173)
bun run dev

# Verificar y formatear con Biome
bun run lint:fix
bun run format
```

Abrir en: http://localhost:5173


---

## Portfolio por defecto

14 empresas activas + 1 slot reservado (Q - Qnity, pendiente):

```
AMD  · AMAT · HPQ  · INTC · ON
ORCL · POWI · QCOM · TXN  · MRVL
HIMX · NTAP · KD   · ARM
```

**Peso por empresa:** 1/15 fijo (aunque solo haya 14 activas).
**Slot Q:** Reservado como cash flat — no gana ni pierde hasta que se agregue.
**Inversión base:** $2,000 USD (configurable desde la UI).

---

## Benchmarks

- 🟡 **S&P 500** (`^GSPC`)
- 🟣 **NASDAQ Composite** (`^IXIC`)

---

## Funcionalidades

### 📈 Modo Histórico
- NAV acumulado como ETF (buy & hold, igual peso)
- Comparación visual vs S&P500 y NASDAQ
- Periodos: 1M · 3M · 6M · 1Y · 3Y · 5Y · MAX
- Tabla de breakdown por empresa (retorno individual)

### ⚡ Modo Live
- Cotizaciones actuales con cambio diario
- Valor total del portfolio en tiempo real
- Indicador mercado abierto/cerrado
- Refresco automático cada 60 segundos
- Yahoo Finance (15 min de delay — gratis)

### ⚙️ Gestión
- Agregar ticker (búsqueda validada contra Yahoo Finance)
- Quitar ticker
- Ajustar inversión base
- Configuración persiste en localStorage

---

## Agregar Q (cuando esté disponible)

1. En la UI, busca el ticker en "Agregar empresa"
2. Si Yahoo Finance lo reconoce, lo agrega automáticamente
3. El peso se reajusta: Q toma su 1/15, el cash reservado desaparece

---

## Datos

- **Histórico:** Descargado de Yahoo Finance, cache de 1 hora
- **Live:** Cache de 60 segundos para no saturar Yahoo Finance
- **Intraday:** Velas de 5 minutos del día actual
