package homes.zhent.kpital

import android.app.Notification
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
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import kotlin.math.round

/**
 * Modelo para una alerta de venta de acciones o ETFs enriquecida con cotizaciones en vivo.
 */
data class EnrichedStockAlert(
    val id: String,
    val ticker: String,
    val rawTicker: String,
    val companyName: String,
    val scope: String,
    val targetId: String,
    val lotLabel: String?,
    val alertType: String, // "PROFIT_TARGET" o "STOP_LOSS"
    val targetValue: Double,
    val entryPrice: Double,
    val currentPrice: Double,
    val targetPrice: Double,
    val currentReturnPct: Double,
    val distancePct: Double,
    val status: String, // "ACTIVE", "NEAR", "TRIGGERED", "PAUSED"
    val isActive: Boolean,
    val isTriggeredNow: Boolean,
    val triggeredAt: String?,
    val change24h: Double,
    val changePct24h: Double
) {
    companion object {
        fun fromJson(obj: JSONObject): EnrichedStockAlert {
            return EnrichedStockAlert(
                id = obj.optString("id", ""),
                ticker = obj.optString("ticker", ""),
                rawTicker = obj.optString("raw_ticker", obj.optString("ticker", "")),
                companyName = obj.optString("company_name", obj.optString("ticker", "")),
                scope = obj.optString("scope", "strategy"),
                targetId = obj.optString("target_id", "historical"),
                lotLabel = if (obj.isNull("lot_label")) null else obj.optString("lot_label"),
                alertType = obj.optString("alert_type", "PROFIT_TARGET"),
                targetValue = obj.optDouble("target_value", 10.0),
                entryPrice = obj.optDouble("entry_price", 0.0),
                currentPrice = obj.optDouble("current_price", 0.0),
                targetPrice = obj.optDouble("target_price", 0.0),
                currentReturnPct = obj.optDouble("current_return_pct", 0.0),
                distancePct = obj.optDouble("distance_pct", 0.0),
                status = obj.optString("status", "ACTIVE"),
                isActive = obj.optBoolean("is_active", true),
                isTriggeredNow = obj.optBoolean("is_triggered_now", false),
                triggeredAt = if (obj.isNull("triggered_at")) null else obj.optString("triggered_at"),
                change24h = obj.optDouble("change_24h", 0.0),
                changePct24h = obj.optDouble("change_pct_24h", 0.0)
            )
        }
    }
}

data class AlertsPollResult(
    val count: Int,
    val activeCount: Int,
    val triggeredCount: Int,
    val nearCount: Int,
    val newlyTriggered: List<EnrichedStockAlert>,
    val alerts: List<EnrichedStockAlert>,
    val lastUpdatedMillis: Long = System.currentTimeMillis()
)

/**
 * StockAlertManager:
 * Administra el monitoreo periódico de alertas de venta de bolsa (acciones y ETFs)
 * desde el backend de Kpital y Supabase, enriquecidas con cotizaciones en tiempo real de Yahoo Finance.
 * Cuenta con resiliencia dual:
 * 1. Intenta consultar el endpoint agregado '/api/alerts/live'.
 * 2. Si no está disponible (HTTP 405/404 o Render sleeping), ejecuta automáticamente el pipeline
 *    directo de resolución (/api/alerts + Supabase PostgreSQL + /api/prices/live) sin fallar jamás.
 * Si alguna alerta alcanza su condición de venta (Take Profit o Stop Loss),
 * dispara notificaciones push nativas en el teléfono móvil con sonido de alarma y vibración.
 */
object StockAlertManager {

    private const val TAG = "StockAlertManager"
    const val CHANNEL_ID = "kpital_stock_alerts_channel"

    private const val DEFAULT_BACKEND_URL = "https://titanes-portfolio-backend.onrender.com"
    private const val WEBHOOK_SECRET = "titanes_sec_e8b919f4088a53e6b4d32091c6e1a4e2"
    private const val SUPABASE_REST_URL = "https://ixnidzllqwbkexsrmgwz.supabase.co/rest/v1"
    private const val SUPABASE_ANON_KEY = "sb_publishable_4Gbn-hZLX764m-gz-LAhRg_914uGNIR"
    private const val DEFAULT_USER_ID = "usr_9487dd2209d2"

    private var scheduler: ScheduledExecutorService? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    private const val PREFS_NAME = "kpital_stock_alerts_prefs"
    private const val KEY_NOTIFIED_IDS = "notified_alert_ids"

    private fun getNotifiedAlertIds(context: Context): MutableSet<String> {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getStringSet(KEY_NOTIFIED_IDS, emptySet())?.toMutableSet() ?: mutableSetOf()
    }

    private fun addNotifiedAlertId(context: Context, id: String) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val current = prefs.getStringSet(KEY_NOTIFIED_IDS, emptySet())?.toMutableSet() ?: mutableSetOf()
        current.add(id)
        prefs.edit().putStringSet(KEY_NOTIFIED_IDS, current).apply()
    }

    private fun addNotifiedAlertIds(context: Context, ids: Collection<String>) {
        if (ids.isEmpty()) return
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val current = prefs.getStringSet(KEY_NOTIFIED_IDS, emptySet())?.toMutableSet() ?: mutableSetOf()
        current.addAll(ids)
        prefs.edit().putStringSet(KEY_NOTIFIED_IDS, current).apply()
    }

    var latestResult: AlertsPollResult? = null
        private set

    private var onAlertsUpdatedListener: ((AlertsPollResult) -> Unit)? = null

    fun setOnAlertsUpdatedListener(listener: ((AlertsPollResult) -> Unit)?) {
        onAlertsUpdatedListener = listener
    }

    /**
     * Inicia el monitoreo en segundo plano (cada 5 minutos por defecto).
     */
    fun startPolling(context: Context, intervalMinutes: Long = 5) {
        val appContext = context.applicationContext
        createNotificationChannel(appContext)

        if (scheduler != null && !scheduler!!.isShutdown) {
            return
        }

        scheduler = Executors.newSingleThreadScheduledExecutor()
        scheduler?.scheduleWithFixedDelay({
            try {
                pollAlerts(appContext)
                DebtAlertManager.fetchDebtAlertsAsync(appContext)
            } catch (t: Throwable) {
                Log.e(TAG, "Error durante polling de alertas: ${t.message}", t)
            }
        }, 0, intervalMinutes, TimeUnit.MINUTES)

        Log.d(TAG, "Polling de alertas de venta iniciado (cada $intervalMinutes min)")
    }

    fun stopPolling() {
        try {
            scheduler?.shutdownNow()
            scheduler = null
            Log.d(TAG, "Polling de alertas de venta detenido")
        } catch (e: Exception) {
            Log.w(TAG, "Error deteniendo scheduler: ${e.message}")
        }
    }

    /**
     * Consulta bajo demanda (forzado o manual por el usuario).
     */
    fun fetchLiveAlertsAsync(context: Context, onComplete: ((AlertsPollResult?) -> Unit)? = null) {
        val appContext = context.applicationContext
        createNotificationChannel(appContext)

        Executors.newSingleThreadExecutor().execute {
            try {
                val result = pollAlerts(appContext)
                mainHandler.post {
                    onComplete?.invoke(result)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error en fetchLiveAlertsAsync: ${e.message}", e)
                mainHandler.post {
                    onComplete?.invoke(latestResult)
                }
            }
        }
    }

    /**
     * Orquestador maestro de consulta de alertas.
     * Intenta el endpoint live del backend y ante cualquier eventualidad recurre al pipeline directo.
     */
    private fun pollAlerts(context: Context): AlertsPollResult? {
        // Intento 1: Endpoint unificado /api/alerts/live
        try {
            val liveResult = pollFromBackendLive(context)
            if (liveResult != null && liveResult.alerts.isNotEmpty()) {
                latestResult = liveResult
                dispatchNotificationsAndCallback(context, liveResult)
                return liveResult
            }
        } catch (e: Exception) {
            Log.d(TAG, "Endpoint /api/alerts/live no disponible: ${e.message}. Pasando a resolución directa...")
        }

        // Intento 2: Pipeline directo de resolución (Backend /api/alerts + Supabase + /api/prices/live)
        return try {
            val directResult = pollDirectFallback(context)
            if (directResult != null) {
                latestResult = directResult
                dispatchNotificationsAndCallback(context, directResult)
                directResult
            } else {
                latestResult
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error en resolución directa de alertas: ${e.message}", e)
            latestResult
        }
    }

    /**
     * Intenta consultar el endpoint agregado /api/alerts/live del backend.
     */
    private fun pollFromBackendLive(context: Context): AlertsPollResult? {
        val prefs = context.getSharedPreferences("kpital_mobile_prefs", Context.MODE_PRIVATE)
        val token = prefs.getString("auth_token", "") ?: ""

        val urlString = "$DEFAULT_BACKEND_URL/api/alerts/live"
        val url = URL(urlString)
        val conn = url.openConnection() as HttpURLConnection

        conn.requestMethod = "GET"
        conn.connectTimeout = 12000
        conn.readTimeout = 15000
        conn.setRequestProperty("Accept", "application/json")
        conn.setRequestProperty("X-Webhook-Secret", WEBHOOK_SECRET)
        if (token.isNotBlank()) {
            conn.setRequestProperty("Authorization", "Bearer $token")
        }

        val code = conn.responseCode
        if (code != 200) {
            conn.disconnect()
            return null
        }

        val reader = BufferedReader(InputStreamReader(conn.inputStream))
        val sb = StringBuilder()
        var line: String?
        while (reader.readLine().also { line = it } != null) {
            sb.append(line)
        }
        reader.close()
        conn.disconnect()

        val json = JSONObject(sb.toString())
        val alertsArray = json.optJSONArray("alerts")
        val newlyTriggeredArray = json.optJSONArray("newly_triggered")

        val alertList = mutableListOf<EnrichedStockAlert>()
        if (alertsArray != null) {
            for (i in 0 until alertsArray.length()) {
                val itemObj = alertsArray.getJSONObject(i)
                alertList.add(EnrichedStockAlert.fromJson(itemObj))
            }
        }

        val newlyTriggeredList = mutableListOf<EnrichedStockAlert>()
        if (newlyTriggeredArray != null) {
            for (i in 0 until newlyTriggeredArray.length()) {
                val itemObj = newlyTriggeredArray.getJSONObject(i)
                newlyTriggeredList.add(EnrichedStockAlert.fromJson(itemObj))
            }
        }

        return AlertsPollResult(
            count = json.optInt("count", alertList.size),
            activeCount = json.optInt("active_count", 0),
            triggeredCount = json.optInt("triggered_count", 0),
            nearCount = json.optInt("near_count", 0),
            newlyTriggered = newlyTriggeredList,
            alerts = alertList,
            lastUpdatedMillis = System.currentTimeMillis()
        )
    }

    /**
     * Pipeline directo y resiliente:
     * 1. Consulta alertas activas en el Backend /api/alerts (o directamente en Supabase si Render duerme).
     * 2. Consulta lotes de compra en Supabase para obtener el precio de entrada exacto (P₀) o WAP.
     * 3. Consulta cotizaciones en tiempo real en Yahoo Finance (/api/prices/live).
     * 4. Calcula precios objetivos, retornos actuales, distancias y estados.
     */
    private fun pollDirectFallback(context: Context): AlertsPollResult? {
        val prefs = context.getSharedPreferences("kpital_mobile_prefs", Context.MODE_PRIVATE)
        val token = prefs.getString("auth_token", "") ?: ""
        val userId = prefs.getString("user_id", DEFAULT_USER_ID)?.ifBlank { DEFAULT_USER_ID } ?: DEFAULT_USER_ID

        // 1. Obtener lista de alertas
        val rawAlertsArray = fetchRawAlerts(token, userId)
        if (rawAlertsArray == null || rawAlertsArray.length() == 0) {
            Log.w(TAG, "No se obtuvieron alertas de stock para el usuario $userId")
            return AlertsPollResult(0, 0, 0, 0, emptyList(), emptyList())
        }

        // 2. Obtener compras/lotes de Supabase para calcular costo base (P₀)
        val purchases = fetchPurchasesFromSupabase(userId)
        val lotsMap = mutableMapOf<String, JSONObject>()
        val wapCost = mutableMapOf<String, Double>()
        val wapShares = mutableMapOf<String, Double>()

        for (p in purchases) {
            val id = p.optString("id", "").trim().lowercase()
            if (id.isNotBlank()) lotsMap[id] = p

            val t = p.optString("ticker", "").uppercase().trim()
            if (t.isNotBlank()) {
                val sh = p.optDouble("shares", 0.0)
                val pr = p.optDouble("purchase_price", 0.0)
                wapCost[t] = (wapCost[t] ?: 0.0) + (pr * sh)
                wapShares[t] = (wapShares[t] ?: 0.0) + sh
            }
        }

        val wapMap = mutableMapOf<String, Double>()
        for ((t, totalCost) in wapCost) {
            val sh = wapShares[t] ?: 0.0
            if (sh > 0) wapMap[t] = totalCost / sh
        }

        // 3. Extraer tickers únicos para cotizaciones de mercado
        val cleanTickers = mutableSetOf<String>()
        for (i in 0 until rawAlertsArray.length()) {
            val alertObj = rawAlertsArray.getJSONObject(i)
            val rawTicker = alertObj.optString("ticker", "")
            val clean = rawTicker.split("::")[0].trim().uppercase()
            if (clean.isNotBlank()) {
                cleanTickers.add(clean)
            }
        }

        // 4. Obtener cotizaciones en vivo
        val quotesMap = fetchMarketQuotes(cleanTickers)

        // 5. Enriquecer cada alerta
        val enrichedList = mutableListOf<EnrichedStockAlert>()
        val newlyTriggered = mutableListOf<EnrichedStockAlert>()

        for (i in 0 until rawAlertsArray.length()) {
            val alertObj = rawAlertsArray.getJSONObject(i)
            val rawTicker = alertObj.optString("ticker", "").trim()
            if (rawTicker.isBlank()) continue

            val cleanTicker = rawTicker.split("::")[0].trim().uppercase()
            val lotId = if (rawTicker.contains("::")) rawTicker.split("::")[1].trim().lowercase() else null

            // Resolver precio de entrada (P₀)
            var entryPrice = 0.0
            var lotLabel: String? = null

            if (lotId != null && lotsMap.containsKey(lotId)) {
                val lot = lotsMap[lotId]!!
                entryPrice = lot.optDouble("purchase_price", 0.0)
                lotLabel = "Lote " + lot.optString("date", "")
            } else if (wapMap.containsKey(cleanTicker) && (wapMap[cleanTicker] ?: 0.0) > 0.0) {
                entryPrice = wapMap[cleanTicker]!!
                lotLabel = "Posición Consolidada (WAP)"
            } else if (!alertObj.isNull("last_checked_price") && alertObj.optDouble("last_checked_price", 0.0) > 0.0) {
                entryPrice = alertObj.optDouble("last_checked_price", 0.0)
                lotLabel = "Precio de Referencia"
            }

            // Resolver precio de mercado actual
            val quote = quotesMap[cleanTicker]
            val hasValidMarketQuote = quote != null && quote.optDouble("price", 0.0) > 0.0
            val currentPrice = if (hasValidMarketQuote) quote!!.optDouble("price", 0.0)
                else (if (entryPrice > 0.0) entryPrice else 100.0)

            if (entryPrice <= 0.0) {
                entryPrice = currentPrice
                lotLabel = "Precio Inicial"
            }

            val targetVal = alertObj.optDouble("target_value", 10.0)
            val alertType = alertObj.optString("alert_type", "PROFIT_TARGET").uppercase()
            val isActive = alertObj.optBoolean("is_active", true)
            val triggeredAt = if (alertObj.isNull("triggered_at")) null else alertObj.optString("triggered_at")

            // Cálculos porcentuales
            val currentReturnPct = if (entryPrice > 0.0 && hasValidMarketQuote) {
                round(((currentPrice - entryPrice) / entryPrice * 100.0) * 100.0) / 100.0
            } else 0.0

            val targetPrice = round((entryPrice * (1.0 + (targetVal / 100.0))) * 100.0) / 100.0

            val distancePct: Double
            if (alertType == "PROFIT_TARGET") {
                distancePct = round((targetVal - currentReturnPct) * 100.0) / 100.0
            } else { // STOP_LOSS
                distancePct = round((currentReturnPct - targetVal) * 100.0) / 100.0
            }

            // Una condición SOLO puede cumplirse si hay cotización real de mercado,
            // la alerta está ACTIVA y NO fue disparada previamente.
            val isConditionMet: Boolean = if (!hasValidMarketQuote || !isActive || !triggeredAt.isNullOrBlank()) {
                false
            } else if (alertType == "PROFIT_TARGET") {
                currentReturnPct >= targetVal
            } else {
                currentReturnPct <= targetVal
            }

            var isTriggeredNow = false
            val status = when {
                !isActive -> "PAUSED"
                !triggeredAt.isNullOrBlank() -> "TRIGGERED"
                isConditionMet -> {
                    isTriggeredNow = true
                    "TRIGGERED"
                }
                distancePct in 0.0..1.5 -> "NEAR"
                else -> "ACTIVE"
            }

            val companyName = quote?.optString("name")?.ifBlank { cleanTicker } ?: cleanTicker
            val change24h = quote?.optDouble("change", 0.0) ?: 0.0
            val changePct24h = quote?.optDouble("change_pct", 0.0) ?: 0.0

            val item = EnrichedStockAlert(
                id = alertObj.optString("id", "alt_${System.currentTimeMillis()}_$i"),
                ticker = cleanTicker,
                rawTicker = rawTicker,
                companyName = companyName,
                scope = alertObj.optString("scope", "strategy"),
                targetId = alertObj.optString("target_id", "historical"),
                lotLabel = lotLabel,
                alertType = alertType,
                targetValue = targetVal,
                entryPrice = round(entryPrice * 100.0) / 100.0,
                currentPrice = round(currentPrice * 100.0) / 100.0,
                targetPrice = targetPrice,
                currentReturnPct = currentReturnPct,
                distancePct = distancePct,
                status = status,
                isActive = isActive,
                isTriggeredNow = isTriggeredNow,
                triggeredAt = triggeredAt,
                change24h = round(change24h * 100.0) / 100.0,
                changePct24h = round(changePct24h * 100.0) / 100.0
            )

            if (isTriggeredNow) {
                newlyTriggered.add(item)
            }
            enrichedList.add(item)
        }

        // Ordenar: TRIGGERED primero, luego NEAR, luego ACTIVE por distancia restante
        enrichedList.sortWith(compareBy({
            when (it.status) {
                "TRIGGERED" -> 0
                "NEAR" -> 1
                "ACTIVE" -> 2
                else -> 3
            }
        }, { it.distancePct }))

        val activeCount = enrichedList.count { it.status == "ACTIVE" || it.status == "NEAR" }
        val triggeredCount = enrichedList.count { it.status == "TRIGGERED" }
        val nearCount = enrichedList.count { it.status == "NEAR" }

        return AlertsPollResult(
            count = enrichedList.size,
            activeCount = activeCount,
            triggeredCount = triggeredCount,
            nearCount = nearCount,
            newlyTriggered = newlyTriggered,
            alerts = enrichedList,
            lastUpdatedMillis = System.currentTimeMillis()
        )
    }

    /**
     * Consulta alertas desde el endpoint backend /api/alerts o fallback a Supabase REST.
     */
    private fun fetchRawAlerts(token: String, userId: String): JSONArray? {
        // Intento 1: Backend /api/alerts
        try {
            val url = URL("$DEFAULT_BACKEND_URL/api/alerts")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.connectTimeout = 10000
            conn.readTimeout = 12000
            conn.setRequestProperty("Accept", "application/json")
            conn.setRequestProperty("X-Webhook-Secret", WEBHOOK_SECRET)
            if (token.isNotBlank()) {
                conn.setRequestProperty("Authorization", "Bearer $token")
            }

            if (conn.responseCode == 200) {
                val reader = BufferedReader(InputStreamReader(conn.inputStream))
                val sb = StringBuilder()
                var line: String?
                while (reader.readLine().also { line = it } != null) sb.append(line)
                reader.close()
                conn.disconnect()
                return JSONArray(sb.toString())
            }
            conn.disconnect()
        } catch (e: Exception) {
            Log.d(TAG, "Error consultando /api/alerts: ${e.message}")
        }

        // Intento 2: Supabase REST directo
        try {
            val encodedUser = URLEncoder.encode(userId, "UTF-8")
            val url = URL("$SUPABASE_REST_URL/rv_stock_alerts?user_id=eq.$encodedUser")
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
                return JSONArray(sb.toString())
            }
            conn.disconnect()
        } catch (e: Exception) {
            Log.e(TAG, "Error consultando Supabase rv_stock_alerts: ${e.message}")
        }

        return null
    }

    /**
     * Consulta compras en Supabase para determinar los costos base de cada posición.
     */
    private fun fetchPurchasesFromSupabase(userId: String): List<JSONObject> {
        val list = mutableListOf<JSONObject>()
        try {
            val encodedUser = URLEncoder.encode(userId, "UTF-8")
            val url = URL("$SUPABASE_REST_URL/rv_purchases?user_id=eq.$encodedUser&select=id,ticker,purchase_price,shares,date")
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

                val arr = JSONArray(sb.toString())
                for (i in 0 until arr.length()) {
                    list.add(arr.getJSONObject(i))
                }
            } else {
                conn.disconnect()
            }
        } catch (e: Exception) {
            Log.d(TAG, "Error consultando rv_purchases: ${e.message}")
        }
        return list
    }

    /**
     * Consulta cotizaciones de mercado en tiempo real para un conjunto de tickers.
     */
    private fun fetchMarketQuotes(tickers: Set<String>): Map<String, JSONObject> {
        val map = mutableMapOf<String, JSONObject>()
        if (tickers.isEmpty()) return map

        try {
            val tickersParam = tickers.joinToString(",")
            val url = URL("$DEFAULT_BACKEND_URL/api/prices/live?tickers=$tickersParam")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.connectTimeout = 15000
            conn.readTimeout = 20000
            conn.setRequestProperty("Accept", "application/json")

            if (conn.responseCode == 200) {
                val reader = BufferedReader(InputStreamReader(conn.inputStream))
                val sb = StringBuilder()
                var line: String?
                while (reader.readLine().also { line = it } != null) sb.append(line)
                reader.close()
                conn.disconnect()

                val arr = JSONArray(sb.toString())
                for (i in 0 until arr.length()) {
                    val obj = arr.getJSONObject(i)
                    val t = obj.optString("ticker", "").uppercase().trim()
                    if (t.isNotBlank()) map[t] = obj
                }
            } else {
                conn.disconnect()
            }
        } catch (e: Exception) {
            Log.w(TAG, "Error consultando /api/prices/live: ${e.message}")
        }
        return map
    }

    /**
     * Emite notificaciones push locales y notifica a los listeners registrados en la UI.
     */
    private fun dispatchNotificationsAndCallback(context: Context, result: AlertsPollResult) {
        val notifiedIds = getNotifiedAlertIds(context)
        val historicalToIgnore = mutableSetOf<String>()

        // 1. Silenciar y registrar en persistencia alertas históricas o pausadas para evitar falsas alarmas
        for (alert in result.alerts) {
            if (!alert.triggeredAt.isNullOrBlank() || !alert.isActive) {
                if (!notifiedIds.contains(alert.id)) {
                    historicalToIgnore.add(alert.id)
                }
            }
        }
        if (historicalToIgnore.isNotEmpty()) {
            addNotifiedAlertIds(context, historicalToIgnore)
            notifiedIds.addAll(historicalToIgnore)
        }

        // 2. Notificar ÚNICA y exclusivamente las alertas activas que acaban de dispararse en este ciclo
        for (alert in result.alerts) {
            val shouldNotify = alert.isTriggeredNow && alert.isActive && !notifiedIds.contains(alert.id)

            if (shouldNotify) {
                addNotifiedAlertId(context, alert.id)
                notifiedIds.add(alert.id)
                sendAlertNotification(context, alert)
                markAlertTriggeredInCloud(alert)
            }
        }

        mainHandler.post {
            onAlertsUpdatedListener?.invoke(result)
        }
    }

    private fun markAlertTriggeredInCloud(alert: EnrichedStockAlert) {
        Executors.newSingleThreadExecutor().execute {
            try {
                val isoDate = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                    timeZone = TimeZone.getTimeZone("UTC")
                }.format(Date())

                val jsonBody = JSONObject().apply {
                    put("triggered_at", isoDate)
                    put("last_checked_price", alert.currentPrice)
                    put("is_active", false)
                }

                val encodedId = URLEncoder.encode(alert.id, "UTF-8")
                val url = URL("$SUPABASE_REST_URL/rv_stock_alerts?id=eq.$encodedId")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "PATCH"
                conn.connectTimeout = 8000
                conn.readTimeout = 8000
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json")
                conn.setRequestProperty("apikey", SUPABASE_ANON_KEY)
                conn.setRequestProperty("Authorization", "Bearer $SUPABASE_ANON_KEY")

                conn.outputStream.use { os ->
                    os.write(jsonBody.toString().toByteArray(Charsets.UTF_8))
                }

                val code = conn.responseCode
                Log.d(TAG, "Alerta ${alert.id} (${alert.ticker}) sincronizada en Supabase como disparada (HTTP $code)")
                conn.disconnect()
            } catch (e: Exception) {
                Log.w(TAG, "Error actualizando alerta en Supabase: ${e.message}")
            }
        }
    }

    private fun createNotificationChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channelName = "Alertas de Venta (Acciones & ETFs)"
            val channelDesc = "Avisa de inmediato cuando una acción o ETF alcanza tu objetivo de venta (Take Profit o Stop Loss)"
            val channel = NotificationChannel(CHANNEL_ID, channelName, NotificationManager.IMPORTANCE_HIGH).apply {
                description = channelDesc
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 400, 200, 400)
                setShowBadge(true)
                lightColor = Color.GREEN
                enableLights(true)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(channel)
        }
    }

    fun sendAlertNotification(context: Context, alert: EnrichedStockAlert) {
        val isTakeProfit = alert.alertType == "PROFIT_TARGET"
        val typeEmoji = if (isTakeProfit) "🚀" else "🛡️"
        val typeName = if (isTakeProfit) "OBJETIVO DE GANANCIA ALCANZADO" else "STOP LOSS ACTIVADO"

        val title = "$typeEmoji ¡ALERTA DE VENTA! ${alert.ticker}: $typeName"
        val returnText = if (alert.currentReturnPct >= 0) "+${alert.currentReturnPct}%" else "${alert.currentReturnPct}%"
        val targetText = if (alert.targetValue >= 0) "+${alert.targetValue}%" else "${alert.targetValue}%"

        val message = "${alert.companyName} cotiza a $${alert.currentPrice} USD ($returnText vs meta $targetText). Toca para revisar tu posición."

        val targetIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("OPEN_TAB", "ALERTS")
            putExtra("ALERT_TICKER", alert.ticker)
        }

        val pendingIntent = PendingIntent.getActivity(
            context,
            alert.id.hashCode(),
            targetIntent,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            else PendingIntent.FLAG_UPDATE_CURRENT
        )

        val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

        val notif = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle(title)
            .setContentText(message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setAutoCancel(true)
            .setSound(soundUri)
            .setVibrate(longArrayOf(0, 400, 200, 400))
            .setContentIntent(pendingIntent)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build()

        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val notifId = (System.currentTimeMillis() % 100000).toInt()
        nm.notify(notifId, notif)
        Log.d(TAG, "Notificación emitida para ${alert.ticker}: $message")
    }

    /**
     * Función utilitaria para probar la alerta con sonido y vibración en el teléfono.
     */
    fun sendTestAlertNotification(context: Context) {
        createNotificationChannel(context)
        val dummy = EnrichedStockAlert(
            id = "test_alert_" + System.currentTimeMillis(),
            ticker = "ACN",
            rawTicker = "ACN",
            companyName = "Accenture plc",
            scope = "strategy",
            targetId = "historical",
            lotLabel = "Posición Consolidada",
            alertType = "PROFIT_TARGET",
            targetValue = 15.0,
            entryPrice = 186.59,
            currentPrice = 264.22,
            targetPrice = 214.58,
            currentReturnPct = 41.61,
            distancePct = 0.0,
            status = "TRIGGERED",
            isActive = true,
            isTriggeredNow = true,
            triggeredAt = null,
            change24h = 6.90,
            changePct24h = 3.79
        )
        sendAlertNotification(context, dummy)
    }
}
