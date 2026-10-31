package homes.zhent.kpital

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log

/**
 * KpitalNotificationListener:
 * Servicio nativo ultra-ligero que intercepta notificaciones de bancos colombianos
 * y delega el análisis, parseo y sincronización HTTP directamente al motor en Go.
 */
class KpitalNotificationListener : NotificationListenerService() {

    companion object {
        private const val TAG = "KpitalMobile"
        // Paquetes conocidos de banca colombiana para optimización
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

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        super.onNotificationPosted(sbn)
        if (sbn == null) return

        val packageName = sbn.packageName ?: ""
        val extras = sbn.notification?.extras ?: return

        val title = extras.getString(Notification.EXTRA_TITLE) ?: ""
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""
        val postTime = sbn.postTime

        if (title.isBlank() && text.isBlank()) return

        // Procesa si es banco conocido o contiene indicadores de dinero
        val isFinancial = MONITORED_PACKAGES.any { packageName.contains(it, ignoreCase = true) } ||
                title.contains("$") || text.contains("$") ||
                title.contains("compra", ignoreCase = true) || text.contains("compra", ignoreCase = true)

        if (!isFinancial) return

        Log.d(TAG, "Notificación detectada desde: $packageName -> $title: $text")

        // Invocación directa al Core compilado en Go (gomobile)
        try {
            // Core.processNotificationJSON es exportado automáticamente por Go
            val resultJson = Core.processNotificationJSON(packageName, title, text, postTime)
            Log.d(TAG, "Respuesta Go Core: $resultJson")
        } catch (e: Throwable) {
            Log.e(TAG, "Error invocando Go Core: ${e.message}", e)
        }
    }
}
