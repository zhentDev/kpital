package homes.zhent.kpital

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.widget.Toast
import core.Core
import org.json.JSONObject
import kotlin.concurrent.thread

/**
 * PocketSelectorActivity:
 * Diálogo interactivo rápido (estilo MacroDroid / Prompt de selección) que aparece
 * inmediatamente cuando se intercepta una notificación de compra o débito bancario.
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

        // Cargar cajitas y cuentas disponibles en segundo plano vía Go Core
        thread {
            try {
                val pocketsJsonStr = Core.fetchMobilePockets(bank, txType)
                val json = JSONObject(pocketsJsonStr)
                val pocketsArray = json.optJSONArray("pockets")
                val namesArray = json.optJSONArray("pocket_names")

                val displayOptions = mutableListOf<String>()
                val internalNames = mutableListOf<String>()

                if (pocketsArray != null && namesArray != null) {
                    for (i in 0 until pocketsArray.length()) {
                        displayOptions.add(pocketsArray.getString(i))
                        internalNames.add(namesArray.getString(i))
                    }
                } else {
                    displayOptions.add("⭐ Cuenta Principal ($formattedAmount)")
                    internalNames.add("Principal")
                    displayOptions.add("❌ Cancelar")
                    internalNames.add("Cancelar")
                }

                runOnUiThread {
                    showSelectionDialog(bank, desc, formattedAmount, displayOptions, internalNames, amount, txType, rawText)
                }
            } catch (e: Exception) {
                Log.e("PocketSelector", "Error fetching pockets: ${e.message}", e)
                runOnUiThread {
                    Toast.makeText(this@PocketSelectorActivity, "Error conectando con Kpital", Toast.LENGTH_SHORT).show()
                    finish()
                }
            }
        }
    }

    private fun showSelectionDialog(
        bank: String,
        desc: String,
        formattedAmount: String,
        displayOptions: List<String>,
        internalNames: List<String>,
        amount: Double,
        txType: String,
        rawText: String
    ) {
        val title = "💳 Gasto en $desc ($$formattedAmount)"
        val message = "¿De qué cajita o cuenta sale este dinero en $bank?"

        val builder = AlertDialog.Builder(this)
        builder.setTitle(title)
        builder.setMessage(message)

        builder.setItems(displayOptions.toTypedArray()) { _, which ->
            val selectedName = internalNames.getOrNull(which) ?: "Principal"

            if (selectedName.contains("Cancelar", ignoreCase = true) || selectedName.contains("Ignorar", ignoreCase = true)) {
                Toast.makeText(this, "Operación cancelada", Toast.LENGTH_SHORT).show()
                finish()
                return@setItems
            }

            // Despachar transacción a Kpital vía Go Core
            thread {
                try {
                    val respJson = Core.sendTransactionToBackend(bank, selectedName, desc, txType, amount, rawText)
                    val result = JSONObject(respJson)
                    val success = result.optBoolean("success", false)
                    val msg = result.optString("message", "Movimiento registrado")

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
                        Toast.makeText(this@PocketSelectorActivity, "Error al registrar: ${e.message}", Toast.LENGTH_SHORT).show()
                        finish()
                    }
                }
            }
        }

        builder.setNegativeButton("Descartar") { dialog, _ ->
            dialog.dismiss()
            finish()
        }

        builder.setCancelable(false)
        val dialog = builder.create()
        dialog.show()
    }
}
