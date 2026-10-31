package homes.zhent.kpital

import android.app.Activity
import android.content.ComponentName
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.text.TextUtils
import android.widget.Button
import android.widget.TextView
import android.widget.Toast

class MainActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Inicializa el Core de Go con la URL de Kpital y auto-sincronización activa
        try {
            Core.initConfig("https://titanes-portfolio-backend.onrender.com", "", "", true)
        } catch (t: Throwable) {
            // Log si se está testeando en simulador
        }

        // Interfaz simple minimalista sin XML pesado
        val layout = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            setPadding(60, 100, 60, 60)
            setBackgroundColor(android.graphics.Color.parseColor("#090d16"))
        }

        val titleView = TextView(this).apply {
            text = "Kpital Mobile Engine"
            textSize = 24f
            setTextColor(android.graphics.Color.WHITE)
            setTypeface(null, android.graphics.Typeface.BOLD)
        }
        layout.addView(titleView)

        val descView = TextView(this).apply {
            text = "\nCaptura automática de notificaciones bancarias en tiempo real motorizada con Go nativo.\n"
            textSize = 14f
            setTextColor(android.graphics.Color.parseColor("#94a3b8"))
        }
        layout.addView(descView)

        val statusView = TextView(this).apply {
            val enabled = isNotificationServiceEnabled()
            text = if (enabled) "● Estado: Servicio ACTIVO y escuchando" else "○ Estado: Permiso PENDIENTE"
            setTextColor(if (enabled) android.graphics.Color.parseColor("#10b981") else android.graphics.Color.parseColor("#f59e0b"))
            textSize = 15f
            setTypeface(null, android.graphics.Typeface.BOLD)
        }
        layout.addView(statusView)

        val permButton = Button(this).apply {
            text = "Configurar Acceso a Notificaciones"
            setOnClickListener {
                startActivity(Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS"))
            }
        }
        layout.addView(permButton)

        setContentView(layout)
    }

    private fun isNotificationServiceEnabled(): Boolean {
        val pkgName = packageName
        val flat = Settings.Secure.getString(contentResolver, "enabled_notification_listeners")
        if (!TextUtils.isEmpty(flat)) {
            val names = flat.split(":").toTypedArray()
            for (name in names) {
                val cn = ComponentName.unflattenFromString(name)
                if (cn != null && TextUtils.equals(pkgName, cn.packageName)) {
                    return true
                }
            }
        }
        return false
    }
}
