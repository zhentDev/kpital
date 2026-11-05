package homes.zhent.kpital

import android.app.Activity
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
import org.json.JSONObject
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
                        Toast.makeText(this@PocketSelectorActivity, "Gasto descartado", Toast.LENGTH_SHORT).show()
                        finish()
                        return@setOnClickListener
                    }

                    val finalAmount = getFinalAmount()
                    if (finalAmount <= 0) {
                        Toast.makeText(this@PocketSelectorActivity, "Por favor ingresa un monto válido", Toast.LENGTH_SHORT).show()
                        return@setOnClickListener
                    }

                    isEnabled = false
                    text = "Registrando en Kpital..."

                    thread {
                        try {
                            val respStr = Core.sendTransactionToBackend(bank, internalName, desc, txType, finalAmount, rawText)
                            val result = JSONObject(respStr)
                            val success = result.optBoolean("success", false)
                            val msg = result.optString("message", "Movimiento registrado con éxito")

                            runOnUiThread {
                                if (success) {
                                    val mId = movementId
                                    if (mId != null) {
                                        MovementHistoryManager.updateMovementStatus(
                                            context = this@PocketSelectorActivity,
                                            id = mId,
                                            newStatus = MovementHistoryManager.STATUS_COMPLETED,
                                            pocketName = internalName,
                                            newAmount = finalAmount
                                        )
                                    }
                                    Toast.makeText(this@PocketSelectorActivity, "✅ $msg", Toast.LENGTH_LONG).show()
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
}
