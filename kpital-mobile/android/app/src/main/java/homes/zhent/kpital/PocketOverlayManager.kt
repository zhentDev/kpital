package homes.zhent.kpital

import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.*
import core.Core
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale
import kotlin.concurrent.thread

/**
 * PocketOverlayManager:
 * Administra el diálogo flotante directo usando el WindowManager de Android (TYPE_APPLICATION_OVERLAY).
 * Estructurado con cabecera fija, scroll único central sin anidaciones conflictivas y pie de botones fijo
 * para garantizar que todos los rubros, botones y acciones sean 100% visibles y accesibles en cualquier pantalla.
 */
object PocketOverlayManager {

    private const val TAG = "PocketOverlay"
    private var currentOverlayView: View? = null
    private var windowManager: WindowManager? = null

    fun show(
        context: Context,
        bank: String,
        initialAmount: Double,
        desc: String,
        txType: String,
        rawText: String,
        movementId: String? = null
    ) {
        val appContext = context.applicationContext
        val mainHandler = Handler(Looper.getMainLooper())

        mainHandler.post {
            try {
                dismiss() // Cerrar anterior si hubiera

                windowManager = appContext.getSystemService(Context.WINDOW_SERVICE) as WindowManager

                val layoutType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                } else {
                    @Suppress("DEPRECATION")
                    WindowManager.LayoutParams.TYPE_PHONE
                }

                val params = WindowManager.LayoutParams(
                    WindowManager.LayoutParams.MATCH_PARENT,
                    WindowManager.LayoutParams.MATCH_PARENT,
                    layoutType,
                    WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                            WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH or
                            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                    PixelFormat.TRANSLUCENT
                ).apply {
                    gravity = Gravity.CENTER
                }

                val screenHeight = appContext.resources.displayMetrics.heightPixels
                val screenWidth = appContext.resources.displayMetrics.widthPixels
                val sanitizedInitial = MovementHistoryManager.sanitizeStoredAmount(initialAmount)

                // Contenedor semitransparente que cubre el fondo (click afuera para cerrar)
                val backdrop = FrameLayout(appContext).apply {
                    setBackgroundColor(Color.parseColor("#B3000000"))
                }

                // Tarjeta central flotante con tamaño acotado
                val cardLayout = LinearLayout(appContext).apply {
                    orientation = LinearLayout.VERTICAL
                    setPadding(40, 36, 40, 36)
                    background = GradientDrawable().apply {
                        cornerRadius = 32f
                        setColor(Color.parseColor("#0e1526"))
                        setStroke(2, Color.parseColor("#1e293b"))
                    }
                }

                val cardParams = FrameLayout.LayoutParams(
                    (screenWidth * 0.92).toInt(),
                    FrameLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    gravity = Gravity.CENTER
                }
                backdrop.addView(cardLayout, cardParams)

                // ─────────────────────────────────────────────────────────────
                // 1. CABECERA FIJA SUPERIOR
                // ─────────────────────────────────────────────────────────────
                val headerLayout = LinearLayout(appContext).apply {
                    orientation = LinearLayout.VERTICAL
                }
                cardLayout.addView(headerLayout)

                val titleView = TextView(appContext).apply {
                    text = "💳 $desc"
                    textSize = 18f
                    setTextColor(Color.WHITE)
                    setTypeface(null, Typeface.BOLD)
                }
                headerLayout.addView(titleView)

                val amountPrompt = TextView(appContext).apply {
                    text = "Valor a registrar ($ COP) - Puedes editarlo:"
                    textSize = 12f
                    setTextColor(Color.parseColor("#00e5ff"))
                    setTypeface(null, Typeface.BOLD)
                    setPadding(0, 10, 0, 4)
                }
                headerLayout.addView(amountPrompt)

                val amountInput = EditText(appContext).apply {
                    if (sanitizedInitial > 0) {
                        setText(String.format(Locale.US, "%.0f", sanitizedInitial))
                    } else {
                        hint = "Ej: 10000"
                    }
                    setHintTextColor(Color.parseColor("#475569"))
                    setTextColor(Color.WHITE)
                    textSize = 20f
                    setTypeface(null, Typeface.BOLD)
                    inputType = InputType.TYPE_CLASS_NUMBER
                    background = GradientDrawable().apply {
                        cornerRadius = 14f
                        setColor(Color.parseColor("#090d16"))
                        setStroke(2, Color.parseColor("#00e5ff"))
                    }
                    setPadding(26, 16, 26, 16)
                }
                headerLayout.addView(amountInput)

                // Badge de resumen que se muestra en el Paso 2
                val summaryBadge = TextView(appContext).apply {
                    textSize = 12f
                    setTypeface(null, Typeface.BOLD)
                    setTextColor(Color.parseColor("#38bdf8"))
                    background = GradientDrawable().apply {
                        cornerRadius = 10f
                        setColor(Color.parseColor("#082f49"))
                        setStroke(1, Color.parseColor("#0284c7"))
                    }
                    setPadding(14, 6, 14, 6)
                    val p = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.WRAP_CONTENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                    ).apply {
                        setMargins(0, 8, 0, 6)
                    }
                    layoutParams = p
                    visibility = View.GONE
                }
                headerLayout.addView(summaryBadge)

                val subTitleView = TextView(appContext).apply {
                    text = if (txType == "credit") {
                        "¿A qué cajita o cuenta entra este dinero en $bank?"
                    } else {
                        "¿De qué cajita o cuenta sale este dinero en $bank?"
                    }
                    textSize = 12f
                    setTextColor(Color.parseColor("#cbd5e1"))
                    setPadding(0, 10, 0, 10)
                }
                headerLayout.addView(subTitleView)

                // ─────────────────────────────────────────────────────────────
                // 2. CUERPO CON SCROLLVIEW ÚNICO (Sin ScrollViews anidados)
                // ─────────────────────────────────────────────────────────────
                val scrollMaxHeight = (screenHeight * 0.44).toInt()
                val bodyScroll = ScrollView(appContext).apply {
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        scrollMaxHeight
                    )
                }
                val bodyContentLayout = LinearLayout(appContext).apply {
                    orientation = LinearLayout.VERTICAL
                }
                bodyScroll.addView(bodyContentLayout)
                cardLayout.addView(bodyScroll)

                // ─────────────────────────────────────────────────────────────
                // 3. PIE DE BOTONES FIJO INFERIOR (Nunca se oculta ni sale de pantalla)
                // ─────────────────────────────────────────────────────────────
                val footerLayout = LinearLayout(appContext).apply {
                    orientation = LinearLayout.HORIZONTAL
                    gravity = Gravity.END or Gravity.CENTER_VERTICAL
                    setPadding(0, 14, 0, 0)
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                    )
                }
                cardLayout.addView(footerLayout)

                val backBtn = Button(appContext).apply {
                    text = "↩️ Volver"
                    textSize = 12f
                    isAllCaps = false
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
                        setMargins(0, 0, 10, 0)
                    }
                    layoutParams = p
                    visibility = View.GONE
                }
                footerLayout.addView(backBtn)

                val dismissBtn = Button(appContext).apply {
                    text = "✕ Descartar"
                    textSize = 12f
                    isAllCaps = false
                    setTextColor(Color.parseColor("#f87171"))
                    background = GradientDrawable().apply {
                        cornerRadius = 14f
                        setColor(Color.parseColor("#1e1b2e"))
                        setStroke(1, Color.parseColor("#ef4444"))
                    }
                    setPadding(20, 10, 20, 10)
                    setOnClickListener {
                        if (movementId != null) {
                            MovementHistoryManager.discardMovement(appContext, movementId)
                        }
                        dismiss()
                    }
                }
                footerLayout.addView(dismissBtn)

                // Cache de opciones para volver atrás
                var cachedDisplayOptions = listOf<String>()
                var cachedInternalNames = listOf<String>()

                // Función para mostrar el Paso 1 (Selección de Cuentas / Cajitas)
                fun showStep1() {
                    titleView.text = "💳 $desc"
                    amountPrompt.visibility = View.VISIBLE
                    amountInput.visibility = View.VISIBLE
                    summaryBadge.visibility = View.GONE
                    subTitleView.text = if (txType == "credit") {
                        "¿A qué cajita o cuenta entra este dinero en $bank?"
                    } else {
                        "¿De qué cajita o cuenta sale este dinero en $bank?"
                    }
                    backBtn.visibility = View.GONE

                    bodyContentLayout.removeAllViews()

                    if (cachedDisplayOptions.isEmpty()) {
                        val loadingView = TextView(appContext).apply {
                            text = "Cargando cajitas y cuentas..."
                            textSize = 13f
                            setTextColor(Color.parseColor("#94a3b8"))
                            setPadding(0, 20, 0, 20)
                        }
                        bodyContentLayout.addView(loadingView)

                        thread {
                            try {
                                val pocketsJsonStr = Core.fetchMobilePockets(bank, txType)
                                val obj = JSONObject(pocketsJsonStr)
                                val pocketsArray = obj.optJSONArray("pockets")
                                val namesArray = obj.optJSONArray("pocket_names")

                                val displayOpts = mutableListOf<String>()
                                val internalNms = mutableListOf<String>()

                                if (pocketsArray != null && namesArray != null && pocketsArray.length() > 0) {
                                    for (i in 0 until pocketsArray.length()) {
                                        displayOpts.add(pocketsArray.getString(i))
                                        internalNms.add(namesArray.getString(i))
                                    }
                                } else {
                                    displayOpts.add("⭐ Cuenta Principal")
                                    internalNms.add("Principal")
                                }

                                cachedDisplayOptions = displayOpts
                                cachedInternalNames = internalNms

                                mainHandler.post {
                                    showStep1()
                                }
                            } catch (e: Exception) {
                                Log.e(TAG, "Error cargando cajitas: ${e.message}", e)
                                mainHandler.post {
                                    loadingView.text = "Error: ${e.message}"
                                }
                            }
                        }
                    } else {
                        for (i in cachedDisplayOptions.indices) {
                            val label = cachedDisplayOptions[i]
                            val internalName = cachedInternalNames.getOrNull(i) ?: label

                            val btn = Button(appContext).apply {
                                text = label
                                textSize = 13f
                                isAllCaps = false
                                gravity = Gravity.START or Gravity.CENTER_VERTICAL
                                setPadding(30, 22, 30, 22)

                                background = GradientDrawable().apply {
                                    cornerRadius = 16f
                                    if (label.startsWith("⭐")) {
                                        setColor(Color.parseColor("#082f49"))
                                        setStroke(2, Color.parseColor("#00e5ff"))
                                    } else {
                                        setColor(Color.parseColor("#111827"))
                                        setStroke(1, Color.parseColor("#334155"))
                                    }
                                }
                                setTextColor(Color.WHITE)

                                val p = LinearLayout.LayoutParams(
                                    LinearLayout.LayoutParams.MATCH_PARENT,
                                    LinearLayout.LayoutParams.WRAP_CONTENT
                                ).apply {
                                    setMargins(0, 6, 0, 6)
                                }
                                layoutParams = p

                                setOnClickListener {
                                    val entered = amountInput.text.toString().trim()
                                    val parsed = MovementHistoryManager.parseAmount(entered)
                                    val finalAmount = if (parsed > 0) parsed else sanitizedInitial

                                    if (finalAmount <= 0) {
                                        Toast.makeText(appContext, "Por favor ingresa un monto válido", Toast.LENGTH_SHORT).show()
                                        return@setOnClickListener
                                    }

                                    // Avanzar al Paso 2
                                    showOverlayRubroStep(
                                        appContext = appContext,
                                        titleView = titleView,
                                        amountPrompt = amountPrompt,
                                        amountInput = amountInput,
                                        summaryBadge = summaryBadge,
                                        subTitleView = subTitleView,
                                        bodyContentLayout = bodyContentLayout,
                                        backBtn = backBtn,
                                        bank = bank,
                                        selectedAccount = internalName,
                                        desc = desc,
                                        txType = txType,
                                        finalAmount = finalAmount,
                                        rawText = rawText,
                                        movementId = movementId,
                                        onBackRequested = { showStep1() }
                                    )
                                }
                            }
                            bodyContentLayout.addView(btn)
                        }
                    }
                }

                // Iniciar en el Paso 1
                showStep1()

                // Añadir a WindowManager
                windowManager?.addView(backdrop, params)
                currentOverlayView = backdrop

            } catch (e: Throwable) {
                Log.e(TAG, "Fallo al mostrar overlay flotante: ${e.message}", e)
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // PASO 2: ASIGNACIÓN DE RUBRO EN OVERLAY FLOTANTE (SIN SCROLLVIEWS ANIDADOS)
    // ─────────────────────────────────────────────────────────────────────────────

    private fun showOverlayRubroStep(
        appContext: Context,
        titleView: TextView,
        amountPrompt: TextView,
        amountInput: EditText,
        summaryBadge: TextView,
        subTitleView: TextView,
        bodyContentLayout: LinearLayout,
        backBtn: Button,
        bank: String,
        selectedAccount: String,
        desc: String,
        txType: String,
        finalAmount: Double,
        rawText: String,
        movementId: String?,
        onBackRequested: () -> Unit
    ) {
        val mainHandler = Handler(Looper.getMainLooper())

        // Actualizar cabecera fija
        titleView.text = "🎯 ¿A qué rubro pertenece?"
        amountPrompt.visibility = View.GONE
        amountInput.visibility = View.GONE
        val formatted = String.format(Locale.US, "%,.0f", finalAmount)
        summaryBadge.text = "💳 $selectedAccount • $$formatted COP"
        summaryBadge.visibility = View.VISIBLE
        subTitleView.text = "Selecciona el rubro presupuestario de Kpital:"

        // Activar botón volver en el pie fijo
        backBtn.visibility = View.VISIBLE
        backBtn.setOnClickListener {
            onBackRequested()
        }

        // Limpiar cuerpo y mostrar loader
        bodyContentLayout.removeAllViews()

        val loadingRubros = TextView(appContext).apply {
            text = "Cargando rubros presupuestarios..."
            textSize = 12f
            setTextColor(Color.parseColor("#94a3b8"))
            setPadding(0, 16, 0, 16)
        }
        bodyContentLayout.addView(loadingRubros)

        thread {
            var wealthList = mutableListOf<Triple<String, String, String>>()
            var needsList = mutableListOf<Triple<String, String, String>>()
            var wantsList = mutableListOf<Triple<String, String, String>>()

            try {
                val respStr = Core.fetchMobileBudgetItems()
                val json = JSONObject(respStr)
                if (json.optBoolean("success", false)) {
                    val wArr = json.optJSONArray("wealth") ?: JSONArray()
                    for (i in 0 until wArr.length()) {
                        val o = wArr.getJSONObject(i)
                        wealthList.add(Triple(o.optString("id"), o.optString("name"), o.optString("icon", "🛡️")))
                    }
                    val nArr = json.optJSONArray("needs") ?: JSONArray()
                    for (i in 0 until nArr.length()) {
                        val o = nArr.getJSONObject(i)
                        needsList.add(Triple(o.optString("id"), o.optString("name"), o.optString("icon", "💡")))
                    }
                    val waArr = json.optJSONArray("wants") ?: JSONArray()
                    for (i in 0 until waArr.length()) {
                        val o = waArr.getJSONObject(i)
                        wantsList.add(Triple(o.optString("id"), o.optString("name"), o.optString("icon", "🍷")))
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Error fetching rubros in overlay: ${e.message}")
            }

            if (wealthList.isEmpty() && needsList.isEmpty() && wantsList.isEmpty()) {
                wealthList = mutableListOf(
                    Triple("wealth_emergency", "Fondo de Emergencia", "🛡️"),
                    Triple("wealth_savings", "Ahorro Alto Rendimiento", "🏛️"),
                    Triple("wealth_impresora", "Meta Impresora 3D", "🖨️"),
                    Triple("wealth_portfolio", "Portafolio Renta Fija", "🚀"),
                    Triple("wealth_viaje", "Meta Viaje / Europa", "✈️")
                )
                needsList = mutableListOf(
                    Triple("need_utilities", "Servicios Públicos, Luz & Internet", "💡"),
                    Triple("need_groceries", "Alimentación & Supermercado", "🛒"),
                    Triple("need_health", "Salud, EPS & Tratamientos", "🎯"),
                    Triple("need_rent", "Arriendo / Vivienda", "🏠"),
                    Triple("need_debts", "Pago Tarjeta / Deuda", "💳")
                )
                wantsList = mutableListOf(
                    Triple("want_restaurants", "Restaurantes, Salidas & Domicilios", "🍷"),
                    Triple("want_shopping", "Compras & Ropa", "🛍️"),
                    Triple("want_leisure", "Ocio & Entretenimiento", "🎮"),
                    Triple("want_transport", "Transporte & Gasolina", "🚗")
                )
            }

            mainHandler.post {
                loadingRubros.visibility = View.GONE
                renderOverlayRubroButtons(
                    appContext = appContext,
                    layout = bodyContentLayout,
                    wealthList = wealthList,
                    needsList = needsList,
                    wantsList = wantsList,
                    onRubroSelected = { rId, rName, rPillar ->
                        submitFinalOverlayTransaction(
                            appContext = appContext,
                            bank = bank,
                            account = selectedAccount,
                            desc = desc,
                            txType = txType,
                            finalAmount = finalAmount,
                            rawText = rawText,
                            budgetItemId = rId,
                            budgetItemName = rName,
                            budgetItemType = rPillar,
                            movementId = movementId
                        )
                    }
                )
            }
        }
    }

    private fun renderOverlayRubroButtons(
        appContext: Context,
        layout: LinearLayout,
        wealthList: List<Triple<String, String, String>>,
        needsList: List<Triple<String, String, String>>,
        wantsList: List<Triple<String, String, String>>,
        onRubroSelected: (String, String, String) -> Unit
    ) {
        // ── 1. PATRIMONIO (VERDES) ──
        if (wealthList.isNotEmpty()) {
            addOverlayPillarTag(appContext, layout, "🟢 Patrimonio & Ahorro", "#10b981", "#052e16")
            for (w in wealthList) {
                addOverlayRubroButton(appContext, layout, w.second, w.third, "#10b981") {
                    onRubroSelected(w.first, w.second, "wealth")
                }
            }
        }

        // ── 2. NECESIDADES (AZULES) ──
        if (needsList.isNotEmpty()) {
            addOverlayPillarTag(appContext, layout, "🔵 Necesidades Básicas (Needs)", "#0ea5e9", "#082f49")
            for (n in needsList) {
                addOverlayRubroButton(appContext, layout, n.second, n.third, "#0ea5e9") {
                    onRubroSelected(n.first, n.second, "needs")
                }
            }
        }

        // ── 3. DESEOS (PÚRPURAS) ──
        if (wantsList.isNotEmpty()) {
            addOverlayPillarTag(appContext, layout, "🟣 Estilo de Vida (Wants)", "#c084fc", "#2e1065")
            for (wa in wantsList) {
                addOverlayRubroButton(appContext, layout, wa.second, wa.third, "#c084fc") {
                    onRubroSelected(wa.first, wa.second, "wants")
                }
            }
        }

        // Separador
        val sep = View(appContext).apply {
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 1).apply {
                setMargins(0, 16, 0, 12)
            }
            setBackgroundColor(Color.parseColor("#1e293b"))
        }
        layout.addView(sep)

        // Contenedor de Formulario Inline para Crear Nuevo Rubro
        val inlineForm = LinearLayout(appContext).apply {
            orientation = LinearLayout.VERTICAL
            visibility = View.GONE
            setPadding(16, 12, 16, 12)
            background = GradientDrawable().apply {
                cornerRadius = 14f
                setColor(Color.parseColor("#0e1526"))
                setStroke(1, Color.parseColor("#38bdf8"))
            }
            val p = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                setMargins(0, 4, 0, 10)
            }
            layoutParams = p
        }

        val inputCustom = EditText(appContext).apply {
            hint = "Nombre del nuevo rubro..."
            setHintTextColor(Color.parseColor("#64748b"))
            setTextColor(Color.WHITE)
            textSize = 13f
            setBackgroundColor(Color.parseColor("#111827"))
            setPadding(20, 14, 20, 14)
        }
        inlineForm.addView(inputCustom)

        // Selector de tipo de pilar inline
        val pillarSelectorLayout = LinearLayout(appContext).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, 10, 0, 10)
        }
        var selectedPillar = "needs"

        val btnPillarNeeds = Button(appContext).apply {
            text = "🔵 Necesidad"
            textSize = 10f
            isAllCaps = false
            setTextColor(Color.WHITE)
            background = GradientDrawable().apply {
                cornerRadius = 10f
                setColor(Color.parseColor("#0284c7"))
            }
            val p = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                setMargins(2, 0, 2, 0)
            }
            layoutParams = p
        }

        val btnPillarWants = Button(appContext).apply {
            text = "🟣 Deseo"
            textSize = 10f
            isAllCaps = false
            setTextColor(Color.parseColor("#94a3b8"))
            background = GradientDrawable().apply {
                cornerRadius = 10f
                setColor(Color.parseColor("#1e293b"))
            }
            val p = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                setMargins(2, 0, 2, 0)
            }
            layoutParams = p
        }

        val btnPillarWealth = Button(appContext).apply {
            text = "🟢 Ahorro"
            textSize = 10f
            isAllCaps = false
            setTextColor(Color.parseColor("#94a3b8"))
            background = GradientDrawable().apply {
                cornerRadius = 10f
                setColor(Color.parseColor("#1e293b"))
            }
            val p = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                setMargins(2, 0, 2, 0)
            }
            layoutParams = p
        }

        fun updatePillarSelection(active: String) {
            selectedPillar = active
            btnPillarNeeds.apply {
                setTextColor(if (active == "needs") Color.WHITE else Color.parseColor("#94a3b8"))
                (background as? GradientDrawable)?.setColor(if (active == "needs") Color.parseColor("#0284c7") else Color.parseColor("#1e293b"))
            }
            btnPillarWants.apply {
                setTextColor(if (active == "wants") Color.WHITE else Color.parseColor("#94a3b8"))
                (background as? GradientDrawable)?.setColor(if (active == "wants") Color.parseColor("#9333ea") else Color.parseColor("#1e293b"))
            }
            btnPillarWealth.apply {
                setTextColor(if (active == "wealth") Color.WHITE else Color.parseColor("#94a3b8"))
                (background as? GradientDrawable)?.setColor(if (active == "wealth") Color.parseColor("#10b981") else Color.parseColor("#1e293b"))
            }
        }

        btnPillarNeeds.setOnClickListener { updatePillarSelection("needs") }
        btnPillarWants.setOnClickListener { updatePillarSelection("wants") }
        btnPillarWealth.setOnClickListener { updatePillarSelection("wealth") }

        pillarSelectorLayout.addView(btnPillarNeeds)
        pillarSelectorLayout.addView(btnPillarWants)
        pillarSelectorLayout.addView(btnPillarWealth)
        inlineForm.addView(pillarSelectorLayout)

        val btnConfirmCustom = Button(appContext).apply {
            text = "Guardar y Asignar Rubro"
            textSize = 12f
            isAllCaps = false
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.BLACK)
            background = GradientDrawable().apply {
                cornerRadius = 10f
                setColor(Color.parseColor("#00e5ff"))
            }
            setPadding(16, 12, 16, 12)
            setOnClickListener {
                val txt = inputCustom.text.toString().trim()
                if (txt.isNotBlank()) {
                    onRubroSelected("custom_${System.currentTimeMillis()}", txt, selectedPillar)
                } else {
                    Toast.makeText(appContext, "Escribe un nombre", Toast.LENGTH_SHORT).show()
                }
            }
        }
        inlineForm.addView(btnConfirmCustom)
        layout.addView(inlineForm)

        // Botón Toggle para mostrar formulario inline
        val addCustomBtn = Button(appContext).apply {
            text = "➕ Crear Nuevo Rubro..."
            textSize = 12f
            isAllCaps = false
            setTextColor(Color.WHITE)
            setTypeface(null, Typeface.BOLD)
            background = GradientDrawable().apply {
                cornerRadius = 14f
                setColor(Color.parseColor("#1e293b"))
                setStroke(1, Color.parseColor("#00e5ff"))
            }
            setPadding(24, 18, 24, 18)
            val p = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                setMargins(0, 4, 0, 10)
            }
            layoutParams = p
            setOnClickListener {
                inlineForm.visibility = if (inlineForm.visibility == View.VISIBLE) View.GONE else View.VISIBLE
            }
        }
        layout.addView(addCustomBtn)

        // Botón Omitir Rubro
        val skipBtn = Button(appContext).apply {
            text = "⚡ Omitir Rubro (Asignar más tarde)"
            textSize = 11f
            isAllCaps = false
            setTextColor(Color.parseColor("#94a3b8"))
            background = GradientDrawable().apply {
                cornerRadius = 12f
                setColor(Color.parseColor("#090d16"))
                setStroke(1, Color.parseColor("#1e293b"))
            }
            setPadding(20, 14, 20, 14)
            val p = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                setMargins(0, 2, 0, 8)
            }
            layoutParams = p
            setOnClickListener {
                onRubroSelected("", "", "")
            }
        }
        layout.addView(skipBtn)
    }

    private fun addOverlayPillarTag(context: Context, layout: LinearLayout, title: String, textColor: String, bgColor: String) {
        val h = TextView(context).apply {
            text = title
            textSize = 11f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.parseColor(textColor))
            background = GradientDrawable().apply {
                cornerRadius = 8f
                setColor(Color.parseColor(bgColor))
                setStroke(1, Color.parseColor(textColor))
            }
            setPadding(14, 4, 14, 4)
            val p = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                setMargins(0, 12, 0, 6)
            }
            layoutParams = p
        }
        layout.addView(h)
    }

    private fun addOverlayRubroButton(
        context: Context,
        layout: LinearLayout,
        name: String,
        icon: String,
        accentColor: String,
        onClick: () -> Unit
    ) {
        val btn = Button(context).apply {
            text = "$icon $name"
            textSize = 12f
            isAllCaps = false
            gravity = Gravity.START or Gravity.CENTER_VERTICAL
            setTextColor(Color.WHITE)
            background = GradientDrawable().apply {
                cornerRadius = 14f
                setColor(Color.parseColor("#0c111e"))
                setStroke(1, Color.parseColor(accentColor))
            }
            setPadding(24, 18, 24, 18)
            val p = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                setMargins(0, 4, 0, 4)
            }
            layoutParams = p
            setOnClickListener {
                isEnabled = false
                onClick()
            }
        }
        layout.addView(btn)
    }

    private fun submitFinalOverlayTransaction(
        appContext: Context,
        bank: String,
        account: String,
        desc: String,
        txType: String,
        finalAmount: Double,
        rawText: String,
        budgetItemId: String,
        budgetItemName: String,
        budgetItemType: String,
        movementId: String?
    ) {
        val mainHandler = Handler(Looper.getMainLooper())
        Toast.makeText(appContext, "Registrando...", Toast.LENGTH_SHORT).show()

        thread {
            try {
                val respStr = Core.sendTransactionWithRubroToBackend(
                    bank,
                    account,
                    desc,
                    txType,
                    finalAmount,
                    rawText,
                    budgetItemId,
                    budgetItemName,
                    budgetItemType
                )
                val result = JSONObject(respStr)
                val success = result.optBoolean("success", false)
                val msg = result.optString("message", "Movimiento registrado con éxito")

                mainHandler.post {
                    if (success) {
                        if (movementId != null) {
                            val pocketDisplay = if (budgetItemName.isNotBlank()) "$account ➔ $budgetItemName" else account
                            MovementHistoryManager.updateMovementStatus(
                                context = appContext,
                                id = movementId,
                                newStatus = MovementHistoryManager.STATUS_COMPLETED,
                                pocketName = pocketDisplay,
                                newAmount = finalAmount
                            )
                        }
                        val finalMsg = if (budgetItemName.isNotBlank()) "✅ Asignado a $budgetItemName ($account)" else "✅ $msg"
                        Toast.makeText(appContext, finalMsg, Toast.LENGTH_LONG).show()
                    } else {
                        Toast.makeText(appContext, "⚠️ $msg", Toast.LENGTH_LONG).show()
                    }
                    dismiss()
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error enviando tx rubro: ${e.message}", e)
                mainHandler.post {
                    Toast.makeText(appContext, "Error al sincronizar: ${e.message}", Toast.LENGTH_SHORT).show()
                    dismiss()
                }
            }
        }
    }

    fun dismiss() {
        try {
            if (currentOverlayView != null && windowManager != null) {
                windowManager?.removeView(currentOverlayView)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Error removiendo overlay: ${e.message}")
        } finally {
            currentOverlayView = null
        }
    }
}
