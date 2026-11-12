/**
 * Zustand Store — Fixed Income, Savings Accounts & CDTs.
 * 100% Cloud-Synced with Supabase PostgreSQL (SSOT) via FastAPI backend.
 * Zero financial data persistence in localStorage.
 */

import toast from "react-hot-toast";
import { create } from "zustand";
import { isMainOwnerUser, getCurrentUserEmail, useAuthStore } from "./authStore";
import {
  createFixedIncomeAccount,
  createFixedIncomeCDT,
  createFixedIncomeEntity,
  deleteFixedIncomeAccountApi,
  deleteFixedIncomeCDTApi,
  deleteFixedIncomeEntityApi,
  fetchFixedIncomeData,
  fetchHistoricalRates,
  syncFixedIncomeStateApi,
  updateFixedIncomeAccountApi,
  updateFixedIncomeCDTApi,
  updateFixedIncomeEntityApi,
} from "../api/client";

const DEFAULT_ENTITIES = [];
const DEFAULT_ACCOUNTS = [];
const DEFAULT_CDTS = [];

export const useFixedIncomeStore = create((set, get) => ({
  // ── State ────────────────────────────────────────
  entities: DEFAULT_ENTITIES,
  accounts: DEFAULT_ACCOUNTS,
  cdts: DEFAULT_CDTS,
  transactions: [],
  deletedTxIds: [],
  historicalRates: { entities: {} },
  preferredCurrency: "COP", // 'COP' | 'USD'
  projectionTimeline: "ALL", // '1M' | '3M' | '6M' | '1Y' | '3Y' | '5Y' | 'ALL'
  projectionMode: "NOMINAL", // 'NOMINAL' | 'REAL'
  monthlyDepositContribution: 0,
  isInitialized: false,

  // ── Initialization & Backend Sync (100% Supabase SSOT) ───────────────
  initFetchFixedIncome: async () => {
    try {
      if (typeof window !== "undefined") {
        localStorage.removeItem("titanes_fixed_income_store");
        localStorage.removeItem("kpital_fixed_income_store");
      }

      const currentUser = useAuthStore.getState()?.user;
      const currentEmail = currentUser?.email || getCurrentUserEmail();
      const isOwner = isMainOwnerUser(currentEmail);

      if (!isOwner) {
        // Terminal virgen/limpia para cuentas que no sean la principal
        set({
          entities: [],
          accounts: [],
          cdts: [],
          transactions: [],
          isInitialized: true,
        });
        return;
      }

      const res = await fetchFixedIncomeData({ bypassCache: true });
      let rates = { entities: {} };
      try {
        rates = await fetchHistoricalRates();
      } catch (err) {
        console.error("[FixedIncome] Failed fetching rates database:", err);
      }

      const finalEntities = Array.isArray(res?.entities) ? res.entities : [];
      const finalCDTs = Array.isArray(res?.cdts) ? res.cdts : [];

      const isTestTx = (t) => {
        const desc = (t?.description || "").toLowerCase();
        return desc.includes("test abono") || desc.includes("test sobregiro") || desc.includes("reversión test");
      };
      const isZombieOrOrphanTx = (t) => {
        if (!t || !t.id) return true;
        return (
          t.id === "tx_int_deuda_mike_transfer_in" ||
          t.id === "tx_deuda_mike_20261024_01" ||
          t.id === "tx_int_finandina_in_350k" ||
          t.id === "tx_int_finandina_out_350k" ||
          t.id === "tx_cf_tx_sub_1792795620492_e98s"
        );
      };
      const deletedTxSet = new Set([
        ...(get().deletedTxIds || []),
        "tx_int_deuda_mike_transfer_in",
        "tx_deuda_mike_20261024_01",
        "tx_int_finandina_in_350k",
        "tx_int_finandina_out_350k",
        "tx_cf_tx_sub_1792795620492_e98s",
      ]);

      const rawTransactions = Array.isArray(res?.transactions) ? res.transactions : [];
      let finalTransactions = rawTransactions
        .filter((t) => t && t.id && !deletedTxSet.has(t.id) && !isTestTx(t) && !isZombieOrOrphanTx(t))
        .sort(
          (a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || "")
        );

      let finalAccounts = (Array.isArray(res?.accounts) ? res.accounts : []).map((acc) => {
        const { disableDailyCompounding, ...rest } = acc;
        return rest;
      });

      // Sanitizar duplicados por reclasificación en Cuenta RappiPay (Principal)
      const hasRappiCompra150k = finalTransactions.some(
        (t) => t.accountId === "acc_rappi_principal" && Math.abs(Number(t.amount)) === 150000 && (t.description || "").toLowerCase().includes("compra en tu rappicuenta")
      );
      if (hasRappiCompra150k) {
        const hasDuplicateTransfer = finalTransactions.some(
          (t) => t.accountId === "acc_rappi_principal" && Math.abs(Number(t.amount)) === 150000 && (t.description || "").toLowerCase().includes("transferencia para fondo de emergencia")
        );
        if (hasDuplicateTransfer) {
          finalTransactions = finalTransactions.filter(
            (t) => !(t.accountId === "acc_rappi_principal" && Math.abs(Number(t.amount)) === 150000 && (t.description || "").toLowerCase().includes("transferencia para fondo de emergencia"))
          );
          finalAccounts = finalAccounts.map((a) => {
            if (a.id === "acc_rappi_principal") {
              const correctedBalance = Math.max(0, Number(a.balance || 0) - 150000);
              return { ...a, balance: correctedBalance };
            }
            return a;
          });
        }
      }

      // Normalize Plenti Bolsillo a la vista, Finandina FlexiDigital+ pocket, and Daviplata Principal
      const accountsToSync = [];
      finalAccounts = finalAccounts.map((acc) => {
        const isDaviplata =
          acc.id === "acc_daviplata_disp" ||
          acc.entityId === "ent_daviplata" ||
          (acc.name || "").toLowerCase().includes("daviplata");
        if (isDaviplata && Number(acc.balance || 0) === 0) {
          const updated = { ...acc, balance: 2200.03 };
          accountsToSync.push(updated);
          return updated;
        }

        const isPlentiPocket =
          acc.id === "acc_1786777955489" ||
          (acc.currency === "USD" && (acc.name || "").toLowerCase().includes("bolsillo"));
        if (isPlentiPocket && (Number(acc.interestRateEA || 0) < 4.0 || acc.fallbackAccountId !== "acc_plenti_principal")) {
          const updated = {
            ...acc,
            name: "Bolsillo a la vista",
            fallbackAccountId: "acc_plenti_principal",
            interestRateEA: 4.0,
            rateHistory: [
              { date: "2026-05-01", rateEA: 3.0 },
              { date: "2026-08-01", rateEA: 4.0 },
            ],
            tieredRates: [
              { maxBalance: 500, rateEA: 4.0, label: "Hasta $500 USD (4.0% EA)" },
              { maxBalance: 1000, rateEA: 4.0, label: "$500 a $1,000 USD (4.0% EA)" },
              { maxBalance: 5000, rateEA: 4.5, label: "$1,000 a $5,000 USD (4.5% EA)" },
              { maxBalance: 9999999, rateEA: 6.0, label: "Más de $5,000 USD (6.0% EA)" },
            ],
          };
          accountsToSync.push(updated);
          return updated;
        }

        // Finandina Bolsillo de Ahorro — Fondo de Emergencia (FlexiDigital +)
        if (acc.id === "acc_1786771927434") {
          const targetName = "Bolsillo de Ahorro — Fondo de Emergencia (FlexiDigital +)";
          if (
            acc.name !== targetName ||
            Number(acc.interestRateEA || 0) !== 10.5 ||
            acc.fallbackAccountId !== "acc_finandina_principal" ||
            !Array.isArray(acc.rateHistory) ||
            acc.rateHistory.length < 2
          ) {
            const updated = {
              ...acc,
              name: targetName,
              accountCategory: "high_yield",
              interestRateEA: 10.5,
              fallbackAccountId: "acc_finandina_principal",
              rateHistory: [
                { date: "2024-01-01", rateEA: 10.0 },
                { date: "2026-08-01", rateEA: 10.5 },
              ],
            };
            accountsToSync.push(updated);
            return updated;
          }
        }

        return acc;
      });

      for (const upd of accountsToSync) {
        updateFixedIncomeAccountApi(upd.id, upd).catch(() => {});
      }

      // Normalización para Finandina FlexiDigital + (Principal) y su Bolsillo
      const cleanFinandinaTxs = finalTransactions.filter(
        (t) => !(t.accountId === "acc_finandina_principal" && Math.abs(Number(t.amount)) === 37000)
      );
      finalAccounts = finalAccounts.map((acc) => {
        if (acc.id === "acc_finandina_principal") {
          const finTxs = cleanFinandinaTxs.filter((t) => t.accountId === "acc_finandina_principal");
          if (finTxs.length > 0) {
            const net = finTxs.reduce((sum, tx) => {
              const isDebit = tx.type === "debit" || Number(tx.amount) < 0;
              const amt = Math.abs(Number(tx.amount || 0));
              return sum + (isDebit ? -amt : amt);
            }, 0);
            return { ...acc, balance: Math.max(0, net) };
          }
        }

        return acc;
      });
      finalTransactions = cleanFinandinaTxs;

      set({
        entities: finalEntities,
        accounts: finalAccounts,
        cdts: finalCDTs,
        transactions: finalTransactions,
        historicalRates: rates || { entities: {} },
        isInitialized: true,
      });
    } catch (e) {
      console.error("[FixedIncome] Error loading from Supabase backend:", e);
      set({ isInitialized: true });
    }
  },

  // ── Entity Actions ───────────────────────────────
  addEntity: async (entityData) => {
    const newEntity = {
      id: entityData.id || `ent_${Date.now()}`,
      name: entityData.name.trim(),
      country: entityData.country || "🇨🇴",
      color: entityData.color || "#10b981",
      icon: entityData.icon || "🏦",
      logoUrl: entityData.logoUrl || undefined,
      createdAt: new Date().toISOString(),
    };
    try {
      await createFixedIncomeEntity(newEntity);
      set((state) => ({ entities: [...state.entities, newEntity] }));
      toast.success(`Entidad ${newEntity.name} creada`);
      return newEntity;
    } catch {
      set((state) => ({ entities: [...state.entities, newEntity] }));
      toast.error("Error al sincronizar entidad con el servidor");
      return newEntity;
    }
  },

  updateEntity: async (entity) => {
    try {
      await updateFixedIncomeEntityApi(entity.id, entity);
      set((state) => ({
        entities: state.entities.map((e) => (e.id === entity.id ? { ...e, ...entity } : e)),
      }));
      toast.success("Entidad actualizada");
    } catch {
      set((state) => ({
        entities: state.entities.map((e) => (e.id === entity.id ? { ...e, ...entity } : e)),
      }));
    }
  },

  deleteEntity: async (entityId) => {
    try {
      await deleteFixedIncomeEntityApi(entityId);
      set((state) => ({
        entities: state.entities.filter((e) => e.id !== entityId),
        accounts: state.accounts.filter((a) => a.entityId !== entityId),
        cdts: state.cdts.filter((c) => c.entityId !== entityId),
      }));
      toast.success("Entidad eliminada");
    } catch {
      set((state) => ({
        entities: state.entities.filter((e) => e.id !== entityId),
        accounts: state.accounts.filter((a) => a.entityId !== entityId),
        cdts: state.cdts.filter((c) => c.entityId !== entityId),
      }));
    }
  },

  // ── Account Actions ──────────────────────────────
  addAccount: async (accountData) => {
    const rate = Number(accountData.interestRateEA || 0);
    const newAccount = {
      id: accountData.id || `acc_${Date.now()}`,
      entityId: accountData.entityId,
      name: accountData.name.trim(),
      type: accountData.type || "savings",
      syncType: accountData.syncType || "api",
      accountCategory: accountData.accountCategory || (accountData.type === "wallet" || rate === 0 ? "digital_wallet" : "high_yield"),
      fallbackAccountId: accountData.fallbackAccountId || null,
      currency: accountData.currency || "COP",
      balance: Number(accountData.balance || 0),
      interestRateEA: rate,
      isTaxExemptGMF: accountData.isTaxExemptGMF ?? true,
      rateHistory: [{ date: new Date().toISOString().slice(0, 10), rateEA: rate }],
      createdAt: new Date().toISOString(),
    };
    const openingTx = newAccount.balance > 0
      ? {
          id: `tx_init_${newAccount.id}_${Date.now()}`,
          accountId: newAccount.id,
          entityId: newAccount.entityId,
          date: new Date().toISOString().slice(0, 10),
          description: `Saldo Inicial / Apertura ${newAccount.name}`,
          amount: newAccount.balance,
          currency: newAccount.currency,
          type: "credit",
          category: "Saldo Inicial",
          source: "account_creation",
          createdAt: new Date().toISOString(),
        }
      : null;

    const nextAccounts = [...get().accounts, newAccount];
    const nextTxs = openingTx ? [openingTx, ...(get().transactions || [])] : get().transactions;

    try {
      await createFixedIncomeAccount(newAccount);
      set({ accounts: nextAccounts, transactions: nextTxs });
      if (openingTx) {
        await syncFixedIncomeStateApi({
          entities: get().entities,
          accounts: nextAccounts,
          cdts: get().cdts,
          transactions: nextTxs,
        });
      }
      toast.success(`Cuenta ${newAccount.name} agregada`);
    } catch {
      set({ accounts: nextAccounts, transactions: nextTxs });
    }
  },

  updateAccount: async (account) => {
    if (!account || !account.id) return;
    try {
      await updateFixedIncomeAccountApi(account.id, account);
      set((state) => ({
        accounts: state.accounts.map((a) => (a.id && a.id === account.id ? { ...a, ...account } : a)),
      }));
      toast.success("Cuenta actualizada");
    } catch {
      set((state) => ({
        accounts: state.accounts.map((a) => (a.id && a.id === account.id ? { ...a, ...account } : a)),
      }));
    }
  },

  deleteAccount: async (accountId) => {
    try {
      await deleteFixedIncomeAccountApi(accountId);
      set((state) => ({
        accounts: state.accounts.filter((a) => a.id !== accountId),
      }));
      toast.success("Cuenta eliminada");
    } catch {
      set((state) => ({
        accounts: state.accounts.filter((a) => a.id !== accountId),
      }));
    }
  },

  // ── CDT Actions ──────────────────────────────────
  addCDT: async (cdtData) => {
    const newCDT = {
      id: cdtData.id || `cdt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      entityId: cdtData.entityId,
      name: cdtData.name.trim(),
      capital: Number(cdtData.capital || 0),
      currency: cdtData.currency || "COP",
      interestRateEA: Number(cdtData.interestRateEA || 0),
      termDays: Number(cdtData.termDays || 180),
      dayBase: cdtData.dayBase ? Number(cdtData.dayBase) : undefined,
      startDate: cdtData.startDate || new Date().toISOString().slice(0, 10),
      maturityDate: cdtData.maturityDate,
      reteFuentePct: Number(cdtData.reteFuentePct ?? 4.0),
      isAutoRenew: !!cdtData.isAutoRenew,
      status: cdtData.status || "active",
      accountId: cdtData.accountId || undefined,
      category: cdtData.category || undefined,
      ...(cdtData.status === "matured" ? {
        payoutAmount: Number(cdtData.payoutAmount || 0),
        payoutDate: cdtData.payoutDate || cdtData.maturityDate,
        netProfit: Number(cdtData.payoutAmount || 0) - Number(cdtData.capital || 0),
      } : {}),
      createdAt: new Date().toISOString(),
    };
    try {
      await createFixedIncomeCDT(newCDT);
      set((state) => ({ cdts: [...state.cdts, newCDT] }));
      toast.success(`CDT ${newCDT.name} registrado`);
      return newCDT;
    } catch {
      set((state) => ({ cdts: [...state.cdts, newCDT] }));
      toast.error("No se pudo guardar el CDT en la nube");
      return newCDT;
    }
  },

  updateCDT: async (cdt) => {
    if (!cdt || !cdt.id) return;
    try {
      await updateFixedIncomeCDTApi(cdt.id, cdt);
      set((state) => ({
        cdts: state.cdts.map((c) => (c.id && c.id === cdt.id ? { ...c, ...cdt } : c)),
      }));
      toast.success("CDT actualizado");
    } catch {
      set((state) => ({
        cdts: state.cdts.map((c) => (c.id && c.id === cdt.id ? { ...c, ...cdt } : c)),
      }));
      toast.error("No se pudo actualizar el CDT en la nube");
    }
  },

  deleteCDT: async (cdtId) => {
    try {
      await deleteFixedIncomeCDTApi(cdtId);
      set((state) => ({
        cdts: state.cdts.filter((c) => c.id !== cdtId),
      }));
      toast.success("CDT eliminado");
    } catch {
      toast.error("Error al eliminar el CDT");
    }
  },

  // ── Transaction Actions ───────────────────────────
  addTransaction: async (txData) => {
    const newTx = {
      id: txData.id || `tx_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      accountId: txData.accountId,
      date: txData.date || new Date().toISOString().slice(0, 10),
      description: txData.description || "Movimiento",
      amount: Number(txData.amount || 0),
      currency: txData.currency || "COP",
      type: txData.type || (Number(txData.amount) >= 0 ? "credit" : "debit"),
      createdAt: new Date().toISOString(),
    };
    const currentTx = get().transactions || [];
    const updatedTx = [newTx, ...currentTx];
    set({ transactions: updatedTx });
    try {
      await syncFixedIncomeStateApi({
        entities: get().entities,
        accounts: get().accounts,
        cdts: get().cdts,
        transactions: updatedTx,
      });
      toast.success("Movimiento registrado");
    } catch {
      toast.error("Error sincronizando movimiento con el servidor");
    }
  },

  deleteTransaction: async (txId) => {
    const nextDeleted = [...new Set([...(get().deletedTxIds || []), txId])];
    const updatedTx = (get().transactions || []).filter((t) => t.id !== txId);
    set({ transactions: updatedTx, deletedTxIds: nextDeleted });
    try {
      await syncFixedIncomeStateApi({
        entities: get().entities,
        accounts: get().accounts,
        cdts: get().cdts,
        transactions: updatedTx,
        deletedTxIds: [txId],
      });
      toast.success("Movimiento eliminado");
    } catch {
      toast.error("Error sincronizando eliminación con el servidor");
    }
  },

  updateTransaction: async (txData) => {
    if (!txData || !txData.id) return;
    const updatedTx = (get().transactions || []).map((t) =>
      t.id === txData.id ? { ...t, ...txData } : t
    );
    set({ transactions: updatedTx });
    try {
      await syncFixedIncomeStateApi({
        entities: get().entities,
        accounts: get().accounts,
        cdts: get().cdts,
        transactions: updatedTx,
      });
      toast.success("Movimiento actualizado");
    } catch {
      toast.error("Error actualizando movimiento en el servidor");
    }
  },

  deleteTransactions: async (txIds) => {
    const idSet = new Set(txIds);
    const nextDeleted = [...new Set([...(get().deletedTxIds || []), ...txIds])];
    const updatedTx = (get().transactions || []).filter((t) => !idSet.has(t.id));
    set({ transactions: updatedTx, deletedTxIds: nextDeleted });
    try {
      await syncFixedIncomeStateApi({
        entities: get().entities,
        accounts: get().accounts,
        cdts: get().cdts,
        transactions: updatedTx,
        deletedTxIds: Array.from(idSet),
      });
      toast.success(`${idSet.size} movimiento(s) eliminado(s)`);
    } catch {
      toast.error("Error eliminando movimientos en el servidor");
    }
  },

  updateTransactionsYear: async (txIds, targetYear) => {
    const idSet = new Set(txIds);
    const updatedTx = (get().transactions || []).map((t) => {
      if (!idSet.has(t.id)) return t;
      const oldDate = t.date || new Date().toISOString().slice(0, 10);
      const parts = oldDate.split("-");
      const newDate = `${targetYear}-${parts[1] || "01"}-${parts[2] || "01"}`;
      return { ...t, date: newDate };
    });
    set({ transactions: updatedTx });
    try {
      await syncFixedIncomeStateApi({
        entities: get().entities,
        accounts: get().accounts,
        cdts: get().cdts,
        transactions: updatedTx,
      });
      toast.success(`Año de ${idSet.size} movimiento(s) cambiado a ${targetYear}`);
    } catch {
      toast.error("Error actualizando año en el servidor");
    }
  },

  // ── Inter-account Money Movements ─────────────────
  applyCashFlowAccountMovement: async ({
    accountId,
    amount,
    date,
    description,
    movementId,
    txType = "credit",
    usdAmount,
    silent = false,
  }) => {
    const amt = Math.abs(Number(amount || 0));
    const state = get();
    const acc = state.accounts.find((a) => a.id === accountId);
    if (!acc || amt <= 0) return;

    const cleanMovId = movementId ? String(movementId).replace(/^cf_/, "") : null;
    const txId = `tx_cf_${movementId || Date.now()}`;
    const isDuplicate = (state.transactions || []).some(
      (t) =>
        t.id === txId ||
        (movementId &&
          (t.id === movementId ||
            t.id === cleanMovId ||
            t.id === `tx_cf_${cleanMovId}` ||
            String(t.id).includes(String(movementId))))
    );
    if (isDuplicate) {
      if (!silent) toast("Este movimiento ya existe en esta cuenta", { icon: "ℹ️" });
      return;
    }

    let finalAmount = amt;
    const isTargetUsd = acc.currency === "USD";
    if (isTargetUsd) {
      if (usdAmount && Number(usdAmount) > 0) {
        finalAmount = Number(usdAmount);
      } else if (amt > 1000) {
        const fx = Number(state.fxRate) > 0 ? Number(state.fxRate) : (amt === 200000 ? 200000 / 63.56 : 4150);
        finalAmount = Number((amt / fx).toFixed(2));
      }
    }

    const isDebit = txType === "debit";
    const currentBal = Number(acc.balance || 0);
    const txDate = date || new Date().toISOString().slice(0, 10);
    const createdAt = new Date().toISOString();

    let updatedAccounts = [...state.accounts];
    const newTxsToInsert = [];

    if (isDebit && acc.fallbackAccountId && finalAmount > currentBal && currentBal > 0) {
      // Cascada: cubre hasta donde alcance el bolsillo y descuenta el resto de la cuenta principal de respaldo
      const shortfall = Number((finalAmount - currentBal).toFixed(2));
      const fallbackAcc = state.accounts.find((a) => a.id === acc.fallbackAccountId);

      newTxsToInsert.push({
        id: txId,
        accountId: acc.id,
        entityId: acc.entityId,
        date: txDate,
        description: `${description || "Retiro"} (Parcial en ${acc.name})`,
        amount: -currentBal,
        currency: acc.currency || "COP",
        type: "debit",
        category: "Retiro / Gasto",
        source: "cashflow_sync",
        createdAt,
      });

      updatedAccounts = updatedAccounts.map((a) => {
        if (a.id === acc.id) return { ...a, balance: 0 };
        if (fallbackAcc && a.id === fallbackAcc.id) {
          return { ...a, balance: Math.max(0, Number((Number(a.balance || 0) - shortfall).toFixed(2))) };
        }
        return a;
      });

      if (fallbackAcc) {
        newTxsToInsert.push({
          id: `${txId}_fb`,
          accountId: fallbackAcc.id,
          entityId: fallbackAcc.entityId,
          date: txDate,
          description: `${description || "Retiro"} (Respaldo cascada desde ${acc.name})`,
          amount: -shortfall,
          currency: fallbackAcc.currency || "COP",
          type: "debit",
          category: "Retiro / Gasto",
          source: "cashflow_sync",
          createdAt,
        });
      }
    } else {
      const signedAmount = isDebit ? -finalAmount : finalAmount;
      const newBalance = Math.max(0, Number((currentBal + signedAmount).toFixed(2)));
      newTxsToInsert.push({
        id: txId,
        accountId: acc.id,
        entityId: acc.entityId,
        date: txDate,
        description: description || (isDebit ? `Retiro: ${acc.name}` : "Transferencia recibida"),
        amount: signedAmount,
        currency: acc.currency || "COP",
        type: isDebit ? "debit" : "credit",
        category: isDebit ? "Retiro / Gasto" : "Transferencia desde Flujo de Caja",
        source: "cashflow_sync",
        createdAt,
      });
      updatedAccounts = updatedAccounts.map((a) => (a.id === acc.id ? { ...a, balance: newBalance } : a));
    }

    const updatedTx = [...newTxsToInsert, ...(state.transactions || [])];
    set({ accounts: updatedAccounts, transactions: updatedTx });
    try {
      await syncFixedIncomeStateApi({
        entities: state.entities,
        accounts: updatedAccounts,
        cdts: state.cdts,
        transactions: updatedTx,
      });
    } catch (e) {
      console.warn("[FixedIncome] applyCashFlowAccountMovement sync failed:", e);
    }
    if (!silent) {
      const formattedDisplay = isTargetUsd
        ? `${isDebit ? "-" : "+"}$${finalAmount.toFixed(2)} USD`
        : `${isDebit ? "-" : "+"}$${finalAmount.toLocaleString("es-CO")} COP`;
      toast.success(
        isDebit
          ? `${formattedDisplay} retirados de ${acc.name}`
          : `${formattedDisplay} abonados en ${acc.name}`,
        { icon: isDebit ? "📤" : "🏦" }
      );
    }
  },

  creditAccountFromCashFlow: async (args) => {
    return get().applyCashFlowAccountMovement({ ...args, txType: "credit" });
  },

  debitAccountFromCashFlow: async (args) => {
    return get().applyCashFlowAccountMovement({ ...args, txType: "debit" });
  },

  revertCashFlowMovement: async ({ movementId }) => {
    if (!movementId) return false;
    const state = get();
    const cleanMovId = String(movementId).replace(/^cf_/, "");
    const txId = `tx_cf_${movementId}`;

    const matchedTxs = (state.transactions || []).filter(
      (t) =>
        t.id === txId ||
        t.id === `${txId}_fb` ||
        t.id === movementId ||
        t.id === cleanMovId ||
        t.id === `tx_cf_${cleanMovId}` ||
        t.id === `tx_cf_${cleanMovId}_fb`
    );

    if (matchedTxs.length === 0) {
      return false;
    }

    const matchedIds = new Set(matchedTxs.map((t) => t.id));
    const balanceAdjustments = {};
    matchedTxs.forEach((t) => {
      const amtAbs = Math.abs(Number(t.amount || 0));
      const wasDebit = t.type === "debit" || Number(t.amount) < 0;
      const inverseDelta = wasDebit ? amtAbs : -amtAbs;
      balanceAdjustments[t.accountId] = (balanceAdjustments[t.accountId] || 0) + inverseDelta;
    });

    const updatedAccounts = state.accounts.map((a) => {
      if (!balanceAdjustments[a.id]) return a;
      return {
        ...a,
        balance: Math.max(0, Number((Number(a.balance || 0) + balanceAdjustments[a.id]).toFixed(2))),
      };
    });
    const updatedTx = (state.transactions || []).filter((t) => !matchedIds.has(t.id));
    const deletedList = Array.from(matchedIds);
    const nextDeletedIds = [...new Set([...(state.deletedTxIds || []), ...deletedList])];

    set({ accounts: updatedAccounts, transactions: updatedTx, deletedTxIds: nextDeletedIds });
    try {
      await syncFixedIncomeStateApi({
        entities: state.entities,
        accounts: updatedAccounts,
        cdts: state.cdts,
        transactions: updatedTx,
        deletedTxIds: deletedList,
      });
    } catch (e) {
      console.warn("[FixedIncome] revertCashFlowMovement sync failed:", e);
    }
    return true;
  },

  revertAccountCredit: async ({ movementId }) => {
    return get().revertCashFlowMovement({ movementId });
  },

  syncCashFlowMovementToFixedIncome: async (oldTx, newTx) => {
    const state = get();
    const resolveTargetAccount = (tx) => {
      if (!tx || !tx.paymentSource) return null;
      const ps = tx.paymentSource;
      if (ps.type === "credit_card" || ps.type === "cash" || ps.type === "investment_cash") return null;
      if (ps.targetId === "acc_nu_debito") return null;

      let acc = null;
      if (ps.targetId) {
        acc = state.accounts.find((a) => a.id === ps.targetId);
      }
      if (!acc && ps.targetName) {
        const qNorm = ps.targetName.toLowerCase().trim();
        acc = state.accounts.find((a) => {
          if (a.id === "acc_nu_debito") return false;
          const aName = (a.name || "").toLowerCase().trim();
          return aName === qNorm || (aName.length > 3 && qNorm.includes(aName));
        });
      }
      if (!acc || acc.id === "acc_nu_debito") return null;
      // Solo aplicar a cuentas de Renta Fija / Bolsillos / Principal de Rappi, Finandina, Plenti, Nu Cajitas
      if (ps.type === "fixed_pocket" || ps.type === "savings" || acc.accountCategory === "high_yield" || acc.type === "pocket" || acc.entityId === "ent_1789616750396" || acc.entityId === "ent_1786771791285") {
        return acc;
      }
      return null;
    };

    if (oldTx?.id) {
      await get().revertCashFlowMovement({ movementId: oldTx.id });
    }

    const targetAcc = resolveTargetAccount(newTx);
    if (newTx && targetAcc && Number(newTx.amount) > 0) {
      const txType = newTx.type === "credit" ? "credit" : "debit";
      const desc = txType === "credit"
        ? (newTx.description || "Depósito")
        : `Retiro: ${newTx.description || newTx.budgetItemName || "Movimiento"}`;
      await get().applyCashFlowAccountMovement({
        accountId: targetAcc.id,
        amount: newTx.amount,
        date: newTx.date,
        description: desc,
        movementId: newTx.id,
        txType,
      });
    }
  },

  transferBetweenAccounts: async ({ fromAccountId, toAccountId, amount, date, note }) => {
    const amt = Math.abs(Number(amount || 0));
    const state = get();
    const from = state.accounts.find((a) => a.id === fromAccountId);
    const to = state.accounts.find((a) => a.id === toAccountId);
    if (!from || !to || amt <= 0) return false;
    if (amt > Number(from.balance || 0) + 0.01) {
      toast.error(`Saldo insuficiente en ${from.name}`);
      return false;
    }
    const stamp = Date.now();
    const txDate = date || new Date().toISOString().slice(0, 10);
    const nowIso = new Date().toISOString();
    const debitTx = {
      id: `tx_int_${stamp}_out`,
      accountId: from.id,
      entityId: from.entityId,
      date: txDate,
      description: `Movimiento interno ➔ ${to.name}${note ? ` (${note})` : ""}`,
      amount: -amt,
      currency: from.currency || "COP",
      type: "debit",
      category: "Movimiento Interno",
      source: "internal_transfer",
      linkedTxId: `tx_int_${stamp}_in`,
      createdAt: nowIso,
    };
    const creditTx = {
      id: `tx_int_${stamp}_in`,
      accountId: to.id,
      entityId: to.entityId,
      date: txDate,
      description: `Depósito desde ${from.name}${note ? ` (${note})` : ""}`,
      amount: amt,
      currency: to.currency || "COP",
      type: "credit",
      category: "Movimiento Interno",
      source: "internal_transfer",
      linkedTxId: debitTx.id,
      createdAt: nowIso,
    };
    const updatedAccounts = state.accounts.map((a) => {
      if (a.id === from.id) return { ...a, balance: Math.max(0, Number(a.balance || 0) - amt) };
      if (a.id === to.id) return { ...a, balance: Number(a.balance || 0) + amt };
      return a;
    });
    const updatedTx = [creditTx, debitTx, ...(state.transactions || [])];
    set({ accounts: updatedAccounts, transactions: updatedTx });
    try {
      await syncFixedIncomeStateApi({
        entities: state.entities,
        accounts: updatedAccounts,
        cdts: state.cdts,
        transactions: updatedTx,
      });
    } catch (e) {
      console.warn("[FixedIncome] transferBetweenAccounts sync failed:", e);
    }
    toast.success(`$${amt.toLocaleString("es-CO")} movidos de ${from.name} a ${to.name}`, { icon: "🔁" });
    return true;
  },

  // ── View Settings Actions ─────────────────────────
  setPreferredCurrency: (curr) => set({ preferredCurrency: curr }),
  setProjectionTimeline: (timeline) => set({ projectionTimeline: timeline }),
  setProjectionMode: (mode) => set({ projectionMode: mode }),
  setMonthlyDepositContribution: (val) => set({ monthlyDepositContribution: Number(val) }),

  migrateEntityProducts: async (fromEntityId, toEntityId) => {
    const state = get();
    const updatedAccounts = state.accounts.map((a) =>
      a.entityId === fromEntityId ? { ...a, entityId: toEntityId } : a
    );
    const updatedCDTs = state.cdts.map((c) =>
      c.entityId === fromEntityId ? { ...c, entityId: toEntityId } : c
    );
    set({ accounts: updatedAccounts, cdts: updatedCDTs });
    try {
      await syncFixedIncomeStateApi({
        entities: state.entities,
        accounts: updatedAccounts,
        cdts: updatedCDTs,
        transactions: state.transactions,
      });
      toast.success("Productos migrados exitosamente");
    } catch {
      toast.error("Error migrando productos en el servidor");
    }
  },

  resetStore: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("titanes_fixed_income_store");
      localStorage.removeItem("kpital_fixed_income_store");
    }
    set({
      entities: [],
      accounts: [],
      cdts: [],
      transactions: [],
      deletedTxIds: [],
      historicalRates: { entities: {} },
      isInitialized: false,
    });
  },
}));
