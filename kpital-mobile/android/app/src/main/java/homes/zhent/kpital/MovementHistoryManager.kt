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

    private fun getPrefs(context: Context): SharedPreferences {
        return context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    /**
     * Guarda un movimiento en el historial (LIFO).
     * Evita duplicados cercanos (mismo banco, monto y timestamp dentro de 4 segundos).
     * Retorna el id del movimiento guardado.
     */
    fun addMovement(context: Context, movement: CapturedMovement): String {
        return lock.withLock {
            val list = loadMovementsInternal(context).toMutableList()

            // Filtro anti-duplicados por notificaciones dobles del sistema operativo
            val existing = list.firstOrNull {
                it.bank.equals(movement.bank, ignoreCase = true) &&
                        kotlin.math.abs(it.amount - movement.amount) < 0.01 &&
                        kotlin.math.abs(it.timestamp - movement.timestamp) < 4000
            }

            if (existing != null) {
                Log.d(TAG, "Notificación duplicada detectada para ${movement.bank} ($${movement.amount}), reutilizando id=${existing.id}")
                return@withLock existing.id
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
     * Elimina únicamente los movimientos que ya fueron completados o descartados,
     * conservando los pendientes para que no se pierdan.
     */
    fun clearCompletedMovements(context: Context) {
        lock.withLock {
            val list = loadMovementsInternal(context).filter { it.status == STATUS_PENDING }
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
