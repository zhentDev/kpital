package homes.zhent.kpital

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import androidx.core.app.NotificationCompat
import core.Core
import org.json.JSONObject

/**
 * KpitalNotificationListener:
 * Servicio nativo ultra-ligero que intercepta notificaciones de bancos colombianos
 * tanto desde sus aplicaciones móviles oficiales como desde mensajes de texto (SMS).
 * Si la app tiene permiso de sobreponerse en pantalla (SYSTEM_ALERT_WINDOW),
 * despliega de inmediato el cuadro flotante táctil (PocketOverlayManager) para clasificar el gasto.
 */
class KpitalNotificationListener : NotificationListenerService() {

    companion object {
        private const val TAG = "KpitalMobile"
        private const val CHANNEL_ID = "kpital_urgent_alerts"

        // Estado de conexión del Binder con el sistema Android OS
        var isConnected: Boolean = false
            private set

        /**
         * Fuerza a Android a reconectar el listener si el sistema lo desconectó
         * tras actualizar el APK.
         */
        fun requestRebindIfDisconnected(context: Context) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                try {
                    val component = ComponentName(context, KpitalNotificationListener::class.java)
                    Log.d(TAG, "Solicitando requestRebind para KpitalNotificationListener...")
                    requestRebind(component)
                } catch (e: Exception) {
                    Log.w(TAG, "requestRebind no pudo ejecutarse: ${e.message}")
                }
            }
        }

        // Paquetes de apps bancarias oficiales
        private val BANK_PACKAGES = setOf(
            "com.grability.rappi",
            "com.rappipay.app",
            "com.rappi.pay",
            "com.rpay.rappi",
            "co.com.bancolombia",
            "com.bancolombia.personas",
            "co.com.bancolombia.app",
            "co.com.davivienda",
            "co.com.davivienda.daviplata",
            "com.davivienda.personas",
            "br.com.nubank",
            "com.nu.colombia",
            "co.nu.colombia",
            "com.nu.production",
            "com.nequi.MobileApp",
            "co.nequi",
            "com.bancofalabella.bancofalabella",
            "cl.falabella.banco",
            "com.lulobank",
            "com.cajasocial",
            "co.com.bancocajasocial",
            "com.mercadopago.wallet",
            "co.com.bancodebogota.bancamovil",
            "com.bbva.bbvacolombia",
            "co.com.colpatria.bancamovil",
            "com.google.android.apps.walletnfcrel"
        )

        // Paquetes estándar de aplicaciones de mensajería SMS en Android
        private val SMS_PACKAGES = setOf(
            "com.google.android.apps.messaging",
            "com.samsung.android.messaging",
            "com.android.mms",
            "com.android.mms.service",
            "com.miui.sms",
            "com.motorola.messaging",
            "com.huawei.message",
            "com.coloros.mms",
            "com.oplus.mms",
            "com.heytap.mms",
            "com.transsion.message"
        )

        // Entidades financieras reconocidas en SMS bancarios
        private val KNOWN_BANK_NAMES = listOf(
            "caja social", "bcs", "bancolombia", "davivienda", "daviplata",
            "banco de bogota", "banco de bogotá", "banco de occidente",
            "falabella", "scotiabank", "colpatria", "bbva", "nequi", "nu colombia", "nubank",
            "rappi", "rappipay", "rappicuenta", "rappicard", "lulo", "lulobank", "mercado pago"
        )
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        try {
            DebtAlertManager.scheduleDaily8PmAlarm(this)
        } catch (e: Exception) {
            Log.e(TAG, "Error programando alarma 8PM en listener onCreate: ${e.message}")
        }
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        isConnected = true
        Log.i(TAG, "🟢 KpitalNotificationListener conectado exitosamente a Android OS")
        try {
            DebtAlertManager.scheduleDaily8PmAlarm(this)
        } catch (e: Exception) {
            Log.e(TAG, "Error programando alarma 8PM en onListenerConnected: ${e.message}")
        }
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        isConnected = false
        Log.w(TAG, "🔴 KpitalNotificationListener desconectado por Android OS")
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val name = "Alertas de Movimientos Bancarios"
            val descriptionText = "Muestra de inmediato el selector de cajitas al recibir compras o transferencias"
            val importance = NotificationManager.IMPORTANCE_HIGH
            val channel = NotificationChannel(CHANNEL_ID, name, importance).apply {
                description = descriptionText
                enableVibration(true)
                setShowBadge(true)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        super.onNotificationPosted(sbn)
        handleNotificationEvent(sbn, "POSTED")
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        super.onNotificationRemoved(sbn)
        // Procesar notificación cuando el usuario la desliza/borra de la barra de estado
        // Permite capturar transacciones bancarias durante pruebas o si llegaron antes de reconectar.
        // MovementHistoryManager evitará duplicados automáticamente si ya fue registrada o procesada.
        handleNotificationEvent(sbn, "REMOVED")
    }

    private fun handleNotificationEvent(sbn: StatusBarNotification?, eventType: String) {
        if (sbn == null) return

        val packageName = sbn.packageName ?: ""
        // Ignorar nuestras propias notificaciones para evitar bucles
        if (packageName == applicationContext.packageName) return

        // 1. FILTRADO ESTRICTO DE ORIGEN:
        val isFromBankApp = BANK_PACKAGES.any { packageName.contains(it, ignoreCase = true) } ||
                packageName.contains("rappi", ignoreCase = true) ||
                packageName.contains("nubank", ignoreCase = true) ||
                packageName.contains("nu.colombia", ignoreCase = true) ||
                packageName.contains("nu.production", ignoreCase = true) ||
                packageName.contains("bancolombia", ignoreCase = true) ||
                packageName.contains("nequi", ignoreCase = true) ||
                packageName.contains("davivienda", ignoreCase = true) ||
                packageName.contains("daviplata", ignoreCase = true) ||
                packageName.contains("lulobank", ignoreCase = true) ||
                packageName.contains("cajasocial", ignoreCase = true) ||
                packageName.contains("falabella", ignoreCase = true) ||
                packageName.contains("bcs", ignoreCase = true) ||
                packageName.contains("mercadopago", ignoreCase = true) ||
                packageName.contains("bbva", ignoreCase = true) ||
                packageName.contains("colpatria", ignoreCase = true) ||
                packageName.contains("bancodebogota", ignoreCase = true)

        val isFromSmsApp = SMS_PACKAGES.any { packageName.contains(it, ignoreCase = true) } ||
                packageName.contains("sms", ignoreCase = true) ||
                packageName.contains("mms", ignoreCase = true) ||
                packageName.contains("messaging", ignoreCase = true)

        if (!isFromBankApp && !isFromSmsApp) return

        val extras = sbn.notification?.extras ?: return
        val title = extras.getString(Notification.EXTRA_TITLE) ?: ""
        val rawText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()
            ?: extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()
            ?: ""
        val postTime = sbn.postTime

        if (title.isBlank() && rawText.isBlank()) return

        // Extracción de texto:
        // En apps bancarias oficiales (Nu, Rappi, etc.), concatenamos todas las líneas para no perder el monto ni el comercio.
        // En SMS, si agrupa el historial del remitente, tomamos la última línea más reciente.
        val textLines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)
        val textToProcess = if (isFromBankApp) {
            if (textLines != null && textLines.isNotEmpty()) {
                textLines.joinToString(" ").trim()
            } else {
                rawText.replace("\n", " ").trim()
            }
        } else {
            if (textLines != null && textLines.isNotEmpty()) {
                textLines.last().toString().trim()
            } else {
                rawText.split("\n").filter { it.isNotBlank() }.lastOrNull()?.trim() ?: rawText.trim()
            }
        }

        // 2. FILTRADO DE CONTENIDO FINANCIERO Y SEGURIDAD:
        val lower = (title + " " + textToProcess).lowercase()
        if (isFromSmsApp) {
            // A. Debe mencionar explícitamente a un banco o billetera colombiana
            val mentionsBank = KNOWN_BANK_NAMES.any { lower.contains(it) }
            if (!mentionsBank) return

            // B. Descartar códigos OTP o claves dinámicas de seguridad
            val isOtp = lower.contains("codigo de seguridad") || lower.contains("código de seguridad") ||
                    lower.contains("clave dinamica") || lower.contains("clave dinámica") ||
                    lower.contains("tu codigo") || lower.contains("tu código") ||
                    lower.contains("no compartas") || lower.contains("verificacion") || lower.contains("verificación")
            if (isOtp) return

            // C. Descartar transacciones rechazadas o fallidas
            val isRejected = lower.contains("rechazado") || lower.contains("rechazada") ||
                    lower.contains("declinada") || lower.contains("declinado") ||
                    lower.contains("fallido") || lower.contains("fallida")
            if (isRejected) return

            // D. Debe tener palabras clave financieras
            val hasFinancialKeywords = lower.contains("$") || lower.contains("pago") ||
                    lower.contains("compra") || lower.contains("transfer") || lower.contains("aprobado") ||
                    lower.contains("debito") || lower.contains("credito") || lower.contains("abono")
            if (!hasFinancialKeywords) return
        } else {
            // Para apps bancarias oficiales:
            val hasFinancialKeywords = lower.contains("$") || lower.contains("cop") ||
                    lower.contains("compra") || lower.contains("compraste") ||
                    lower.contains("envia") || lower.contains("envío") || lower.contains("transfer") ||
                    lower.contains("pagaste") || lower.contains("pago") || lower.contains("recibiste") ||
                    lower.contains("te transfirieron") || lower.contains("plata") ||
                    lower.contains("aprob") || lower.contains("abono") || lower.contains("retiro") ||
                    lower.contains("transacc") || lower.contains("exitos") || lower.contains("gasto")
            if (!hasFinancialKeywords) return
        }
        Log.d(TAG, "[$eventType] Movimiento detectado ($packageName): $title -> $textToProcess")

        // 3. Procesar y extraer entidad, monto y concepto con el motor Go
        var bank = "Banco"
        var amount = 0.0
        var description = if (title.isNotBlank() && !title.all { it.isDigit() }) title else "Movimiento bancario"
        var txType = "debit"

        try {
            val parsedJson = Core.parseNotificationJSON(packageName, title, textToProcess, postTime)
            Log.d(TAG, "Parseo Go Core: $parsedJson")
            val obj = JSONObject(parsedJson)

            if (obj.optBoolean("parsed", false)) {
                bank = obj.optString("bank", "Banco")
                amount = obj.optDouble("amount", 0.0)
                description = obj.optString("description", description)
                txType = obj.optString("txType", "debit")
            } else {
                // Heurísticas de respaldo
                val fullLower = (title + " " + textToProcess).lowercase()
                when {
                    fullLower.contains("caja social") || fullLower.contains("bcs") -> bank = "Banco Caja Social"
                    fullLower.contains("nequi") -> bank = "Nequi Colombia"
                    fullLower.contains("bancolombia") -> bank = "Bancolombia"
                    fullLower.contains("nu") -> bank = "Nu Colombia"
                    fullLower.contains("rappi") -> bank = "RappiPay"
                    fullLower.contains("daviplata") || fullLower.contains("davivienda") -> bank = "Davivienda / Daviplata"
                    fullLower.contains("falabella") -> bank = "Banco Falabella"
                }
            }
        } catch (e: Throwable) {
            Log.e(TAG, "Error procesando con Go Core: ${e.message}", e)
        }

        // 3.4. Validar monto para evitar falsos positivos de números de fecha o teléfono
        val fullCombinedText = "$title - $textToProcess"
        val hasExplicitCurrency = fullCombinedText.contains("$") || fullCombinedText.contains("COP", ignoreCase = true)
        if (amount > 50_000_000 || (amount > 10_000_000 && !hasExplicitCurrency)) {
            Log.w(TAG, "Monto sospechoso o fuera de rango ($amount COP) en '$fullCombinedText'. Ignorando para proteger integridad.")
            return
        }

        // 3.5. Registrar y persistir de inmediato en el historial de la app Kpital
        val movement = CapturedMovement(
            bank = bank,
            amount = amount,
            description = description,
            txType = txType,
            rawText = fullCombinedText,
            timestamp = if (postTime > 0) postTime else System.currentTimeMillis(),
            status = MovementHistoryManager.STATUS_PENDING
        )
        val movementId = MovementHistoryManager.addMovement(applicationContext, movement)
        Log.d(TAG, "Movimiento guardado en historial local: id=$movementId, $bank, $amount COP, status=${movement.status}")

        // Si fue clasificado automáticamente como duplicado/descartado, no interrumpir con overlay
        if (movement.status == MovementHistoryManager.STATUS_DISCARDED) {
            Log.d(TAG, "Notificación clasificada como duplicada/descartada. No se muestra overlay.")
            return
        }

        // 4. DISPARADOR PRINCIPAL: Overlay Flotante Directo (WindowManager)
        val canOverlay = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Settings.canDrawOverlays(this)
        } else {
            true
        }

        if (canOverlay) {
            Log.d(TAG, "Mostrando PocketOverlayManager para $bank ($amount COP)...")
            PocketOverlayManager.show(
                context = this,
                bank = bank,
                initialAmount = amount,
                desc = description,
                txType = txType,
                rawText = "$title - $textToProcess",
                movementId = movementId
            )
        } else {
            Log.w(TAG, "No tiene permiso canDrawOverlays para mostrar la burbuja flotante")
        }

        // 5. Respaldo adicional: Heads-up Notification con FullScreenIntent
        val targetIntent = Intent(this, PocketSelectorActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(PocketSelectorActivity.EXTRA_BANK, bank)
            putExtra(PocketSelectorActivity.EXTRA_AMOUNT, amount)
            putExtra(PocketSelectorActivity.EXTRA_DESC, description)
            putExtra(PocketSelectorActivity.EXTRA_TX_TYPE, txType)
            putExtra(PocketSelectorActivity.EXTRA_RAW_TEXT, "$title - $textToProcess")
            putExtra(PocketSelectorActivity.EXTRA_MOVEMENT_ID, movementId)
        }

        val requestCode = System.currentTimeMillis().toInt()
        val pendingIntent = PendingIntent.getActivity(
            this,
            requestCode,
            targetIntent,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            } else {
                PendingIntent.FLAG_UPDATE_CURRENT
            }
        )

        val amountStr = if (amount > 0) String.format("$%,.0f COP", amount) else "Monto por definir"
        val notifBuilder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("⚡ Registrar en Kpital: $bank")
            .setContentText("$amountStr - $description")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setFullScreenIntent(pendingIntent, true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)

        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val notificationId = (System.currentTimeMillis() % 10000).toInt()
        notificationManager.notify(notificationId, notifBuilder.build())
    }
}
