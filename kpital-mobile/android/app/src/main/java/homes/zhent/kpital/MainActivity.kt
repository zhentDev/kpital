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

    // Contenedores de la sección de Alertas de Bolsa
    private lateinit var alertsCardsContainer: LinearLayout
    private lateinit var emptyAlertsView: LinearLayout
    private lateinit var alertsMetricActive: TextView
    private lateinit var alertsMetricNear: TextView
    private lateinit var alertsMetricTriggered: TextView
    private lateinit var alertsLastUpdatedText: TextView
    private lateinit var btnRefreshAlerts: Button
    private lateinit var btnTestAlertNotification: Button

    private val dateFormat = SimpleDateFormat("d 'de' MMM, h:mm a", Locale("es", "CO"))

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
            setPadding(45, 60, 45, 60)
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
            text = "Terminal nativa para captura de gastos bancarios y monitoreo de alertas de venta de bolsa en Colombia y Wall Street.\n"
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
            text = "💡 Este permiso permite que cuando Nequi, Nu o Bancolombia envíen una notificación, Kpital despliegue de inmediato la selección de cajita en pantalla.\n"
            textSize = 12f
            setTextColor(Color.parseColor("#94a3b8"))
            setPadding(0, 10, 0, 0)
        }
        rootLayout.addView(overlayHelpView)

        updatePermissionStatus()

        // Separador 1
        rootLayout.addView(createSeparator())

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
            text = "\nTus gastos de Bancolombia, Nu y Rappi se vinculan a tus cajitas, y tus alertas de venta de acciones/ETFs te notificarán aquí en vivo.\n"
            textSize = 13f
            setTextColor(Color.parseColor("#94a3b8"))
        }
        userSessionLayout.addView(syncInfoTextView)

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
        rootLayout.addView(loginFormLayout)

        // Separador 2
        rootLayout.addView(createSeparator())

        // --- SELECTOR DE PESTAÑAS (GASTOS BANCARIOS vs ALERTAS DE BOLSA) ---
        buildTabSelector(rootLayout)

        // --- SECCIÓN: BANDEJA E HISTORIAL DE MOVIMIENTOS BANCARIOS ---
        buildHistorySection(rootLayout)

        // --- SECCIÓN: ALERTAS ACTIVAS DE BOLSA Y ETFS ---
        buildStockAlertsSection(rootLayout)

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
                Toast.makeText(this, "🎯 Alerta disparada para $ticker", Toast.LENGTH_LONG).show()
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

    private fun createSeparator(): View {
        return View(this).apply {
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 2).apply {
                setMargins(0, 35, 0, 35)
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
            setPadding(0, 0, 0, 24)
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
            textSize = 19f
            setTextColor(Color.WHITE)
            setTypeface(null, Typeface.BOLD)
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        headerRow.addView(titleView)

        // Botón de prueba/simulación para testear sin esperar un gasto real
        val testBtn = Button(this).apply {
            text = "+ Simular"
            textSize = 11f
            setTextColor(Color.parseColor("#38bdf8"))
            background = GradientDrawable().apply {
                cornerRadius = 14f
                setColor(Color.parseColor("#0c2340"))
                setStroke(1, Color.parseColor("#0284c7"))
            }
            setPadding(20, 10, 20, 10)
            setOnClickListener {
                showSimulateMovementDialog()
            }
        }
        headerRow.addView(testBtn)
        historyHeader.addView(headerRow)

        val subDesc = TextView(this).apply {
            text = "Todos los movimientos detectados quedan guardados aquí. Si cerraste la ventana flotante o no pudiste atenderla, puedes completarlos en cualquier momento con un clic."
            textSize = 12f
            setTextColor(Color.parseColor("#94a3b8"))
            setPadding(0, 8, 0, 16)
        }
        historyHeader.addView(subDesc)

        // Contenedor de Botones de Filtro
        filterContainer = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, 0, 0, 16)
        }

        allFilterBtn = createFilterButton("Todos", "ALL")
        pendingFilterBtn = createFilterButton("🟡 Pendientes", "PENDING")
        completedFilterBtn = createFilterButton("🟢 Completados", "COMPLETED")

        filterContainer.addView(allFilterBtn)
        filterContainer.addView(pendingFilterBtn)
        filterContainer.addView(completedFilterBtn)
        historyHeader.addView(filterContainer)

        sectionBankMovements.addView(historyHeader)

        // Vista de Estado Vacío
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
            text = "📭"
            textSize = 34f
            gravity = Gravity.CENTER
        }
        emptyHistoryView.addView(emptyIcon)

        val emptyText = TextView(this).apply {
            text = "No hay movimientos en esta sección.\nLas compras, retiros o transferencias detectadas aparecerán aquí automáticamente."
            textSize = 13f
            setTextColor(Color.parseColor("#64748b"))
            gravity = Gravity.CENTER
            setPadding(0, 10, 0, 0)
        }
        emptyHistoryView.addView(emptyText)
        sectionBankMovements.addView(emptyHistoryView)

        // Contenedor dinámico de tarjetas de movimientos
        historyContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }
        sectionBankMovements.addView(historyContainer)

        // Botón inferior para limpiar completados
        val cleanCompletedBtn = Button(this).apply {
            text = "🧹 Limpiar movimientos completados"
            textSize = 12f
            setTextColor(Color.parseColor("#94a3b8"))
            background = GradientDrawable().apply {
                cornerRadius = 16f
                setColor(Color.parseColor("#0f172a"))
                setStroke(1, Color.parseColor("#334155"))
            }
            val params = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                setMargins(0, 16, 0, 20)
            }
            layoutParams = params
            setOnClickListener {
                MovementHistoryManager.clearCompletedMovements(this@MainActivity)
                refreshHistoryUI()
                Toast.makeText(this@MainActivity, "Movimientos completados eliminados del historial", Toast.LENGTH_SHORT).show()
            }
        }
        sectionBankMovements.addView(cleanCompletedBtn)

        root.addView(sectionBankMovements)
    }

    private fun createFilterButton(label: String, filterKey: String): Button {
        return Button(this).apply {
            text = label
            textSize = 12f
            isAllCaps = false
            val isSelected = (activeFilter == filterKey)
            setTextColor(if (isSelected) Color.WHITE else Color.parseColor("#94a3b8"))
            background = getFilterButtonDrawable(isSelected)

            val params = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                setMargins(6, 0, 6, 0)
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
            cornerRadius = 16f
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

        val filtered = when (activeFilter) {
            "PENDING" -> allMovements.filter { it.status == MovementHistoryManager.STATUS_PENDING }
            "COMPLETED" -> allMovements.filter { it.status == MovementHistoryManager.STATUS_COMPLETED }
            else -> allMovements
        }

        historyContainer.removeAllViews()

        if (filtered.isEmpty()) {
            emptyHistoryView.visibility = View.VISIBLE
        } else {
            emptyHistoryView.visibility = View.GONE
            for (movement in filtered) {
                val cardView = createMovementCardView(movement)
                historyContainer.addView(cardView)
            }
        }
    }

    private fun createMovementCardView(movement: CapturedMovement): View {
        val isPending = (movement.status == MovementHistoryManager.STATUS_PENDING)
        val isCredit = (movement.txType.equals("credit", ignoreCase = true))

        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(35, 30, 35, 30)
            background = GradientDrawable().apply {
                cornerRadius = 24f
                setColor(Color.parseColor("#0c111e"))
                if (isPending) {
                    setStroke(2, Color.parseColor("#0284c7")) // Resaltado azul para pendientes
                } else {
                    setStroke(1, Color.parseColor("#1e293b"))
                }
            }
            val params = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                setMargins(0, 0, 0, 20)
            }
            layoutParams = params
        }

        // Fila 1: Banco (Pill con color) + Fecha/Hora + Botón Eliminar
        val topRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }

        val bankColor = getBankColor(movement.bank)
        val bankBadge = TextView(this).apply {
            text = movement.bank
            textSize = 12f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.WHITE)
            background = GradientDrawable().apply {
                cornerRadius = 12f
                setColor(adjustAlpha(bankColor, 0.25f))
                setStroke(2, bankColor)
            }
            setPadding(20, 6, 20, 6)
        }
        topRow.addView(bankBadge)

        val timeView = TextView(this).apply {
            text = dateFormat.format(Date(movement.timestamp))
            textSize = 11f
            setTextColor(Color.parseColor("#64748b"))
            setPadding(20, 0, 0, 0)
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        topRow.addView(timeView)

        val deleteBtn = TextView(this).apply {
            text = "✕"
            textSize = 14f
            setTextColor(Color.parseColor("#64748b"))
            setPadding(15, 5, 10, 5)
            setOnClickListener {
                MovementHistoryManager.deleteMovement(this@MainActivity, movement.id)
                refreshHistoryUI()
            }
        }
        topRow.addView(deleteBtn)
        card.addView(topRow)

        // Fila 2: Descripción / Concepto del Gasto
        val descView = TextView(this).apply {
            text = movement.description
            textSize = 16f
            setTextColor(Color.WHITE)
            setTypeface(null, Typeface.BOLD)
            setPadding(0, 14, 0, 4)
        }
        card.addView(descView)

        // Fila 3: Monto formateado
        val amountView = TextView(this).apply {
            if (movement.amount > 0) {
                val formatted = String.format("%,.0f", movement.amount)
                val prefix = if (isCredit) "+$" else "$"
                text = "$prefix$formatted COP"
                setTextColor(if (isCredit) Color.parseColor("#4ade80") else Color.parseColor("#00e5ff"))
                textSize = 22f
                setTypeface(null, Typeface.BOLD)
            } else {
                text = "⚠️ Monto por definir al completar"
                setTextColor(Color.parseColor("#f59e0b"))
                textSize = 14f
                setTypeface(null, Typeface.BOLD)
            }
            setPadding(0, 2, 0, 8)
        }
        card.addView(amountView)

        // Snippet de texto original si está disponible
        if (movement.rawText.isNotBlank()) {
            val rawSnippet = TextView(this).apply {
                val textClean = movement.rawText.replace("\n", " ").trim()
                text = if (textClean.length > 90) textClean.take(90) + "..." else textClean
                textSize = 11f
                setTextColor(Color.parseColor("#475569"))
                setPadding(0, 0, 0, 12)
            }
            card.addView(rawSnippet)
        }

        // Fila 4: Estado y Botón de Acción 1-Clic
        val bottomRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, 6, 0, 0)
        }

        val statusView = TextView(this).apply {
            if (isPending) {
                text = "🟡 Pendiente de cajita"
                setTextColor(Color.parseColor("#fbbf24"))
                background = GradientDrawable().apply {
                    cornerRadius = 10f
                    setColor(Color.parseColor("#2a1e04"))
                    setStroke(1, Color.parseColor("#f59e0b"))
                }
            } else {
                val pocketLabel = movement.pocketName ?: "Kpital"
                text = "🟢 Registrado en $pocketLabel"
                setTextColor(Color.parseColor("#4ade80"))
                background = GradientDrawable().apply {
                    cornerRadius = 10f
                    setColor(Color.parseColor("#052e16"))
                    setStroke(1, Color.parseColor("#10b981"))
                }
            }
            textSize = 11f
            setTypeface(null, Typeface.BOLD)
            setPadding(16, 8, 16, 8)
        }
        bottomRow.addView(statusView)

        val spacer = View(this).apply {
            layoutParams = LinearLayout.LayoutParams(0, 1, 1f)
        }
        bottomRow.addView(spacer)

        // Botón estrella: "⚡ Completar con 1 clic"
        if (isPending) {
            val completeBtn = Button(this).apply {
                text = "⚡ Asignar Cajita (1 clic)"
                textSize = 12f
                isAllCaps = false
                setTypeface(null, Typeface.BOLD)
                setTextColor(Color.WHITE)
                background = GradientDrawable().apply {
                    cornerRadius = 16f
                    setColor(Color.parseColor("#0284c7"))
                    setStroke(1, Color.parseColor("#38bdf8"))
                }
                setPadding(28, 12, 28, 12)
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
            txType = "debit",
            rawText = "Transacción aprobada por $chosenAmount COP en $chosenDesc con $chosenBank",
            timestamp = System.currentTimeMillis(),
            status = MovementHistoryManager.STATUS_PENDING
        )

        MovementHistoryManager.addMovement(this, movement)
        refreshHistoryUI()
        Toast.makeText(this, "Simulación generada: $chosenBank ($chosenAmount COP). Toca 'Asignar Cajita' para registrarla.", Toast.LENGTH_LONG).show()
    }

    private fun getBankColor(bank: String): Int {
        val lower = bank.lowercase()
        return when {
            lower.contains("nu") -> Color.parseColor("#820ad1") // Nu morado
            lower.contains("bancolombia") -> Color.parseColor("#eab308") // Bancolombia amarillo
            lower.contains("nequi") -> Color.parseColor("#ec008c") // Nequi magenta
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
            textSize = 19f
            setTextColor(Color.WHITE)
            setTypeface(null, Typeface.BOLD)
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        headerRow.addView(titleView)

        // Botón Probar Alerta Sonora en Celular
        btnTestAlertNotification = Button(this).apply {
            text = "🧪 Probar"
            textSize = 11f
            setTextColor(Color.parseColor("#f43f5e"))
            background = GradientDrawable().apply {
                cornerRadius = 14f
                setColor(Color.parseColor("#2a0f1d"))
                setStroke(1, Color.parseColor("#f43f5e"))
            }
            setPadding(18, 10, 18, 10)
            setOnClickListener {
                StockAlertManager.sendTestAlertNotification(this@MainActivity)
                Toast.makeText(this@MainActivity, "🚨 Alerta emitida con sonido y vibración en tu teléfono", Toast.LENGTH_SHORT).show()
            }
        }
        headerRow.addView(btnTestAlertNotification)

        // Botón Actualizar Cotizaciones
        btnRefreshAlerts = Button(this).apply {
            text = "🔄 Actualizar"
            textSize = 11f
            setTextColor(Color.parseColor("#38bdf8"))
            background = GradientDrawable().apply {
                cornerRadius = 14f
                setColor(Color.parseColor("#0c2340"))
                setStroke(1, Color.parseColor("#0284c7"))
            }
            setPadding(18, 10, 18, 10)
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
                    if (res != null) {
                        renderStockAlertsUI(res)
                        Toast.makeText(this@MainActivity, "Cotizaciones actualizadas", Toast.LENGTH_SHORT).show()
                    } else {
                        Toast.makeText(this@MainActivity, "Error consultando cotizaciones", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        }
        headerRow.addView(btnRefreshAlerts)
        sectionStockAlerts.addView(headerRow)

        val subDesc = TextView(this).apply {
            text = "Monitoreo en vivo cada 5 min. Tu teléfono te notificará con alarma sonora en cuanto una acción o ETF alcance tu precio de Take Profit o Stop Loss."
            textSize = 12f
            setTextColor(Color.parseColor("#94a3b8"))
            setPadding(0, 8, 0, 14)
        }
        sectionStockAlerts.addView(subDesc)

        // Fila de Métricas (Activas, Cerca, Disparadas)
        val metricsRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, 0, 0, 14)
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
            textSize = 11f
            setTextColor(Color.parseColor("#64748b"))
            setPadding(0, 0, 0, 14)
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
            text = "No tienes alertas de venta registradas.\nPuedes configurarlas desde la terminal Kpital en tus posiciones de bolsa y se sincronizarán aquí automáticamente."
            textSize = 13f
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
            setPadding(16, 10, 16, 10)
            val p = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                setMargins(4, 0, 4, 0)
            }
            layoutParams = p
            gravity = Gravity.CENTER
        }
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
        } else {
            emptyAlertsView.visibility = View.GONE
            for (alert in result.alerts) {
                val card = createAlertCardView(alert)
                alertsCardsContainer.addView(card)
            }
        }
    }

    private fun createAlertCardView(alert: EnrichedStockAlert): View {
        val isTakeProfit = (alert.alertType == "PROFIT_TARGET")
        val isTriggered = (alert.status == "TRIGGERED")
        val isNear = (alert.status == "NEAR")

        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(35, 30, 35, 30)
            background = GradientDrawable().apply {
                cornerRadius = 24f
                setColor(Color.parseColor("#0c111e"))
                val strokeColor = when {
                    isTriggered -> Color.parseColor("#10b981") // Verde esmeralda si se ejecutó
                    isNear -> Color.parseColor("#f59e0b") // Ámbar si está cerca
                    else -> Color.parseColor("#1e293b")
                }
                setStroke(if (isTriggered || isNear) 2 else 1, strokeColor)
            }
            val params = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                setMargins(0, 0, 0, 20)
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
            textSize = 14f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.parseColor("#00e5ff"))
            background = GradientDrawable().apply {
                cornerRadius = 12f
                setColor(Color.parseColor("#082f49"))
                setStroke(2, Color.parseColor("#00e5ff"))
            }
            setPadding(20, 6, 20, 6)
        }
        topRow.addView(tickerBadge)

        val companyView = TextView(this).apply {
            text = alert.companyName
            textSize = 14f
            setTextColor(Color.WHITE)
            setTypeface(null, Typeface.BOLD)
            setPadding(16, 0, 10, 0)
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        topRow.addView(companyView)

        val typePill = TextView(this).apply {
            val prefix = if (alert.targetValue >= 0) "+" else ""
            text = if (isTakeProfit) "🟢 $prefix${alert.targetValue}% TP" else "🔴 ${alert.targetValue}% SL"
            textSize = 11f
            setTypeface(null, Typeface.BOLD)
            setTextColor(if (isTakeProfit) Color.parseColor("#4ade80") else Color.parseColor("#f87171"))
            background = GradientDrawable().apply {
                cornerRadius = 10f
                setColor(if (isTakeProfit) Color.parseColor("#062e16") else Color.parseColor("#2a0f1d"))
                setStroke(1, if (isTakeProfit) Color.parseColor("#10b981") else Color.parseColor("#ef4444"))
            }
            setPadding(16, 6, 16, 6)
        }
        topRow.addView(typePill)
        card.addView(topRow)

        // Fila 2: Subtítulo / Lote y Estrategia
        val subText = alert.lotLabel ?: "Posición Consolidada"
        val subView = TextView(this).apply {
            text = "$subText • ${alert.scope.replaceFirstChar { it.uppercase() }}"
            textSize = 11f
            setTextColor(Color.parseColor("#64748b"))
            setPadding(0, 8, 0, 14)
        }
        card.addView(subView)

        // Fila 3: Grilla de Precios (Precio Actual vs Entrada vs Meta de Venta)
        val priceGrid = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(20, 16, 20, 16)
            background = GradientDrawable().apply {
                cornerRadius = 16f
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
        card.addView(priceGrid)

        // Fila 4: Retorno actual + Distancia restante + Estado
        val bottomRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, 14, 0, 0)
        }

        val retText = "${if (alert.currentReturnPct >= 0) "+" else ""}${String.format(Locale.US, "%.2f", alert.currentReturnPct)}%"
        val retView = TextView(this).apply {
            text = "Retorno: $retText"
            textSize = 13f
            setTypeface(null, Typeface.BOLD)
            setTextColor(if (alert.currentReturnPct >= 0) Color.parseColor("#4ade80") else Color.parseColor("#f87171"))
        }
        bottomRow.addView(retView)

        val distView = TextView(this).apply {
            text = if (isTriggered) {
                " • 🎯 ¡Alcanzado!"
            } else if (alert.distancePct <= 0) {
                " • 🎯 Cumplido"
            } else {
                " • Faltan ${String.format(Locale.US, "%.2f", alert.distancePct)}%"
            }
            textSize = 12f
            setTextColor(if (isTriggered || alert.distancePct <= 0) Color.parseColor("#10b981") else Color.parseColor("#94a3b8"))
            setPadding(10, 0, 10, 0)
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        bottomRow.addView(distView)

        val statusBadge = TextView(this).apply {
            val (stText, stColor, stBg) = when (alert.status) {
                "TRIGGERED" -> Triple("🚨 EJECUTADA", "#10b981", "#062e16")
                "NEAR" -> Triple("⚡ CERCA", "#f59e0b", "#2a1e04")
                "PAUSED" -> Triple("⚪ PAUSADA", "#64748b", "#1e293b")
                else -> Triple("🟢 ACTIVA", "#0284c7", "#0c2340")
            }
            text = stText
            textSize = 11f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.parseColor(stColor))
            background = GradientDrawable().apply {
                cornerRadius = 10f
                setColor(Color.parseColor(stBg))
                setStroke(1, Color.parseColor(stColor))
            }
            setPadding(18, 8, 18, 8)
        }
        bottomRow.addView(statusBadge)
        card.addView(bottomRow)

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
                textSize = 13f
                setTextColor(Color.parseColor(valueColor))
                setTypeface(null, Typeface.BOLD)
                gravity = Gravity.CENTER
                setPadding(0, 2, 0, 2)
            }
            addView(vView)

            val sView = TextView(this@MainActivity).apply {
                text = subtext
                textSize = 9f
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
