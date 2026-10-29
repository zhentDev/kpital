import { useEffect, useState, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { animate } from "animejs";
import { calculateCompoundHistory, suggestFixedIncomeRate } from "../../api/client";
import { useFixedIncomeStore } from "../../store/fixedIncomeStore";
import { BANK_PRESETS, getBankPreset, svgToDataUri } from "../../utils/bankPresets";
import {
  CurrencyInput,
  DynamicDatePicker,
  FloatingInput,
  CustomSelectDropdown,
} from "../Common";
import { useTheme } from "../../context/ThemeContext";
import "./FixedIncomeModal.css";

export default function FixedIncomeModal({
  isOpen,
  onClose,
  initialTab = "account",
  initialEntityId = null,
  editItem = null,
}) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const modalRef = useRef(null);
  const backdropRef = useRef(null);
  const bodyRef = useRef(null);

  const { entities, accounts, addEntity, updateEntity, addAccount, updateAccount, addCDT, updateCDT, addTransaction, updateTransaction } =
    useFixedIncomeStore();
  const [activeTab, setActiveTab] = useState(initialTab); // 'entity' | 'account' | 'cdt' | 'calculator' | 'transaction'

  // Entity Form State
  const [entityName, setEntityName] = useState("");
  const [entityCountry, setEntityCountry] = useState("🇨🇴");
  const [entityColor, setEntityColor] = useState("#820ad1");
  const [entityIcon, setEntityIcon] = useState("💜");
  const [entityLogoUrl, setEntityLogoUrl] = useState("");

  // Account Form State
  const [selectedEntityId, setSelectedEntityId] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState("pocket");
  const [accountSyncType, setAccountSyncType] = useState("api");
  const [accountCategory, setAccountCategory] = useState("high_yield");
  const [accountCurrency, setAccountCurrency] = useState("COP");
  const [accountBalance, setAccountBalance] = useState("");
  const [accountRateEA, setAccountRateEA] = useState("");
  const [accountTaxExempt, setAccountTaxExempt] = useState(true);
  const [accountStartDate, setAccountStartDate] = useState("2023-06-01");

  // CDT Form State
  const [cdtName, setCdtName] = useState("");
  const [cdtCapital, setCdtCapital] = useState("");
  const [cdtCurrency, setCdtCurrency] = useState("COP");
  const [cdtRateEA, setCdtRateEA] = useState("");
  const [cdtTermDays, setCdtTermDays] = useState(180);
  const [cdtStartDate, setCdtStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [cdtMaturityDate, setCdtMaturityDate] = useState("");
  const [cdtReteFuente, setCdtReteFuente] = useState(4.0);
  const [cdtAutoRenew, setCdtAutoRenew] = useState(false);
  const [cdtStatus, setCdtStatus] = useState("active");
  const [cdtPayoutAmount, setCdtPayoutAmount] = useState("");
  const [cdtPayoutDate, setCdtPayoutDate] = useState("");
  const [cdtCategory, setCdtCategory] = useState("");
  const [cdtAvailableTiers, setCdtAvailableTiers] = useState([]);
  const [suggestedRateLabel, setSuggestedRateLabel] = useState("");

  // Transaction / Manual Movement State
  const [txAccountId, setTxAccountId] = useState("");
  const [txDate, setTxDate] = useState(new Date().toISOString().slice(0, 10));
  const [txTime, setTxTime] = useState(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
  const [txDescription, setTxDescription] = useState("");
  const [txType, setTxType] = useState("credit"); // 'credit' | 'debit'
  const [txAmount, setTxAmount] = useState("");
  const [txUpdateAccountBalance, setTxUpdateAccountBalance] = useState(true);

  // Historical Aportes Calculator State
  const [calcEntityId, setCalcEntityId] = useState("");
  const [calcAccountName, setCalcAccountName] = useState("");
  const [calcDeposits, setCalcDeposits] = useState([
    { id: 1, date: new Date().toISOString().slice(0, 10), amount: "" },
  ]);
  const [calcResult, setCalcResult] = useState(null);
  const [isCalculating, setIsCalculating] = useState(false);

  // Memoized options for CustomSelectDropdown (includes existing entities + all traditional/modern bank presets)
  const entityOptions = useMemo(() => {
    const existing = entities.map((e) => ({
      value: e.id,
      label: e.name,
      country: e.country,
      icon: e.icon,
      color: e.color,
      badge: "En Portafolio",
      logoUrl: e.logoUrl || (e.name ? svgToDataUri(getBankPreset(e.name)?.logoSvg) : null),
    }));

    const existingNames = new Set(
      entities.map((e) => (e.name || "").toLowerCase().replace(/banco\s+/g, "").trim())
    );

    const availablePresets = BANK_PRESETS.filter((bp) => {
      const cleanBp = bp.name.toLowerCase().replace(/banco\s+/g, "").trim();
      return (
        !existingNames.has(cleanBp) &&
        !entities.some((e) => e.id === `ent_${bp.id}` || e.id === bp.id)
      );
    }).map((bp) => ({
      value: `preset_${bp.id}`,
      label: bp.name,
      country: bp.country,
      icon: bp.icon,
      color: bp.color,
      badge: `+ Nuevo (${bp.defaultRateEA}% E.A.)`,
      isPreset: true,
      logoUrl: svgToDataUri(bp.logoSvg),
    }));

    return [...existing, ...availablePresets];
  }, [entities]);

  // Current entity or preset data for auto-suggestions
  const currentSelectedPreset = useMemo(() => {
    if (!selectedEntityId) return null;
    if (selectedEntityId.startsWith("preset_")) {
      const pId = selectedEntityId.replace("preset_", "");
      return getBankPreset(pId);
    }
    const found = entities.find((e) => e.id === selectedEntityId);
    if (found) {
      return getBankPreset(found.name);
    }
    return null;
  }, [selectedEntityId, entities]);

  const suggestedProducts = currentSelectedPreset?.suggestedProducts || [];

  // Default active interest rate for the chosen entity / preset
  const entityDefaultRate = useMemo(() => {
    if (!selectedEntityId) return "10.0";
    if (selectedEntityId.startsWith("preset_")) {
      const pId = selectedEntityId.replace("preset_", "");
      const preset = getBankPreset(pId);
      return preset?.defaultRateEA !== undefined ? String(preset.defaultRateEA) : "10.0";
    }
    const found = entities.find((e) => e.id === selectedEntityId);
    if (found) {
      // Check if user already has an active account with a rate in this entity
      const existingRateAcc = accounts.find(
        (a) => a.entityId === selectedEntityId && Number(a.interestRateEA || 0) > 0
      );
      if (existingRateAcc) {
        return String(existingRateAcc.interestRateEA);
      }
      const preset = getBankPreset(found.name);
      if (preset?.defaultRateEA !== undefined) {
        return String(preset.defaultRateEA);
      }
    }
    return "10.0";
  }, [selectedEntityId, entities, accounts]);
  const suggestedCdtProducts = useMemo(() => {
    const filtered = suggestedProducts.filter((p) =>
      p.toLowerCase().includes("cdt") ||
      p.toLowerCase().includes("congelad") ||
      p.toLowerCase().includes("plazo") ||
      p.toLowerCase().includes("cdat")
    );
    if (filtered.length === 0 && currentSelectedPreset) {
      return [`CDT ${currentSelectedPreset.name}`];
    }
    return filtered;
  }, [suggestedProducts, currentSelectedPreset]);

  const accountOptions = useMemo(() => {
    return accounts.map((acc) => {
      const ent = entities.find((e) => e.id === acc.entityId);
      const logo = ent?.logoUrl || (ent?.name ? svgToDataUri(getBankPreset(ent.name)?.logoSvg) : null);
      return {
        value: acc.id,
        label: `${ent?.name || "Banco"} — ${acc.name}`,
        badge: `$${Number(acc.balance || 0).toLocaleString("en-US")} ${acc.currency}`,
        icon: ent?.icon,
        logoUrl: logo,
      };
    });
  }, [accounts, entities]);

  const bankPresetOptions = useMemo(() => {
    return BANK_PRESETS.map((bp) => ({
      value: bp.id,
      label: bp.name,
      badge: `${bp.defaultRateEA}% E.A.`,
      country: bp.country,
      icon: bp.icon,
      logoUrl: svgToDataUri(bp.logoSvg),
    }));
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      if (modalRef.current) {
        animate(modalRef.current, {
          scale: [0.94, 1],
          opacity: [0, 1],
          translateY: [16, 0],
          duration: 320,
          ease: "out(3)",
        });
      }
      if (backdropRef.current) {
        animate(backdropRef.current, {
          opacity: [0, 1],
          duration: 240,
          ease: "out(2)",
        });
      }
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && bodyRef.current) {
      animate(bodyRef.current, {
        opacity: [0.35, 1],
        translateY: [6, 0],
        duration: 220,
        ease: "out(2)",
      });
    }
  }, [activeTab, isOpen]);

  useEffect(() => {
    setActiveTab(initialTab);
    if (initialEntityId) {
      setSelectedEntityId(initialEntityId);
      setCalcEntityId(initialEntityId);
    } else if (!selectedEntityId) {
      if (entities.length > 0) {
        setSelectedEntityId(entities[0].id);
        setCalcEntityId(entities[0].id);
      } else if (entityOptions.length > 0) {
        setSelectedEntityId(entityOptions[0].value);
        setCalcEntityId(entityOptions[0].value);
      }
    }
  }, [initialTab, initialEntityId, entities, entityOptions, isOpen]);

  // Pre-fill form fields when editing an existing item, or reset if creating new
  useEffect(() => {
    if (!isOpen) return;

    if (!editItem) {
      if (initialTab === "entity") {
        setEntityName("");
        setEntityCountry("🇨🇴");
        setEntityColor("#820ad1");
        setEntityIcon("💜");
        setEntityLogoUrl("");
      } else if (initialTab === "account") {
        setAccountName("");
        setAccountType("pocket");
        setAccountSyncType("api");
        setAccountCategory("high_yield");
        setAccountCurrency("COP");
        setAccountBalance("");
        setAccountRateEA(entityDefaultRate || "10.0");
        setAccountTaxExempt(true);
        setAccountStartDate("2023-06-01");
      } else if (initialTab === "cdt") {
        setCdtName("");
        setCdtCapital("");
        setCdtCurrency("COP");
        setCdtRateEA("");
        setCdtTermDays(180);
        setCdtStartDate(new Date().toISOString().slice(0, 10));
        setCdtMaturityDate("");
        setCdtReteFuente(4.0);
        setCdtAutoRenew(false);
        setCdtStatus("active");
        setCdtPayoutAmount("");
        setCdtPayoutDate("");
        setCdtCategory("");
      } else if (initialTab === "transaction") {
        setTxAccountId(accounts[0]?.id || "");
        setTxDate(new Date().toISOString().slice(0, 10));
        setTxDescription("");
        setTxType("credit");
        setTxAmount("");
        setTxUpdateAccountBalance(true);
      }
      return;
    }

    if (initialTab === "entity") {
      setEntityName(editItem.name || "");
      setEntityCountry(editItem.country || "🇨🇴");
      setEntityColor(editItem.color || "#820ad1");
      setEntityIcon(editItem.icon || "💜");
      setEntityLogoUrl(editItem.logoUrl || svgToDataUri(getBankPreset(editItem.name).logoSvg));
    } else if (initialTab === "account") {
      setSelectedEntityId(editItem.entityId || "");
      setAccountName(editItem.name || "");
      setAccountType(editItem.type || "pocket");
      setAccountSyncType(editItem.syncType || "api");
      setAccountCategory(
        editItem.accountCategory ||
        (editItem.type === "wallet" || Number(editItem.interestRateEA || 0) === 0 ? "digital_wallet" : "high_yield")
      );
      setAccountCurrency(editItem.currency || "COP");
      setAccountBalance(String(editItem.balance || ""));
      setAccountRateEA(String(editItem.interestRateEA || ""));
      setAccountTaxExempt(editItem.isTaxExemptGMF ?? true);
      setAccountStartDate(editItem.startDate || (editItem.createdAt ? editItem.createdAt.slice(0, 10) : "2023-06-01"));
    } else if (initialTab === "cdt") {
      setSelectedEntityId(editItem.entityId || "");
      setCdtName(editItem.name || "");
      setCdtCapital(String(editItem.capital || ""));
      setCdtCurrency(editItem.currency || "COP");
      setCdtRateEA(String(editItem.interestRateEA || ""));
      setCdtTermDays(editItem.termDays || 180);
      setCdtStartDate(editItem.startDate || new Date().toISOString().slice(0, 10));
      setCdtMaturityDate(editItem.maturityDate || "");
      setCdtReteFuente(editItem.reteFuentePct ?? 4.0);
      setCdtAutoRenew(editItem.isAutoRenew || false);
      setCdtStatus(editItem.status || "active");
      setCdtPayoutAmount(String(editItem.payoutAmount || ""));
      setCdtPayoutDate(editItem.payoutDate || "");
      setCdtCategory(editItem.category || "");
    } else if (initialTab === "transaction" || editItem.accountId) {
      setTxAccountId(editItem.accountId || accounts[0]?.id || "");
      setTxDate(editItem.date || new Date().toISOString().slice(0, 10));
      setTxTime(
        editItem.time ||
        (editItem.createdAt ? editItem.createdAt.slice(11, 16) : new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }))
      );
      setTxDescription(editItem.description || "");
      setTxType(editItem.type || "credit");
      setTxAmount(editItem.amount ? String(Math.abs(Number(editItem.amount))) : "");
      setTxUpdateAccountBalance(true);
    }
  }, [editItem, isOpen, initialTab, accounts]);

  const handleSaveTransaction = async (e) => {
    e.preventDefault();
    if (!txAccountId) {
      toast.error("Selecciona una cuenta de ahorro o bolsillo");
      return;
    }
    const numAmt = Number(txAmount);
    if (!numAmt || numAmt <= 0) {
      toast.error("Ingresa un monto válido mayor a 0");
      return;
    }
    const targetAcc = accounts.find((a) => a.id === txAccountId);
    const signedAmount = txType === "credit" ? numAmt : -numAmt;
    const defaultDesc = txType === "credit" ? `Aporte a ${targetAcc?.name || "Cajita"}` : `Retiro de ${targetAcc?.name || "Cajita"}`;

    if (editItem && editItem.id) {
      // Editing existing transaction
      const oldSignedAmount = Number(editItem.amount || 0);
      const delta = signedAmount - oldSignedAmount;

      await updateTransaction({
        id: editItem.id,
        accountId: txAccountId,
        date: txDate,
        time: txTime ? (txTime.length === 5 ? `${txTime}:00` : txTime) : null,
        description: txDescription.trim() || defaultDesc,
        amount: signedAmount,
        type: txType,
        currency: targetAcc?.currency || "COP",
      });

      if (txUpdateAccountBalance) {
        if (editItem.accountId === txAccountId && targetAcc) {
          const newBal = Math.max(0, (targetAcc.balance || 0) + delta);
          await updateAccount({ ...targetAcc, balance: newBal });
        } else {
          // Changed account: revert from old, add to new
          const oldAcc = accounts.find((a) => a.id === editItem.accountId);
          if (oldAcc) {
            await updateAccount({ ...oldAcc, balance: Math.max(0, (oldAcc.balance || 0) - oldSignedAmount) });
          }
          if (targetAcc) {
            await updateAccount({ ...targetAcc, balance: Math.max(0, (targetAcc.balance || 0) + signedAmount) });
          }
        }
      }

      toast.success("Movimiento actualizado correctamente");
    } else {
      // Creating new transaction
      await addTransaction({
        accountId: txAccountId,
        date: txDate,
        time: txTime ? (txTime.length === 5 ? `${txTime}:00` : txTime) : null,
        description: txDescription.trim() || defaultDesc,
        amount: signedAmount,
        type: txType,
        currency: targetAcc?.currency || "COP",
      });

      if (txUpdateAccountBalance && targetAcc) {
        const newBal = Math.max(0, (targetAcc.balance || 0) + signedAmount);
        await updateAccount({ ...targetAcc, balance: newBal });
      }

      toast.success(`Movimiento registrado: ${txType === "credit" ? "+" : "-"}$${numAmt.toLocaleString("en-US")} COP`);
    }

    setTxDescription("");
    setTxAmount("");
    onClose();
  };

  // Suggest rates when entity, product type, or term changes
  useEffect(() => {
    if (!selectedEntityId) return;

    if (activeTab === "cdt") {
      suggestFixedIncomeRate(selectedEntityId, "cdt", cdtTermDays, cdtStartDate).then((res) => {
        if (res?.rateEA && !cdtRateEA) {
          setCdtRateEA(String(res.rateEA));
        }
        if (res?.tiers) {
          setCdtAvailableTiers(res.tiers);
        }
        if (res?.label) {
          setSuggestedRateLabel(res.label);
        }
      });
    } else if (activeTab === "account") {
      if (accountCategory === "payroll" || accountCategory === "digital_wallet") {
        setAccountRateEA("0");
      } else {
        if (!accountRateEA || accountRateEA === "0") {
          setAccountRateEA(entityDefaultRate);
        }
        suggestFixedIncomeRate(
          selectedEntityId,
          accountType,
          null,
          new Date().toISOString().slice(0, 10),
        ).then((res) => {
          if (res?.rateEA) {
            setAccountRateEA(String(res.rateEA));
          }
          if (res?.label) {
            setSuggestedRateLabel(res.label);
          }
        }).catch(() => {});
      }
    }
  }, [selectedEntityId, activeTab, cdtTermDays, cdtStartDate, accountType, accountCategory, entityDefaultRate]);

  // Auto-calculate maturity date when term or start date changes
  useEffect(() => {
    if (cdtStartDate && cdtTermDays) {
      const d = new Date(cdtStartDate);
      d.setDate(d.getDate() + Number(cdtTermDays));
      setCdtMaturityDate(d.toISOString().slice(0, 10));
    }
  }, [cdtStartDate, cdtTermDays]);

  if (!isOpen) return null;

  const handleSaveEntity = async (e) => {
    e.preventDefault();
    if (!entityName.trim()) {
      toast.error("Ingresa el nombre de la entidad");
      return;
    }
    const finalLogo = entityLogoUrl || svgToDataUri(getBankPreset(entityName).logoSvg);
    if (editItem?.id) {
      await updateEntity({
        id: editItem.id,
        name: entityName,
        country: entityCountry,
        color: entityColor,
        icon: entityIcon,
        logoUrl: finalLogo,
      });
    } else {
      await addEntity({
        name: entityName,
        country: entityCountry,
        color: entityColor,
        icon: entityIcon,
        logoUrl: finalLogo,
      });
    }
    setEntityName("");
    setEntityLogoUrl("");
    onClose();
  };

  const handleSaveAccount = async (e) => {
    e.preventDefault();
    if (!selectedEntityId) {
      toast.error("Selecciona una entidad");
      return;
    }
    if (!accountName.trim()) {
      toast.error("Ingresa el nombre de la cuenta o bolsillo");
      return;
    }

    let finalEntityId = selectedEntityId;
    if (selectedEntityId.startsWith("preset_")) {
      const pId = selectedEntityId.replace("preset_", "");
      const bp = getBankPreset(pId);
      const existingEnt = entities.find(
        (ent) => (ent.name || "").toLowerCase() === (bp.name || "").toLowerCase()
      );
      if (existingEnt) {
        finalEntityId = existingEnt.id;
      } else {
        const newEnt = await addEntity({
          name: bp.name,
          country: bp.country,
          color: bp.color,
          icon: bp.icon,
          logoUrl: svgToDataUri(bp.logoSvg),
        });
        finalEntityId = newEnt?.id || `ent_${Date.now()}`;
      }
    }

    const isZeroYield = accountCategory === "digital_wallet" || accountCategory === "payroll";
    const accountData = {
      entityId: finalEntityId,
      name: accountName,
      type: accountCategory === "digital_wallet" ? "wallet" : accountType,
      syncType: accountSyncType,
      accountCategory,
      currency: accountCurrency,
      balance: Number(accountBalance || 0),
      interestRateEA: isZeroYield ? 0 : Number(accountRateEA || 0),
      isTaxExemptGMF: accountTaxExempt,
      startDate: accountStartDate,
      createdAt: editItem?.createdAt || `${accountStartDate}T00:00:00.000Z`,
    };
    if (editItem?.id) {
      await updateAccount({ ...accountData, id: editItem.id });
    } else {
      await addAccount(accountData);
    }
    setAccountName("");
    setAccountBalance("");
    setAccountRateEA("");
    onClose();
  };

  const handleSaveCDT = async (e) => {
    e.preventDefault();
    if (!selectedEntityId) {
      toast.error("Selecciona una entidad");
      return;
    }
    if (!cdtName.trim()) {
      toast.error("Ingresa el nombre del CDT");
      return;
    }
    if (!cdtCapital || Number(cdtCapital) <= 0) {
      toast.error("Ingresa un capital válido");
      return;
    }

    let finalEntityId = selectedEntityId;
    if (selectedEntityId.startsWith("preset_")) {
      const pId = selectedEntityId.replace("preset_", "");
      const bp = getBankPreset(pId);
      const existingEnt = entities.find(
        (ent) => (ent.name || "").toLowerCase() === (bp.name || "").toLowerCase()
      );
      if (existingEnt) {
        finalEntityId = existingEnt.id;
      } else {
        const newEnt = await addEntity({
          name: bp.name,
          country: bp.country,
          color: bp.color,
          icon: bp.icon,
          logoUrl: svgToDataUri(bp.logoSvg),
        });
        finalEntityId = newEnt?.id || `ent_${Date.now()}`;
      }
    }

    const cdtData = {
      entityId: finalEntityId,
      name: cdtName,
      capital: Number(cdtCapital),
      currency: cdtCurrency,
      interestRateEA: Number(cdtRateEA || 0),
      termDays: Number(cdtTermDays),
      startDate: cdtStartDate,
      maturityDate: cdtMaturityDate,
      reteFuentePct: Number(cdtReteFuente),
      isAutoRenew: cdtAutoRenew,
      status: cdtStatus,
      category: cdtCategory || undefined,
      ...(cdtStatus === "matured" ? {
        payoutAmount: Number(cdtPayoutAmount || 0),
        payoutDate: cdtPayoutDate || cdtMaturityDate,
        netProfit: Number(cdtPayoutAmount || 0) - Number(cdtCapital || 0),
      } : {}),
    };
    if (editItem?.id) {
      await updateCDT({ ...cdtData, id: editItem.id });
    } else {
      await addCDT(cdtData);
    }
    setCdtName("");
    setCdtCapital("");
    setCdtRateEA("");
    setCdtPayoutAmount("");
    setCdtPayoutDate("");
    setCdtCategory("");
    setCdtStatus("active");
    onClose();
  };

  // Add Deposit row in historical calculator
  const addDepositRow = () => {
    setCalcDeposits([
      ...calcDeposits,
      { id: Date.now(), date: new Date().toISOString().slice(0, 10), amount: "" },
    ]);
  };

  const removeDepositRow = (id) => {
    if (calcDeposits.length <= 1) return;
    setCalcDeposits(calcDeposits.filter((d) => d.id !== id));
  };

  const updateDepositRow = (id, field, value) => {
    setCalcDeposits(calcDeposits.map((d) => (d.id === id ? { ...d, [field]: value } : d)));
  };

  const handleCalculateHistoricalCompounding = async () => {
    const validDeposits = calcDeposits
      .filter((d) => d.date && Number(d.amount) > 0)
      .map((d) => ({ date: d.date, amount: Number(d.amount) }));

    if (validDeposits.length === 0) {
      toast.error("Ingresa al menos un aporte con fecha y monto");
      return;
    }

    setIsCalculating(true);
    try {
      const res = await calculateCompoundHistory(calcEntityId, validDeposits);
      setCalcResult(res);
      toast.success("Cálculo histórico completado");
    } catch (e) {
      toast.error("Error calculando interés histórico");
    } finally {
      setIsCalculating(false);
    }
  };

  const handleSaveCalculatedAccount = async () => {
    if (!calcResult || !calcResult.currentAccumulatedBalance) return;
    const name = calcAccountName.trim() || "Cuenta Ahorro (Calculada)";
    await addAccount({
      entityId: calcEntityId,
      name: name,
      type: "pocket",
      currency: "COP",
      balance: calcResult.currentAccumulatedBalance,
      interestRateEA: 12.0,
      isTaxExemptGMF: true,
    });
    setCalcResult(null);
    onClose();
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={backdropRef}
      className="fi-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Container with FIXED Height and Width so switching tabs NEVER shifts position */}
      <div
        ref={modalRef}
        className="fi-modal-container"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Tabs */}
        <div className="fi-modal-header-tabs">
          <button
            type="button"
            onClick={() => setActiveTab("account")}
            className={`fi-modal-tab-btn ${activeTab === "account" ? "active-account" : ""}`}
          >
            💰 Cuenta / Bolsillo
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("cdt")}
            className={`fi-modal-tab-btn ${activeTab === "cdt" ? "active-cdt" : ""}`}
          >
            📜 CDT / Plazo Fijo
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("calculator")}
            className={`fi-modal-tab-btn ${activeTab === "calculator" ? "active-calculator" : ""}`}
          >
            🧮 Aportes por Fecha
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("transaction")}
            className={`fi-modal-tab-btn ${activeTab === "transaction" ? "active-transaction" : ""}`}
          >
            💸 + Movimiento
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("entity")}
            className={`fi-modal-tab-btn ${activeTab === "entity" ? "active-entity" : ""}`}
          >
            🏦 + Entidad
          </button>
        </div>

        {/* Content Body */}
        <div ref={bodyRef} className="fi-modal-body">
          {/* TAB 1: CUENTA / BOLSILLO */}
          {activeTab === "account" && (
            <form
              onSubmit={handleSaveAccount}
              style={{ display: "flex", flexDirection: "column", gap: 14, height: "100%" }}
            >
              <div>
                <label className="fi-form-label">
                  Entidad Bancaria
                </label>
                <CustomSelectDropdown
                  options={entityOptions}
                  value={selectedEntityId}
                  onChange={(val) => setSelectedEntityId(val)}
                  placeholder="Selecciona una entidad..."
                />
              </div>

              <div>
                <FloatingInput
                  label="Nombre del Producto / Bolsillo"
                  placeholder="ej. Cuentamiga, Cuenta de Rendimiento, Bolsillo Viajes"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  required
                />
                {suggestedProducts.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                    <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", alignSelf: "center" }}>
                      Sugerencias {currentSelectedPreset?.name || "Entidad"}:
                    </span>
                    {suggestedProducts.map((pName) => (
                      <button
                        key={pName}
                        type="button"
                        onClick={() => {
                          setAccountName(pName);
                          if ((!accountRateEA || accountRateEA === "0") && accountCategory === "high_yield") {
                            setAccountRateEA(entityDefaultRate);
                          }
                        }}
                        className={`fi-tier-chip ${accountName === pName ? "selected" : ""}`}
                        style={{ fontSize: "0.72rem", padding: "2px 8px" }}
                      >
                        {pName}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Sync Mode & Financial Category */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label className="fi-form-label">
                    Modo de Registro
                  </label>
                  <select
                    value={accountSyncType}
                    onChange={(e) => setAccountSyncType(e.target.value)}
                    className="fi-select"
                  >
                    <option value="api">🤖 Automático (API / Notificaciones Móvil)</option>
                    <option value="manual">✍️ Manual (Movimientos a mano)</option>
                  </select>
                </div>
                <div>
                  <label className="fi-form-label">
                    Categoría Financiera
                  </label>
                  <select
                    value={accountCategory}
                    onChange={(e) => {
                      const cat = e.target.value;
                      setAccountCategory(cat);
                      if (cat === "digital_wallet") {
                        setAccountRateEA("0");
                        setAccountType("wallet");
                      } else if (cat === "payroll") {
                        setAccountRateEA("0");
                        setAccountType("savings");
                      }
                    }}
                    className="fi-select"
                  >
                    <option value="high_yield">⚡ Ahorro Alto Rendimiento (Intereses E.A.)</option>
                    <option value="digital_wallet">👛 Billetera Digital / Bajo Monto (Nequi, Daviplata - 0% E.A.)</option>
                    <option value="payroll">💼 Nómina / Débito Transaccional (0.0% E.A.)</option>
                    <option value="cash">💵 Efectivo / Caja Menor (Manual)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label className="fi-form-label">
                    Tipo
                  </label>
                  <select
                    value={accountType}
                    onChange={(e) => setAccountType(e.target.value)}
                    className="fi-select"
                  >
                    <option value="pocket">⚡ Bolsillo / Cajita</option>
                    <option value="savings">💳 Cuenta de Ahorro / Nómina</option>
                    <option value="wallet">💵 Billetera / Cash Yield</option>
                  </select>
                </div>
                <div>
                  <label className="fi-form-label">
                    Divisa
                  </label>
                  <select
                    value={accountCurrency}
                    onChange={(e) => setAccountCurrency(e.target.value)}
                    className="fi-select"
                  >
                    <option value="COP">COP ($)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="USDC">USDC (Stablecoin)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label className="fi-form-label">
                    Saldo Actual
                  </label>
                  <CurrencyInput
                    currency={accountCurrency}
                    value={accountBalance}
                    onChange={(val) => setAccountBalance(val !== "" ? String(val) : "")}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="fi-form-label">
                    Tasa Efectiva Anual (E.A. %)
                  </label>
                  {accountCategory === "digital_wallet" ? (
                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: 8,
                        background: isLight ? "rgba(168, 85, 247, 0.08)" : "rgba(168, 85, 247, 0.15)",
                        border: "1px dashed rgba(168, 85, 247, 0.35)",
                        fontSize: "0.78rem",
                        color: "var(--text-secondary)",
                      }}
                    >
                      <span>👛 <strong>0.00% E.A.</strong> — Billetera tradicional de bajo monto sin rendimiento. Solo para entradas y salidas cotidianas.</span>
                    </div>
                  ) : accountCategory === "payroll" ? (
                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: 8,
                        background: isLight ? "rgba(59, 130, 246, 0.08)" : "rgba(59, 130, 246, 0.15)",
                        border: "1px dashed rgba(59, 130, 246, 0.35)",
                        fontSize: "0.78rem",
                        color: "var(--text-secondary)",
                      }}
                    >
                      <span>💼 <strong>0.00% E.A.</strong> — Cuenta de nómina / débito transaccional sin rendimiento. Los rendimientos se generan exclusivamente en las cajitas o bolsillos.</span>
                    </div>
                  ) : (
                    <FloatingInput
                      type="number"
                      step="0.01"
                      placeholder="ej. 12.0"
                      suffix="% E.A."
                      value={accountRateEA}
                      onChange={(e) => setAccountRateEA(e.target.value)}
                      required
                    />
                  )}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label className="fi-form-label">
                    Fecha Apertura / Inicio
                  </label>
                  <DynamicDatePicker
                    value={accountStartDate}
                    onChange={(iso) => setAccountStartDate(iso)}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", paddingTop: 16 }}>
                  <label className="fi-checkbox-label">
                    <input
                      type="checkbox"
                      checked={accountTaxExempt}
                      onChange={(e) => setAccountTaxExempt(e.target.checked)}
                    />
                    <span>Exenta de 4x1000 (GMF)</span>
                  </label>
                </div>
              </div>

              {/* Pinned Footer at Bottom */}
              <div className="fi-modal-footer">
                <button
                  type="button"
                  onClick={onClose}
                  className="fi-btn-cancel"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    padding: "8px 20px",
                    borderRadius: 8,
                    background: "#10b981",
                    border: "none",
                    color: "#000",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {editItem ? "Guardar Cambios" : "Guardar Cuenta"}
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: CDT / PLAZO FIJO */}
          {activeTab === "cdt" && (
            <form
              onSubmit={handleSaveCDT}
              style={{ display: "flex", flexDirection: "column", gap: 14, height: "100%" }}
            >
              <div>
                <label className="fi-form-label">
                  Entidad Emisora
                </label>
                <CustomSelectDropdown
                  options={entityOptions}
                  value={selectedEntityId}
                  onChange={(val) => setSelectedEntityId(val)}
                  placeholder="Selecciona una entidad..."
                />
              </div>

              {/* Nu/Bank Term Chips for Instant Plazo & Rate Selection */}
              {cdtAvailableTiers.length > 0 && (
                <div>
                  <div className="fi-form-label" style={{ fontSize: "0.74rem", marginBottom: 6 }}>
                    Plazos y Tasas Sugeridas para esta Entidad:
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {cdtAvailableTiers.map((tier, idx) => {
                      const isSelected =
                        (cdtTermDays >= tier.termDaysMin && cdtTermDays <= tier.termDaysMax) ||
                        cdtTermDays === tier.termDaysMax;
                      return (
                        <button
                          type="button"
                          key={idx}
                          onClick={() => {
                            const discreteDays = [60, 90, 120, 180, 270, 360, 540, 720, 1080].find(
                              (d) => d >= tier.termDaysMin && d <= tier.termDaysMax
                            ) || tier.termDaysMin;
                            setCdtTermDays(discreteDays);
                            setCdtRateEA(String(tier.rateEA));
                          }}
                          className={`fi-tier-chip ${isSelected ? "selected" : ""}`}
                        >
                          {tier.label}: {tier.rateEA}% E.A.
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <FloatingInput
                  label="Nombre / Identificador del CDT"
                  placeholder="ej. CDT Caja Social Tasa Fija, CDT Nu Congelada 180 Días, CDT Pibank"
                  value={cdtName}
                  onChange={(e) => setCdtName(e.target.value)}
                  required
                />
                {suggestedCdtProducts.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                    <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", alignSelf: "center" }}>
                      Sugerencias CDT {currentSelectedPreset?.name || "Entidad"}:
                    </span>
                    {suggestedCdtProducts.map((pName) => (
                      <button
                        key={pName}
                        type="button"
                        onClick={() => setCdtName(pName)}
                        className={`fi-tier-chip ${cdtName === pName ? "selected" : ""}`}
                        style={{ fontSize: "0.72rem", padding: "2px 8px" }}
                      >
                        {pName}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label className="fi-form-label">
                    Capital Invertido
                  </label>
                  <CurrencyInput
                    currency={cdtCurrency}
                    value={cdtCapital}
                    onChange={(val) => setCdtCapital(val !== "" ? String(val) : "")}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="fi-form-label">
                    Tasa Pactada (E.A. %)
                  </label>
                  <FloatingInput
                    type="number"
                    step="0.01"
                    placeholder="ej. 12.2"
                    suffix="% E.A."
                    value={cdtRateEA}
                    onChange={(e) => setCdtRateEA(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.75rem",
                      color: "#94a3b8",
                      marginBottom: 4,
                    }}
                  >
                    Plazo (Días)
                  </label>
                  <FloatingInput
                    type="number"
                    value={cdtTermDays}
                    onChange={(e) => setCdtTermDays(Number(e.target.value))}
                    required
                  />
                </div>
                <div>
                  <label className="fi-form-label">
                    Fecha Apertura
                  </label>
                  <DynamicDatePicker
                    value={cdtStartDate}
                    onChange={(iso) => setCdtStartDate(iso)}
                  />
                </div>
                <div>
                  <label className="fi-form-label">
                    Vencimiento (Auto)
                  </label>
                  <DynamicDatePicker
                    value={cdtMaturityDate}
                    onChange={(iso) => setCdtMaturityDate(iso)}
                    align="right"
                    disabled
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label className="fi-form-label">
                    Retención en la Fuente (%)
                  </label>
                  <FloatingInput
                    type="number"
                    step="0.1"
                    suffix="%"
                    value={cdtReteFuente}
                    onChange={(e) => setCdtReteFuente(Number(e.target.value))}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", paddingTop: 18 }}>
                  <label className="fi-checkbox-label">
                    <input
                      type="checkbox"
                      checked={cdtAutoRenew}
                      onChange={(e) => setCdtAutoRenew(e.target.checked)}
                    />
                    <span>Auto-Renovable al Vencer</span>
                  </label>
                </div>
              </div>

              {/* Estado y Categoría (solo visible en modo edición) */}
              {editItem?.id && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label className="fi-form-label">
                        Estado
                      </label>
                      <select
                        value={cdtStatus}
                        onChange={(e) => setCdtStatus(e.target.value)}
                        className="fi-select"
                        style={{
                          color: cdtStatus === "matured" ? (isLight ? "#92400e" : "#f59e0b") : "#10b981",
                          fontWeight: 600,
                        }}
                      >
                        <option value="active">🟢 Activo</option>
                        <option value="matured">🟡 Vencido / Liquidado</option>
                      </select>
                    </div>
                    <div>
                      <FloatingInput
                        label="Categoría / Bolsa"
                        placeholder="ej. Viaje, Estudios, Deuda"
                        value={cdtCategory}
                        onChange={(e) => setCdtCategory(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Campos de Liquidación (solo si status === matured) */}
                  {cdtStatus === "matured" && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div>
                        <label className="fi-form-label">
                          Monto de Salida ($)
                        </label>
                        <CurrencyInput
                          currency={cdtCurrency}
                          value={cdtPayoutAmount}
                          onChange={(val) => setCdtPayoutAmount(val !== "" ? String(val) : "")}
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="fi-form-label">
                          Fecha Liquidación
                        </label>
                        <DynamicDatePicker
                          value={cdtPayoutDate}
                          onChange={(iso) => setCdtPayoutDate(iso)}
                          align="right"
                        />
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Pinned Footer at Bottom */}
              <div className="fi-modal-footer">
                <button
                  type="button"
                  onClick={onClose}
                  className="fi-btn-cancel"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    padding: "8px 20px",
                    borderRadius: 8,
                    background: "#f59e0b",
                    border: "none",
                    color: "#000",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {editItem ? "Guardar Cambios" : "Registrar CDT"}
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: APORTES HISTÓRICOS CALCULATOR */}
          {activeTab === "calculator" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, height: "100%" }}>
              <div>
                <label className="fi-form-label">
                  Entidad Bancaria
                </label>
                <CustomSelectDropdown
                  options={entityOptions}
                  value={calcEntityId}
                  onChange={(val) => setCalcEntityId(val)}
                  placeholder="Selecciona una entidad..."
                />
              </div>

              <div>
                <FloatingInput
                  label="Nombre de la Cuenta (Opcional)"
                  placeholder="ej. Cuenta Principal Nu"
                  value={calcAccountName}
                  onChange={(e) => setCalcAccountName(e.target.value)}
                />
              </div>

              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 6,
                  }}
                >
                  <span className="fi-form-label" style={{ marginBottom: 0 }}>
                    Aportes Realizados (Fecha y Monto):
                  </span>
                  <button
                    type="button"
                    onClick={addDepositRow}
                    style={{
                      background: "rgba(192, 132, 252, 0.15)",
                      border: "1px solid #c084fc",
                      color: "#c084fc",
                      borderRadius: 6,
                      padding: "2px 8px",
                      fontSize: "0.7rem",
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    + Agregar Aporte
                  </button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {calcDeposits.map((dep, idx) => (
                    <div key={dep.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: "0.75rem", color: "#64748b", minWidth: 20 }}>
                        #{idx + 1}
                      </span>
                      <div style={{ flex: 1 }}>
                        <DynamicDatePicker
                          value={dep.date}
                          onChange={(iso) => updateDepositRow(dep.id, "date", iso)}
                        />
                      </div>
                      <div style={{ flex: 1.2 }}>
                        <CurrencyInput
                          currency="COP"
                          value={dep.amount}
                          onChange={(val) => updateDepositRow(dep.id, "amount", val !== "" ? String(val) : "")}
                          placeholder="Monto ($)"
                        />
                      </div>
                      {calcDeposits.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeDepositRow(dep.id)}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "#ef4444",
                            cursor: "pointer",
                            fontSize: "0.85rem",
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={handleCalculateHistoricalCompounding}
                disabled={isCalculating}
                style={{
                  padding: "10px 16px",
                  borderRadius: 8,
                  background: "linear-gradient(135deg, #a855f7 0%, #6366f1 100%)",
                  border: "none",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "0.85rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                {isCalculating
                  ? "Calculando curva histórica..."
                  : "⚡ Calcular Saldo Actual con Tasas Históricas"}
              </button>

              {/* Calculated Result Box */}
              {calcResult && (
                <div className="fi-info-box">
                  <div
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      marginBottom: 6,
                    }}
                  >
                    Resultado Crecimiento:
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, 1fr)",
                      gap: 8,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "0.68rem", opacity: 0.8 }}>Capital:</div>
                      <div
                        className="mono"
                        style={{ fontSize: "0.85rem", fontWeight: 700 }}
                      >
                        ${calcResult.totalContributedCapital.toLocaleString("en-US")}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "0.68rem", opacity: 0.8 }}>Intereses:</div>
                      <div
                        className="mono"
                        style={{ fontSize: "0.85rem", fontWeight: 700, color: "#10b981" }}
                      >
                        +${calcResult.totalInterestsEarned.toLocaleString("en-US")}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "0.68rem", opacity: 0.8 }}>Saldo Actual:</div>
                      <div
                        className="mono"
                        style={{ fontSize: "0.9rem", fontWeight: 800, color: "#38bdf8" }}
                      >
                        ${calcResult.currentAccumulatedBalance.toLocaleString("en-US")}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Pinned Footer at Bottom */}
              <div className="fi-modal-footer">
                <button
                  type="button"
                  onClick={onClose}
                  className="fi-btn-cancel"
                >
                  Cancelar
                </button>
                {calcResult && (
                  <button
                    type="button"
                    onClick={handleSaveCalculatedAccount}
                    style={{
                      padding: "8px 20px",
                      borderRadius: 8,
                      background: "#10b981",
                      border: "none",
                      color: "#000",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    💾 Guardar Cuenta Activa
                  </button>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: NUEVA ENTIDAD */}
          {activeTab === "entity" && (
            <form
              onSubmit={handleSaveEntity}
              style={{ display: "flex", flexDirection: "column", gap: 14, height: "100%" }}
            >
              {/* Selector desplegable de Bancos y Plataformas Sugeridas */}
              <div>
                <label className="fi-form-label" style={{ color: "var(--accent-primary, #0284c7)" }}>
                  💡 Seleccionar Banco o Plataforma (Auto-completar datos):
                </label>
                <CustomSelectDropdown
                  options={bankPresetOptions}
                  placeholder="Selecciona una entidad para auto-llenar campos..."
                  value=""
                  onChange={(val) => {
                    const bp = BANK_PRESETS.find((p) => p.id === val);
                    if (bp) {
                      setEntityName(bp.name);
                      setEntityCountry(bp.country);
                      setEntityColor(bp.color);
                      setEntityIcon(bp.icon);
                      setEntityLogoUrl(svgToDataUri(bp.logoSvg));
                    }
                  }}
                />
              </div>

              <div>
                <FloatingInput
                  label="Nombre del Banco / Entidad"
                  placeholder="ej. Nu Colombia, Banco Finandina, Lulo Bank, Pibank"
                  value={entityName}
                  onChange={(e) => setEntityName(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div>
                  <label className="fi-form-label">
                    País
                  </label>
                  <select
                    value={entityCountry}
                    onChange={(e) => setEntityCountry(e.target.value)}
                    className="fi-select"
                  >
                    <option value="🇨🇴">🇨🇴 Colombia</option>
                    <option value="🇺🇸">🇺🇸 USA</option>
                    <option value="🇪🇺">🇪🇺 Europa</option>
                    <option value="🌎">🌎 Internacional</option>
                  </select>
                </div>
                <div>
                  <FloatingInput
                    label="Icono Emoji"
                    placeholder="ej. 💜"
                    value={entityIcon}
                    onChange={(e) => setEntityIcon(e.target.value)}
                  />
                </div>
                <div>
                  <label className="fi-form-label">
                    Color Distintivo
                  </label>
                  <input
                    type="color"
                    value={entityColor}
                    onChange={(e) => setEntityColor(e.target.value)}
                    style={{
                      width: "100%",
                      height: 42,
                      padding: 2,
                      borderRadius: 8,
                      border: "1px solid rgba(125,125,125,0.2)",
                      cursor: "pointer",
                      background: "transparent",
                    }}
                  />
                </div>
              </div>

              {/* Pinned Footer at Bottom */}
              <div className="fi-modal-footer">
                <button
                  type="button"
                  onClick={onClose}
                  className="fi-btn-cancel"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    padding: "8px 20px",
                    borderRadius: 8,
                    background: "#00e5ff",
                    border: "none",
                    color: "#000",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {editItem ? "Guardar Cambios" : "Crear Entidad"}
                </button>
              </div>
            </form>
          )}

          {/* TAB 5: MOVIMIENTO / TRANSACCIÓN MANUAL */}
          {activeTab === "transaction" && (
            <form
              onSubmit={handleSaveTransaction}
              style={{ display: "flex", flexDirection: "column", gap: 14, height: "100%" }}
            >
              <div>
                <label className="fi-form-label">
                  Cuenta de Ahorro o Bolsillo Destino
                </label>
                <CustomSelectDropdown
                  options={accountOptions}
                  value={txAccountId}
                  onChange={(val) => setTxAccountId(val)}
                  placeholder="Selecciona una cuenta o bolsillo..."
                />
              </div>

              {/* Tipo: Depósito o Retiro */}
              <div>
                <label className="fi-form-label">
                  Tipo de Movimiento
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setTxType("credit")}
                    className={`fi-movement-type-btn ${txType === "credit" ? "active-credit" : ""}`}
                  >
                    + Depósito (Entrada)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTxType("debit")}
                    className={`fi-movement-type-btn ${txType === "debit" ? "active-debit" : ""}`}
                  >
                    - Retiro (Salida)
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 0.8fr", gap: 10 }}>
                <div>
                  <label className="fi-form-label">
                    Monto ({accounts.find((a) => a.id === txAccountId)?.currency || "COP"})
                  </label>
                  <CurrencyInput
                    currency={accounts.find((a) => a.id === txAccountId)?.currency || "COP"}
                    value={txAmount}
                    onChange={(val) => setTxAmount(val !== "" ? String(val) : "")}
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="fi-form-label">
                    Fecha
                  </label>
                  <DynamicDatePicker
                    value={txDate}
                    onChange={(iso) => setTxDate(iso)}
                    align="right"
                    direction="auto"
                  />
                </div>

                <div>
                  <label className="fi-form-label">
                    Hora
                  </label>
                  <input
                    type="time"
                    step="1"
                    value={txTime}
                    onChange={(e) => setTxTime(e.target.value)}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      background: isLight ? "#ffffff" : "rgba(13, 18, 38, 0.7)",
                      border: isLight ? "1px solid rgba(0, 0, 0, 0.15)" : "1px solid rgba(255, 255, 255, 0.1)",
                      borderRadius: "8px",
                      padding: "8px 10px",
                      color: isLight ? "#0f172a" : "#f8fafc",
                      fontSize: "0.85rem",
                      height: "38px",
                    }}
                  />
                </div>
              </div>

              <div>
                <FloatingInput
                  label="Descripción / Concepto"
                  placeholder={txType === "credit" ? "ej. Aporte nómina, Ahorro viaje" : "ej. Pago tiquetes, Retiro personal"}
                  value={txDescription}
                  onChange={(e) => setTxDescription(e.target.value)}
                />
              </div>

              {/* Checkbox: Actualizar saldo actual de la cuenta */}
              <label className="fi-checkbox-label" style={{ marginTop: 4 }}>
                <input
                  type="checkbox"
                  checked={txUpdateAccountBalance}
                  onChange={(e) => setTxUpdateAccountBalance(e.target.checked)}
                />
                <span>Actualizar el saldo actual de la cuenta automáticamente</span>
              </label>

              {/* Pinned Footer at Bottom */}
              <div className="fi-modal-footer">
                <button
                  type="button"
                  onClick={onClose}
                  className="fi-btn-cancel"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    padding: "10px 22px",
                    borderRadius: 10,
                    background: txType === "credit" ? "#10b981" : "#f43f5e",
                    border: "none",
                    color: "#fff",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {editItem?.id ? "Guardar Cambios" : "Registrar Movimiento"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
