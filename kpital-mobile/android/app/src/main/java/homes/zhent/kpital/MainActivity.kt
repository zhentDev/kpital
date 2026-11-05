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
import java.util.*
import kotlin.concurrent.thread

class MainActivity : Activity() {

    private lateinit var prefs: SharedPreferences
    private lateinit var statusTextView: TextView
    private lateinit var overlayStatusTextView: TextView
    private lateinit var userSessionLayout: LinearLayout
    private lateinit var loginFormLayout: LinearLayout
    private lateinit var welcomeUserTextView: TextView

    // Contenedores del Historial de Movimientos
    private lateinit var historyContainer: LinearLayout
    private lateinit var filterContainer: LinearLayout
    private lateinit var emptyHistoryView: LinearLayout
    private var allFilterBtn: Button? = null
    private var pendingFilterBtn: Button? = null
    private var completedFilterBtn: Button? = null
    private var activeFilter: String = "ALL" // "ALL", "PENDING", "COMPLETED"

    private val dateFormat = SimpleDateFormat("d 'de' MMM, h:mm a", Locale("es", "CO"))

    override fun onCreate(savedInstanceState) {
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
            text = "\nTus gastos de Bancolombia, Nu y Rappi se vincularán directamente a tu cuenta y cajitas.\n"
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

        // --- SECCIÓN 3: BANDEJA E HISTORIAL DE MOVIMIENTOS CAPTURADOS ---
        buildHistorySection(rootLayout)

        // Escuchar cambios en segundo plano (notificaciones nuevas o asignaciones completadas)
        MovementHistoryManager.setOnHistoryChangeListener {
            runOnUiThread {
                refreshHistoryUI()
            }
        }

        setContentView(scroll)
        refreshHistoryUI()
    }

    override fun onResume() {
        super.onResume()
        updatePermissionStatus()
        refreshHistoryUI()
    }

    private fun createSeparator(): View {
        return View(this).apply {
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 2).apply {
                setMargins(0, 35, 0, 35)
            }
            setBackgroundColor(Color.parseColor("#1e293b"))
        }
    }

    private fun buildHistorySection(root: LinearLayout) {
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

        root.addView(historyHeader)

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
        root.addView(emptyHistoryView)

        // Contenedor dinámico de tarjetas de movimientos
        historyContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }
        root.addView(historyContainer)

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
        root.addView(cleanCompletedBtn)
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

        val randIdx = Random().nextInt(testBanks.size)
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
