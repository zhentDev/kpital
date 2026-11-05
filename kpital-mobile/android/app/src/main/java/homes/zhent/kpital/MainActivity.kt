package homes.zhent.kpital

import android.app.Activity
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
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
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.concurrent.thread

class MainActivity : Activity() {

    private lateinit var prefs: SharedPreferences
    private lateinit var statusTextView: TextView
    private lateinit var overlayStatusTextView: TextView
    private lateinit var userSessionLayout: LinearLayout
    private lateinit var loginFormLayout: LinearLayout
    private lateinit var welcomeUserTextView: TextView

    // Control de Cabecera y Sección Colapsable de Ajustes
    private lateinit var overallStatusBadge: TextView
    private lateinit var btnToggleSettings: Button
    private lateinit var collapsibleSettingsCard: LinearLayout
    private var isSettingsExpanded: Boolean = false

    // Control de Pestañas Principales (Bancos vs Alertas de Bolsa)
    private var activeMainTab: String = "BANK" // "BANK" o "ALERTS"
    private lateinit var tabSelectorLayout: LinearLayout
    private lateinit var btnTabBank: Button
    private lateinit var btnTabAlerts: Button
    private lateinit var sectionBankMovements: LinearLayout
    private lateinit var sectionStockAlerts: LinearLayout

    // Contenedores del Historial de Movimientos Bancarios
    private lateinit var historyContainer: LinearLayout
    private lateinit var filterContainer: LinearLayout
    private lateinit var emptyHistoryView: LinearLayout
    private var allFilterBtn: Button? = null
    private var pendingFilterBtn: Button? = null
    private var completedFilterBtn: Button? = null
    private var activeFilter: String = "ALL" // "ALL", "PENDING", "COMPLETED"
    private var isCompletedHistoryExpanded: Boolean = false

    // Contenedores de la sección de Alertas de Bolsa
    private lateinit var alertsCardsContainer: LinearLayout
    private lateinit var emptyAlertsView: LinearLayout
    private lateinit var alertsMetricActive: TextView
    private lateinit var alertsMetricNear: TextView
    private lateinit var alertsMetricTriggered: TextView
    private lateinit var alertsLastUpdatedText: TextView
    private lateinit var btnRefreshAlerts: Button
    private lateinit var btnTestAlertNotification: Button

    // Estados de colapso de acordeones en alertas de bolsa
    private var isTriggeredStockAlertsExpanded: Boolean = true
    private var isNearStockAlertsExpanded: Boolean = true
    private var isActiveStockAlertsExpanded: Boolean = true
    private var isPausedStockAlertsExpanded: Boolean = false

    private val dateFormat = SimpleDateFormat("d 'de' MMM, h:mm a", Locale("es", "CO"))

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        prefs = getSharedPreferences("kpital_mobile_prefs", Context.MODE_PRIVATE)
        val savedToken = prefs.getString("auth_token", "") ?: ""
        val savedUserEmail = prefs.getString("user_email", "") ?: ""
        val savedUserName = prefs.getString("user_name", "") ?: ""

        // Cargar preferencias de expansión de acordeones
        isCompletedHistoryExpanded = prefs.getBoolean("pref_completed_history_expanded", false)
        isTriggeredStockAlertsExpanded = prefs.getBoolean("pref_triggered_stock_expanded", true)
        isNearStockAlertsExpanded = prefs.getBoolean("pref_near_stock_expanded", true)
        isActiveStockAlertsExpanded = prefs.getBoolean("pref_active_stock_expanded", true)
        isPausedStockAlertsExpanded = prefs.getBoolean("pref_paused_stock_expanded", false)

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
            setPadding(40, 50, 40, 50)
        }
        scroll.addView(rootLayout)

        // Determinar si los ajustes deben iniciar colapsados (si ya hay sesión y permisos dados)
        val notifReady = isNotificationServiceEnabled()
        val overlayReady = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) Settings.canDrawOverlays(this) else true
        val isSessionReady = savedToken.isNotBlank()
        val allConfigured = notifReady && overlayReady && isSessionReady

        isSettingsExpanded = prefs.getBoolean("pref_settings_expanded", !allConfigured)

        // ─────────────────────────────────────────────────────────────────────────
        // 1. CABECERA MODERNA Y COMPACTA (Always on top)
        // ─────────────────────────────────────────────────────────────────────────
        buildTopHeader(rootLayout)

        // ─────────────────────────────────────────────────────────────────────────
        // 2. SECCIÓN COLAPSABLE: AJUSTES, PERMISOS Y SESIÓN (Accordion Card)
        // ─────────────────────────────────────────────────────────────────────────
        buildCollapsibleSettingsCard(rootLayout, savedToken, savedUserEmail, savedUserName)

        // ─────────────────────────────────────────────────────────────────────────
        // 3. SELECTOR DE PESTAÑAS (Inmediatamente arriba y accesible)
        // ─────────────────────────────────────────────────────────────────────────
        buildTabSelector(rootLayout)

        // ─────────────────────────────────────────────────────────────────────────
        // 4. PESTAÑA 1: BANDEJA E HISTORIAL DE MOVIMIENTOS BANCARIOS
        // ─────────────────────────────────────────────────────────────────────────
        buildHistorySection(rootLayout)

        // ─────────────────────────────────────────────────────────────────────────
        // 5. PESTAÑA 2: ALERTAS ACTIVAS DE BOLSA Y ETFS
        // ─────────────────────────────────────────────────────────────────────────
        buildStockAlertsSection(rootLayout)

        updatePermissionStatus()

        // Escuchar cambios de notificaciones bancarias en segundo plano
        MovementHistoryManager.setOnHistoryChangeListener {
            runOnUiThread {
                refreshHistoryUI()
            }
        }

        // Iniciar monitoreo continuo de alertas de bolsa (cada 5 min)
        StockAlertManager.startPolling(this, intervalMinutes = 5)
        StockAlertManager.setOnAlertsUpdatedListener { pollResult ->
            runOnUiThread {
                renderStockAlertsUI(pollResult)
            }
        }

        // Revisar si la app fue abierta desde una notificación de alerta
        handleOpenFromNotification(intent)

        setContentView(scroll)
        refreshHistoryUI()
        switchMainTab(activeMainTab)
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        handleOpenFromNotification(intent)
    }

    private fun handleOpenFromNotification(intent: Intent?) {
        if (intent?.getStringExtra("OPEN_TAB") == "ALERTS") {
            switchMainTab("ALERTS")
            val ticker = intent.getStringExtra("ALERT_TICKER") ?: ""
            if (ticker.isNotBlank()) {
                Toast.makeText(this, "🚨 Alerta disparada para $ticker", Toast.LENGTH_LONG).show()
            }
        }
    }

    override fun onResume() {
        super.onResume()
        updatePermissionStatus()
        refreshHistoryUI()
        if (activeMainTab == "ALERTS") {
            StockAlertManager.fetchLiveAlertsAsync(this) { res ->
                if (res != null) renderStockAlertsUI(res)
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        StockAlertManager.stopPolling()
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // COMPONENTE: CABECERA MODERNA CON TOGGLE DE AJUSTES
    // ─────────────────────────────────────────────────────────────────────────────

    private fun buildTopHeader(root: LinearLayout) {
        val headerLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, 0, 0, 16)
        }

        val topRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }

        val titleBlock = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }

        val titleView = TextView(this).apply {
            text = "Kpital Mobile"
            textSize = 22f
            setTextColor(Color.WHITE)
            setTypeface(null, Typeface.BOLD)
        }
        titleBlock.addView(titleView)

        val descView = TextView(this).apply {
            text = "Gastos bancarios & alertas de bolsa en vivo"
            textSize = 11f
            setTextColor(Color.parseColor("#94a3b8"))
        }
        titleBlock.addView(descView)

        topRow.addView(titleBlock)

        // Badge de Estado General (🟢 Activo / 🟡 Permisos / ⚪ Sin Sesión)
        overallStatusBadge = TextView(this).apply {
            textSize = 10f
            setTypeface(null, Typeface.BOLD)
            setPadding(14, 8, 14, 8)
            val p = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                setMargins(0, 0, 10, 0)
            }
            layoutParams = p
        }
        topRow.addView(overallStatusBadge)

        // Botón Toggle para Expandir/Ocultar Ajustes, Permisos y Sesión
        btnToggleSettings = Button(this).apply {
            text = if (isSettingsExpanded) "⚙️ Ajustes ▲" else "⚙️ Ajustes ▼"
            textSize = 11f
            isAllCaps = false
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.parseColor("#38bdf8"))
            background = GradientDrawable().apply {
                cornerRadius = 14f
                setColor(Color.parseColor("#0c2340"))
                setStroke(1, Color.parseColor("#0284c7"))
            }
            setPadding(20, 10, 20, 10)
            setOnClickListener {
                isSettingsExpanded = !isSettingsExpanded
                collapsibleSettingsCard.visibility = if (isSettingsExpanded) View.VISIBLE else View.GONE
                text = if (isSettingsExpanded) "⚙️ Ajustes ▲" else "⚙️ Ajustes ▼"
                prefs.edit().putBoolean("pref_settings_expanded", isSettingsExpanded).apply()
            }
        }
        topRow.addView(btnToggleSettings)

        headerLayout.addView(topRow)
        root.addView(headerLayout)
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // COMPONENTE: TARJETA COLAPSABLE DE AJUSTES, PERMISOS Y SESIÓN
    // ─────────────────────────────────────────────────────────────────────────────

    private fun buildCollapsibleSettingsCard(root: LinearLayout, savedToken: String, savedUserEmail: String, savedUserName: String) {
        collapsibleSettingsCard = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(35, 30, 35, 30)
            visibility = if (isSettingsExpanded) View.VISIBLE else View.GONE
            background = GradientDrawable().apply {
                cornerRadius = 20f
                setColor(Color.parseColor("#0c111e"))
                setStroke(1, Color.parseColor("#1e293b"))
            }
            val p = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                setMargins(0, 0, 0, 22)
            }
            layoutParams = p
        }

        // Sub-título 1: Permisos del Sistema
        val permTitle = TextView(this).apply {
            text = "🛡️ Permisos del Sistema"
            textSize = 15f
            setTextColor(Color.WHITE)
            setTypeface(null, Typeface.BOLD)
            setPadding(0, 0, 0, 10)
        }
        collapsibleSettingsCard.addView(permTitle)

        // Estado del Servicio de Notificaciones
        statusTextView = TextView(this).apply {
            textSize = 12f
            setTypeface(null, Typeface.BOLD)
            setPadding(0, 0, 0, 6)
        }
        collapsibleSettingsCard.addView(statusTextView)

        val permButton = Button(this).apply {
            text = "1. Permiso de Notificaciones Bancarias"
            textSize = 11f
            isAllCaps = false
            setTextColor(Color.WHITE)
            background = GradientDrawable().apply {
                cornerRadius = 12f
                setColor(Color.parseColor("#1e293b"))
                setStroke(1, Color.parseColor("#334155"))
            }
            setPadding(16, 8, 16, 8)
            setOnClickListener {
                startActivity(Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS"))
            }
        }
        collapsibleSettingsCard.addView(permButton)

        // Estado del Permiso de Ventana Flotante
        overlayStatusTextView = TextView(this).apply {
            textSize = 12f
            setTypeface(null, Typeface.BOLD)
            setPadding(0, 14, 0, 6)
        }
        collapsibleSettingsCard.addView(overlayStatusTextView)

        val overlayPermButton = Button(this).apply {
            text = "2. Permitir Ventana Emergente Automática"
            textSize = 11f
            isAllCaps = false
            setTextColor(Color.WHITE)
            setTypeface(null, Typeface.BOLD)
            background = GradientDrawable().apply {
                cornerRadius = 12f
                setColor(Color.parseColor("#0284c7"))
                setStroke(1, Color.parseColor("#38bdf8"))
            }
            setPadding(16, 8, 16, 8)
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
        collapsibleSettingsCard.addView(overlayPermButton)

        val overlayHelpView = TextView(this).apply {
            text = "💡 Permite que cuando Nequi, Nu o Bancolombia envíen una notificación, aparezca el selector táctil de cajita de inmediato."
            textSize = 10f
            setTextColor(Color.parseColor("#64748b"))
            setPadding(0, 6, 0, 14)
        }
        collapsibleSettingsCard.addView(overlayHelpView)

        // Separador interno
        collapsibleSettingsCard.addView(createSeparator())

        // Sub-título 2: Sesión de Usuario
        val sessionHeaderTitle = TextView(this).apply {
            text = "👤 Cuenta y Sincronización"
            textSize = 15f
            setTextColor(Color.WHITE)
            setTypeface(null, Typeface.BOLD)
            setPadding(0, 8, 0, 10)
        }
        collapsibleSettingsCard.addView(sessionHeaderTitle)

        // --- SECCIÓN 1: SESIÓN INICIADA ---
        userSessionLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            visibility = if (savedToken.isNotBlank()) View.VISIBLE else View.GONE
        }
        welcomeUserTextView = TextView(this).apply {
            text = "👤 Conectado como:\n${savedUserName.ifEmpty { savedUserEmail }}"
            textSize = 14f
            setTextColor(Color.parseColor("#00e5ff"))
            setTypeface(null, Typeface.BOLD)
        }
        userSessionLayout.addView(welcomeUserTextView)

        val syncInfoTextView = TextView(this).apply {
            text = "Tus transacciones y alertas se sincronizan en vivo con tu cuenta Kpital.\n"
            textSize = 11f
            setTextColor(Color.parseColor("#94a3b8"))
            setPadding(0, 4, 0, 8)
        }
        userSessionLayout.addView(syncInfoTextView)

        val logoutButton = Button(this).apply {
            text = "Cerrar Sesión"
            textSize = 11f
            isAllCaps = false
            setTextColor(Color.parseColor("#f87171"))
            background = GradientDrawable().apply {
                cornerRadius = 12f
                setColor(Color.parseColor("#2a0f1d"))
                setStroke(1, Color.parseColor("#ef4444"))
            }
            setPadding(18, 8, 18, 8)
            setOnClickListener {
                prefs.edit().clear().apply()
                Core.initConfig("https://titanes-portfolio-backend.onrender.com", "", "", true)
                userSessionLayout.visibility = View.GONE
                loginFormLayout.visibility = View.VISIBLE
                updatePermissionStatus()
                Toast.makeText(this@MainActivity, "Sesión cerrada", Toast.LENGTH_SHORT).show()
            }
        }
        userSessionLayout.addView(logoutButton)
        collapsibleSettingsCard.addView(userSessionLayout)

        // --- SECCIÓN 2: FORMULARIO DE LOGIN ---
        loginFormLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            visibility = if (savedToken.isBlank()) View.VISIBLE else View.GONE
        }

        val emailInput = EditText(this).apply {
            hint = "Correo electrónico"
            setHintTextColor(Color.parseColor("#64748b"))
            setTextColor(Color.WHITE)
            textSize = 13f
            inputType = InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
            setText(if (savedUserEmail.isNotBlank()) savedUserEmail else "caballerojesus703@hotmail.com")
            background = GradientDrawable().apply {
                cornerRadius = 12f
                setColor(Color.parseColor("#0f172a"))
                setStroke(1, Color.parseColor("#334155"))
            }
            setPadding(24, 18, 24, 18)
            val p = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                setMargins(0, 0, 0, 10)
            }
            layoutParams = p
        }
        loginFormLayout.addView(emailInput)

        val passInput = EditText(this).apply {
            hint = "Contraseña"
            setHintTextColor(Color.parseColor("#64748b"))
            setTextColor(Color.WHITE)
            textSize = 13f
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            background = GradientDrawable().apply {
                cornerRadius = 12f
                setColor(Color.parseColor("#0f172a"))
                setStroke(1, Color.parseColor("#334155"))
            }
            setPadding(24, 18, 24, 18)
            val p = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                setMargins(0, 0, 0, 12)
            }
            layoutParams = p
        }
        loginFormLayout.addView(passInput)

        val loginButton = Button(this).apply {
            text = "Entrar a mi Cuenta"
            textSize = 12f
            isAllCaps = false
            setTextColor(Color.BLACK)
            setTypeface(null, Typeface.BOLD)
            background = GradientDrawable().apply {
                cornerRadius = 12f
                setColor(Color.parseColor("#00e5ff"))
            }
            setPadding(20, 12, 20, 12)
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
                                updatePermissionStatus()

                                // Auto-colapsar ajustes al iniciar sesión con éxito
                                isSettingsExpanded = false
                                collapsibleSettingsCard.visibility = View.GONE
                                btnToggleSettings.text = "⚙️ Ajustes ▼"
                                prefs.edit().putBoolean("pref_settings_expanded", false).apply()

                                Toast.makeText(this@MainActivity, "¡Bienvenido, $userName!", Toast.LENGTH_SHORT).show()
                                StockAlertManager.fetchLiveAlertsAsync(this@MainActivity)
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
        collapsibleSettingsCard.addView(loginFormLayout)

        root.addView(collapsibleSettingsCard)
    }

    private fun createSeparator(): View {
        return View(this).apply {
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 1).apply {
                setMargins(0, 20, 0, 20)
            }
            setBackgroundColor(Color.parseColor("#1e293b"))
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // GESTIÓN DE PESTAÑAS PRINCIPALES
    // ─────────────────────────────────────────────────────────────────────────────

    private fun buildTabSelector(root: LinearLayout) {
        tabSelectorLayout = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, 0, 0, 20)
        }

        btnTabBank = Button(this).apply {
            text = "💳 Gastos y Bancos"
            textSize = 13f
            isAllCaps = false
            setTypeface(null, Typeface.BOLD)
            val p = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                setMargins(0, 0, 8, 0)
            }
            layoutParams = p
            setOnClickListener {
                switchMainTab("BANK")
            }
        }
        tabSelectorLayout.addView(btnTabBank)

        btnTabAlerts = Button(this).apply {
            text = "📈 Alertas de Bolsa"
            textSize = 13f
            isAllCaps = false
            setTypeface(null, Typeface.BOLD)
            val p = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                setMargins(8, 0, 0, 0)
            }
            layoutParams = p
            setOnClickListener {
                switchMainTab("ALERTS")
            }
        }
        tabSelectorLayout.addView(btnTabAlerts)

        root.addView(tabSelectorLayout)
    }

    private fun switchMainTab(tab: String) {
        activeMainTab = tab
        val isBank = (tab == "BANK")

        sectionBankMovements.visibility = if (isBank) View.VISIBLE else View.GONE
        sectionStockAlerts.visibility = if (!isBank) View.VISIBLE else View.GONE

        btnTabBank.background = getTabButtonDrawable(isBank)
        btnTabBank.setTextColor(if (isBank) Color.WHITE else Color.parseColor("#94a3b8"))

        btnTabAlerts.background = getTabButtonDrawable(!isBank)
        btnTabAlerts.setTextColor(if (!isBank) Color.WHITE else Color.parseColor("#94a3b8"))

        if (!isBank) {
            val cached = StockAlertManager.latestResult
            if (cached != null) {
                renderStockAlertsUI(cached)
            }
            StockAlertManager.fetchLiveAlertsAsync(this) { res ->
                if (res != null) renderStockAlertsUI(res)
            }
        }
    }

    private fun getTabButtonDrawable(isSelected: Boolean): GradientDrawable {
        return GradientDrawable().apply {
            cornerRadius = 18f
            if (isSelected) {
                setColor(Color.parseColor("#0284c7"))
                setStroke(2, Color.parseColor("#38bdf8"))
            } else {
                setColor(Color.parseColor("#0e1526"))
                setStroke(1, Color.parseColor("#1e293b"))
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // PESTAÑA 1: BANDEJA E HISTORIAL DE MOVIMIENTOS BANCARIOS
    // ─────────────────────────────────────────────────────────────────────────────

    private fun buildHistorySection(root: LinearLayout) {
        sectionBankMovements = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }

        val historyHeader = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }

        val headerRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }

        val titleView = TextView(this).apply {
            text = "📋 Historial de Notificaciones"
            textSize = 18f
            setTextColor(Color.WHITE)
            setTypeface(null, Typeface.BOLD)
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        headerRow.addView(titleView)

        // Botón de prueba/simulación
        val testBtn = Button(this).apply {
            text = "+ Simular"
            textSize = 11f
            isAllCaps = false
            setTextColor(Color.parseColor("#38bdf8"))
            background = GradientDrawable().apply {
                cornerRadius = 14f
                setColor(Color.parseColor("#0c2340"))
                setStroke(1, Color.parseColor("#0284c7"))
            }
            setPadding(18, 8, 18, 8)
            setOnClickListener {
                showSimulateMovementDialog()
            }
        }
        headerRow.addView(testBtn)
        historyHeader.addView(headerRow)

        val subDesc = TextView(this).apply {
            text = "Movimientos detectados automáticamente en tus bancos. Puedes completarlos en cualquier momento."
            textSize = 11f
            setTextColor(Color.parseColor("#94a3b8"))
            setPadding(0, 6, 0, 14)
        }
        historyHeader.addView(subDesc)

        // Contenedor de Botones de Filtro
        filterContainer = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, 0, 0, 14)
        }

        allFilterBtn = createFilterButton("Todos", "ALL")
        pendingFilterBtn = createFilterButton("🟡 Pendientes", "PENDING")
        completedFilterBtn = createFilterButton("🟢 Registrados", "COMPLETED")

        filterContainer.addView(allFilterBtn)
        filterContainer.addView(pendingFilterBtn)
        filterContainer.addView(completedFilterBtn)
        historyHeader.addView(filterContainer)

        sectionBankMovements.addView(historyHeader)

        // Estado Vacío
        emptyHistoryView = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(40, 50, 40, 50)
            background = GradientDrawable().apply {
                cornerRadius = 20f
                setColor(Color.parseColor("#0c111e"))
                setStroke(1, Color.parseColor("#1e293b"))
            }
            visibility = View.GONE
        }

        val emptyIcon = TextView(this).apply {
            text = "💳"
            textSize = 34f
            gravity = Gravity.CENTER
        }
        emptyHistoryView.addView(emptyIcon)

        val emptyText = TextView(this).apply {
            text = "No hay movimientos registrados todavía.\nCuando recibas una notificación bancaria o simules un movimiento, aparecerá aquí."
            textSize = 12f
            setTextColor(Color.parseColor("#64748b"))
            gravity = Gravity.CENTER
            setPadding(0, 10, 0, 0)
        }
        emptyHistoryView.addView(emptyText)
        sectionBankMovements.addView(emptyHistoryView)

        // Contenedor de Tarjetas de Movimientos
        historyContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }
        sectionBankMovements.addView(historyContainer)

        // Botón para limpiar completados
        val cleanCompletedBtn = Button(this).apply {
            text = "🧹 Limpiar Registrados del Historial"
            textSize = 11f
            isAllCaps = false
            setTextColor(Color.parseColor("#94a3b8"))
            background = GradientDrawable().apply {
                cornerRadius = 14f
                setColor(Color.parseColor("#0c111e"))
                setStroke(1, Color.parseColor("#1e293b"))
            }
            setPadding(20, 12, 20, 12)
            val params = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                setMargins(0, 20, 0, 10)
            }
            layoutParams = params
            setOnClickListener {
                MovementHistoryManager.clearCompletedMovements(this@MainActivity)
                refreshHistoryUI()
                Toast.makeText(this@MainActivity, "Movimientos registrados eliminados", Toast.LENGTH_SHORT).show()
            }
        }
        sectionBankMovements.addView(cleanCompletedBtn)

        root.addView(sectionBankMovements)
    }

    private fun createFilterButton(label: String, filterKey: String): Button {
        return Button(this).apply {
            text = label
            textSize = 11f
            isAllCaps = false
            val isSelected = (activeFilter == filterKey)
            setTextColor(if (isSelected) Color.WHITE else Color.parseColor("#94a3b8"))
            background = getFilterButtonDrawable(isSelected)

            val params = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                setMargins(4, 0, 4, 0)
            }
            layoutParams = params

            setOnClickListener {
                activeFilter = filterKey
                updateFilterButtonsUI()
                refreshHistoryUI()
            }
        }
    }

    private fun getFilterButtonDrawable(isSelected: Boolean): GradientDrawable {
        return GradientDrawable().apply {
            cornerRadius = 14f
            if (isSelected) {
                setColor(Color.parseColor("#0284c7"))
                setStroke(2, Color.parseColor("#38bdf8"))
            } else {
                setColor(Color.parseColor("#0e1526"))
                setStroke(1, Color.parseColor("#1e293b"))
            }
        }
    }

    private fun updateFilterButtonsUI() {
        allFilterBtn?.background = getFilterButtonDrawable(activeFilter == "ALL")
        allFilterBtn?.setTextColor(if (activeFilter == "ALL") Color.WHITE else Color.parseColor("#94a3b8"))

        pendingFilterBtn?.background = getFilterButtonDrawable(activeFilter == "PENDING")
        pendingFilterBtn?.setTextColor(if (activeFilter == "PENDING") Color.WHITE else Color.parseColor("#94a3b8"))

        completedFilterBtn?.background = getFilterButtonDrawable(activeFilter == "COMPLETED")
        completedFilterBtn?.setTextColor(if (activeFilter == "COMPLETED") Color.WHITE else Color.parseColor("#94a3b8"))
    }

    private fun refreshHistoryUI() {
        if (!::historyContainer.isInitialized) return

        val allMovements = MovementHistoryManager.getMovements(this)
        val pendingCount = allMovements.count { it.status == MovementHistoryManager.STATUS_PENDING }
        val completedCount = allMovements.count { it.status == MovementHistoryManager.STATUS_COMPLETED }

        // Actualizar badges en botones de filtro
        allFilterBtn?.text = "Todos (${allMovements.size})"
        pendingFilterBtn?.text = "🟡 Pendientes ($pendingCount)"
        completedFilterBtn?.text = "🟢 Registrados ($completedCount)"

        historyContainer.removeAllViews()

        if (allMovements.isEmpty()) {
            emptyHistoryView.visibility = View.VISIBLE
            return
        }
        emptyHistoryView.visibility = View.GONE

        if (activeFilter == "PENDING") {
            val pendingList = allMovements.filter { it.status == MovementHistoryManager.STATUS_PENDING }
            if (pendingList.isEmpty()) {
                emptyHistoryView.visibility = View.VISIBLE
            } else {
                for (movement in pendingList) {
                    historyContainer.addView(createMovementCardView(movement))
                }
            }
            return
        }

        if (activeFilter == "COMPLETED") {
            val completedList = allMovements.filter { it.status == MovementHistoryManager.STATUS_COMPLETED }
            if (completedList.isEmpty()) {
                emptyHistoryView.visibility = View.VISIBLE
            } else {
                for (movement in completedList) {
                    historyContainer.addView(createMovementCardView(movement))
                }
            }
            return
        }

        // Modo "ALL": Organización limpia con sección pendiente arriba y acordeón para completados
        val pendingList = allMovements.filter { it.status == MovementHistoryManager.STATUS_PENDING }
        val completedList = allMovements.filter { it.status == MovementHistoryManager.STATUS_COMPLETED }

        // 1. Bloque de Movimientos Pendientes
        if (pendingList.isNotEmpty()) {
            val pendingTitle = TextView(this).apply {
                text = "🟡 Pendientes de Asignar Cajita (${pendingList.size})"
                textSize = 13f
                setTypeface(null, Typeface.BOLD)
                setTextColor(Color.parseColor("#f59e0b"))
                setPadding(0, 6, 0, 10)
            }
            historyContainer.addView(pendingTitle)

            for (movement in pendingList) {
                historyContainer.addView(createMovementCardView(movement))
            }
        }

        // 2. Bloque Acordeón para Movimientos Registrados
        if (completedList.isNotEmpty()) {
            val completedSectionLayout = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(0, if (pendingList.isNotEmpty()) 12 else 0, 0, 0)
            }

            val completedCardsLayout = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                visibility = if (isCompletedHistoryExpanded) View.VISIBLE else View.GONE
            }

            val accordionHeader = createAccordionHeader(
                title = "🟢 Movimientos Registrados",
                count = completedList.size,
                badgeColor = "#10b981",
                isExpanded = isCompletedHistoryExpanded
            ) { expanded ->
                isCompletedHistoryExpanded = expanded
                completedCardsLayout.visibility = if (expanded) View.VISIBLE else View.GONE
                prefs.edit().putBoolean("pref_completed_history_expanded", expanded).apply()
            }
            completedSectionLayout.addView(accordionHeader)

            for (movement in completedList) {
                completedCardsLayout.addView(createMovementCardView(movement))
            }
            completedSectionLayout.addView(completedCardsLayout)
            historyContainer.addView(completedSectionLayout)
        }
    }

    private fun createMovementCardView(movement: CapturedMovement): View {
        val isPending = (movement.status == MovementHistoryManager.STATUS_PENDING)
        val isCredit = (movement.txType.equals("credit", ignoreCase = true))

        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(30, 24, 30, 24)
            background = GradientDrawable().apply {
                cornerRadius = 20f
                setColor(Color.parseColor("#0c111e"))
                if (isPending) {
                    setStroke(2, Color.parseColor("#f59e0b")) // Borde ámbar para pendientes
                } else {
                    setStroke(1, Color.parseColor("#1e293b"))
                }
            }
            val params = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                setMargins(0, 0, 0, 14)
            }
            layoutParams = params
        }

        // Fila 1: Banco Badge + Tipo + Monto
        val topRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }

        val bankBadge = TextView(this).apply {
            text = movement.bank
            textSize = 12f
            setTypeface(null, Typeface.BOLD)
            val bankColor = getBankColor(movement.bank)
            setTextColor(bankColor)
            background = GradientDrawable().apply {
                cornerRadius = 10f
                setColor(adjustAlpha(bankColor, 0.15f))
                setStroke(1, bankColor)
            }
            setPadding(16, 6, 16, 6)
        }
        topRow.addView(bankBadge)

        if (isCredit) {
            val creditBadge = TextView(this).apply {
                text = "💳 Tarjeta"
                textSize = 10f
                setTypeface(null, Typeface.BOLD)
                setTextColor(Color.parseColor("#c084fc"))
                background = GradientDrawable().apply {
                    cornerRadius = 8f
                    setColor(Color.parseColor("#2e1065"))
                    setStroke(1, Color.parseColor("#9333ea"))
                }
                setPadding(12, 4, 12, 4)
                val p = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    setMargins(10, 0, 0, 0)
                }
                layoutParams = p
            }
            topRow.addView(creditBadge)
        }

        val spacerTop = View(this).apply {
            layoutParams = LinearLayout.LayoutParams(0, 1, 1f)
        }
        topRow.addView(spacerTop)

        val amountView = TextView(this).apply {
            text = "$${String.format(Locale.US, "%,.0f", movement.amount)} COP"
            textSize = 15f
            setTextColor(Color.WHITE)
            setTypeface(null, Typeface.BOLD)
        }
        topRow.addView(amountView)
        card.addView(topRow)

        // Fila 2: Descripción y Fecha
        val descView = TextView(this).apply {
            text = movement.description
            textSize = 13f
            setTextColor(Color.parseColor("#f1f5f9"))
            setPadding(0, 8, 0, 2)
        }
        card.addView(descView)

        val dateView = TextView(this).apply {
            val formattedDate = dateFormat.format(Date(movement.timestamp))
            text = formattedDate
            textSize = 11f
            setTextColor(Color.parseColor("#64748b"))
            setPadding(0, 0, 0, 10)
        }
        card.addView(dateView)

        // Fila 3: Estado y Botón de Acción
        val bottomRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, 4, 0, 0)
        }

        val statusView = TextView(this).apply {
            if (isPending) {
                text = "🟡 Pendiente de asignar"
                setTextColor(Color.parseColor("#f59e0b"))
                background = GradientDrawable().apply {
                    cornerRadius = 8f
                    setColor(Color.parseColor("#2a1e04"))
                    setStroke(1, Color.parseColor("#f59e0b"))
                }
            } else {
                val pocketLabel = movement.pocketName ?: "Kpital"
                text = "🟢 En $pocketLabel"
                setTextColor(Color.parseColor("#4ade80"))
                background = GradientDrawable().apply {
                    cornerRadius = 8f
                    setColor(Color.parseColor("#052e16"))
                    setStroke(1, Color.parseColor("#10b981"))
                }
            }
            textSize = 10f
            setTypeface(null, Typeface.BOLD)
            setPadding(14, 6, 14, 6)
        }
        bottomRow.addView(statusView)

        val spacer = View(this).apply {
            layoutParams = LinearLayout.LayoutParams(0, 1, 1f)
        }
        bottomRow.addView(spacer)

        if (isPending) {
            val completeBtn = Button(this).apply {
                text = "⚡ Asignar Cajita"
                textSize = 11f
                isAllCaps = false
                setTypeface(null, Typeface.BOLD)
                setTextColor(Color.WHITE)
                background = GradientDrawable().apply {
                    cornerRadius = 14f
                    setColor(Color.parseColor("#0284c7"))
                    setStroke(1, Color.parseColor("#38bdf8"))
                }
                setPadding(22, 10, 22, 10)
                setOnClickListener {
                    openPocketSelector(movement)
                }
            }
            bottomRow.addView(completeBtn)
        }

        card.addView(bottomRow)
        return card
    }

    private fun openPocketSelector(movement: CapturedMovement) {
        val targetIntent = Intent(this, PocketSelectorActivity::class.java).apply {
            putExtra(PocketSelectorActivity.EXTRA_BANK, movement.bank)
            putExtra(PocketSelectorActivity.EXTRA_AMOUNT, movement.amount)
            putExtra(PocketSelectorActivity.EXTRA_DESC, movement.description)
            putExtra(PocketSelectorActivity.EXTRA_TX_TYPE, movement.txType)
            putExtra(PocketSelectorActivity.EXTRA_RAW_TEXT, movement.rawText)
            putExtra(PocketSelectorActivity.EXTRA_MOVEMENT_ID, movement.id)
        }
        startActivity(targetIntent)
    }

    private fun showSimulateMovementDialog() {
        val testBanks = arrayOf("Nu Colombia", "Bancolombia", "Nequi", "RappiPay")
        val testAmounts = doubleArrayOf(45000.0, 120000.0, 18500.0, 32000.0)
        val testDescs = arrayOf(
            "Compra en Éxito Calle 80",
            "Transferencia a Davivienda",
            "Pago en D1 Supermercados",
            "Compra en Rappi Restaurante"
        )

        val randIdx = testBanks.indices.random()
        val chosenBank = testBanks[randIdx]
        val chosenAmount = testAmounts[randIdx]
        val chosenDesc = testDescs[randIdx]

        val movement = CapturedMovement(
            bank = chosenBank,
            amount = chosenAmount,
            description = chosenDesc,
            txType = if (chosenBank.contains("Nu") || chosenBank.contains("Rappi")) "credit" else "expense",
            rawText = "Notificación simulada para pruebas",
            status = MovementHistoryManager.STATUS_PENDING
        )

        MovementHistoryManager.addMovement(this, movement)
        refreshHistoryUI()
        Toast.makeText(this, "Simulado: $chosenBank por $${chosenAmount.toInt()}", Toast.LENGTH_SHORT).show()
        openPocketSelector(movement)
    }

    private fun getBankColor(bank: String): Int {
        val lower = bank.lowercase()
        return when {
            lower.contains("nu") -> Color.parseColor("#8b5cf6") // Nu morado
            lower.contains("bancolombia") -> Color.parseColor("#facc15") // Bancolombia amarillo
            lower.contains("nequi") -> Color.parseColor("#ec4899") // Nequi fucsia
            lower.contains("rappi") -> Color.parseColor("#f97316") // Rappi naranja
            lower.contains("davi") -> Color.parseColor("#ef4444") // Davivienda rojo
            lower.contains("falabella") -> Color.parseColor("#10b981") // Falabella verde
            lower.contains("caja social") || lower.contains("bcs") -> Color.parseColor("#2563eb") // BCS azul
            else -> Color.parseColor("#00e5ff") // Cyan por defecto
        }
    }

    private fun adjustAlpha(color: Int, factor: Float): Int {
        val alpha = (Color.alpha(color) * factor).toInt().coerceIn(0, 255)
        val red = Color.red(color)
        val green = Color.green(color)
        val blue = Color.blue(color)
        return Color.argb(alpha, red, green, blue)
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // PESTAÑA 2: ALERTAS DE VENTA DE BOLSA (ACCIONES & ETFS)
    // ─────────────────────────────────────────────────────────────────────────────

    private fun buildStockAlertsSection(root: LinearLayout) {
        sectionStockAlerts = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            visibility = View.GONE
        }

        val headerRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }

        val titleView = TextView(this).apply {
            text = "📈 Alertas de Venta (Bolsa)"
            textSize = 18f
            setTextColor(Color.WHITE)
            setTypeface(null, Typeface.BOLD)
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        headerRow.addView(titleView)

        // Botón Probar Alerta Sonora
        btnTestAlertNotification = Button(this).apply {
            text = "🧪 Probar"
            textSize = 11f
            isAllCaps = false
            setTextColor(Color.parseColor("#f43f5e"))
            background = GradientDrawable().apply {
                cornerRadius = 14f
                setColor(Color.parseColor("#2a0f1d"))
                setStroke(1, Color.parseColor("#f43f5e"))
            }
            setPadding(16, 8, 16, 8)
            setOnClickListener {
                StockAlertManager.sendTestAlertNotification(this@MainActivity)
                Toast.makeText(this@MainActivity, "🚨 Alerta emitida con sonido y vibración", Toast.LENGTH_SHORT).show()
            }
        }
        headerRow.addView(btnTestAlertNotification)

        // Botón Actualizar Cotizaciones
        btnRefreshAlerts = Button(this).apply {
            text = "🔄 Actualizar"
            textSize = 11f
            isAllCaps = false
            setTextColor(Color.parseColor("#38bdf8"))
            background = GradientDrawable().apply {
                cornerRadius = 14f
                setColor(Color.parseColor("#0c2340"))
                setStroke(1, Color.parseColor("#0284c7"))
            }
            setPadding(16, 8, 16, 8)
            val p = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                setMargins(8, 0, 0, 0)
            }
            layoutParams = p
            setOnClickListener {
                text = "⏳ ..."
                isEnabled = false
                StockAlertManager.fetchLiveAlertsAsync(this@MainActivity) { res ->
                    isEnabled = true
                    text = "🔄 Actualizar"
                    if (res != null && res.alerts.isNotEmpty()) {
                        renderStockAlertsUI(res)
                        Toast.makeText(this@MainActivity, "Cotizaciones actualizadas (${res.alerts.size} alertas)", Toast.LENGTH_SHORT).show()
                    } else if (res != null) {
                        renderStockAlertsUI(res)
                        Toast.makeText(this@MainActivity, "Sin alertas activas", Toast.LENGTH_SHORT).show()
                    } else {
                        Toast.makeText(this@MainActivity, "Error consultando cotizaciones", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        }
        headerRow.addView(btnRefreshAlerts)
        sectionStockAlerts.addView(headerRow)

        val subDesc = TextView(this).apply {
            text = "Monitoreo en vivo cada 5 min. Tu teléfono te notificará con alarma sonora en cuanto una posición alcance tu precio de venta."
            textSize = 11f
            setTextColor(Color.parseColor("#94a3b8"))
            setPadding(0, 6, 0, 12)
        }
        sectionStockAlerts.addView(subDesc)

        // Fila de Métricas (Activas, Cerca, Disparadas)
        val metricsRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, 0, 0, 12)
        }

        alertsMetricActive = createMetricPill("🎯 Activas: --", "#0284c7")
        alertsMetricNear = createMetricPill("⚡ Cerca: --", "#d97706")
        alertsMetricTriggered = createMetricPill("🚨 Disparadas: --", "#10b981")

        metricsRow.addView(alertsMetricActive)
        metricsRow.addView(alertsMetricNear)
        metricsRow.addView(alertsMetricTriggered)
        sectionStockAlerts.addView(metricsRow)

        alertsLastUpdatedText = TextView(this).apply {
            text = "● Monitoreando en vivo cada 5 min"
            textSize = 10f
            setTextColor(Color.parseColor("#64748b"))
            setPadding(0, 0, 0, 12)
        }
        sectionStockAlerts.addView(alertsLastUpdatedText)

        // Estado Vacío
        emptyAlertsView = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(40, 50, 40, 50)
            background = GradientDrawable().apply {
                cornerRadius = 20f
                setColor(Color.parseColor("#0c111e"))
                setStroke(1, Color.parseColor("#1e293b"))
            }
            visibility = View.GONE
        }

        val emptyIcon = TextView(this).apply {
            text = "📈"
            textSize = 34f
            gravity = Gravity.CENTER
        }
        emptyAlertsView.addView(emptyIcon)

        val emptyText = TextView(this).apply {
            text = "No tienes alertas de venta registradas.\nPuedes configurarlas desde la terminal Kpital en tus posiciones y se sincronizarán aquí."
            textSize = 12f
            setTextColor(Color.parseColor("#64748b"))
            gravity = Gravity.CENTER
            setPadding(0, 10, 0, 0)
        }
        emptyAlertsView.addView(emptyText)
        sectionStockAlerts.addView(emptyAlertsView)

        // Contenedor de Tarjetas de Alertas
        alertsCardsContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }
        sectionStockAlerts.addView(alertsCardsContainer)

        root.addView(sectionStockAlerts)
    }

    private fun createMetricPill(label: String, strokeColor: String): TextView {
        return TextView(this).apply {
            text = label
            textSize = 11f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.WHITE)
            background = GradientDrawable().apply {
                cornerRadius = 14f
                setColor(Color.parseColor("#0e1526"))
                setStroke(1, Color.parseColor(strokeColor))
            }
            setPadding(14, 8, 14, 8)
            val p = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                setMargins(4, 0, 4, 0)
            }
            layoutParams = p
            gravity = Gravity.CENTER
        }
    }

    /**
     * Componente Reutilizable: Encabezado de Acordeón Desplegable (Expandir / Ocultar)
     */
    private fun createAccordionHeader(
        title: String,
        count: Int,
        badgeColor: String,
        isExpanded: Boolean,
        onToggle: (Boolean) -> Unit
    ): LinearLayout {
        var expandedState = isExpanded

        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(24, 16, 24, 16)
            background = GradientDrawable().apply {
                cornerRadius = 16f
                setColor(Color.parseColor("#0e1526"))
                setStroke(1, Color.parseColor("#1e293b"))
            }
            val p = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                setMargins(0, 10, 0, 10)
            }
            layoutParams = p
        }

        val titleView = TextView(this).apply {
            text = title
            textSize = 13f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.WHITE)
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        header.addView(titleView)

        val countBadge = TextView(this).apply {
            text = "$count"
            textSize = 11f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.parseColor(badgeColor))
            background = GradientDrawable().apply {
                cornerRadius = 10f
                setColor(adjustAlpha(Color.parseColor(badgeColor), 0.18f))
                setStroke(1, Color.parseColor(badgeColor))
            }
            setPadding(14, 4, 14, 4)
            val p = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                setMargins(0, 0, 12, 0)
            }
            layoutParams = p
        }
        header.addView(countBadge)

        val chevronView = TextView(this).apply {
            text = if (expandedState) "▲" else "▼"
            textSize = 12f
            setTextColor(Color.parseColor("#94a3b8"))
            setTypeface(null, Typeface.BOLD)
        }
        header.addView(chevronView)

        header.setOnClickListener {
            expandedState = !expandedState
            chevronView.text = if (expandedState) "▲" else "▼"
            onToggle(expandedState)
        }

        return header
    }

    private fun renderStockAlertsUI(result: AlertsPollResult) {
        if (!::alertsCardsContainer.isInitialized) return

        alertsMetricActive.text = "🎯 Activas: ${result.activeCount}"
        alertsMetricNear.text = "⚡ Cerca: ${result.nearCount}"
        alertsMetricTriggered.text = "🚨 Disparadas: ${result.triggeredCount}"

        val timeStr = dateFormat.format(Date(result.lastUpdatedMillis))
        alertsLastUpdatedText.text = "● Monitoreando en vivo • Cotizaciones de: $timeStr"

        alertsCardsContainer.removeAllViews()

        if (result.alerts.isEmpty()) {
            emptyAlertsView.visibility = View.VISIBLE
            return
        }
        emptyAlertsView.visibility = View.GONE

        // Agrupación por categoría para evitar listas desparramadas
        val triggeredList = result.alerts.filter { it.status == "TRIGGERED" }
        val nearList = result.alerts.filter { it.status == "NEAR" }
        val activeList = result.alerts.filter { it.status == "ACTIVE" }
        val pausedList = result.alerts.filter { it.status == "PAUSED" }

        // 1. Acordeón 🚨 Objetivos de Venta Alcanzados
        if (triggeredList.isNotEmpty()) {
            val container = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                visibility = if (isTriggeredStockAlertsExpanded) View.VISIBLE else View.GONE
            }
            val header = createAccordionHeader(
                title = "🚨 Objetivos de Venta Alcanzados",
                count = triggeredList.size,
                badgeColor = "#10b981",
                isExpanded = isTriggeredStockAlertsExpanded
            ) { exp ->
                isTriggeredStockAlertsExpanded = exp
                container.visibility = if (exp) View.VISIBLE else View.GONE
                prefs.edit().putBoolean("pref_triggered_stock_expanded", exp).apply()
            }
            alertsCardsContainer.addView(header)
            for (alert in triggeredList) {
                container.addView(createAlertCardView(alert))
            }
            alertsCardsContainer.addView(container)
        }

        // 2. Acordeón ⚡ Próximas a Ejecutar (Cerca <= 1.5%)
        if (nearList.isNotEmpty()) {
            val container = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                visibility = if (isNearStockAlertsExpanded) View.VISIBLE else View.GONE
            }
            val header = createAccordionHeader(
                title = "⚡ Próximas a Ejecutar (≤1.5%)",
                count = nearList.size,
                badgeColor = "#f59e0b",
                isExpanded = isNearStockAlertsExpanded
            ) { exp ->
                isNearStockAlertsExpanded = exp
                container.visibility = if (exp) View.VISIBLE else View.GONE
                prefs.edit().putBoolean("pref_near_stock_expanded", exp).apply()
            }
            alertsCardsContainer.addView(header)
            for (alert in nearList) {
                container.addView(createAlertCardView(alert))
            }
            alertsCardsContainer.addView(container)
        }

        // 3. Acordeón 🎯 Alertas Activas en Seguimiento
        if (activeList.isNotEmpty()) {
            val container = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                visibility = if (isActiveStockAlertsExpanded) View.VISIBLE else View.GONE
            }
            val header = createAccordionHeader(
                title = "🎯 Alertas Activas en Seguimiento",
                count = activeList.size,
                badgeColor = "#0284c7",
                isExpanded = isActiveStockAlertsExpanded
            ) { exp ->
                isActiveStockAlertsExpanded = exp
                container.visibility = if (exp) View.VISIBLE else View.GONE
                prefs.edit().putBoolean("pref_active_stock_expanded", exp).apply()
            }
            alertsCardsContainer.addView(header)
            for (alert in activeList) {
                container.addView(createAlertCardView(alert))
            }
            alertsCardsContainer.addView(container)
        }

        // 4. Acordeón ⏸️ Alertas Pausadas
        if (pausedList.isNotEmpty()) {
            val container = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                visibility = if (isPausedStockAlertsExpanded) View.VISIBLE else View.GONE
            }
            val header = createAccordionHeader(
                title = "⚪ Alertas Pausadas",
                count = pausedList.size,
                badgeColor = "#64748b",
                isExpanded = isPausedStockAlertsExpanded
            ) { exp ->
                isPausedStockAlertsExpanded = exp
                container.visibility = if (exp) View.VISIBLE else View.GONE
                prefs.edit().putBoolean("pref_paused_stock_expanded", exp).apply()
            }
            alertsCardsContainer.addView(header)
            for (alert in pausedList) {
                container.addView(createAlertCardView(alert))
            }
            alertsCardsContainer.addView(container)
        }
    }

    private fun createAlertCardView(alert: EnrichedStockAlert): View {
        val isTakeProfit = (alert.alertType == "PROFIT_TARGET")
        val isTriggered = (alert.status == "TRIGGERED")
        val isNear = (alert.status == "NEAR")

        var isDetailsExpanded = false

        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(30, 24, 30, 24)
            background = GradientDrawable().apply {
                cornerRadius = 20f
                setColor(Color.parseColor("#0c111e"))
                val strokeColor = when {
                    isTriggered -> Color.parseColor("#10b981")
                    isNear -> Color.parseColor("#f59e0b")
                    else -> Color.parseColor("#1e293b")
                }
                setStroke(if (isTriggered || isNear) 2 else 1, strokeColor)
            }
            val params = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                setMargins(0, 0, 0, 14)
            }
            layoutParams = params
        }

        // Fila 1: Ticker Pill + Nombre de Empresa + Badge Tipo de Alerta
        val topRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }

        val tickerBadge = TextView(this).apply {
            text = alert.ticker
            textSize = 13f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.parseColor("#00e5ff"))
            background = GradientDrawable().apply {
                cornerRadius = 10f
                setColor(Color.parseColor("#082f49"))
                setStroke(1, Color.parseColor("#00e5ff"))
            }
            setPadding(16, 4, 16, 4)
        }
        topRow.addView(tickerBadge)

        val companyView = TextView(this).apply {
            text = alert.companyName
            textSize = 13f
            setTextColor(Color.WHITE)
            setTypeface(null, Typeface.BOLD)
            setPadding(12, 0, 8, 0)
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        topRow.addView(companyView)

        val typePill = TextView(this).apply {
            val prefix = if (alert.targetValue >= 0) "+" else ""
            text = if (isTakeProfit) "🟢 $prefix${alert.targetValue}% TP" else "🔴 ${alert.targetValue}% SL"
            textSize = 10f
            setTypeface(null, Typeface.BOLD)
            setTextColor(if (isTakeProfit) Color.parseColor("#4ade80") else Color.parseColor("#f87171"))
            background = GradientDrawable().apply {
                cornerRadius = 8f
                setColor(if (isTakeProfit) Color.parseColor("#062e16") else Color.parseColor("#2a0f1d"))
                setStroke(1, if (isTakeProfit) Color.parseColor("#10b981") else Color.parseColor("#ef4444"))
            }
            setPadding(14, 4, 14, 4)
        }
        topRow.addView(typePill)
        card.addView(topRow)

        // Fila 2: Resumen Compacto (Precio Actual, Retorno y Botón Toggle Detalles)
        val summaryRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, 8, 0, 4)
        }

        val curPriceView = TextView(this).apply {
            text = "$${String.format(Locale.US, "%.2f", alert.currentPrice)} USD"
            textSize = 14f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.WHITE)
        }
        summaryRow.addView(curPriceView)

        val retText = "${if (alert.currentReturnPct >= 0) "+" else ""}${String.format(Locale.US, "%.2f", alert.currentReturnPct)}%"
        val retView = TextView(this).apply {
            text = " ($retText)"
            textSize = 12f
            setTypeface(null, Typeface.BOLD)
            setTextColor(if (alert.currentReturnPct >= 0) Color.parseColor("#4ade80") else Color.parseColor("#f87171"))
        }
        summaryRow.addView(retView)

        val spacerSummary = View(this).apply {
            layoutParams = LinearLayout.LayoutParams(0, 1, 1f)
        }
        summaryRow.addView(spacerSummary)

        // Botón Toggle para ver/ocultar detalles de precios (P0, Target)
        val btnToggleDetails = TextView(this).apply {
            text = "👁️ Precios ▼"
            textSize = 10f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.parseColor("#38bdf8"))
            background = GradientDrawable().apply {
                cornerRadius = 8f
                setColor(Color.parseColor("#0c2340"))
                setStroke(1, Color.parseColor("#0284c7"))
            }
            setPadding(14, 6, 14, 6)
        }
        summaryRow.addView(btnToggleDetails)
        card.addView(summaryRow)

        // ── SECCIÓN COLAPSABLE INTERNA DE LA TARJETA (DETALLES Y GRILLA) ──────────
        val detailsSection = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            visibility = View.GONE
            setPadding(0, 8, 0, 0)
        }

        // Subtítulo / Lote y Estrategia
        val subText = alert.lotLabel ?: "Posición Consolidada"
        val subView = TextView(this).apply {
            text = "$subText • ${alert.scope.replaceFirstChar { it.uppercase() }}"
            textSize = 10f
            setTextColor(Color.parseColor("#64748b"))
            setPadding(0, 0, 0, 8)
        }
        detailsSection.addView(subView)

        // Grilla de Precios (Precio Actual vs Entrada P0 vs Meta Venta)
        val priceGrid = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(16, 12, 16, 12)
            background = GradientDrawable().apply {
                cornerRadius = 14f
                setColor(Color.parseColor("#080c14"))
            }
        }

        val curPriceFormatted = "$${String.format(Locale.US, "%.2f", alert.currentPrice)} USD"
        val chgFormatted = "${if (alert.changePct24h >= 0) "+" else ""}${String.format(Locale.US, "%.2f", alert.changePct24h)}% (24h)"
        val colActual = createPriceColumn("PRECIO ACTUAL", curPriceFormatted, if (alert.changePct24h >= 0) "#4ade80" else "#f87171", chgFormatted)

        val entryPriceFormatted = "$${String.format(Locale.US, "%.2f", alert.entryPrice)} USD"
        val colEntrada = createPriceColumn("PRECIO ENTRADA", entryPriceFormatted, "#94a3b8", "Costo P₀")

        val targetPriceFormatted = "$${String.format(Locale.US, "%.2f", alert.targetPrice)} USD"
        val colTarget = createPriceColumn("META VENTA", targetPriceFormatted, "#38bdf8", if (isTakeProfit) "Take Profit" else "Stop Loss")

        priceGrid.addView(colActual)
        priceGrid.addView(colEntrada)
        priceGrid.addView(colTarget)
        detailsSection.addView(priceGrid)

        // Fila de Distancia y Estado
        val distRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, 10, 0, 0)
        }

        val distView = TextView(this).apply {
            text = if (isTriggered) {
                "🎯 ¡Meta Alcanzada!"
            } else if (alert.distancePct <= 0) {
                "🎯 Cumplido"
            } else {
                "Distancia: faltan ${String.format(Locale.US, "%.2f", alert.distancePct)}%"
            }
            textSize = 11f
            setTextColor(if (isTriggered || alert.distancePct <= 0) Color.parseColor("#10b981") else Color.parseColor("#94a3b8"))
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        distRow.addView(distView)

        val statusBadge = TextView(this).apply {
            val (stText, stColor, stBg) = when (alert.status) {
                "TRIGGERED" -> Triple("🚨 EJECUTADA", "#10b981", "#062e16")
                "NEAR" -> Triple("⚡ CERCA", "#f59e0b", "#2a1e04")
                "PAUSED" -> Triple("⚪ PAUSADA", "#64748b", "#1e293b")
                else -> Triple("🟢 ACTIVA", "#0284c7", "#0c2340")
            }
            text = stText
            textSize = 10f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.parseColor(stColor))
            background = GradientDrawable().apply {
                cornerRadius = 8f
                setColor(Color.parseColor(stBg))
                setStroke(1, Color.parseColor(stColor))
            }
            setPadding(14, 6, 14, 6)
        }
        distRow.addView(statusBadge)
        detailsSection.addView(distRow)

        card.addView(detailsSection)

        // Evento para alternar detalles
        fun toggleCardDetails() {
            isDetailsExpanded = !isDetailsExpanded
            detailsSection.visibility = if (isDetailsExpanded) View.VISIBLE else View.GONE
            btnToggleDetails.text = if (isDetailsExpanded) "👁️ Precios ▲" else "👁️ Precios ▼"
        }

        btnToggleDetails.setOnClickListener { toggleCardDetails() }
        card.setOnClickListener { toggleCardDetails() }

        return card
    }

    private fun createPriceColumn(title: String, value: String, valueColor: String, subtext: String): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            gravity = Gravity.CENTER_HORIZONTAL

            val tView = TextView(this@MainActivity).apply {
                text = title
                textSize = 9f
                setTextColor(Color.parseColor("#64748b"))
                setTypeface(null, Typeface.BOLD)
                gravity = Gravity.CENTER
            }
            addView(tView)

            val vView = TextView(this@MainActivity).apply {
                text = value
                textSize = 12f
                setTextColor(Color.parseColor(valueColor))
                setTypeface(null, Typeface.BOLD)
                gravity = Gravity.CENTER
                setPadding(0, 2, 0, 2)
            }
            addView(vView)

            val sView = TextView(this@MainActivity).apply {
                text = subtext
                textSize = 8f
                setTextColor(Color.parseColor("#64748b"))
                gravity = Gravity.CENTER
            }
            addView(sView)
        }
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

        val savedToken = prefs.getString("auth_token", "") ?: ""
        val hasToken = savedToken.isNotBlank()
        val allOk = notifEnabled && overlayEnabled && hasToken

        if (::overallStatusBadge.isInitialized) {
            overallStatusBadge.apply {
                if (allOk) {
                    text = "🟢 Conectado"
                    setTextColor(Color.parseColor("#4ade80"))
                    background = GradientDrawable().apply {
                        cornerRadius = 12f
                        setColor(Color.parseColor("#052e16"))
                        setStroke(1, Color.parseColor("#10b981"))
                    }
                } else if (!notifEnabled || !overlayEnabled) {
                    text = "🟡 Permisos"
                    setTextColor(Color.parseColor("#f59e0b"))
                    background = GradientDrawable().apply {
                        cornerRadius = 12f
                        setColor(Color.parseColor("#2a1e04"))
                        setStroke(1, Color.parseColor("#f59e0b"))
                    }
                } else {
                    text = "⚪ Sin Sesión"
                    setTextColor(Color.parseColor("#94a3b8"))
                    background = GradientDrawable().apply {
                        cornerRadius = 12f
                        setColor(Color.parseColor("#0e1526"))
                        setStroke(1, Color.parseColor("#334155"))
                    }
                }
            }
        }
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
