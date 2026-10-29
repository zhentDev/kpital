# ⚡ Titanes Portfolio - Bank Simulator & Notification Gateway (Go)

Microservicio ultraliviano y de alto rendimiento escrito en **Go 1.22+ estándar** (cero dependencias externas de terceros), diseñado como aplicación compañera (*Companion App*) para el ecosistema **Titanes Portfolio**.

---

## 🎯 Propósitos Principales

1. **Simulador de Notificaciones Bancarias de Colombia (Zero-Risk Testing):**
   - Permite simular eventos financieros realistas con un solo clic sin gastar ni mover dinero real.
   - Presets incluidos para **Nu Colombia**, **RappiPay**, **Bancolombia**, **Plenti**, **Banco Caja Social**, **Google Wallet**, etc.
   - Simula compras con tarjeta, envíos/recepciones por Bre-B y Transfiya, retiros de cajitas específicas (Viaje, Impresora) y abonos de rendimientos diarios/mensuales.

2. **Receptor / Parser de Notificaciones Móviles (Webhooks Android):**
   - Endpoint `POST /api/notifications/incoming` optimizado para recibir notificaciones desde **MacroDroid**, **Tasker** o cualquier webhook HTTP.
   - Motor de expresiones regulares de alta velocidad que extrae: entidad bancaria, monto en pesos (COP), tipo de transacción (`debit`, `credit`, `yield_payout`), comercio limpio y saldo resultante si está disponible.
   - Reenvío automático y resiliente hacia FastAPI (`POST /api/webhooks/mobile-transaction`) con reintentos y retroceso exponencial (*exponential backoff*).

3. **Interfaz Web Móvil PWA Embebida (`embed.FS`):**
   - Accesible directamente desde el celular conectándose al Wi-Fi local: `http://<IP_LOCAL>:8080`.
   - Soporte Dual Theme (Modo Oscuro & Modo Claro) cumpliendo las directrices del proyecto.
   - Consola en vivo en tiempo real mediante **Server-Sent Events (SSE)** que muestra eventos, parseo y latencias en microsegundos.
   - Selector dinámico de backend: alternancia en 1 clic entre **Localhost** (`http://localhost:8000`) y **Render Cloud** (`https://titanes-portfolio-backend.onrender.com`).

---

## 📁 Estructura del Proyecto

```
bank-simulator/
├── bin/
│   └── bank-simulator.exe       # Binario compilado autocontenido (7.7 MB)
├── cmd/
│   └── server/
│       └── main.go              # Punto de entrada, detección de IP LAN y servidor HTTP
├── pkg/
│   ├── client/
│   │   ├── titanes_client.go    # Cliente HTTP hacia FastAPI con reintentos exponenciales
│   │   └── titanes_client_test.go
│   ├── models/
│   │   └── models.go            # Modelos de datos compartidos y DTOs
│   ├── parser/
│   │   ├── amount.go            # Parser numérico para moneda colombiana ($33.500,00, etc.)
│   │   ├── parser.go            # Motor de expresiones regulares por entidad bancaria
│   │   └── parser_test.go       # 12 casos de prueba con notificaciones reales
│   ├── simulator/
│   │   ├── templates.go         # Catálogo de 15 plantillas sintéticas bancarias
│   │   └── templates_test.go    # Pruebas de parseo de todas las plantillas
│   └── web/
│       ├── server.go            # Enrutador HTTP (Go 1.22+ ServeMux) y endpoints REST
│       ├── server_test.go       # Pruebas integrales de endpoints web
│       ├── sse.go               # Broker thread-safe de Server-Sent Events con historial
│       └── static/
│           └── index.html       # Web App embebida moderna con modo claro/oscuro
├── go.mod                       # Módulo Go estándar
└── README.md
```

---

## 🚀 Inicio Rápido

### Opción A: Ejecución directa con Go
```powershell
cd bank-simulator
go run cmd/server/main.go
```

### Opción B: Ejecución del binario compilado
```powershell
cd bank-simulator
./bin/bank-simulator.exe
```

### Parámetros Opcionales (Flags / Variables de Entorno)
| Parámetro | Variable de Entorno | Valor por Defecto | Descripción |
|---|---|---|---|
| `-port` | `PORT` | `8080` | Puerto HTTP del servidor |
| `-backend` | `TITANES_BACKEND_URL` | `http://localhost:8000` | URL base de la API de Titanes FastAPI |
| `-secret` | `WEBHOOK_SECRET_KEY` | `titanes_sec_e8b919f4...` | Clave secreta para autenticar con FastAPI |

Ejemplo con flags:
```powershell
./bin/bank-simulator.exe -port 8080 -backend https://titanes-portfolio-backend.onrender.com
```

---

## 📲 Configuración en MacroDroid / Android

Para enviar notificaciones reales o de prueba desde tu celular al simulador:

1. **Disparador en MacroDroid:**
   - *Notificación recibida* (Seleccionar Nubank, Rappi, Bancolombia, etc.).
2. **Acción:**
   - *Abrir Sitio Web / Solicitud HTTP* -> Método `POST`.
   - **URL:** `http://<IP_LOCAL_DE_TU_PC>:8080/api/notifications/incoming`
   - **Content-Type:** `application/json`
   - **Cuerpo del mensaje:**
     ```json
     {
       "app_name": "[not_app_name]",
       "title": "[not_title]",
       "text": "[not_text]"
     }
     ```

---

## 🧪 Ejecutar Pruebas Unitarias

Para correr la suite completa de pruebas unitarias:
```powershell
cd bank-simulator
go test ./... -v
```

Todas las suites de prueba (`pkg/parser`, `pkg/simulator`, `pkg/client`, `pkg/web`) pasan al 100% con cero dependencias externas.
