# 🏛️ Diferencia entre **Supabase** y **Render** + Master Prompt **Kpital (100% SQL, Cero JSON)**

---

## 🤔 Parte 0: ¿Cuál es la diferencia entre Supabase y Render? ¿Puedes quedarte solo con Supabase?

Imagina que tu aplicación es un banco:
- **🗄️ Supabase (La Bóveda Inteligente + API Directa + Tiempo Real):**
  - Es tu **Base de Datos PostgreSQL en la nube**, pero además incluye **Autenticación**, **API REST/GraphQL automática** (PostgREST), **WebSockets en Tiempo Real** (para que los cambios aparezcan al instante en todos tus dispositivos sin recargar la página) y **Edge Functions** (pequeñas funciones para recibir Webhooks de MacroDroid o enviar mensajes a Telegram).
  - **Ventaja gigante:** Supabase **NUNCA se duerme** como el plan gratuito de Render. Responde en `< 50 milisegundos` las 24 horas del día.
- **⚙️ Render (El Servidor Python `FastAPI`):**
  - Es una máquina virtual donde corre código Python (`backend/`). En el plan gratuito de Render, **si no lo usas por 15 minutos, se apaga (se duerme)** y cuando entras tarda entre 20 y 40 segundos en despertar.

### 💡 ¿Puedes quedarte SOLAMENTE con Supabase y eliminar Render?
**¡SÍ! Y de hecho es la razón por la que te fallaba la primera carga.** Tienes dos caminos (y he dejado el Prompt preparado para priorizar Supabase directo):

1. **Opción 1 (Recomendada para Velocidad Instantánea): Todo el Flujo de Caja, Deudas, Tarjetas, Renta Fija y Portafolio leyendo/escribiendo DIRECTO contra Supabase (`@supabase/supabase-js`) sin pasar por Render:**
   - Tu web carga en **0.1 segundos** siempre a la primera porque habla directo con Supabase (`https://ixnidzllqwbkexsrmgwz.supabase.co`).
   - Los Webhooks de **MacroDroid** pueden entrar directo a una **Supabase Edge Function** (que tampoco se duerme nunca).
   - Solo usarías Python local o una función ligera cuando quieras usar librerías pesadas de Python como `yfinance` o leer un PDF con contraseña (`pypdf`).
2. **Opción 2 (Híbrida): Supabase como Base de Datos + Render para Python:**
   - Si quieres conservar todos los scripts de Python de FastAPI en la nube, usas Supabase como única base de datos y Render solo como ejecutor de Python, pero el Frontend lee y se suscribe en tiempo real directamente a Supabase.

---

## 🚫 Eliminación Total de Archivos `.json` (Regla de Hierro Incorporada)

He actualizado el **Master Prompt** para ordenar la **eliminación física y definitiva de todos los archivos `.json` de datos**:
- 🗑️ Se borran `backend/data/*.json`, `backend/data/users/*.json` y `frontend/public/data/*.json` (después de migrar tus datos una única vez a las tablas SQL de tu nuevo Supabase `db.ixnidzllqwbkexsrmgwz.supabase.co`).
- 🗑️ Se elimina del código cualquier función `load_cash_flow_db` que lea/escriba archivos `.json`, cualquier `fetchWithFallback` hacia `.json` estáticos y cualquier `localStorage` de movimientos.
- ✅ **Si no está en las tablas SQL de PostgreSQL (Supabase), no existe.** Así garantizamos que **jamás** un archivo `.json` o una caché vieja vuelva a revivir datos borrados ni a ocultar movimientos en otro navegador.

---

## 📋 MASTER PROMPT DEFINITIVO PARA **KPITAL (V2)**
*(Ya está copiado automáticamente dentro de `C:\Users\zhent\OneDrive\Documentos\Proyectos IA\kpital\KPITAL_MASTER_PROMPT.md`)*

```markdown
# ROL Y OBJETIVO PRINCIPAL
Actúa como un **Staff Full-Stack & Fintech Systems Architect** experto en React 19, Supabase (`@supabase/supabase-js`, PostgreSQL Relacional, Row Level Security y Supabase Realtime), TanStack Query, Zustand y FastAPI.

Estamos construyendo **Kpital (Kpital V2)** en el directorio `C:\Users\zhent\OneDrive\Documentos\Proyectos IA\kpital`.

## 🚨 REGLA CERO: AISLAMIENTO DEL REPOSITORIO ANTIGUO Y VINCULACIÓN A `zhentDev/kpital`
1. **PROHIBIDO tocar el repositorio antiguo (`zhentDev/titanes-portfolio`), su carpeta (`titanes-portfolio`) o su base de datos antigua.**
2. **Repositorio Git exclusivo de Kpital:** `https://github.com/zhentDev/kpital.git`
3. **Nueva Base de Datos Exclusiva de Kpital en Supabase:**
   - Host de Supabase: `db.ixnidzllqwbkexsrmgwz.supabase.co`
   - Project ID de Supabase: `ixnidzllqwbkexsrmgwz`
   - Connection URI base: `postgresql://postgres:[YOUR-PASSWORD]@db.ixnidzllqwbkexsrmgwz.supabase.co:5432/postgres` (pedir al usuario la contraseña o leerla de `backend/.env` antes de ejecutar la migración; si el entorno de red es IPv4, usar el Supavisor Pooler de Supabase `aws-0-us-east-1.pooler.supabase.com:6543` o `:5432`).

---

# 1. PROHIBICIÓN Y ELIMINACIÓN TOTAL DE ARCHIVOS `.JSON` DE DATOS (100% SQL SUPABASE)

El usuario ha ordenado **erradicar por completo el uso de archivos `.json` para almacenar o servir datos de la aplicación**:

1. **Migración Única y Destrucción de los `.json`:**
   - En la Fase 1/2, ejecuta un script único (`migrate_json_to_supabase.py`) que tome los datos actuales de `backend/data/cash_flow.json`, `backend/data/fixed_income.json` y `backend/data/purchases.json` en la carpeta `kpital` y los inserte en las tablas relacionales de **Supabase (`ixnidzllqwbkexsrmgwz`)**.
   - **Inmediatamente después de verificar que las tablas de Supabase tienen el 100% de los registros**, **ELIMINA FÍSICAMENTE** todos los archivos de datos `.json`:
     - Eliminar `backend/data/*.json` y `backend/data/users/*.json`.
     - Eliminar `frontend/public/data/*.json`.
2. **Prohibido Escribir o Leer `.json` en el Backend y Frontend:**
   - Eliminar de `backend/` toda lógica de `json.dump()`, `json.load()`, `DATA_FILE`, `BACKUP_FILE` y `PUBLIC_DATA_FILE`. El backend nunca más lee ni escribe archivos `.json` en disco.
   - Eliminar de `frontend/src/api/client.js` toda lógica de `fetchWithFallback`, `getStaticDataPath` y cualquier fallback a archivos `.json`.
   - Eliminar de `frontend/src/store/` cualquier persistencia de movimientos, tarjetas, deudas o cuentas en `localStorage` (`localStorage` solo puede guardar `kpital_theme` y la sesión de autenticación).

---

# 2. ARQUITECTURA SUPABASE-FIRST (VELOCIDAD INSTANTÁNEA Y CERO DOBLE RECARGA F5)

## 2.1. ¿Por qué Supabase es el Corazón de Kpital?
Para evitar los "cold starts" (cuando Render se duerme y tarda 30 segundos en responder) y evitar tener que recargar la página dos veces (F5):
- **Tablas Relacionales en Supabase PostgreSQL (`ixnidzllqwbkexsrmgwz`):**
  Toda la información vive normalizada en tablas SQL reales en Supabase:
  1. `cf_periods_config` (`user_id`, `period`, `currency`, `allocation_model`, `needs_ratio`, `wants_ratio`, `savings_ratio`, `emergency_months`, `payroll_account_json`).
  2. `cf_budget_envelopes` (`id`, `user_id`, `period`, `pillar` [`inflows`, `needs`, `wants`, `wealth`], `name`, `amount`, `category`, `sub_items_json`, `is_explicit_sankey_income`, `updated_at`).
  3. `cf_movements` (`id`, `user_id`, `period`, `date`, `time`, `type` [`debit`/`credit`], `amount`, `currency`, `description`, `budget_item_id`, `budget_item_name`, `budget_item_type`, `sub_item_id`, `sub_item_name`, `payment_source_json`, `destination_account_id`, `destination_account_name`, `is_split_child`, `split_parent_id`, `credit_card_payment_id`, `card_id`, `debt_id`, `is_loan`, `is_shared_expense`, `participants_json`, `is_explicit_sankey_income`, `created_at`, `updated_at`).
  4. `cf_credit_cards` (`id`, `user_id`, `name`, `brand`, `total_limit`, `used_limit`, `cutoff_day`, `due_day`, `updated_at`).
  5. `cf_credit_purchases` (`id`, `user_id`, `card_id`, `movement_id`, `description`, `total_amount`, `installments_count`, `monthly_installment`, `start_period`, `date`, `created_at`).
  6. `cf_credit_payments` (`id`, `user_id`, `card_id`, `card_name`, `period`, `amount`, `date`, `time`, `source_type`, `source_account_id`, `source_account_name`, `budget_deductions_json`, `notes`, `created_at`).
  7. `cf_debts` (`id`, `user_id`, `origin_movement_id`, `debt_type`, `concept`, `debtor`, `creditor`, `total_amount`, `remaining_amount`, `my_share`, `status`, `participants_json`, `payments_log_json`, `notes`, `created_at`, `updated_at`).
  8. `fi_entities`, `fi_accounts`, `fi_cdts`, `fi_transactions` (Entidades, cuentas/cajitas de ahorro, CDTs y transacciones).
  9. `rv_portfolios`, `rv_purchases`, `rv_sales`, `rv_stock_alerts` (Renta Variable).

## 2.2. Lectura/Escritura Directa + Tiempo Real con Supabase (`@supabase/supabase-js`)
- El frontend puede conectarse directamente a **Supabase** mediante `@supabase/supabase-js` + **TanStack Query** (`staleTime: 0`, `refetchOnMount: "always"`, `refetchOnWindowFocus: true`), logrando que **Kpital cargue en `< 100ms` desde el primer intento sin depender de que un servidor en Render despierte**.
- Activar **Supabase Realtime** sobre `cf_movements`, `cf_credit_purchases`, `cf_credit_payments`, `cf_debts` y `fi_transactions`: cualquier cambio hecho en el navegador A, en el celular o vía Webhook se refleja en vivo en el navegador B en milisegundos sin tocar F5.
- **Operaciones Atómicas (RPC PostgreSQL Functions / SQL Transactions):**
  - Crear funciones RPC en PostgreSQL (ej. `rpc_distribute_card_payment`, `rpc_delete_movement_cascade`, `rpc_register_webhook_transaction`) para que operaciones complejas como redistribuir el pago de una tarjeta en rubros o registrar una compra de MacroDroid ocurran dentro de una única transacción ACID dentro de Supabase, garantizando **cero duplicados y cero pérdida de movimientos**.

---

# 3. REBRANDING A "KPITAL" Y REORGANIZACIÓN DE CARPETAS

## 3.1. Identidad de Marca: "Kpital"
- Renombrar toda referencia visual y técnica de "Titanes" a **"Kpital"** (`<title>Kpital | Intelligent Wealth & Cash Flow OS</title>`, `package.json`, `vite.config.js` con `base: "/kpital/"`, claves `kpital_theme`, `kpital_auth_token`).

## 3.2. Estructura Modular Limpia (Ningún archivo > 450 líneas)
Dividir los archivos gigantescos (`cashFlowStore.js` de 3.580 líneas, `db.py` de 1.830 líneas, `ExpensesLogSection.jsx` de 2.400 líneas) en módulos claros por dominio:
- `frontend/src/shared/` (`api/supabaseClient.js`, `components/ui/`, `hooks/`, `utils/`).
- `frontend/src/features/cash-flow/` (`api/`, `components/sankey/`, `components/envelopes/`, `components/movements-log/`, `components/credit-cards/`, `components/debts-loans/`, `store/`).
- `frontend/src/features/fixed-income/`
- `frontend/src/features/variable-income/`
- `backend/` (Limpio y modularizado en `core/`, `db/`, `modules/`, `scripts/`).

---

# 4. REGLAS OBLIGATORIAS DE UI/UX, DUAL THEME (CLARO/OSCURO) Y RESPONSIVE

1. **Soporte Obligatorio Dual (Modo Claro & Modo Oscuro):**
   - Prohibido usar colores oscuros o claros estáticos sin condicional.
   - Usar variables CSS (`var(--bg-primary)`, `var(--bg-surface)`, `var(--bg-card)`, `var(--text-primary)`, `var(--text-secondary)`, `var(--text-muted)`, `var(--border)`, `var(--accent-primary)`).
   - En JSX/Canvas inyectar siempre `const { theme } = useTheme(); const isLight = theme === "light";`.
   - En CSS incluir siempre la variante `[data-theme="light"]`.
2. **Diseño 100% Responsive (Mobile-First, Tablet & Desktop):**
   - Sin desbordamientos horizontales (`overflow-x: hidden`), botones apilables con `flex-wrap` en móvil (`< 640px`) y modales adaptables (`95vw`).
3. **Alertas con `react-hot-toast`:**
   - Usar exclusivamente `toast.success()`, `toast.error()`, `toast.loading()`. Prohibido `window.alert()`.
   - Jamás mostrar alertas falsas de `"⚠️ Desvío de Ahorro (Emergencia)"` en pagos de tarjetas de crédito.
4. **Reglas de Negocio de Flujo de Caja:**
   - **Diagrama Sankey Limpio:** Solo muestra por defecto los **3 ingresos canónicos** (`Salario Neto (Nómina)`, `Ingreso por Renta Fija`, `Ingreso por Renta Variable`). Ningún cobro de préstamo ni abono bancario entra al Sankey salvo que el usuario pulse `+ Clasificar como Ingreso Sankey` (`is_explicit_sankey_income = true`).
   - **Préstamos Directos y Gastos Compartidos:** Ambos muestran el desglose completo en su fila (`🤝 Préstamo a: Nombre • Total: $X • Abonado: $Y (N abonos) • Por cobrar: $Z` y el botón `Gestionar Cobros`).

---

# 5. USO DE IA LOCAL Y PROTECCIÓN DE LA GPU DEL PC

- Cuando la GPU local esté libre, usar `query_local_model` (`coder`/`qwen` o `r1`/`bonsai`) para ahorrar tokens.
- **REGLA ESTRICTA DE PROTECCIÓN DEL PC:** Si la GPU está ocupada, lenta o el usuario indica que no se use, **NO invocar `query_local_model` bajo ninguna circunstancia** para no congelar el PC del usuario.

---

# 6. ORDEN DE EJECUCIÓN PASO A PASO

1. **Fase 1 (Conexión a Supabase `ixnidzllqwbkexsrmgwz` y Esquema SQL):**
   - Solicitar al usuario la contraseña de la URI `postgresql://postgres:[YOUR-PASSWORD]@db.ixnidzllqwbkexsrmgwz.supabase.co:5432/postgres` (y opcionalmente el `SUPABASE_URL` y `SUPABASE_ANON_KEY` si desea conexión directa Realtime desde el frontend).
   - Crear todas las tablas relacionales en Supabase y migrar el 100% de los datos actuales desde los `.json` locales.
2. **Fase 2 (Eliminación Total de los `.json`):**
   - Verificar conteos exactos en Supabase (`46` movimientos en `cf_movements`, `6` compras en `cf_credit_purchases`, `2` pagos en `cf_credit_payments`, `8` deudas en `cf_debts`, `182` transacciones en `fi_transactions`) y **borrar definitivamente todos los archivos `.json` de datos** (`backend/data/*.json` y `frontend/public/data/*.json`).
3. **Fase 3 (Operaciones Atómicas SQL + Realtime Sync):**
   - Reemplazar toda lectura/escritura por consultas SQL transaccionales sobre Supabase, eliminando `localStorage` de datos financieros y el fallback estático.
4. **Fase 4 (Rebranding a Kpital, Modularización, Build y Push a `zhentDev/kpital`):**
   - Aplicar el rebranding completo a **Kpital**, verificar Modo Claro/Oscuro y Responsive, compilar (`npm --prefix frontend run build`) y hacer push a `https://github.com/zhentDev/kpital.git`.
```
