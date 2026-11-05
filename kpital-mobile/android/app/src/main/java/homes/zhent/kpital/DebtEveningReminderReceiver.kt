package homes.zhent.kpital

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * BroadcastReceiver para disparar recordatorios de vencimiento de deudas y cobros
 * a las 8:00 PM (20:00) todos los días.
 *
 * También escucha BOOT_COMPLETED para rearmar la alarma si el teléfono se reinicia.
 */
class DebtEveningReminderReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "DebtEveningReceiver"
    }

    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action
        Log.i(TAG, "DebtEveningReminderReceiver recibió acción: $action")

        val appContext = context.applicationContext

        when (action) {
            Intent.ACTION_BOOT_COMPLETED,
            "android.intent.action.QUICKBOOT_POWERON" -> {
                Log.i(TAG, "Dispositivo reiniciado. Reprogramando alarma de las 8:00 PM...")
                DebtAlertManager.scheduleDaily8PmAlarm(appContext)
            }

            DebtAlertManager.ACTION_DEBT_EVENING_REMINDER -> {
                Log.i(TAG, "Disparador de las 8:00 PM activado. Verificando deudas que vencen hoy...")
                DebtAlertManager.dispatchEveningRemindersAsync(appContext)
                // Reprogramar para el día siguiente
                DebtAlertManager.scheduleDaily8PmAlarm(appContext)
            }

            else -> {
                // Si la acción vino sin filtro específico pero fue dirigida a este receiver
                DebtAlertManager.dispatchEveningRemindersAsync(appContext)
                DebtAlertManager.scheduleDaily8PmAlarm(appContext)
            }
        }
    }
}
