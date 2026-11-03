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
 * Servicio nativo ultra-ligero que intercepta notificaciones de bancos colombianos.
 * Si la app tiene permiso de sobreponerse en pantalla (SYSTEM_ALERT_WINDOW),
 * levanta PocketSelectorActivity directamente al instante.
 * Adicionalmente, emite un Heads-Up Notification prioritario con FullScreenIntent
 * para garantizar que la pantalla despierte o aparezca el banner interactivo.
 */
class KpitalNotificationListener : NotificationListenerService() {

    companion object {
        private const val TAG = "KpitalMobile"
        private const val CHANNEL_ID = "kpital_urgent_alerts"
        private val MONITORED_PACKAGES = setOf(
            "co.com.bancolombia",
            "com.bancolombia.personas",
            "co.com.davivienda",
            "com.nu.colombia",
            "com.nequi.MobileApp",
            "com.rpay.rappi",
            "com.bancofalabella.bancofalabella",
            "com.lulobank",
            "com.cajasocial"
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
        if (sbn == null) return

        val packageName = sbn.packageName ?: ""
        // Ignorar nuestras propias notificaciones para evitar bucles
        if (packageName == applicationContext.packageName) return

        val extras = sbn.notification?.extras ?: return

        val title = extras.getString(Notification.EXTRA_TITLE) ?: ""
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""
        val postTime = sbn.postTime

        if (title.isBlank() && text.isBlank()) return

        val isFromBankApp = MONITORED_PACKAGES.any { packageName.contains(it, ignoreCase = true) }
        val hasFinancialKeywords = title.contains("$") || text.contains("$") ||
                title.contains("compra", ignoreCase = true) || text.contains("compra", ignoreCase = true) ||
                title.contains("envia", ignoreCase = true) || text.contains("envia", ignoreCase = true) ||
                title.contains("envío", ignoreCase = true) || text.contains("envío", ignoreCase = true) ||
                title.contains("transfer", ignoreCase = true) || text.contains("transfer", ignoreCase = true) ||
                title.contains("pagaste", ignoreCase = true) || text.contains("pagaste", ignoreCase = true) ||
                title.contains("pago", ignoreCase = true) || text.contains("pago", ignoreCase = true) ||
                title.contains("recibiste", ignoreCase = true) || text.contains("recibiste", ignoreCase = true) ||
                title.contains("plata", ignoreCase = true) || text.contains("plata", ignoreCase = true)

        if (!isFromBankApp && !hasFinancialKeywords) return

        Log.d(TAG, "Notificación bancaria detectada: $packageName -> $title: $text")

        // 1. Intentar parseo con el motor en Go
        var bank = "Banco"
        var amount = 0.0
        var description = if (title.isNotBlank()) title else "Movimiento bancario"
        var txType = "debit"

        try {
            val parsedJson = Core.parseNotificationJSON(packageName, title, text, postTime)
            Log.d(TAG, "Parseo Go Core: $parsedJson")
            val obj = JSONObject(parsedJson)

            if (obj.optBoolean("parsed", false)) {
                bank = obj.optString("bank", "Banco")
                amount = obj.optDouble("amount", 0.0)
                description = obj.optString("description", description)
                txType = obj.optString("txType", "debit")
            } else {
                // Heurística de fallback cuando no viene el monto en el texto (ej. Nequi "Envío exitoso")
                if (packageName.contains("nequi", ignoreCase = true) || title.contains("nequi", ignoreCase = true)) {
                    bank = "Nequi Colombia"
                } else if (packageName.contains("bancolombia", ignoreCase = true)) {
                    bank = "Bancolombia"
                } else if (packageName.contains("nu", ignoreCase = true)) {
                    bank = "Nu Colombia"
                } else if (packageName.contains("rappi", ignoreCase = true)) {
                    bank = "RappiPay"
                }
            }
        } catch (e: Throwable) {
            Log.e(TAG, "Error procesando con Go Core: ${e.message}", e)
        }

        // 2. Preparar el Intent para PocketSelectorActivity
        val targetIntent = Intent(this, PocketSelectorActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(PocketSelectorActivity.EXTRA_BANK, bank)
            putExtra(PocketSelectorActivity.EXTRA_AMOUNT, amount)
            putExtra(PocketSelectorActivity.EXTRA_DESC, description)
            putExtra(PocketSelectorActivity.EXTRA_TX_TYPE, txType)
            putExtra(PocketSelectorActivity.EXTRA_RAW_TEXT, "$title - $text")
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

        // 3. Mecanismo A: Si tiene permiso SYSTEM_ALERT_WINDOW (Mostrar sobre otras apps),
        // lanzar directamente la actividad para que aparezca al frente de una vez.
        var openedDirectly = false
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this)) {
            try {
                startActivity(targetIntent)
                openedDirectly = true
                Log.d(TAG, "Ventana abierta directamente sobre la app activa vía SYSTEM_ALERT_WINDOW")
            } catch (e: Throwable) {
                Log.w(TAG, "No se pudo abrir startActivity directo: ${e.message}")
            }
        }

        // 4. Mecanismo B: Lanzar Heads-up Notification con FullScreenIntent de máxima prioridad
        val amountStr = if (amount > 0) String.format("$%,.0f COP", amount) else "Monto por definir"
        val notifBuilder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("⚡ Registrar en Kpital: $bank")
            .setContentText("$amountStr - $description")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setFullScreenIntent(pendingIntent, true) // Despierta pantalla o sale banner arriba
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)

        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val notificationId = (System.currentTimeMillis() % 10000).toInt()
        notificationManager.notify(notificationId, notifBuilder.build())
        Log.d(TAG, "Heads-up / Full-Screen notification disparada (ID: $notificationId, openedDirectly=$openedDirectly)")
    }
}
