package homes.zhent.kpital

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
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
 * Construye botones táctiles dinámicos elegantes (estilo dark theme Kpital).
 */
class PocketSelectorActivity : Activity() {

    companion object {
        const val EXTRA_BANK = "extra_bank"
        const val EXTRA_AMOUNT = "extra_amount"
        const val EXTRA_DESC = "extra_desc"
        const val EXTRA_TX_TYPE = "extra_tx_type"
        const val EXTRA_RAW_TEXT = "extra_raw_text"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val bank = intent.getStringExtra(EXTRA_BANK) ?: "Banco"
        val amount = intent.getDoubleExtra(EXTRA_AMOUNT, 0.0)
        val desc = intent.getStringExtra(EXTRA_DESC) ?: "Compra"
        val txType = intent.getStringExtra(EXTRA_TX_TYPE) ?: "debit"
        val rawText = intent.getStringExtra(EXTRA_RAW_TEXT) ?: ""

        val formattedAmount = String.format("%,.0f", amount)

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

        val amountView = TextView(this).apply {
            text = "$$formattedAmount COP"
            textSize = 24f
            setTextColor(Color.parseColor("#00e5ff"))
            setTypeface(null, Typeface.BOLD)
            setPadding(0, 10, 0, 10)
        }
        container.addView(amountView)

        val promptView = TextView(this).apply {
            text = "¿De qué cajita o cuenta sale este dinero en $bank?"
            textSize = 14f
            setTextColor(Color.parseColor("#94a3b8"))
            setPadding(0, 0, 0, 30)
        }
        container.addView(promptView)

        val loadingView = TextView(this).apply {
            text = "Cargando tus cajitas y saldos..."
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
                        amount = amount,
                        txType = txType,
                        rawText = rawText,
                        displayOptions = displayOptions,
                        internalNames = internalNames
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
        amount: Double,
        txType: String,
        rawText: String,
        displayOptions: List<String>,
        internalNames: List<String>
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

                    isEnabled = false
                    text = "Registrando en Kpital..."

                    thread {
                        try {
                            val respStr = Core.sendTransactionToBackend(bank, internalName, desc, txType, amount, rawText)
                            val result = JSONObject(respStr)
                            val success = result.optBoolean("success", false)
                            val msg = result.optString("message", "Movimiento registrado con éxito")

                            runOnUiThread {
                                if (success) {
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
