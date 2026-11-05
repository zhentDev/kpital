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
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

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
                rawTicker = obj.optString("raw_ticker", ""),
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
 * desde el backend de Kpital, enriquecidas con cotizaciones en tiempo real.
 * Si alguna alerta alcanza su condición de venta (Take Profit o Stop Loss),
 * dispara notificaciones push nativas en el teléfono móvil con sonido y vibración.
 */
object StockAlertManager {

    private const val TAG = "StockAlertManager"
    const val CHANNEL_ID = "kpital_stock_alerts_channel"

    private const val DEFAULT_BACKEND_URL = "https://titanes-portfolio-backend.onrender.com"
    private const val WEBHOOK_SECRET = "titanes_sec_e8b919f4088a53e6b4d32091c6e1a4e2"

    private var scheduler: ScheduledExecutorService? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    // Conjunto de IDs de alertas que ya emitieron sonido en esta sesión para evitar spam
    private val alreadyNotifiedIds = mutableSetOf<String>()

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
        // Ejecutar inmediatamente y luego con el intervalo configurado
        scheduler?.scheduleWithFixedDelay({
            try {
                pollAlerts(appContext)
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
                    onComplete?.invoke(null)
                }
            }
        }
    }

    private fun pollAlerts(context: Context): AlertsPollResult? {
        val prefs = context.getSharedPreferences("kpital_mobile_prefs", Context.MODE_PRIVATE)
        val token = prefs.getString("auth_token", "") ?: ""

        val urlString = "$DEFAULT_BACKEND_URL/api/alerts/live"
        val url = URL(urlString)
        val conn = url.openConnection() as HttpURLConnection

        conn.requestMethod = "GET"
        conn.connectTimeout = 15000
        conn.readTimeout = 20000
        conn.setRequestProperty("Accept", "application/json")
        conn.setRequestProperty("X-Webhook-Secret", WEBHOOK_SECRET)
        if (token.isNotBlank()) {
            conn.setRequestProperty("Authorization", "Bearer $token")
        }

        val code = conn.responseCode
        if (code != 200) {
            Log.w(TAG, "Respuesta no exitosa al consultar alertas: HTTP $code")
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

        val result = AlertsPollResult(
            count = json.optInt("count", alertList.size),
            activeCount = json.optInt("active_count", 0),
            triggeredCount = json.optInt("triggered_count", 0),
            nearCount = json.optInt("near_count", 0),
            newlyTriggered = newlyTriggeredList,
            alerts = alertList,
            lastUpdatedMillis = System.currentTimeMillis()
        )

        latestResult = result

        // Emitir notificaciones de sistema para cualquier alerta disparada
        for (alert in alertList) {
            val shouldNotify = (alert.isTriggeredNow || alert.status == "TRIGGERED") &&
                    !alreadyNotifiedIds.contains(alert.id)

            if (shouldNotify) {
                alreadyNotifiedIds.add(alert.id)
                sendAlertNotification(context, alert)
            }
        }

        mainHandler.post {
            onAlertsUpdatedListener?.invoke(result)
        }

        return result
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
