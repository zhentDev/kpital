package homes.zhent.kpital

import android.app.Notification
import android.content.Intent
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import core.Core
import org.json.JSONObject

/**
 * KpitalNotificationListener:
 * Servicio nativo ultra-ligero que intercepta notificaciones de bancos colombianos,
 * extrae los datos financieros en Go y lanza el selector interactivo de cajitas/cuentas.
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
                title.contains("compra", ignoreCase = true) || text.contains("compra", ignoreCase = true) ||
                title.contains("transf", ignoreCase = true) || text.contains("transf", ignoreCase = true)

        if (!isFinancial) return

        Log.d(TAG, "Notificación detectada desde: $packageName -> $title: $text")

        // Parseo instantáneo con el motor en Go (sin enviar aún)
        try {
            val parsedJson = Core.parseNotificationJSON(packageName, title, text, postTime)
            Log.d(TAG, "Parseo Go Core: $parsedJson")
            val obj = JSONObject(parsedJson)

            if (obj.optBoolean("success", false) && obj.optBoolean("parsed", false)) {
                val bank = obj.optString("bank", "Banco")
                val amount = obj.optDouble("amount", 0.0)
                val description = obj.optString("description", "Movimiento")
                val txType = obj.optString("txType", "debit")

                if (amount > 0) {
                    // Abrir selector interactivo de cajitas en pantalla completa / cuadro de diálogo
                    val intent = Intent(this, PocketSelectorActivity::class.java).apply {
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                        putExtra(PocketSelectorActivity.EXTRA_BANK, bank)
                        putExtra(PocketSelectorActivity.EXTRA_AMOUNT, amount)
                        putExtra(PocketSelectorActivity.EXTRA_DESC, description)
                        putExtra(PocketSelectorActivity.EXTRA_TX_TYPE, txType)
                        putExtra(PocketSelectorActivity.EXTRA_RAW_TEXT, "$title - $text")
                    }
                    startActivity(intent)
                }
            }
        } catch (e: Throwable) {
            Log.e(TAG, "Error procesando notificación con Go Core: ${e.message}", e)
        }
    }
}
