# 📱 Kpital Mobile (Go Native Push Notification Engine)

Aplicación nativa para Android diseñada para capturar notificaciones bancarias colombianas en tiempo real y alimentar el Flujo de Caja de **Kpital** automáticamente, eliminando intermediarios como MacroDroid.

---

## 🏗️ Arquitectura

```
┌────────────────────────────────────────────────────────┐
│                   DISPOSITIVO ANDROID                  │
│                                                        │
│  [ Notificación Bancaria (Nu, Bancolombia, etc.) ]      │
│                         │                              │
│                         ▼                              │
│       KpitalNotificationListener (Kotlin)              │
│       (Captura el evento del sistema)                  │
│                         │                              │
│                         ▼                              │
│              NÚCLEO EN GO (go-core)                    │
│      ├── Regex Engine Bancario (Cero asignaciones)     │
│      ├── Formateador de moneda COP ($xx.xxx,xx)        │
│      ├── Extracción de Comercio & Últimos 4 dígitos    │
│      └── Cliente HTTP directo a Kpital Webhooks        │
│                         │                              │
│                         ▼                              │
│         [ Kpital Backend / Supabase Cloud ]            │
└────────────────────────────────────────────────────────┘
```

---

## 🚀 Bancos Colombianos Soportados

- 💜 **Nu Colombia:** Compras con tarjeta débito/crédito, transferencias enviadas/recibidas, movimientos de cajitas y nómina.
- 🟡 **Bancolombia:** Compras físicas, virtuales y transferencias.
- 🟣 **Nequi:** Pagos con QR, transferencias y retiros.
- 🔴 **Daviplata / Davivienda:** Compras y transferencias.
- 🟠 **RappiPay:** Compras con RappiCard (MSI), transferencias Transfiya/Bre-B y rendimientos diarios.
- 🟢 **Falabella, Lulo Bank y Banco Caja Social.**

---

## 🛠️ Cómo compilar y generar el APK

1. **Requisitos:**
   - Go 1.21 o superior
   - Android SDK / NDK instalado
   - Gomobile:
     ```bash
     go install golang.org/x/mobile/cmd/gomobile@latest
     gomobile init
     ```

2. **Compilar la librería nativa de Go (`core.aar`):**
   ```bash
   cd kpital-mobile/go-core
   gomobile bind -target=android -o ../android/app/libs/core.aar .
   ```

3. **Construir el APK:**
   ```bash
   cd kpital-mobile/android
   ./gradlew assembleRelease
   ```
   El archivo instalable se generará en `android/app/build/outputs/apk/release/app-release.apk`.

4. **Instalación en tu teléfono:**
   - Envías el `.apk` a tu teléfono (por WhatsApp, Drive o cable USB).
   - Abres la aplicación y tocas en **"Configurar Acceso a Notificaciones"**.
   - Activas el permiso para **Kpital Mobile**.
   - A partir de ese momento, cada compra o ingreso se registra automáticamente en tu terminal Kpital.
