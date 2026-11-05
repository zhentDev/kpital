package homes.zhent.kpital

import android.app.Activity
import android.app.AlertDialog
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.text.InputType
import android.util.Log
import android.view.Gravity
import android.view.View
import android.widget.*
import core.Core
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale
import kotlin.concurrent.thread

/**
 * PocketSelectorActivity:
 * Interfaz interactiva nativa para seleccionar la cajita o cuenta bancaria.
 * Si el monto no vino en la notificación push (ej. Nequi), muestra un campo editable
 * para que el usuario escriba o ajuste el valor en 1 segundo antes de elegir la cajita.
 */
class PocketSelectorActivity : Activity() {

    companion object {
        const val EXTRA_BANK = "extra_bank"
        const val EXTRA_AMOUNT = "extra_amount"
        const val EXTRA_DESC = "extra_desc"
        const val EXTRA_TX_TYPE = "extra_tx_type"
        const val EXTRA_RAW_TEXT = "extra_raw_text"
        const val EXTRA_MOVEMENT_ID = "extra_movement_id"
    }

    private var currentAmount: Double = 0.0
    private var movementId: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Asegurar que la pantalla se encienda y se muestre incluso sobre el bloqueo
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                android.view.WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
                android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            )
        }

        val bank = intent.getStringExtra(EXTRA_BANK) ?: "Banco"
        currentAmount = intent.getDoubleExtra(EXTRA_AMOUNT, 0.0)
        val desc = intent.getStringExtra(EXTRA_DESC) ?: "Movimiento"
        val txType = intent.getStringExtra(EXTRA_TX_TYPE) ?: "debit"
        val rawText = intent.getStringExtra(EXTRA_RAW_TEXT) ?: ""
        movementId = intent.getStringExtra(EXTRA_MOVEMENT_ID)

        val scroll = ScrollView(this).apply {
            setBackgroundColor(Color.parseColor("#090d16"))
        }

        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(40, 50, 40, 50)
        }
        scroll.addView(container)

        // Encabezado
        val titleView = TextView(this).apply {
            text = "💳 $desc"
            textSize = 20f
            setTextColor(Color.WHITE)
            setTypeface(null, Typeface.BOLD)
        }
        container.addView(titleView)

        // Si el monto ya venía en la push (> 0), mostrarlo grande.
        // Si no venía (== 0), mostrar un campo de texto para que el usuario lo ingrese.
        lateinit var amountInput: EditText

        if (currentAmount > 0) {
            val amountView = TextView(this).apply {
                val formatted = String.format("%,.0f", currentAmount)
                text = "$$formatted COP"
                textSize = 24f
                setTextColor(Color.parseColor("#00e5ff"))
                setTypeface(null, Typeface.BOLD)
                setPadding(0, 10, 0, 10)
            }
            container.addView(amountView)
        } else {
            val amountPrompt = TextView(this).apply {
                text = "Ingresa el valor del movimiento:"
                textSize = 14f
                setTextColor(Color.parseColor("#00e5ff"))
                setTypeface(null, Typeface.BOLD)
                setPadding(0, 15, 0, 5)
            }
            container.addView(amountPrompt)

            amountInput = EditText(this).apply {
                hint = "Ej: 1000"
                setHintTextColor(Color.parseColor("#64748b"))
                setTextColor(Color.WHITE)
                textSize = 22f
                setTypeface(null, Typeface.BOLD)
                inputType = InputType.TYPE_CLASS_NUMBER
                setBackgroundColor(Color.parseColor("#0f172a"))
                setPadding(30, 20, 30, 20)
            }
            container.addView(amountInput)
        }

        val promptView = TextView(this).apply {
            text = "¿De qué cajita o cuenta sale este dinero en $bank?"
            textSize = 14f
            setTextColor(Color.parseColor("#94a3b8"))
            setPadding(0, 15, 0, 25)
        }
        container.addView(promptView)

        val loadingView = TextView(this).apply {
            text = "Cargando tus cajitas y cuentas..."
            textSize = 14f
            setTextColor(Color.parseColor("#64748b"))
        }
        container.addView(loadingView)

        val optionsLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }
        container.addView(optionsLayout)

        setContentView(scroll)

        // Cargar cajitas vía Go Core en hilo secundario
        thread {
            try {
                val pocketsJsonStr = Core.fetchMobilePockets(bank, txType)
                Log.d("PocketSelector", "Respuesta Go Core: $pocketsJsonStr")
                val json = JSONObject(pocketsJsonStr)
                val pocketsArray = json.optJSONArray("pockets")
                val namesArray = json.optJSONArray("pocket_names")

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

                runOnUiThread {
                    loadingView.visibility = View.GONE
                    populateOptionButtons(
                        container = optionsLayout,
                        bank = bank,
                        desc = desc,
                        txType = txType,
                        rawText = rawText,
                        displayOptions = displayOptions,
                        internalNames = internalNames,
                        getFinalAmount = {
                            if (currentAmount > 0) {
                                currentAmount
                            } else {
                                val entered = amountInput.text.toString().trim()
                                entered.toDoubleOrNull() ?: 0.0
                            }
                        }
                    )
                }
            } catch (e: Exception) {
                Log.e("PocketSelector", "Error: ${e.message}", e)
                runOnUiThread {
                    loadingView.text = "Error obteniendo cajitas: ${e.message}"
                }
            }
        }
    }

    private fun populateOptionButtons(
        container: LinearLayout,
        bank: String,
        desc: String,
        txType: String,
        rawText: String,
        displayOptions: List<String>,
        internalNames: List<String>,
        getFinalAmount: () -> Double
    ) {
        for (i in displayOptions.indices) {
            val label = displayOptions[i]
            val internalName = internalNames.getOrNull(i) ?: label
            val isCancel = internalName.contains("Cancelar", ignoreCase = true) || internalName.contains("Ignorar", ignoreCase = true)

            val btn = Button(this).apply {
                text = label
                textSize = 14f
                isAllCaps = false
                gravity = Gravity.START or Gravity.CENTER_VERTICAL
                setPadding(35, 30, 35, 30)

                val bg = GradientDrawable().apply {
                    cornerRadius = 20f
                    if (isCancel) {
                        setColor(Color.parseColor("#1e1b2e"))
                        setStroke(2, Color.parseColor("#ef4444"))
                    } else if (label.startsWith("⭐")) {
                        setColor(Color.parseColor("#082f49"))
                        setStroke(2, Color.parseColor("#00e5ff"))
                    } else {
                        setColor(Color.parseColor("#0f172a"))
                        setStroke(2, Color.parseColor("#334155"))
                    }
                }
                background = bg

                setTextColor(if (isCancel) Color.parseColor("#f87171") else Color.WHITE)

                val params = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    setMargins(0, 10, 0, 15)
                }
                layoutParams = params

                setOnClickListener {
                    if (isCancel) {
                        movementId?.let { id ->
                            MovementHistoryManager.discardMovement(this@PocketSelectorActivity, id)
                        }
                        Toast.makeText(this@PocketSelectorActivity, "Gasto descartado", Toast.LENGTH_SHORT).show()
                        finish()
                        return@setOnClickListener
                    }

                    val finalAmount = getFinalAmount()
                    if (finalAmount <= 0) {
                        Toast.makeText(this@PocketSelectorActivity, "Por favor ingresa un monto válido", Toast.LENGTH_SHORT).show()
                        return@setOnClickListener
                    }

                    // Paso 2: Transición inmediata a Selección de Rubro Presupuestario
                    showRubroSelectionStep(
                        container = container,
                        bank = bank,
                        selectedAccount = internalName,
                        desc = desc,
                        txType = txType,
                        finalAmount = finalAmount,
                        rawText = rawText
                    )
                }
            }
            container.addView(btn)
        }

        // Botón fijo inferior de cerrar
        val closeBtn = Button(this).apply {
            text = "✕ Cerrar sin registrar"
            textSize = 12f
            setTextColor(Color.parseColor("#64748b"))
            setBackgroundColor(Color.TRANSPARENT)
            setOnClickListener { finish() }
            val params = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                setMargins(0, 20, 0, 10)
            }
            layoutParams = params
        }
        container.addView(closeBtn)
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // PASO 2: ASIGNACIÓN DE RUBRO PRESUPUESTARIO CON HERENCIA DE LOS 3 PILARES
    // ─────────────────────────────────────────────────────────────────────────────

    private fun showRubroSelectionStep(
        container: LinearLayout,
        bank: String,
        selectedAccount: String,
        desc: String,
        txType: String,
        finalAmount: Double,
        rawText: String
    ) {
        container.removeAllViews()

        // 1. Cabecera Paso 2
        val titleView = TextView(this).apply {
            text = "🎯 ¿A qué rubro pertenece?"
            textSize = 20f
            setTextColor(Color.WHITE)
            setTypeface(null, Typeface.BOLD)
        }
        container.addView(titleView)

        // Badge de resumen de cuenta y monto
        val summaryBadge = TextView(this).apply {
            val formatted = String.format(Locale.US, "%,.0f", finalAmount)
            text = "💳 $selectedAccount • $$formatted COP"
            textSize = 12f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.parseColor("#38bdf8"))
            background = GradientDrawable().apply {
                cornerRadius = 12f
                setColor(Color.parseColor("#082f49"))
                setStroke(1, Color.parseColor("#0284c7"))
            }
            setPadding(18, 8, 18, 8)
            val p = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                setMargins(0, 10, 0, 15)
            }
            layoutParams = p
        }
        container.addView(summaryBadge)

        val promptView = TextView(this).apply {
            text = "Selecciona el rubro presupuestario de Kpital:"
            textSize = 13f
            setTextColor(Color.parseColor("#94a3b8"))
            setPadding(0, 0, 0, 15)
        }
        container.addView(promptView)

        val loadingRubros = TextView(this).apply {
            text = "Cargando tus rubros en vivo..."
            textSize = 12f
            setTextColor(Color.parseColor("#64748b"))
            setPadding(0, 10, 0, 15)
        }
        container.addView(loadingRubros)

        val rubrosLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }
        container.addView(rubrosLayout)

        // Cargar rubros dinámicamente desde el backend o fallback inteligente
        thread {
            var wealthList = mutableListOf<Triple<String, String, String>>() // id, name, icon
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
                Log.w("PocketSelector", "Error fetch budget items: ${e.message}")
            }

            // Fallback canónico si no hay conexión o viene vacío
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

            runOnUiThread {
                loadingRubros.visibility = View.GONE
                renderRubroSections(
                    rubrosLayout = rubrosLayout,
                    wealthList = wealthList,
                    needsList = needsList,
                    wantsList = wantsList,
                    onRubroSelected = { rId, rName, rPillar ->
                        submitFinalTransaction(
                            bank = bank,
                            account = selectedAccount,
                            desc = desc,
                            txType = txType,
                            finalAmount = finalAmount,
                            rawText = rawText,
                            budgetItemId = rId,
                            budgetItemName = rName,
                            budgetItemType = rPillar
                        )
                    }
                )
            }
        }
    }

    private fun renderRubroSections(
        rubrosLayout: LinearLayout,
        wealthList: List<Triple<String, String, String>>,
        needsList: List<Triple<String, String, String>>,
        wantsList: List<Triple<String, String, String>>,
        onRubroSelected: (String, String, String) -> Unit
    ) {
        // ── 1. RAMA PATRIMONIO & AHORRO (VERDES / ESMERALDA) ──
        if (wealthList.isNotEmpty()) {
            addPillarHeader(rubrosLayout, "🟢 Patrimonio & Ahorro", "#10b981", "#052e16")
            for (w in wealthList) {
                addRubroButton(rubrosLayout, w.second, w.third, "#10b981", "#052e16") {
                    onRubroSelected(w.first, w.second, "wealth")
                }
            }
        }

        // ── 2. RAMA GASTOS FIJOS & NECESIDADES (AZULES / CELESTE) ──
        if (needsList.isNotEmpty()) {
            addPillarHeader(rubrosLayout, "🔵 Necesidades Básicas (Needs)", "#0ea5e9", "#082f49")
            for (n in needsList) {
                addRubroButton(rubrosLayout, n.second, n.third, "#0ea5e9", "#082f49") {
                    onRubroSelected(n.first, n.second, "needs")
                }
            }
        }

        // ── 3. RAMA ESTILO DE VIDA & DESEOS (PÚRPURAS / FUCSIA) ──
        if (wantsList.isNotEmpty()) {
            addPillarHeader(rubrosLayout, "🟣 Estilo de Vida (Wants)", "#c084fc", "#2e1065")
            for (wa in wantsList) {
                addRubroButton(rubrosLayout, wa.second, wa.third, "#c084fc", "#2e1065") {
                    onRubroSelected(wa.first, wa.second, "wants")
                }
            }
        }

        // Separador
        val sep = View(this).apply {
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 1).apply {
                setMargins(0, 20, 0, 15)
            }
            setBackgroundColor(Color.parseColor("#1e293b"))
        }
        rubrosLayout.addView(sep)

        // Botón ➕ Crear Nuevo Rubro...
        val addCustomBtn = Button(this).apply {
            text = "➕ Crear Nuevo Rubro..."
            textSize = 13f
            isAllCaps = false
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.WHITE)
            background = GradientDrawable().apply {
                cornerRadius = 16f
                setColor(Color.parseColor("#1e293b"))
                setStroke(1, Color.parseColor("#00e5ff"))
            }
            setPadding(30, 24, 30, 24)
            val p = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                setMargins(0, 8, 0, 12)
            }
            layoutParams = p
            setOnClickListener {
                showCreateRubroDialog(onRubroSelected)
            }
        }
        rubrosLayout.addView(addCustomBtn)

        // Botón ⚡ Omitir Rubro (Asignar luego)
        val skipBtn = Button(this).apply {
            text = "⚡ Omitir Rubro (Asignar más tarde)"
            textSize = 12f
            isAllCaps = false
            setTextColor(Color.parseColor("#94a3b8"))
            background = GradientDrawable().apply {
                cornerRadius = 14f
                setColor(Color.parseColor("#0e1526"))
                setStroke(1, Color.parseColor("#1e293b"))
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
                onRubroSelected("", "", "")
            }
        }
        rubrosLayout.addView(skipBtn)
    }

    private fun addPillarHeader(layout: LinearLayout, title: String, textColor: String, bgColor: String) {
        val h = TextView(this).apply {
            text = title
            textSize = 12f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.parseColor(textColor))
            background = GradientDrawable().apply {
                cornerRadius = 10f
                setColor(Color.parseColor(bgColor))
                setStroke(1, Color.parseColor(textColor))
            }
            setPadding(18, 6, 18, 6)
            val p = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                setMargins(0, 16, 0, 10)
            }
            layoutParams = p
        }
        layout.addView(h)
    }

    private fun addRubroButton(
        layout: LinearLayout,
        name: String,
        icon: String,
        accentColor: String,
        bgColor: String,
        onClick: () -> Unit
    ) {
        val btn = Button(this).apply {
            text = "$icon $name"
            textSize = 13f
            isAllCaps = false
            gravity = Gravity.START or Gravity.CENTER_VERTICAL
            setTextColor(Color.WHITE)
            background = GradientDrawable().apply {
                cornerRadius = 16f
                setColor(Color.parseColor("#0c111e"))
                setStroke(1, Color.parseColor(accentColor))
            }
            setPadding(30, 22, 30, 22)
            val p = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                setMargins(0, 6, 0, 6)
            }
            layoutParams = p
            setOnClickListener {
                isEnabled = false
                onClick()
            }
        }
        layout.addView(btn)
    }

    private fun showCreateRubroDialog(onRubroSelected: (String, String, String) -> Unit) {
        val dialogView = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(40, 30, 40, 20)
        }

        val namePrompt = TextView(this).apply {
            text = "Nombre del nuevo rubro:"
            textSize = 13f
            setTextColor(Color.WHITE)
            setTypeface(null, Typeface.BOLD)
            setPadding(0, 0, 0, 8)
        }
        dialogView.addView(namePrompt)

        val inputName = EditText(this).apply {
            hint = "Ej: Gimnasio, Veterinaria, Curso..."
            setHintTextColor(Color.parseColor("#64748b"))
            setTextColor(Color.WHITE)
            textSize = 14f
            setBackgroundColor(Color.parseColor("#0f172a"))
            setPadding(20, 16, 20, 16)
        }
        dialogView.addView(inputName)

        val pillarPrompt = TextView(this).apply {
            text = "Selecciona el pilar principal:"
            textSize = 13f
            setTextColor(Color.WHITE)
            setTypeface(null, Typeface.BOLD)
            setPadding(0, 16, 0, 8)
        }
        dialogView.addView(pillarPrompt)

        val spinnerPillar = Spinner(this)
        val pillars = arrayOf(
            "🔵 Necesidades Básicas (Needs)",
            "🟣 Estilo de Vida (Wants)",
            "🟢 Patrimonio & Ahorro (Wealth)"
        )
        val adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, pillars)
        spinnerPillar.adapter = adapter
        dialogView.addView(spinnerPillar)

        AlertDialog.Builder(this)
            .setTitle("Crear Nuevo Rubro")
            .setView(dialogView)
            .setPositiveButton("Guardar y Asignar") { _, _ ->
                val enteredName = inputName.text.toString().trim()
                if (enteredName.isNotBlank()) {
                    val selIdx = spinnerPillar.selectedItemPosition
                    val pillarType = when (selIdx) {
                        0 -> "needs"
                        1 -> "wants"
                        else -> "wealth"
                    }
                    val customId = "custom_${System.currentTimeMillis()}"
                    onRubroSelected(customId, enteredName, pillarType)
                } else {
                    Toast.makeText(this, "Ingresa un nombre válido", Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    private fun submitFinalTransaction(
        bank: String,
        account: String,
        desc: String,
        txType: String,
        finalAmount: Double,
        rawText: String,
        budgetItemId: String,
        budgetItemName: String,
        budgetItemType: String
    ) {
        Toast.makeText(this, "Registrando en Kpital...", Toast.LENGTH_SHORT).show()

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

                runOnUiThread {
                    if (success) {
                        val mId = movementId
                        if (mId != null) {
                            val pocketDisplay = if (budgetItemName.isNotBlank()) "$account ➔ $budgetItemName" else account
                            MovementHistoryManager.updateMovementStatus(
                                context = this@PocketSelectorActivity,
                                id = mId,
                                newStatus = MovementHistoryManager.STATUS_COMPLETED,
                                pocketName = pocketDisplay,
                                newAmount = finalAmount
                            )
                        }
                        val finalMsg = if (budgetItemName.isNotBlank()) "✅ Asignado a $budgetItemName ($account)" else "✅ $msg"
                        Toast.makeText(this@PocketSelectorActivity, finalMsg, Toast.LENGTH_LONG).show()
                    } else {
                        Toast.makeText(this@PocketSelectorActivity, "⚠️ $msg", Toast.LENGTH_LONG).show()
                    }
                    finish()
                }
            } catch (e: Exception) {
                runOnUiThread {
                    Toast.makeText(this@PocketSelectorActivity, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
                    finish()
                }
            }
        }
    }
}
