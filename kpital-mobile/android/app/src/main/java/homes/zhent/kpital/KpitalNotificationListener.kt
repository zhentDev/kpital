package homes.zhent.kpital

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
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

        // Paquetes de apps bancarias oficiales
        private val BANK_PACKAGES = setOf(
            "co.com.bancolombia",
            "com.bancolombia.personas",
            "co.com.davivienda",
            "com.nu.colombia",
            "com.nequi.MobileApp",
            "com.rpay.rappi",
            "com.bancofalabella.bancofalabella",
            "com.lulobank",
            "com.cajasocial",
            "com.google.android.apps.walletnfcrel"
        )

        // Paquetes estándar de aplicaciones de mensajería SMS en Android
        private val SMS_PACKAGES = setOf(
            "com.google.android.apps.messaging",
            "com.samsung.android.messaging",
            "com.android.mms",
            "com.miui.sms",
            "com.motorola.messaging",
            "com.huawei.message",
            "com.coloros.mms"
        )

        // Entidades financieras reconocidas en SMS bancarios
        private val KNOWN_BANK_NAMES = listOf(
            "caja social", "bcs", "bancolombia", "davivienda", "daviplata",
            "banco de bogota", "banco de bogotá", "banco de occidente",
            "falabella", "scotiabank", "colpatria", "bbva", "nequi", "nu colombia", "nubank"
        )
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
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
        // Disparador temporal para pruebas: permite probar con notificaciones existentes al borrarlas/descartarlas
        handleNotificationEvent(sbn, "REMOVED")
    }

    private fun handleNotificationEvent(sbn: StatusBarNotification?, eventType: String) {
        if (sbn == null) return

        val packageName = sbn.packageName ?: ""
        // Ignorar nuestras propias notificaciones para evitar bucles
        if (packageName == applicationContext.packageName) return

        // 1. FILTRADO ESTRICTO DE ORIGEN:
        val isFromBankApp = BANK_PACKAGES.any { packageName.contains(it, ignoreCase = true) }
        val isFromSmsApp = SMS_PACKAGES.any { packageName.contains(it, ignoreCase = true) }

        if (!isFromBankApp && !isFromSmsApp) return

        val extras = sbn.notification?.extras ?: return
        val title = extras.getString(Notification.EXTRA_TITLE) ?: ""
        val rawText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()
            ?: extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()
            ?: ""
        val postTime = sbn.postTime

        if (title.isBlank() && rawText.isBlank()) return

        // En caso de que la app de SMS agrupe varios mensajes históricos, tomar el más reciente (última línea)
        val textLines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)
        val latestMessage = if (textLines != null && textLines.isNotEmpty()) {
            textLines.last().toString()
        } else {
            rawText.split("\n").filter { it.isNotBlank() }.lastOrNull() ?: rawText
        }

        // 2. FILTRADO DE CONTENIDO FINANCIERO Y SEGURIDAD:
        if (isFromSmsApp) {
            val lower = latestMessage.lowercase()

            // A. Debe mencionar explícitamente a un banco colombiano
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
            val lower = (title + " " + latestMessage).lowercase()
            val hasFinancialKeywords = lower.contains("$") || lower.contains("compra") ||
                    lower.contains("envia") || lower.contains("envío") || lower.contains("transfer") ||
                    lower.contains("pagaste") || lower.contains("pago") || lower.contains("recibiste") ||
                    lower.contains("te transfirieron") || lower.contains("plata")
            if (!hasFinancialKeywords) return
        }

        val textToProcess = latestMessage
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
                rawText = "$title - $textToProcess"
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
