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
            "co.nu.production",
            "com.nu.app",
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
            "caja social", "bcs", "87227", "bancolombia", "davivienda", "daviplata",
            "banco de bogota", "banco de bogotá", "banco de occidente",
            "falabella", "scotiabank", "colpatria", "bbva", "nequi", "nu colombia", "nubank",
            "rappi", "rappipay", "rappicuenta", "rappicard", "lulo", "lulobank", "mercado pago"
        )

        /**
         * Identifica si una notificación es puramente informativa de saldo diario (ej. Banco Caja Social),
         * oferta comercial de préstamos/tarjetas, o código de seguridad, para no crear movimientos falsos.
         */
        fun isInformationalOrIgnored(lower: String): Boolean {
            // A. Marketing, ofertas, promociones de delivery o cupones comerciales (Rappi, etc.)
            val isMarketing = listOf(
                "preaprobado", "cupo preaprobado", "crédito preaprobado", "credito preaprobado",
                "pide tu préstamo", "pide tu prestamo", "solicita tu crédito", "solicita tu tarjeta",
                "avance disponible", "te prestamos", "abre tu cdt", "salvavidas", "propulsor",
                "cupo disponible de",
                // Promociones comerciales de delivery, cupones y descuentos (Rappi, etc.)
                " off", "% off", "$ off", "off!", "off.", "descuento", "descuentos",
                "cupón", "cupon", "cupones", "código promo", "codigo promo", "promo", "promos",
                "promoción", "promocion", "aplica t&c", "aplican t&c", "t&c",
                "términos y condiciones", "terminos y condiciones",
                "pide en rappi", "pide ya", "te llega de una", "envío gratis", "envio gratis",
                "2x1", "3x2", "consiente al", "consiente a", "válido también en", "valido tambien en",
                "solo por hoy", "imperdible", "no te pierdas", "aprovecha", "te regalamos",
                "hasta 40%", "hasta 50%", "hasta 30%", "hasta 20%", "hasta 70%",
                // Entretenimiento, boletería, conciertos y preventas comerciales (Nequi Visa, etc.)
                "preventa", "preventa exclusiva", "boleta", "boletas", "bolestas", "boletería", "boleteria",
                "entrada", "entradas", "concierto", "hazlo aquí", "hazlo aqui", "compra tus boletas",
                "compra tus bolestas", "compra tus entradas", "tarjeta nequi visa"
            ).any { lower.contains(it) }
            if (isMarketing) return true

            // B. Seguridad, claves dinámicas, tokens
            val isSecurity = listOf(
                "clave dinamica", "clave dinámica", "código de seguridad", "codigo de seguridad",
                "token", "código de verificación", "codigo de verificacion", "inicio de sesion",
                "inicio de sesión", "acceso exitoso", "no compartas tu clave", "se ha generado tu código"
            ).any { lower.contains(it) }
            if (isSecurity) return true

            // C. Transacciones fallidas o declinadas
            val isDeclined = listOf(
                "rechazad", "declinad", "fallid", "no exitos", "fondos insuficientes", "saldo insuficiente"
            ).any { lower.contains(it) }
            if (isDeclined) return true

            // D. Saldo diario puramente informativo (Caja Social, Bancolombia, Davivienda, etc.)
            val hasTxVerb = listOf(
                "compra", "compraste", "pagaste", "pago de", "pago por", "pago para", "debito por",
                "débito por", "transferiste", "enviaste", "envío", "envio", "retiro", "retiraste",
                "sacaste", "recibiste", "te transfirieron", "te pasaron", "te enviaron", "te llego plata",
                "te llegó plata", "consignacion", "consignación", "nomina", "nómina", "devolucion",
                "devolución", "pago recibido", "cashback", "reembolso", "rendimiento", "rendimientos"
            ).any { lower.contains(it) }

            if (!hasTxVerb) {
                val hasBalanceIndicator = listOf(
                    "tu saldo", "saldo disponible", "saldo en cuenta", "su saldo", "saldo actual",
                    "saldo nuevo", "nuevo saldo", "saldo al", "consulta de saldo", "tienes un saldo",
                    "saldo total", "tu dinero creció",
                    // Saldo diario informativo Caja Social y bancos colombianos
                    "al final del", "al final de ", "el saldo de su cuenta", "el saldo de tu cuenta", "el saldo de la cuenta",
                    "saldo de su cuenta", "saldo de tu cuenta", "saldo de la cuenta", "saldo de su",
                    "saldo de tu", "saldo al corte", "saldo al cierre", "saldo al final", "fue de %", "fue de $"
                ).any { lower.contains(it) }
                if (hasBalanceIndicator) return true
            }

            return false
        }
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
        val title = (extras.getCharSequence(Notification.EXTRA_TITLE_BIG)?.toString()
            ?: extras.getString(Notification.EXTRA_TITLE)
            ?: extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString()
            ?: "").trim()

        val textLines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)
        val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString() ?: ""
        val normalText = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""
        val summaryText = extras.getCharSequence(Notification.EXTRA_SUMMARY_TEXT)?.toString() ?: ""
        val infoText = extras.getCharSequence(Notification.EXTRA_INFO_TEXT)?.toString() ?: ""
        val subText = extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString() ?: ""

        val allBodyParts = mutableListOf<String>()
        if (bigText.isNotBlank()) allBodyParts.add(bigText)
        if (normalText.isNotBlank() && !allBodyParts.contains(normalText)) allBodyParts.add(normalText)
        if (summaryText.isNotBlank() && !allBodyParts.contains(summaryText)) allBodyParts.add(summaryText)
        if (infoText.isNotBlank() && !allBodyParts.contains(infoText)) allBodyParts.add(infoText)
        if (subText.isNotBlank() && !allBodyParts.contains(subText) && subText != title) allBodyParts.add(subText)
        if (textLines != null) {
            for (line in textLines) {
                val str = line?.toString()?.trim() ?: ""
                if (str.isNotBlank() && !allBodyParts.contains(str)) {
                    allBodyParts.add(str)
                }
            }
        }

        val postTime = sbn.postTime
        if (title.isBlank() && allBodyParts.isEmpty()) return

        val textToProcess = if (isFromBankApp) {
            allBodyParts.joinToString(" ").replace("\n", " ").trim()
        } else {
            if (textLines != null && textLines.isNotEmpty()) {
                textLines.last().toString().trim()
            } else {
                normalText.split("\n").filter { it.isNotBlank() }.lastOrNull()?.trim() ?: normalText.trim()
            }
        }

        // 2. FILTRADO DE CONTENIDO FINANCIERO Y SEGURIDAD:
        val lower = (title + " " + textToProcess).lowercase()

        // 2.0 Descarte preventivo de saldos informativos diarios (Caja Social, Bancolombia, etc.) y promociones
        if (isInformationalOrIgnored(lower)) {
            Log.i(TAG, "[$eventType] Notificación descartada por ser informativa de saldo, oferta o seguridad: '$title - $textToProcess'")
            return
        }
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

            if (obj.optBoolean("isBalance", false) || obj.optBoolean("isIgnored", false) || obj.optString("txType") == "balance_digest" || obj.optBoolean("isInformational", false)) {
                Log.i(TAG, "Notificación informativa/descartada ($packageName): ${obj.optString("ignoreReason", "informativa")}. Ignorando.")
                return
            }

            // CRÍTICO: Una notificación solo se considera transacción si Go Core la parseó exitosamente Y tiene monto > 0
            if (!obj.optBoolean("parsed", false) || obj.optDouble("amount", 0.0) <= 0.0) {
                Log.i(TAG, "Notificación descartada: No contiene una transacción financiera válida con monto mayor a 0 (parsed=${obj.optBoolean("parsed")}, amount=${obj.optDouble("amount")}) en '$title - $textToProcess'.")
                return
            }

            bank = obj.optString("bank", "Banco")
            amount = obj.optDouble("amount", 0.0)
            description = obj.optString("description", description)
            txType = obj.optString("txType", "debit")
        } catch (e: Throwable) {
            Log.e(TAG, "Error procesando con Go Core: ${e.message}", e)
            return
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
