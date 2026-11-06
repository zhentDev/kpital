package homes.zhent.kpital

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors
import kotlin.math.abs
import kotlin.math.round

/**
 * Modelo para una discrepancia o alerta de tasa de interés bancaria
 * entre las cuentas de ahorro/CDTs del usuario y las tasas vigentes de mercado en Colombia / USD.
 */
data class BankRateAlert(
    val accountId: String,
    val accountName: String,
    val entityId: String,
    val entityName: String,
    val currency: String,
    val currentRateEA: Double,
    val marketRateEA: Double,
    val diff: Double,
    val direction: String, // "up" o "down"
    val productName: String,
    val sourceUrl: String,
    val suggestedEffectiveDate: String,
    val message: String,
    val isSimulated: Boolean = false
)

/**
 * BankRateAlertManager:
 * Gestiona el rastreo de tasas del sistema financiero (Nu, RappiPay, Finandina, Lulo, Pibank, Plenti),
 * detecta desactualizaciones frente a los bolsillos y cajitas del usuario en Supabase (`fi_accounts`),
 * emite notificaciones push nativas en Android y permite actualizar la tasa con un solo toque.
 */
object BankRateAlertManager {

    private const val TAG = "BankRateAlertManager"
    const val CHANNEL_ID = "kpital_rate_alerts"

    private const val SUPABASE_REST_URL = "https://ixnidzllqwbkexsrmgwz.supabase.co/rest/v1"
    private const val SUPABASE_ANON_KEY = "sb_publishable_4Gbn-hZLX764m-gz-LAhRg_914uGNIR"
    private const val DEFAULT_USER_ID = "usr_9487dd2209d2"

    private const val PREFS_NAME = "kpital_rate_alerts_prefs"
    private const val KEY_NOTIFIED_RATES = "notified_rate_signatures"

    private val executor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())

    var latestRateAlerts: List<BankRateAlert> = emptyList()
        private set

    private var onRateAlertsUpdatedListener: ((List<BankRateAlert>) -> Unit)? = null

    fun setOnRateAlertsUpdatedListener(listener: ((List<BankRateAlert>) -> Unit)?) {
        onRateAlertsUpdatedListener = listener
    }

    /**
     * Consulta las cuentas de renta fija activas en Supabase, evalúa tasas de mercado
     * y genera alertas notificando si hay cambios.
     */
    fun fetchRateAlertsAsync(
        context: Context,
        onComplete: ((List<BankRateAlert>) -> Unit)? = null
    ) {
        val appContext = context.applicationContext
        executor.execute {
            try {
                val alerts = evaluateUserAccountsAgainstMarket(appContext, DEFAULT_USER_ID)
                latestRateAlerts = alerts

                mainHandler.post {
                    onRateAlertsUpdatedListener?.invoke(alerts)
                    onComplete?.invoke(alerts)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error fetching rate alerts: ${e.message}", e)
                mainHandler.post {
                    onComplete?.invoke(latestRateAlerts)
                }
            }
        }
    }

    /**
     * Descarga cuentas de `fi_accounts` y compara solo bolsillos/cajitas con rentabilidad.
     */
    private fun evaluateUserAccountsAgainstMarket(context: Context, userId: String): List<BankRateAlert> {
        val accountsJson = queryActiveAccounts(userId) ?: return emptyList()
        val alerts = mutableListOf<BankRateAlert>()
        val todayStr = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())

        for (i in 0 until accountsJson.length()) {
            val acc = accountsJson.optJSONObject(i) ?: continue
            val extra = acc.optJSONObject("extra_json") ?: JSONObject()

            val accountId = acc.optString("id", extra.optString("id", ""))
            val accountName = acc.optString("name", extra.optString("name", "Cuenta"))
            val accNameLower = accountName.lowercase(Locale.US)
            val category = acc.optString("account_category", extra.optString("accountCategory", "")).lowercase(Locale.US)
            val entityId = acc.optString("entity_id", extra.optString("entityId", "")).lowercase(Locale.US)
            val currency = acc.optString("currency", extra.optString("currency", "COP"))

            val accType = acc.optString("type", extra.optString("type", "")).lowercase(Locale.US)

            // 1. Omitir cuentas transaccionales o sin rentabilidad (Nómina, débito, efectivo)
            if (category in listOf("payroll", "digital_wallet", "cash") ||
                accNameLower.contains("(nómina)") || accNameLower.contains("(nomina)") ||
                accNameLower.contains("(principal)") || accNameLower.contains("principal") ||
                accNameLower.contains("transaccional") || accNameLower.contains("billetera") ||
                accNameLower.contains("efectivo") || accNameLower.contains("disponible nequi") ||
                accNameLower.contains("daviplata")
            ) {
                continue
            }

            // 2. Omitir productos a plazo fijo (CDTs, Bóvedas, Cajitas Congeladas)
            // Tasa pactada contractual fija e inmutable mientras estén abiertas; no varían con el mercado
            if (category in listOf("cdt", "term_deposit", "fixed_term") ||
                accType in listOf("cdt", "term_deposit") ||
                accNameLower.contains("cdt") || accNameLower.contains("bóveda") ||
                accNameLower.contains("boveda") || accNameLower.contains("congelada") ||
                accNameLower.contains("plazo fijo") || accNameLower.contains("a término") ||
                accNameLower.contains("a termino")
            ) {
                continue
            }

            val currentRate = when {
                !acc.isNull("interest_rate_ea") -> acc.optDouble("interest_rate_ea", 0.0)
                !extra.isNull("interestRateEA") -> extra.optDouble("interestRateEA", 0.0)
                else -> 0.0
            }

            var marketRate: Double? = null
            var entityName = "Banco"
            var productName = "Cuenta de Ahorros"
            var sourceUrl = "https://www.superfinanciera.gov.co/"

            // Nu Colombia: Cajitas a la vista
            if (entityId.contains("nu") || accNameLower.contains("nu")) {
                entityName = "Nu Colombia"
                sourceUrl = "https://nu.com.co/cf/cuenta/"
                marketRate = 9.35
                productName = "Cajitas Nu (A la vista)"
            }
            // RappiPay: Bolsillos a la vista
            else if (entityId.contains("rappi") || accNameLower.contains("rappi") || entityId == "ent_1789616750396") {
                entityName = "RappiPay"
                sourceUrl = "https://rappipay.co/rappicuenta/"
                marketRate = 9.00
                productName = "Bolsillos RappiCuenta (A la vista)"
            }
            // Finandina
            else if (entityId.contains("finandina") || accNameLower.contains("flexi") || entityId == "ent_1786771791285") {
                entityName = "Banco Finandina"
                sourceUrl = "https://www.bancofinandina.com/personas/banco-digital/cuenta-flexidigital"
                if (accNameLower.contains("flexi") || accNameLower.contains("emergencia") || accNameLower.contains("bolsillo")) {
                    marketRate = 10.50
                    productName = "FlexiDigital + (Bolsillo Ahorro)"
                } else {
                    marketRate = 0.15
                    productName = "Cuenta Tradicional Finandina"
                }
            }
            // Lulo Bank
            else if (entityId.contains("lulo") || accNameLower.contains("lulo")) {
                entityName = "Lulo Bank"
                sourceUrl = "https://www.lulobank.com/"
                marketRate = 13.00
                productName = "Bolsillos Lulo Bank"
            }
            // Pibank
            else if (entityId.contains("pibank") || accNameLower.contains("pibank")) {
                entityName = "Pibank"
                sourceUrl = "https://www.pibank.co/"
                marketRate = 12.00
                productName = "Cuenta de Ahorros Pibank"
            }
            // Plenti
            else if (entityId.contains("plenti") || accNameLower.contains("plenti")) {
                entityName = "Plenti (USD)"
                sourceUrl = "https://www.plenti.app/"
                marketRate = 4.00
                productName = "Bolsillo Inteligente Plenti"
            }

            if (marketRate != null) {
                val diff = round((marketRate - currentRate) * 100) / 100.0
                if (abs(diff) >= 0.05) {
                    val alert = BankRateAlert(
                        accountId = accountId,
                        accountName = accountName,
                        entityId = entityId,
                        entityName = entityName,
                        currency = currency,
                        currentRateEA = currentRate,
                        marketRateEA = marketRate,
                        diff = diff,
                        direction = if (diff > 0) "up" else "down",
                        productName = productName,
                        sourceUrl = sourceUrl,
                        suggestedEffectiveDate = todayStr,
                        message = "Tasa de $entityName ($productName) actualizada en mercado a ${String.format(Locale.US, "%.2f", marketRate)}% E.A. (tu cuenta tiene ${String.format(Locale.US, "%.2f", currentRate)}% E.A.)."
                    )
                    alerts.add(alert)

                    // Despachar notificación si no fue notificada previamente
                    dispatchRateNotificationIfEligible(context, alert)
                }
            }
        }

        return alerts
    }

    private fun queryActiveAccounts(userId: String): JSONArray? {
        return try {
            val encodedUser = URLEncoder.encode(userId, "UTF-8")
            val url = URL("$SUPABASE_REST_URL/fi_accounts?user_id=eq.$encodedUser&is_active=eq.true&select=*")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.connectTimeout = 8000
            conn.readTimeout = 8000
            conn.setRequestProperty("Accept", "application/json")
            conn.setRequestProperty("apikey", SUPABASE_ANON_KEY)
            conn.setRequestProperty("Authorization", "Bearer $SUPABASE_ANON_KEY")

            if (conn.responseCode == 200) {
                val reader = BufferedReader(InputStreamReader(conn.inputStream))
                val sb = StringBuilder()
                var line: String?
                while (reader.readLine().also { line = it } != null) sb.append(line)
                reader.close()
                conn.disconnect()
                JSONArray(sb.toString())
            } else {
                conn.disconnect()
                null
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error en queryActiveAccounts: ${e.message}")
            null
        }
    }

    /**
     * Aplica la actualización de tasa en Supabase directamente vía PATCH.
     */
    fun applyRateUpdateAsync(
        context: Context,
        alert: BankRateAlert,
        onComplete: (Boolean) -> Unit
    ) {
        val appContext = context.applicationContext
        executor.execute {
            var success = false
            try {
                val todayStr = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
                val nowIso = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).format(Date())

                // 1. Obtener registro actual para enriquecer rate_history
                val encodedId = URLEncoder.encode(alert.accountId, "UTF-8")
                val getUrl = URL("$SUPABASE_REST_URL/fi_accounts?id=eq.$encodedId&select=*")
                val getConn = getUrl.openConnection() as HttpURLConnection
                getConn.requestMethod = "GET"
                getConn.setRequestProperty("Accept", "application/json")
                getConn.setRequestProperty("apikey", SUPABASE_ANON_KEY)
                getConn.setRequestProperty("Authorization", "Bearer $SUPABASE_ANON_KEY")

                val historyArr = JSONArray()
                var extraObj = JSONObject()

                if (getConn.responseCode == 200) {
                    val reader = BufferedReader(InputStreamReader(getConn.inputStream))
                    val sb = StringBuilder()
                    var line: String?
                    while (reader.readLine().also { line = it } != null) sb.append(line)
                    reader.close()
                    getConn.disconnect()

                    val arr = JSONArray(sb.toString())
                    if (arr.length() > 0) {
                        val currentAcc = arr.getJSONObject(0)
                        extraObj = currentAcc.optJSONObject("extra_json") ?: JSONObject()
                        val existingHistory = currentAcc.optJSONArray("rate_history_json")
                            ?: extraObj.optJSONArray("rateHistory")
                        if (existingHistory != null) {
                            for (h in 0 until existingHistory.length()) {
                                historyArr.put(existingHistory.get(h))
                            }
                        }
                    }
                }

                // Añadir nuevo hito de tasa
                val newRateEntry = JSONObject().apply {
                    put("date", todayStr)
                    put("rateEA", alert.marketRateEA)
                    put("updatedAt", nowIso)
                }
                historyArr.put(newRateEntry)

                // Actualizar extra_json
                extraObj.put("interestRateEA", alert.marketRateEA)
                extraObj.put("rateHistory", historyArr)

                // 2. PATCH al registro
                val patchUrl = URL("$SUPABASE_REST_URL/fi_accounts?id=eq.$encodedId")
                val patchConn = patchUrl.openConnection() as HttpURLConnection
                patchConn.requestMethod = "POST"
                patchConn.setRequestProperty("X-HTTP-Method-Override", "PATCH")
                patchConn.setRequestProperty("Content-Type", "application/json")
                patchConn.setRequestProperty("Prefer", "return=minimal")
                patchConn.setRequestProperty("apikey", SUPABASE_ANON_KEY)
                patchConn.setRequestProperty("Authorization", "Bearer $SUPABASE_ANON_KEY")
                patchConn.doOutput = true

                val payload = JSONObject().apply {
                    put("interest_rate_ea", alert.marketRateEA)
                    put("rate_history_json", historyArr)
                    put("extra_json", extraObj)
                    put("updated_at", nowIso)
                }

                OutputStreamWriter(patchConn.outputStream).use { writer ->
                    writer.write(payload.toString())
                    writer.flush()
                }

                val responseCode = patchConn.responseCode
                patchConn.disconnect()

                if (responseCode in 200..299) {
                    success = true
                    // Remover de la lista local de alertas pendientes
                    latestRateAlerts = latestRateAlerts.filter { it.accountId != alert.accountId }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error aplicando actualización de tasa: ${e.message}", e)
            }

            mainHandler.post {
                onRateAlertsUpdatedListener?.invoke(latestRateAlerts)
                onComplete(success)
            }
        }
    }

    /**
     * Prueba Flash en Vivo: simula un ajuste de rentabilidad en uno de los bolsillos
     * y genera la notificación push nativa sonora inmediatamente.
     */
    fun simulateFlashRateTest(context: Context) {
        val appContext = context.applicationContext
        executor.execute {
            try {
                val accountsJson = queryActiveAccounts(DEFAULT_USER_ID) ?: JSONArray()
                var targetAcc: JSONObject? = null

                // Buscar un bolsillo de alto rendimiento
                for (i in 0 until accountsJson.length()) {
                    val acc = accountsJson.optJSONObject(i) ?: continue
                    val cat = acc.optString("account_category", "").lowercase(Locale.US)
                    val name = acc.optString("name", "").lowercase(Locale.US)
                    if (cat == "high_yield" && !name.contains("nómina") && !name.contains("principal")) {
                        targetAcc = acc
                        break
                    }
                }

                if (targetAcc == null && accountsJson.length() > 0) {
                    targetAcc = accountsJson.getJSONObject(0)
                }

                val todayStr = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
                val accId = targetAcc?.optString("id") ?: "acc_sim_nu"
                val accName = targetAcc?.optString("name") ?: "Cajita Viaje"
                val currRate = targetAcc?.optDouble("interest_rate_ea", 9.35) ?: 9.35
                val simRate = if (currRate < 12.0) round((currRate + 0.90) * 100) / 100.0 else round((currRate - 0.50) * 100) / 100.0
                val diff = round((simRate - currRate) * 100) / 100.0

                val accNameLower = accName.lowercase(Locale.US)
                val entIdLower = (targetAcc?.optString("entity_id") ?: "").lowercase(Locale.US)
                val entityName: String
                val productName: String
                val sourceUrl: String

                if (entIdLower.contains("rappi") || accNameLower.contains("rappi")) {
                    entityName = "RappiPay"
                    productName = "Bolsillos RappiCuenta (A la vista)"
                    sourceUrl = "https://rappipay.co/rappicuenta/"
                } else if (entIdLower.contains("finandina") || accNameLower.contains("flexi") || entIdLower == "ent_1786771791285") {
                    entityName = "Banco Finandina"
                    productName = "FlexiDigital + (Bolsillo Ahorro)"
                    sourceUrl = "https://www.bancofinandina.com/personas/banco-digital/cuenta-flexidigital"
                } else if (entIdLower.contains("nu") || accNameLower.contains("nu")) {
                    entityName = "Nu Colombia"
                    productName = "Cajitas Nu (A la vista)"
                    sourceUrl = "https://nu.com.co/cf/cuenta/"
                } else {
                    entityName = "Banco"
                    productName = "Cuenta de Ahorros"
                    sourceUrl = "https://www.superfinanciera.gov.co/"
                }

                val simAlert = BankRateAlert(
                    accountId = accId,
                    accountName = accName,
                    entityId = if (isRappi) "ent_rappi" else "ent_nu",
                    entityName = entityName,
                    currency = "COP",
                    currentRateEA = currRate,
                    marketRateEA = simRate,
                    diff = diff,
                    direction = if (diff > 0) "up" else "down",
                    productName = productName,
                    sourceUrl = sourceUrl,
                    suggestedEffectiveDate = todayStr,
                    message = "🧪 [Prueba Flash] $entityName reportó ajuste de rentabilidad en $productName a ${String.format(Locale.US, "%.2f", simRate)}% E.A. (tu bolsillo '$accName' tiene ${String.format(Locale.US, "%.2f", currRate)}% E.A.).",
                    isSimulated = true
                )

                val updatedList = mutableListOf(simAlert)
                updatedList.addAll(latestRateAlerts.filter { it.accountId != simAlert.accountId })
                latestRateAlerts = updatedList

                // Emitir notificación push sonora
                dispatchRateNotification(appContext, simAlert, force = true)

                mainHandler.post {
                    onRateAlertsUpdatedListener?.invoke(latestRateAlerts)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error en simulateFlashRateTest: ${e.message}", e)
            }
        }
    }

    private fun dispatchRateNotificationIfEligible(context: Context, alert: BankRateAlert) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val sig = "${alert.accountId}_${alert.marketRateEA}"
        val notified = prefs.getStringSet(KEY_NOTIFIED_RATES, emptySet()) ?: emptySet()
        if (notified.contains(sig)) return

        dispatchRateNotification(context, alert, force = false)

        val newSet = notified.toMutableSet().apply { add(sig) }
        prefs.edit().putStringSet(KEY_NOTIFIED_RATES, newSet).apply()
    }

    private fun dispatchRateNotification(context: Context, alert: BankRateAlert, force: Boolean = false) {
        createNotificationChannel(context)

        val title = if (alert.isSimulated) {
            "⚡ Prueba Flash: Ajuste en ${alert.entityName}"
        } else {
            "📈 Cambio de Tasa: ${alert.entityName} (${String.format(Locale.US, "%+.2f", alert.diff)}%)"
        }

        val rateFormatted = String.format(Locale.US, "%.2f", alert.marketRateEA)
        val currentFormatted = String.format(Locale.US, "%.2f", alert.currentRateEA)
        val content = "${alert.productName} ahora rinde al $rateFormatted% E.A. (tu bolsillo '${alert.accountName}' está al $currentFormatted%). Toca para sincronizar."

        val openIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            putExtra("OPEN_TAB", "ALERTS")
            putExtra("RATE_ALERT_ACCOUNT_ID", alert.accountId)
        }

        val pendingIntent = PendingIntent.getActivity(
            context,
            alert.accountId.hashCode(),
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        val notif = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(content)
            .setStyle(NotificationCompat.BigTextStyle().bigText(content))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setSound(soundUri)
            .setVibrate(longArrayOf(0, 250, 150, 250))
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build()

        val notifManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        notifManager?.notify("rate_alert_${alert.accountId}".hashCode(), notif)
    }

    private fun createNotificationChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val name = "Alertas de Tasas Bancarias"
            val descriptionText = "Notificaciones de cambios de rendimiento en cuentas de ahorro y CDTs de Colombia y USD"
            val importance = NotificationManager.IMPORTANCE_HIGH
            val channel = NotificationChannel(CHANNEL_ID, name, importance).apply {
                description = descriptionText
                enableLights(true)
                lightColor = Color.parseColor("#38bdf8")
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 250, 150, 250)
            }
            val notifManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            notifManager?.createNotificationChannel(channel)
        }
    }
}
