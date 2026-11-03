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
 * Servicio nativo ultra-ligero que intercepta notificaciones de bancos colombianos.
 * Si la notificación es de un banco conocido pero no trae el monto explícito (ej. Nequi "Envío exitoso"),
 * igual despierta el selector interactivo permitiendo al usuario ingresar el valor en 1 segundo.
 */
class KpitalNotificationListener : NotificationListenerService() {

    companion object {
        private const val TAG = "KpitalMobile"
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
                // Fallback heurístico si Go no encontró monto en el texto (ej. Nequi sin monto en push)
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

        // 2. Si es de banco, SIEMPRE abrir el selector (aunque amount sea 0, para que el usuario pueda escribirlo)
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
