package homes.zhent.kpital

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

/**
 * Representa un movimiento bancario interceptado desde notificaciones push o SMS.
 */
data class CapturedMovement(
    val id: String = UUID.randomUUID().toString(),
    val bank: String,
    val amount: Double,
    val description: String,
    val txType: String = "debit", // "debit" o "credit"
    val rawText: String = "",
    val timestamp: Long = System.currentTimeMillis(),
    var status: String = MovementHistoryManager.STATUS_PENDING,
    var pocketName: String? = null,
    var completedAt: Long? = null
) {
    fun toJson(): JSONObject {
        return JSONObject().apply {
            put("id", id)
            put("bank", bank)
            put("amount", amount)
            put("description", description)
            put("txType", txType)
            put("rawText", rawText)
            put("timestamp", timestamp)
            put("status", status)
            put("pocketName", pocketName ?: JSONObject.NULL)
            put("completedAt", completedAt ?: JSONObject.NULL)
        }
    }

    companion object {
        fun fromJson(json: JSONObject): CapturedMovement {
            return CapturedMovement(
                id = json.optString("id", UUID.randomUUID().toString()),
                bank = json.optString("bank", "Banco"),
                amount = json.optDouble("amount", 0.0),
                description = json.optString("description", "Movimiento bancario"),
                txType = json.optString("txType", "debit"),
                rawText = json.optString("rawText", ""),
                timestamp = json.optLong("timestamp", System.currentTimeMillis()),
                status = json.optString("status", MovementHistoryManager.STATUS_PENDING),
                pocketName = if (json.isNull("pocketName")) null else json.optString("pocketName"),
                completedAt = if (json.isNull("completedAt")) null else json.optLong("completedAt")
            )
        }
    }
}

/**
 * MovementHistoryManager:
 * Gestor singleton y thread-safe para persistir el historial completo de movimientos
 * capturados por Kpital Mobile en SharedPreferences mediante JSON nativo.
 *
 * Permite que ninguna notificación o gasto se pierda si el usuario no pudo atender
 * el diálogo flotante de inmediato, permitiendo completarlo en cualquier momento
 * con un solo clic.
 */
object MovementHistoryManager {

    private const val TAG = "MovementHistory"
    private const val PREFS_NAME = "kpital_captured_movements_prefs"
    private const val KEY_MOVEMENTS = "captured_movements_json"
    private const val MAX_HISTORY_ITEMS = 150

    const val STATUS_PENDING = "PENDING"
    const val STATUS_COMPLETED = "COMPLETED"
    const val STATUS_DISCARDED = "DISCARDED"

    private val lock = ReentrantLock()

    // Listener opcional para notificar a la UI en tiempo real
    private var historyChangeListener: (() -> Unit)? = null

    fun setOnHistoryChangeListener(listener: (() -> Unit)?) {
        historyChangeListener = listener
    }

    /**
     * Parsea montos en formato colombiano (ej. 24.845,00 o 24.845 o $ 24.845 o 7.200)
     * evitando que 24.845 sea interpretado como 24 punto 845 (que redondearía a 25 pesos).
     */
    fun parseAmount(raw: String?): Double {
        if (raw == null) return 0.0
        var s = raw.replace("$", "").replace("COP", "", ignoreCase = true).trim()
        if (s.isBlank()) return 0.0
        s = s.replace(Regex("[^0-9.,]"), "")
        val hasDot = s.contains(".")
        val hasComma = s.contains(",")
        val clean = when {
            hasDot && hasComma -> {
                val lastDot = s.lastIndexOf(".")
                val lastComma = s.lastIndexOf(",")
                if (lastComma > lastDot) {
                    s.replace(".", "").replace(",", ".")
                } else {
                    s.replace(",", "")
                }
            }
            hasDot && !hasComma -> {
                val parts = s.split(".")
                if (parts.size > 2 || (parts.size == 2 && parts[1].length == 3)) {
                    s.replace(".", "")
                } else {
                    s
                }
            }
            hasComma && !hasDot -> {
                val parts = s.split(",")
                if (parts.size == 2 && (parts[1].length == 1 || parts[1].length == 2)) {
                    "${parts[0]}.${parts[1]}"
                } else {
                    s.replace(",", "")
                }
            }
            else -> s
        }
        return clean.toDoubleOrNull() ?: 0.0
    }

    private fun getPrefs(context: Context): SharedPreferences {
        return context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    /**
     * Guarda un movimiento en el historial (LIFO).
     * Si detecta que es duplicado (mismo texto en 24h o mismo banco y monto en 15m),
     * lo clasifica automáticamente como STATUS_DISCARDED para no interrumpir al usuario,
     * pero permitiendo que el usuario lo rectifique en cualquier momento.
     * Retorna el id del movimiento guardado.
     */
    fun addMovement(context: Context, movement: CapturedMovement): String {
        return lock.withLock {
            val list = loadMovementsInternal(context).toMutableList()

            // Filtro anti-duplicados inteligente
            val isDuplicate = list.any {
                (it.rawText.isNotBlank() && it.rawText.equals(movement.rawText, ignoreCase = true) &&
                        kotlin.math.abs(it.timestamp - movement.timestamp) < 86_400_000L) ||
                (it.bank.equals(movement.bank, ignoreCase = true) &&
                        kotlin.math.abs(it.amount - movement.amount) < 0.01 &&
                        it.amount > 0 &&
                        kotlin.math.abs(it.timestamp - movement.timestamp) < 900_000L)
            }

            if (isDuplicate) {
                Log.d(TAG, "Notificación duplicada detectada para ${movement.bank} ($${movement.amount}). Clasificada automáticamente en Descartadas.")
                movement.status = STATUS_DISCARDED
            }

            list.add(0, movement)

            // Limitar tamaño máximo para proteger memoria y almacenamiento
            if (list.size > MAX_HISTORY_ITEMS) {
                val trimmed = list.take(MAX_HISTORY_ITEMS)
                saveMovementsInternal(context, trimmed)
            } else {
                saveMovementsInternal(context, list)
            }

            notifyChanged()
            movement.id
        }
    }

    /**
     * Retorna todos los movimientos registrados ordenados de más reciente a más antiguo.
     */
    fun getMovements(context: Context): List<CapturedMovement> {
        return lock.withLock {
            loadMovementsInternal(context)
        }
    }

    /**
     * Obtiene un movimiento específico por su identificador único.
     */
    fun getMovementById(context: Context, id: String): CapturedMovement? {
        return lock.withLock {
            loadMovementsInternal(context).firstOrNull { it.id == id }
        }
    }

    /**
     * Actualiza el estado de un movimiento (ej. a COMPLETED cuando se le asigna cajita).
     */
    fun updateMovementStatus(
        context: Context,
        id: String,
        newStatus: String,
        pocketName: String? = null,
        newAmount: Double? = null
    ) {
        lock.withLock {
            val list = loadMovementsInternal(context).toMutableList()
            val index = list.indexOfFirst { it.id == id }
            if (index != -1) {
                val current = list[index]
                val updated = current.copy(
                    status = newStatus,
                    pocketName = pocketName ?: current.pocketName,
                    amount = if (newAmount != null && newAmount > 0) newAmount else current.amount,
                    completedAt = if (newStatus == STATUS_COMPLETED) System.currentTimeMillis() else current.completedAt
                )
                list[index] = updated
                saveMovementsInternal(context, list)
                Log.d(TAG, "Movimiento $id actualizado a $newStatus (Cajita: $pocketName)")
                notifyChanged()
            }
        }
    }

    /**
     * Elimina un movimiento individual del historial.
     */
    fun deleteMovement(context: Context, id: String) {
        lock.withLock {
            val list = loadMovementsInternal(context).toMutableList()
            val removed = list.removeAll { it.id == id }
            if (removed) {
                saveMovementsInternal(context, list)
                notifyChanged()
            }
        }
    }

    /**
     * Marca un movimiento como descartado/rechazado.
     */
    fun discardMovement(context: Context, id: String) {
        updateMovementStatus(context, id, STATUS_DISCARDED)
    }

    /**
     * Rectifica un movimiento descartado o duplicado, devolviéndolo a estado PENDING.
     */
    fun restoreMovement(context: Context, id: String) {
        updateMovementStatus(context, id, STATUS_PENDING)
    }

    /**
     * Elimina permanentemente todos los movimientos que están en la pestaña Descartadas.
     */
    fun clearDiscardedMovements(context: Context) {
        lock.withLock {
            val list = loadMovementsInternal(context).filter { it.status != STATUS_DISCARDED }
            saveMovementsInternal(context, list)
            notifyChanged()
        }
    }

    /**
     * Elimina únicamente los movimientos que ya fueron completados,
     * conservando los pendientes para que no se pierdan.
     */
    fun clearCompletedMovements(context: Context) {
        lock.withLock {
            val list = loadMovementsInternal(context).filter { it.status != STATUS_COMPLETED }
            saveMovementsInternal(context, list)
            notifyChanged()
        }
    }

    /**
     * Limpia completamente el historial.
     */
    fun clearAll(context: Context) {
        lock.withLock {
            saveMovementsInternal(context, emptyList())
            notifyChanged()
        }
    }

    private fun loadMovementsInternal(context: Context): List<CapturedMovement> {
        val raw = getPrefs(context).getString(KEY_MOVEMENTS, "[]") ?: "[]"
        return try {
            val array = JSONArray(raw)
            val result = mutableListOf<CapturedMovement>()
            for (i in 0 until array.length()) {
                val obj = array.getJSONObject(i)
                result.add(CapturedMovement.fromJson(obj))
            }
            result
        } catch (e: Exception) {
            Log.e(TAG, "Error cargando historial de movimientos: ${e.message}", e)
            emptyList()
        }
    }

    private fun saveMovementsInternal(context: Context, list: List<CapturedMovement>) {
        try {
            val array = JSONArray()
            list.forEach { array.put(it.toJson()) }
            getPrefs(context).edit().putString(KEY_MOVEMENTS, array.toString()).apply()
        } catch (e: Exception) {
            Log.e(TAG, "Error guardando historial de movimientos: ${e.message}", e)
        }
    }

    private fun notifyChanged() {
        try {
            historyChangeListener?.invoke()
        } catch (e: Exception) {
            Log.w(TAG, "Error invocando historyChangeListener: ${e.message}")
        }
    }
}
