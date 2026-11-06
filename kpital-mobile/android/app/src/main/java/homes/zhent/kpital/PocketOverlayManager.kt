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
 * Esto salta 100% garantizado en pantalla sobre cualquier app sin depender de que Android permita o no startActivity.
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

                // Contenedor semitransparente que cubre el fondo (click afuera para cerrar)
                val backdrop = FrameLayout(appContext).apply {
                    setBackgroundColor(Color.parseColor("#B3000000")) // Fondo oscuro translúcido 70%
                }

                // Tarjeta central flotante estilo diálogo
                val cardLayout = LinearLayout(appContext).apply {
                    orientation = LinearLayout.VERTICAL
                    setPadding(50, 45, 50, 45)
                    background = GradientDrawable().apply {
                        cornerRadius = 35f
                        setColor(Color.parseColor("#0e1526"))
                        setStroke(2, Color.parseColor("#1e293b"))
                    }
                }

                val cardParams = FrameLayout.LayoutParams(
                    (appContext.resources.displayMetrics.widthPixels * 0.90).toInt(),
                    FrameLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    gravity = Gravity.CENTER
                }
                backdrop.addView(cardLayout, cardParams)

                // 1. Título y banco
                val titleView = TextView(appContext).apply {
                    text = "💳 $desc"
                    textSize = 19f
                    setTextColor(Color.WHITE)
                    setTypeface(null, Typeface.BOLD)
                }
                cardLayout.addView(titleView)

                // 2. Monto (o Input si vino en 0)
                var amountInput: EditText? = null
                if (initialAmount > 0) {
                    val amountView = TextView(appContext).apply {
                        val formatted = String.format("%,.0f", initialAmount)
                        text = "$$formatted COP"
                        textSize = 24f
                        setTextColor(Color.parseColor("#00e5ff"))
                        setTypeface(null, Typeface.BOLD)
                        setPadding(0, 10, 0, 15)
                    }
                    cardLayout.addView(amountView)
                } else {
                    val manualLabel = TextView(appContext).apply {
                        text = "Ingresa el valor del movimiento:"
                        textSize = 13f
                        setTextColor(Color.parseColor("#94a3b8"))
                        setPadding(0, 10, 0, 8)
                    }
                    cardLayout.addView(manualLabel)

                    val input = EditText(appContext).apply {
                        hint = "Ej: 1000"
                        setHintTextColor(Color.parseColor("#475569"))
                        setTextColor(Color.WHITE)
                        textSize = 20f
                        inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
                        background = GradientDrawable().apply {
                            cornerRadius = 16f
                            setColor(Color.parseColor("#090d16"))
                            setStroke(2, Color.parseColor("#00e5ff"))
                        }
                        setPadding(30, 20, 30, 20)
                    }
                    amountInput = input
                    cardLayout.addView(input)
                }

                // 3. Subtítulo cajitas
                val subTitle = TextView(appContext).apply {
                    text = if (txType == "credit") {
                        "¿A qué cajita o cuenta entra este dinero en $bank?"
                    } else {
                        "¿De qué cajita o cuenta sale este dinero en $bank?"
                    }
                    textSize = 13f
                    setTextColor(Color.parseColor("#cbd5e1"))
                    setPadding(0, 15, 0, 15)
                }
                cardLayout.addView(subTitle)

                // 4. Contenedor de opciones
                val scroll = ScrollView(appContext).apply {
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        (appContext.resources.displayMetrics.heightPixels * 0.40).toInt()
                    )
                }
                val optionsLayout = LinearLayout(appContext).apply {
                    orientation = LinearLayout.VERTICAL
                }
                scroll.addView(optionsLayout)
                cardLayout.addView(scroll)

                val loadingView = TextView(appContext).apply {
                    text = "Cargando cajitas..."
                    textSize = 14f
                    setTextColor(Color.parseColor("#94a3b8"))
                    setPadding(0, 20, 0, 20)
                }
                optionsLayout.addView(loadingView)

                // 5. Botón descartar
                val dismissBtn = Button(appContext).apply {
                    text = "✕ Descartar"
                    textSize = 13f
                    setTextColor(Color.parseColor("#f87171"))
                    background = GradientDrawable().apply {
                        cornerRadius = 20f
                        setColor(Color.parseColor("#1e1b2e"))
                        setStroke(2, Color.parseColor("#ef4444"))
                    }
                    val btnParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                    ).apply {
                        setMargins(0, 15, 0, 0)
                    }
                    layoutParams = btnParams
                    setOnClickListener {
                        if (movementId != null) {
                            MovementHistoryManager.discardMovement(appContext, movementId)
                        }
                        dismiss()
                    }
                }
                cardLayout.addView(dismissBtn)

                // Añadir a WindowManager
                windowManager?.addView(backdrop, params)
                currentOverlayView = backdrop

                // Cargar cajitas en segundo plano
                thread {
                    try {
                        val pocketsJsonStr = Core.fetchMobilePockets(bank, txType)
                        val obj = JSONObject(pocketsJsonStr)
                        val pocketsArray = obj.optJSONArray("pockets")
                        val namesArray = obj.optJSONArray("pocket_names")

                        val displayOptions = mutableListOf<String>()
                        val internalNames = mutableListOf<String>()

                        if (pocketsArray != null && namesArray != null && pocketsArray.length() > 0) {
                            for (i in 0 until pocketsArray.length()) {
                                displayOptions.add(pocketsArray.getString(i))
                                internalNames.add(namesArray.getString(i))
                            }
                        } else {
                            displayOptions.add("⭐ Cuenta Principal")
                            internalNames.add("Principal")
                        }

                        mainHandler.post {
                            loadingView.visibility = View.GONE
                            renderOptions(
                                appContext = appContext,
                                container = optionsLayout,
                                bank = bank,
                                desc = desc,
                                txType = txType,
                                rawText = rawText,
                                movementId = movementId,
                                displayOptions = displayOptions,
                                internalNames = internalNames,
                                getFinalAmount = {
                                    if (initialAmount > 0) {
                                        initialAmount
                                    } else {
                                        MovementHistoryManager.parseAmount(amountInput?.text?.toString())
                                    }
                                }
                            )
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Error cargando cajitas: ${e.message}", e)
                        mainHandler.post {
                            loadingView.text = "Error: ${e.message}"
                        }
                    }
                }
            } catch (e: Throwable) {
                Log.e(TAG, "Fallo al mostrar overlay flotante: ${e.message}", e)
            }
        }
    }

    private fun renderOptions(
        appContext: Context,
        container: LinearLayout,
        bank: String,
        desc: String,
        txType: String,
        rawText: String,
        movementId: String?,
        displayOptions: List<String>,
        internalNames: List<String>,
        getFinalAmount: () -> Double
    ) {
        val mainHandler = Handler(Looper.getMainLooper())

        for (i in displayOptions.indices) {
            val label = displayOptions[i]
            val internalName = internalNames.getOrNull(i) ?: label

            val btn = Button(appContext).apply {
                text = label
                textSize = 14f
                isAllCaps = false
                gravity = Gravity.START or Gravity.CENTER_VERTICAL
                setPadding(35, 28, 35, 28)

                background = GradientDrawable().apply {
                    cornerRadius = 20f
                    if (label.startsWith("⭐")) {
                        setColor(Color.parseColor("#082f49"))
                        setStroke(2, Color.parseColor("#00e5ff"))
                    } else {
                        setColor(Color.parseColor("#111827"))
                        setStroke(2, Color.parseColor("#334155"))
                    }
                }
                setTextColor(Color.WHITE)

                val params = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    setMargins(0, 8, 0, 10)
                }
                layoutParams = params

                setOnClickListener {
                    val finalAmount = getFinalAmount()
                    if (finalAmount <= 0) {
                        Toast.makeText(appContext, "Por favor ingresa un monto válido", Toast.LENGTH_SHORT).show()
                        return@setOnClickListener
                    }

                    // Paso 2: Transición a Selección de Rubro Presupuestario
                    showOverlayRubroStep(
                        appContext = appContext,
                        container = container,
                        bank = bank,
                        selectedAccount = internalName,
                        desc = desc,
                        txType = txType,
                        finalAmount = finalAmount,
                        rawText = rawText,
                        movementId = movementId
                    )
                }
            }
            container.addView(btn)
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // PASO 2: ASIGNACIÓN DE RUBRO EN OVERLAY FLOTANTE (CON SCROLLVIEW Y 3 PILARES)
    // ─────────────────────────────────────────────────────────────────────────────

    private fun showOverlayRubroStep(
        appContext: Context,
        container: LinearLayout,
        bank: String,
        selectedAccount: String,
        desc: String,
        txType: String,
        finalAmount: Double,
        rawText: String,
        movementId: String?
    ) {
        val mainHandler = Handler(Looper.getMainLooper())
        container.removeAllViews()

        // 1. Cabecera Paso 2
        val titleView = TextView(appContext).apply {
            text = "🎯 ¿A qué rubro pertenece?"
            textSize = 17f
            setTextColor(Color.WHITE)
            setTypeface(null, Typeface.BOLD)
        }
        container.addView(titleView)

        // Resumen de cuenta y monto
        val summaryBadge = TextView(appContext).apply {
            val formatted = String.format(Locale.US, "%,.0f", finalAmount)
            text = "💳 $selectedAccount • $$formatted COP"
            textSize = 11f
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
                setMargins(0, 6, 0, 10)
            }
            layoutParams = p
        }
        container.addView(summaryBadge)

        // ScrollView contenedor con altura máxima proporcional
        val scrollMaxH = (appContext.resources.displayMetrics.heightPixels * 0.48).toInt()
        val scroll = ScrollView(appContext).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                scrollMaxH
            )
        }

        val rubrosLayout = LinearLayout(appContext).apply {
            orientation = LinearLayout.VERTICAL
        }
        scroll.addView(rubrosLayout)
        container.addView(scroll)

        val loadingRubros = TextView(appContext).apply {
            text = "Cargando rubros..."
            textSize = 12f
            setTextColor(Color.parseColor("#64748b"))
            setPadding(0, 10, 0, 10)
        }
        rubrosLayout.addView(loadingRubros)

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
                    layout = rubrosLayout,
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

        btnPillarNeeds.setOnClickListener {
            selectedPillar = "needs"
            btnPillarNeeds.background = GradientDrawable().apply { cornerRadius = 10f; setColor(Color.parseColor("#0284c7")) }
            btnPillarNeeds.setTextColor(Color.WHITE)
            btnPillarWants.background = GradientDrawable().apply { cornerRadius = 10f; setColor(Color.parseColor("#1e293b")) }
            btnPillarWants.setTextColor(Color.parseColor("#94a3b8"))
            btnPillarWealth.background = GradientDrawable().apply { cornerRadius = 10f; setColor(Color.parseColor("#1e293b")) }
            btnPillarWealth.setTextColor(Color.parseColor("#94a3b8"))
        }

        btnPillarWants.setOnClickListener {
            selectedPillar = "wants"
            btnPillarWants.background = GradientDrawable().apply { cornerRadius = 10f; setColor(Color.parseColor("#9333ea")) }
            btnPillarWants.setTextColor(Color.WHITE)
            btnPillarNeeds.background = GradientDrawable().apply { cornerRadius = 10f; setColor(Color.parseColor("#1e293b")) }
            btnPillarNeeds.setTextColor(Color.parseColor("#94a3b8"))
            btnPillarWealth.background = GradientDrawable().apply { cornerRadius = 10f; setColor(Color.parseColor("#1e293b")) }
            btnPillarWealth.setTextColor(Color.parseColor("#94a3b8"))
        }

        btnPillarWealth.setOnClickListener {
            selectedPillar = "wealth"
            btnPillarWealth.background = GradientDrawable().apply { cornerRadius = 10f; setColor(Color.parseColor("#059669")) }
            btnPillarWealth.setTextColor(Color.WHITE)
            btnPillarNeeds.background = GradientDrawable().apply { cornerRadius = 10f; setColor(Color.parseColor("#1e293b")) }
            btnPillarNeeds.setTextColor(Color.parseColor("#94a3b8"))
            btnPillarWants.background = GradientDrawable().apply { cornerRadius = 10f; setColor(Color.parseColor("#1e293b")) }
            btnPillarWants.setTextColor(Color.parseColor("#94a3b8"))
        }

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
