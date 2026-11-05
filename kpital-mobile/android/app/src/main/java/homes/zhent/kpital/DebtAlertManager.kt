package homes.zhent.kpital

import android.app.AlarmManager
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
import java.text.NumberFormat
import java.time.LocalDate
import java.time.LocalTime
import java.time.temporal.ChronoUnit
import java.util.Calendar
import java.util.Locale
import java.util.concurrent.Executors

data class DebtDueAlert(
    val id: String,
    val concept: String,
    val personName: String,
    val debtType: String, // "payable" (debo) o "receivable" (por cobrar)
    val remainingAmount: Double,
    val dueDate: String,
    val paymentMethod: String?,
    val status: String, // "DUE_TODAY", "OVERDUE", "DUE_SOON"
    val daysDiff: Long
)

object DebtAlertManager {
    private const val TAG = "DebtAlertManager"
    private const val SUPABASE_REST_URL = "https://ixnidzllqwbkexsrmgwz.supabase.co/rest/v1"
    private const val SUPABASE_ANON_KEY = "sb_publishable_4Gbn-hZLX764m-gz-LAhRg_914uGNIR"
    private const val CHANNEL_ID = "kpital_debt_alerts"

    const val ACTION_DEBT_EVENING_REMINDER = "homes.zhent.kpital.ACTION_DEBT_EVENING_REMINDER"
    const val REQUEST_CODE_8PM = 8020

    private val executor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())

    var latestDebtAlerts: List<DebtDueAlert> = emptyList()
        private set

    private var onDebtAlertsUpdatedListener: ((List<DebtDueAlert>) -> Unit)? = null

    fun setOnDebtAlertsUpdatedListener(listener: ((List<DebtDueAlert>) -> Unit)?) {
        onDebtAlertsUpdatedListener = listener
    }

    /**
     * Programa o reprograma la alarma diaria de Android para las 8:00 PM (20:00).
     */
    fun scheduleDaily8PmAlarm(context: Context) {
        val appContext = context.applicationContext
        val alarmManager = appContext.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return

        val now = Calendar.getInstance()
        val target = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 20) // 8:00 PM
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }

        // Si ya son las 8:00 PM o más hoy, programar para mañana a las 8:00 PM
        if (now.timeInMillis >= target.timeInMillis) {
            target.add(Calendar.DAY_OF_YEAR, 1)
        }

        val intent = Intent(appContext, DebtEveningReminderReceiver::class.java).apply {
            action = ACTION_DEBT_EVENING_REMINDER
        }

        val pendingIntent = PendingIntent.getBroadcast(
            appContext,
            REQUEST_CODE_8PM,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, target.timeInMillis, pendingIntent)
            } else {
                alarmManager.setExact(AlarmManager.RTC_WAKEUP, target.timeInMillis, pendingIntent)
            }
            Log.i(TAG, "⏰ Alarma de las 8:00 PM programada exitosamente para ${target.time}")
        } catch (e: Exception) {
            Log.e(TAG, "Error programando alarma de las 8:00 PM: ${e.message}", e)
        }
    }

    /**
     * Consulta las deudas activas en Supabase y evalúa cuáles están por vencer o vencidas.
     */
    fun fetchDebtAlertsAsync(context: Context, onComplete: ((List<DebtDueAlert>) -> Unit)? = null) {
        val appContext = context.applicationContext
        executor.execute {
            try {
                val alerts = checkDebtsInternal(appContext)
                latestDebtAlerts = alerts
                mainHandler.post {
                    onDebtAlertsUpdatedListener?.invoke(alerts)
                    onComplete?.invoke(alerts)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error consultando alertas de deudas: ${e.message}", e)
                mainHandler.post {
                    onComplete?.invoke(latestDebtAlerts)
                }
            }
        }
    }

    /**
     * Dispara específicamente los recordatorios nocturnos de las 8:00 PM para deudas que vencen hoy o están vencidas.
     */
    fun dispatchEveningRemindersAsync(context: Context) {
        val appContext = context.applicationContext
        executor.execute {
            try {
                Log.i(TAG, "Ejecutando revisión de recordatorios de las 8:00 PM...")
                val prefs = appContext.getSharedPreferences("kpital_prefs", Context.MODE_PRIVATE)
                val userId = prefs.getString("user_id", "usr_9487dd2209d2") ?: "usr_9487dd2209d2"
                val debtsArray = queryActiveDebts(userId) ?: return@execute
                val today = LocalDate.now()

                for (i in 0 until debtsArray.length()) {
                    val obj = debtsArray.optJSONObject(i) ?: continue
                    val extra = obj.optJSONObject("extra_json") ?: JSONObject()

                    val dueDateStr = when {
                        !obj.isNull("due_date") && obj.optString("due_date").isNotBlank() -> obj.optString("due_date")
                        !extra.isNull("dueDate") && extra.optString("dueDate").isNotBlank() -> extra.optString("dueDate")
                        else -> null
                    } ?: continue

                    val remaining = when {
                        !obj.isNull("remaining_amount") -> obj.optDouble("remaining_amount", 0.0)
                        else -> extra.optDouble("remainingAmount", 0.0)
                    }
                    if (remaining <= 0) continue

                    val cleanDue = dueDateStr.take(10)
                    val parsedDue = try {
                        LocalDate.parse(cleanDue)
                    } catch (e: Exception) {
                        continue
                    }

                    val daysDiff = ChronoUnit.DAYS.between(today, parsedDue)

                    // Solo deudas que vencen hoy (0) o que ya están vencidas (< 0)
                    if (daysDiff <= 0L) {
                        val id = obj.optString("id", "")
                        val debtType = obj.optString("debt_type", extra.optString("debtType", "receivable"))
                        val debtor = obj.optString("debtor", extra.optString("debtor", ""))
                        val creditor = obj.optString("creditor", extra.optString("creditor", ""))
                        val personName = (if (debtType == "receivable") debtor else creditor).ifBlank { "Particular" }
                        val concept = obj.optString("concept", extra.optString("concept", "Préstamo / Deuda"))
                        val method = obj.optString("notes", extra.optString("paymentMethod", null))

                        val alert = DebtDueAlert(
                            id = id,
                            concept = concept,
                            personName = personName,
                            debtType = debtType,
                            remainingAmount = remaining,
                            dueDate = cleanDue,
                            paymentMethod = method,
                            status = if (daysDiff == 0L) "DUE_TODAY" else "OVERDUE",
                            daysDiff = daysDiff
                        )
                        dispatchEveningNotificationIfEligible(appContext, alert)
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error en dispatchEveningRemindersAsync: ${e.message}", e)
            }
        }
    }

    private fun checkDebtsInternal(context: Context): List<DebtDueAlert> {
        val prefs = context.getSharedPreferences("kpital_prefs", Context.MODE_PRIVATE)
        val userId = prefs.getString("user_id", "usr_9487dd2209d2") ?: "usr_9487dd2209d2"

        val debtsArray = queryActiveDebts(userId) ?: return emptyList()
        val today = LocalDate.now()
        val resultList = mutableListOf<DebtDueAlert>()

        for (i in 0 until debtsArray.length()) {
            val obj = debtsArray.optJSONObject(i) ?: continue
            val id = obj.optString("id", "")
            val extra = obj.optJSONObject("extra_json") ?: JSONObject()

            val dueDateStr = when {
                !obj.isNull("due_date") && obj.optString("due_date").isNotBlank() -> obj.optString("due_date")
                !extra.isNull("dueDate") && extra.optString("dueDate").isNotBlank() -> extra.optString("dueDate")
                else -> null
            } ?: continue

            val remaining = when {
                !obj.isNull("remaining_amount") -> obj.optDouble("remaining_amount", 0.0)
                else -> extra.optDouble("remainingAmount", 0.0)
            }
            if (remaining <= 0) continue

            val cleanDue = dueDateStr.take(10)
            val parsedDue = try {
                LocalDate.parse(cleanDue)
            } catch (e: Exception) {
                continue
            }

            val daysDiff = ChronoUnit.DAYS.between(today, parsedDue)

            // Vence hoy, vencido o en próximos 3 días
            val alertStatus = when {
                daysDiff == 0L -> "DUE_TODAY"
                daysDiff < 0L -> "OVERDUE"
                daysDiff in 1L..3L -> "DUE_SOON"
                else -> null
            } ?: continue

            val debtType = obj.optString("debt_type", extra.optString("debtType", "receivable"))
            val debtor = obj.optString("debtor", extra.optString("debtor", ""))
            val creditor = obj.optString("creditor", extra.optString("creditor", ""))
            val personName = (if (debtType == "receivable") debtor else creditor).ifBlank { "Particular" }
            val concept = obj.optString("concept", extra.optString("concept", "Préstamo / Deuda"))
            val method = obj.optString("notes", extra.optString("paymentMethod", null))

            val alert = DebtDueAlert(
                id = id,
                concept = concept,
                personName = personName,
                debtType = debtType,
                remainingAmount = remaining,
                dueDate = cleanDue,
                paymentMethod = method,
                status = alertStatus,
                daysDiff = daysDiff
            )
            resultList.add(alert)

            // Evaluar notificación diurna estándar (1 vez por día por cada deuda)
            dispatchNotificationIfEligible(context, alert)

            // Si ya son las 8:00 PM o más tarde (>= 20:00), evaluar también el recordatorio de las 8:00 PM
            val currentHour = try { LocalTime.now().hour } catch (e: Exception) { 0 }
            if (currentHour >= 20 && (alert.status == "DUE_TODAY" || alert.status == "OVERDUE")) {
                dispatchEveningNotificationIfEligible(context, alert)
            }
        }

        return resultList.sortedWith(compareBy({ it.daysDiff }, { -it.remainingAmount }))
    }

    private fun queryActiveDebts(userId: String): JSONArray? {
        return try {
            val encodedUser = URLEncoder.encode(userId, "UTF-8")
            val url = URL("$SUPABASE_REST_URL/cf_debts?user_id=eq.$encodedUser&status=eq.active&select=*")
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
            Log.e(TAG, "Error en queryActiveDebts: ${e.message}")
            null
        }
    }

    private fun dispatchNotificationIfEligible(context: Context, alert: DebtDueAlert) {
        val prefs = context.getSharedPreferences("kpital_debt_alert_notifs", Context.MODE_PRIVATE)
        val todayStr = LocalDate.now().toString()
        val key = "notif_${alert.id}_$todayStr"

        // Si ya notificamos hoy esta misma deuda, omitimos
        if (prefs.getBoolean(key, false)) return

        createNotificationChannel(context)

        val isReceivable = alert.debtType == "receivable"
        val title = when (alert.status) {
            "DUE_TODAY" -> "⏰ ¡Vence hoy! ${alert.concept}"
            "OVERDUE" -> "⚠️ Vencido (${Math.abs(alert.daysDiff)} días): ${alert.concept}"
            else -> "🗓️ Próximo vencimiento: ${alert.concept}"
        }

        val formattedAmt = formatCop(alert.remainingAmount)
        val content = if (isReceivable) {
            "${alert.personName} tiene pendiente el pago de $formattedAmt (Quedó: ${alert.dueDate})"
        } else {
            "Recuerda pagar la cuota de $formattedAmt a ${alert.personName} (Vence: ${alert.dueDate})"
        }

        val openIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            putExtra("OPEN_TAB", "ALERTS")
        }

        val pendingIntent = PendingIntent.getActivity(
            context,
            alert.id.hashCode(),
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
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setSound(soundUri)
            .setColor(Color.parseColor("#f59e0b"))
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build()

        val notifManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notifManager.notify(alert.id.hashCode(), notif)

        prefs.edit().putBoolean(key, true).apply()
        Log.i(TAG, "Notificación de vencimiento enviada para deuda ${alert.id} (${alert.concept})")
    }

    private fun dispatchEveningNotificationIfEligible(context: Context, alert: DebtDueAlert) {
        val prefs = context.getSharedPreferences("kpital_debt_alert_notifs", Context.MODE_PRIVATE)
        val todayStr = LocalDate.now().toString()
        val key = "notif_8pm_${alert.id}_$todayStr"

        // Si ya notificamos a las 8:00 PM hoy esta misma deuda, omitimos
        if (prefs.getBoolean(key, false)) return

        createNotificationChannel(context)

        val isReceivable = alert.debtType == "receivable"
        val isToday = alert.status == "DUE_TODAY"

        val title = if (isToday) {
            "⏰ Recordatorio 8:00 PM: ¡Vence hoy!"
        } else {
            "⚠️ Recordatorio 8:00 PM: Vencido (${Math.abs(alert.daysDiff)} días)"
        }

        val formattedAmt = formatCop(alert.remainingAmount)
        val content = if (isReceivable) {
            "${alert.concept} (${alert.personName}): Recuerda cobrar hoy el saldo de $formattedAmt (Vencimiento: ${alert.dueDate})."
        } else {
            "${alert.concept} (${alert.personName}): Recuerda realizar el pago de $formattedAmt acordado para hoy ${alert.dueDate}."
        }

        val openIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            putExtra("OPEN_TAB", "ALERTS")
        }

        val notifId = ("8pm_" + alert.id).hashCode()
        val pendingIntent = PendingIntent.getActivity(
            context,
            notifId,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        val notif = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setSubText("Recordatorio 8:00 PM • Vencimiento de deuda")
            .setContentText(content)
            .setStyle(NotificationCompat.BigTextStyle().bigText(content))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setSound(soundUri)
            .setColor(Color.parseColor("#f59e0b"))
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build()

        val notifManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notifManager.notify(notifId, notif)

        prefs.edit().putBoolean(key, true).apply()
        Log.i(TAG, "⏰ Notificación de las 8:00 PM enviada para deuda ${alert.id} (${alert.concept})")
    }

    private fun createNotificationChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val existing = manager.getNotificationChannel(CHANNEL_ID)
            if (existing == null) {
                val channel = NotificationChannel(
                    CHANNEL_ID,
                    "⏰ Recordatorios de Préstamos y Deudas",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "Alertas cuando una deuda o préstamo por cobrar vence hoy o está vencido"
                    enableLights(true)
                    lightColor = Color.parseColor("#f59e0b")
                    enableVibration(true)
                }
                manager.createNotificationChannel(channel)
            }
        }
    }

    fun formatCop(amount: Double): String {
        return try {
            val nf = NumberFormat.getCurrencyInstance(Locale("es", "CO"))
            nf.maximumFractionDigits = 0
            nf.format(amount)
        } catch (e: Exception) {
            "$${amount.toLong()}"
        }
    }
}
