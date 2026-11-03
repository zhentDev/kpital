package homes.zhent.kpital

import android.app.Activity
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.text.InputType
import android.text.TextUtils
import android.view.Gravity
import android.view.View
import android.widget.*
import core.Core
import org.json.JSONObject
import kotlin.concurrent.thread

class MainActivity : Activity() {

    private lateinit var prefs: SharedPreferences
    private lateinit var statusTextView: TextView
    private lateinit var overlayStatusTextView: TextView
    private lateinit var userSessionLayout: LinearLayout
    private lateinit var loginFormLayout: LinearLayout
    private lateinit var welcomeUserTextView: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        prefs = getSharedPreferences("kpital_mobile_prefs", Context.MODE_PRIVATE)
        val savedToken = prefs.getString("auth_token", "") ?: ""
        val savedUserEmail = prefs.getString("user_email", "") ?: ""
        val savedUserName = prefs.getString("user_name", "") ?: ""

        // Inicializar motor en Go con token si existe
        try {
            Core.initConfig(
                "https://titanes-portfolio-backend.onrender.com",
                "titanes_sec_e8b919f4088a53e6b4d32091c6e1a4e2",
                savedToken,
                true
            )
        } catch (t: Throwable) {
            // Ignorar en testing
        }

        val scroll = ScrollView(this).apply {
            setBackgroundColor(Color.parseColor("#090d16"))
        }

        val rootLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(50, 70, 50, 60)
        }
        scroll.addView(rootLayout)

        // Título Principal
        val titleView = TextView(this).apply {
            text = "Kpital Mobile"
            textSize = 26f
            setTextColor(Color.WHITE)
            setTypeface(null, Typeface.BOLD)
        }
        rootLayout.addView(titleView)

        val descView = TextView(this).apply {
            text = "Motor nativo en Go para captura automática y categorización de gastos bancarios en Colombia.\n"
            textSize = 13f
            setTextColor(Color.parseColor("#94a3b8"))
        }
        rootLayout.addView(descView)

        // Estado del Servicio de Notificaciones
        statusTextView = TextView(this).apply {
            textSize = 14f
            setTypeface(null, Typeface.BOLD)
        }
        rootLayout.addView(statusTextView)

        val permButton = Button(this).apply {
            text = "1. Permiso de Lectura de Notificaciones"
            setBackgroundColor(Color.parseColor("#1e293b"))
            setTextColor(Color.WHITE)
            setOnClickListener {
                startActivity(Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS"))
            }
        }
        rootLayout.addView(permButton)

        // Estado del Permiso de Ventana Flotante / Mostrar sobre otras apps
        overlayStatusTextView = TextView(this).apply {
            textSize = 14f
            setTypeface(null, Typeface.BOLD)
            setPadding(0, 20, 0, 0)
        }
        rootLayout.addView(overlayStatusTextView)

        val overlayPermButton = Button(this).apply {
            text = "2. Permitir Ventana Emergente Automática"
            setBackgroundColor(Color.parseColor("#0284c7"))
            setTextColor(Color.WHITE)
            setTypeface(null, Typeface.BOLD)
            setOnClickListener {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    val intent = Intent(
                        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:$packageName")
                    )
                    startActivity(intent)
                } else {
                    Toast.makeText(this@MainActivity, "Permiso no requerido en tu versión de Android", Toast.LENGTH_SHORT).show()
                }
            }
        }
        rootLayout.addView(overlayPermButton)

        val overlayHelpView = TextView(this).apply {
            text = "💡 Este permiso permite que cuando Nequi o Nu te envíen una notificación, Kpital se abra automáticamente en tu pantalla para elegir la cajita al instante.\n"
            textSize = 12f
            setTextColor(Color.parseColor("#94a3b8"))
            setPadding(0, 10, 0, 0)
        }
        rootLayout.addView(overlayHelpView)

        updatePermissionStatus()

        // Separador
        val separator = View(this).apply {
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 2).apply {
                setMargins(0, 40, 0, 40)
            }
            setBackgroundColor(Color.parseColor("#1e293b"))
        }
        rootLayout.addView(separator)

        // --- SECCIÓN 1: SESIÓN INICIADA ---
        userSessionLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            visibility = if (savedToken.isNotBlank()) View.VISIBLE else View.GONE
        }
        welcomeUserTextView = TextView(this).apply {
            text = "👤 Conectado como:\n${savedUserName.ifEmpty { savedUserEmail }}"
            textSize = 16f
            setTextColor(Color.parseColor("#00e5ff"))
            setTypeface(null, Typeface.BOLD)
        }
        userSessionLayout.addView(welcomeUserTextView)

        val syncInfoTextView = TextView(this).apply {
            text = "\nTus gastos de Bancolombia, Nu y Rappi se vincularán directamente a tu cuenta y cajitas.\n"
            textSize = 13f
            setTextColor(Color.parseColor("#94a3b8"))
        }
        userSessionLayout.addView(syncInfoTextView)

        // Botón de prueba: Simular compra bancaria para probar el selector de cajitas
        val testNotificationButton = Button(this).apply {
            text = "🧪 Probar Notificación de Banco (Simular $45.000 Nu)"
            setBackgroundColor(Color.parseColor("#0284c7"))
            setTextColor(Color.WHITE)
            setTypeface(null, Typeface.BOLD)
            setOnClickListener {
                val intent = Intent(this@MainActivity, PocketSelectorActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                    putExtra(PocketSelectorActivity.EXTRA_BANK, "Nu Colombia")
                    putExtra(PocketSelectorActivity.EXTRA_AMOUNT, 45000.0)
                    putExtra(PocketSelectorActivity.EXTRA_DESC, "Prueba Éxito Calle 80")
                    putExtra(PocketSelectorActivity.EXTRA_TX_TYPE, "debit")
                    putExtra(PocketSelectorActivity.EXTRA_RAW_TEXT, "Compra con tu Tarjeta Nu por $45.000 en Éxito Calle 80")
                }
                startActivity(intent)
            }
        }
        userSessionLayout.addView(testNotificationButton)

        val spacer = View(this).apply {
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 20)
        }
        userSessionLayout.addView(spacer)

        val logoutButton = Button(this).apply {
            text = "Cerrar Sesión"
            setBackgroundColor(Color.parseColor("#334155"))
            setTextColor(Color.parseColor("#f87171"))
            setOnClickListener {
                prefs.edit().clear().apply()
                Core.initConfig("https://titanes-portfolio-backend.onrender.com", "", "", true)
                userSessionLayout.visibility = View.GONE
                loginFormLayout.visibility = View.VISIBLE
                Toast.makeText(this@MainActivity, "Sesión cerrada", Toast.LENGTH_SHORT).show()
            }
        }
        userSessionLayout.addView(logoutButton)
        rootLayout.addView(userSessionLayout)

        // --- SECCIÓN 2: FORMULARIO DE LOGIN ---
        loginFormLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            visibility = if (savedToken.isBlank()) View.VISIBLE else View.GONE
        }

        val loginTitle = TextView(this).apply {
            text = "Iniciar Sesión en Kpital"
            textSize = 18f
            setTextColor(Color.WHITE)
            setTypeface(null, Typeface.BOLD)
        }
        loginFormLayout.addView(loginTitle)

        val emailInput = EditText(this).apply {
            hint = "Correo electrónico"
            setHintTextColor(Color.parseColor("#64748b"))
            setTextColor(Color.WHITE)
            inputType = InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
            setText(if (savedUserEmail.isNotBlank()) savedUserEmail else "caballerojesus703@hotmail.com")
            setBackgroundColor(Color.parseColor("#0f172a"))
            setPadding(30, 25, 30, 25)
        }
        loginFormLayout.addView(emailInput)

        val passInput = EditText(this).apply {
            hint = "Contraseña"
            setHintTextColor(Color.parseColor("#64748b"))
            setTextColor(Color.WHITE)
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            setBackgroundColor(Color.parseColor("#0f172a"))
            setPadding(30, 25, 30, 25)
        }
        loginFormLayout.addView(passInput)

        val loginButton = Button(this).apply {
            text = "Entrar a mi Cuenta"
            setBackgroundColor(Color.parseColor("#00e5ff"))
            setTextColor(Color.BLACK)
            setTypeface(null, Typeface.BOLD)
            setOnClickListener {
                val email = emailInput.text.toString().trim()
                val pass = passInput.text.toString().trim()
                if (email.isBlank() || pass.isBlank()) {
                    Toast.makeText(this@MainActivity, "Ingresa correo y contraseña", Toast.LENGTH_SHORT).show()
                    return@setOnClickListener
                }

                isEnabled = false
                text = "Conectando..."

                thread {
                    try {
                        val respStr = Core.loginToKpital(email, pass)
                        val resp = JSONObject(respStr)

                        val token = resp.optString("token", "")
                        val userObj = resp.optJSONObject("user")
                        val userName = userObj?.optString("name", email) ?: email

                        runOnUiThread {
                            isEnabled = true
                            text = "Entrar a mi Cuenta"

                            if (token.isNotBlank()) {
                                prefs.edit()
                                    .putString("auth_token", token)
                                    .putString("user_email", email)
                                    .putString("user_name", userName)
                                    .apply()

                                Core.initConfig(
                                    "https://titanes-portfolio-backend.onrender.com",
                                    "titanes_sec_e8b919f4088a53e6b4d32091c6e1a4e2",
                                    token,
                                    true
                                )

                                welcomeUserTextView.text = "👤 Conectado como:\n$userName\n($email)"
                                loginFormLayout.visibility = View.GONE
                                userSessionLayout.visibility = View.VISIBLE
                                Toast.makeText(this@MainActivity, "¡Bienvenido, $userName!", Toast.LENGTH_SHORT).show()
                            } else {
                                val detail = resp.optString("detail", "Credenciales incorrectas")
                                Toast.makeText(this@MainActivity, detail, Toast.LENGTH_LONG).show()
                            }
                        }
                    } catch (e: Exception) {
                        runOnUiThread {
                            isEnabled = true
                            text = "Entrar a mi Cuenta"
                            Toast.makeText(this@MainActivity, "Error de conexión: ${e.message}", Toast.LENGTH_LONG).show()
                        }
                    }
                }
            }
        }
        loginFormLayout.addView(loginButton)
        rootLayout.addView(loginFormLayout)

        setContentView(scroll)
    }

    override fun onResume() {
        super.onResume()
        updatePermissionStatus()
    }

    private fun updatePermissionStatus() {
        val notifEnabled = isNotificationServiceEnabled()
        statusTextView.text = if (notifEnabled) "● Lectura de Notificaciones: ACTIVO" else "○ Lectura de Notificaciones: PENDIENTE"
        statusTextView.setTextColor(if (notifEnabled) Color.parseColor("#10b981") else Color.parseColor("#f59e0b"))

        val overlayEnabled = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Settings.canDrawOverlays(this)
        } else {
            true
        }
        overlayStatusTextView.text = if (overlayEnabled) "● Ventana Emergente Automática: ACTIVO" else "○ Ventana Emergente Automática: PENDIENTE"
        overlayStatusTextView.setTextColor(if (overlayEnabled) Color.parseColor("#10b981") else Color.parseColor("#f59e0b"))
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
