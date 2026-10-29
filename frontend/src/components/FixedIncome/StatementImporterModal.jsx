import { useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { confirmStatementImportApi, uploadStatementApi } from "../../api/client";
import { useFixedIncomeStore } from "../../store/fixedIncomeStore";

export default function StatementImporterModal({ isOpen, onClose }) {
  const { entities, initFetchFixedIncome } = useFixedIncomeStore();
  const [files, setFiles] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [password, setPassword] = useState("");
  const [startYear, setStartYear] = useState(2024);
  const [savePasswordLocally, setSavePasswordLocally] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [targetEntityId, setTargetEntityId] = useState("ent_nu");
  const [selectedAccounts, setSelectedAccounts] = useState([]);
  const [selectedCDTs, setSelectedCDTs] = useState([]);
  const [isImporting, setIsImporting] = useState(false);

  if (!isOpen) return null;

  const handleFilesAdded = (newFileList) => {
    if (!newFileList || newFileList.length === 0) return;
    const fileArray = Array.from(newFileList);
    setFiles((prev) => [...prev, ...fileArray]);
    setExtractedData(null);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesAdded(e.dataTransfer.files);
    }
  };

  const handleRemoveFile = (index) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleProcessFile = async () => {
    if (files.length === 0) {
      toast.error("Por favor selecciona o arrastra al menos un archivo PDF o captura de pantalla");
      return;
    }

    setIsUploading(true);
    try {
      const res = await uploadStatementApi(files, password.trim(), startYear);
      if (!res.success) {
        if (res.error === "PDF_ENCRYPTED") {
          toast.error(res.message || "PDF protegido. Ingresa tu cédula o clave");
        } else if (res.error === "WRONG_PASSWORD") {
          toast.error("Contraseña incorrecta para el PDF");
        } else {
          toast.error(res.message || "Error analizando extractos");
        }
        setIsUploading(false);
        return;
      }

      // Ensure parsedData has at least 1 account fallback if OCR text was generic
      if (!res.parsedData) res.parsedData = { accounts: [], cdts: [], movements: [] };
      if (!res.parsedData.accounts) res.parsedData.accounts = [];
      if (!res.parsedData.cdts) res.parsedData.cdts = [];

      // Re-calculate exact net balances of Cajitas on the frontend directly from the parsed movements list!
      // This guarantees 100% exact alignment with the movements shown in the modal and logs.
      const movementsList = res.parsedData.movements || [];
      const pocketCalcsMap = {};
      movementsList.forEach((m) => {
        const isAgregaste = m.description.toLowerCase().startsWith("agregaste");
        const absVal = Math.abs(m.amount);
        const nameMatch = m.description.match(/(?:a|de)\s+(Cajita\s+[A-Za-z0-9\sáéíóúÁÉÍÓÚñÑ]+)/i);
        const cajitaName = nameMatch ? nameMatch[1].trim() : null;
        
        if (cajitaName) {
          if (!pocketCalcsMap[cajitaName]) pocketCalcsMap[cajitaName] = 0;
          if (isAgregaste) {
            pocketCalcsMap[cajitaName] += absVal;
          } else {
            pocketCalcsMap[cajitaName] -= absVal;
          }
        }
      });

      // Update the accounts list with these exact calculated balances rounded to 2 decimal places
      res.parsedData.accounts.forEach((acc) => {
        const cName = acc.name;
        if (pocketCalcsMap[cName] !== undefined) {
          acc.balance = Number(pocketCalcsMap[cName].toFixed(2));
        } else {
          acc.balance = Number((Number(acc.balance) || 0).toFixed(2));
        }
      });

      if (res.parsedData.accounts.length === 0 && res.parsedData.cdts.length === 0) {
        res.parsedData.accounts = [
          {
            name: "Cuenta Principal / Cajita",
            type: "pocket",
            currency: "COP",
            balance: 0.0,
            interestRateEA: 12.0,
            isTaxExemptGMF: true,
          },
        ];
      }

      setExtractedData(res);

      // OCR movement analysis (debug logging removed)

      setTargetEntityId(res.bankEntity?.id || (entities.length > 0 ? entities[0].id : "ent_nu"));
      setSelectedAccounts((res.parsedData.accounts || []).map((_, i) => i));
      setSelectedCDTs((res.parsedData.cdts || []).map((_, i) => i));
      toast.success(
        `¡${res.processedFilesCount || files.length} archivo(s) analizados exitosamente!`,
      );
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Error subiendo los archivos");
    } finally {
      setIsUploading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!extractedData) return;

    const accountsToImport = (extractedData.parsedData?.accounts || [])
      .filter((_, i) => selectedAccounts.includes(i))
      .map((acc) => ({
        ...acc,
        balance: Number(acc.balance) || 0,
        interestRateEA: Number(acc.interestRateEA) || 5.0,
      }));

    const cdtsToImport = (extractedData.parsedData?.cdts || [])
      .filter((_, i) => selectedCDTs.includes(i))
      .map((cdt) => {
        const isMatured = cdt.status === "matured";
        return {
          ...cdt,
          capital: Number(cdt.capital) || 0,
          interestRateEA: Number(cdt.interestRateEA) || 0,
          payoutAmount: isMatured ? Number(cdt.capital) || 0 : undefined,
          payoutDate: isMatured ? cdt.startDate : undefined,
        };
      });

    const movementsToImport = (extractedData.parsedData?.movements || []).map((m) => ({
      ...m,
      amount: Number(m.amount) || 0,
    }));

    const hasEmptyDate = movementsToImport.some((m) => !m.date || m.date.trim() === "");
    if (hasEmptyDate) {
      toast.error("Por favor ingresa la fecha (AAAA-MM-DD) para todos los movimientos destacados en rojo");
      return;
    }

    if (accountsToImport.length === 0 && cdtsToImport.length === 0) {
      toast.error("Selecciona al menos un producto (Cuenta o CDT) para importar");
      return;
    }

    setIsImporting(true);
    try {
      const res = await confirmStatementImportApi(
        targetEntityId,
        accountsToImport,
        cdtsToImport,
        movementsToImport,
      );

      toast.success(
        `¡Importado con éxito! (${res.importedAccounts} Cuentas/Cajitas, ${res.importedCDTs} CDTs)`,
      );
      await initFetchFixedIncome();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Error al importar datos");
    } finally {
      setIsImporting(false);
    }
  };

  return createPortal(
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100vw",
        height: "100vh",
        background: "rgba(0,0,0,0.85)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        zIndex: 999999,
        padding: "76px 16px 24px 16px",
        overflowY: "auto",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="card fade-up"
        style={{
          width: "100%",
          maxWidth: 660,
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          background: "#0f172a",
          border: "1px solid rgba(255,255,255,0.15)",
          padding: 24,
          borderRadius: 16,
          boxShadow: "0 25px 60px rgba(0,0,0,0.9)",
          marginTop: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            paddingBottom: 12,
          }}
        >
          <h3
            style={{
              margin: 0,
              color: "#f8fafc",
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: "1.15rem",
            }}
          >
            📑 Importador Multibanco en Lote (PDFs / Fotos)
          </h3>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#94a3b8",
              fontSize: "1.4rem",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ overflowY: "auto", flex: 1, paddingRight: 4 }}>
          {!extractedData ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Multi-file Drag & Drop Dropzone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                style={{
                  padding: 24,
                  border: `2px dashed ${isDragOver ? "#38bdf8" : "rgba(56, 189, 248, 0.35)"}`,
                  borderRadius: 14,
                  background: isDragOver ? "rgba(56, 189, 248, 0.1)" : "rgba(56, 189, 248, 0.03)",
                  textAlign: "center",
                  transition: "all 0.2s ease",
                }}
              >
                <input
                  type="file"
                  multiple
                  accept=".pdf,image/*"
                  onChange={(e) => handleFilesAdded(e.target.files)}
                  id="multi-pdf-upload-input"
                  style={{ display: "none" }}
                />
                <label
                  htmlFor="multi-pdf-upload-input"
                  style={{
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <span style={{ fontSize: "2.8rem" }}>📂</span>
                  <span style={{ fontWeight: 700, color: "#f8fafc", fontSize: "1.05rem" }}>
                    Arrastra aquí tus archivos o haz clic para seleccionar en lote
                  </span>
                  <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
                    Admite extractos PDF oficiales y fotos/screenshots del celular (Nu, Lulo,
                    Finandina, Bancolombia, etc.)
                  </span>
                </label>
              </div>

              {/* List of files selected */}
              {files.length > 0 && (
                <div
                  style={{
                    background: "rgba(0,0,0,0.3)",
                    padding: 12,
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.78rem",
                      color: "#38bdf8",
                      fontWeight: 700,
                      marginBottom: 8,
                    }}
                  >
                    📁 Lote de Archivos Seleccionados ({files.length}):
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      maxHeight: 120,
                      overflowY: "auto",
                    }}
                  >
                    {files.map((f, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          background: "rgba(255,255,255,0.04)",
                          padding: "6px 10px",
                          borderRadius: 6,
                          fontSize: "0.8rem",
                        }}
                      >
                        <span
                          style={{
                            color: "#e2e8f0",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          {f.name.endsWith(".pdf") ? "📄" : "📷"} {f.name}
                        </span>
                        <button
                          onClick={() => handleRemoveFile(idx)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#ef4444",
                            cursor: "pointer",
                            fontWeight: 700,
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.85rem",
                      color: "#cbd5e1",
                      marginBottom: 6,
                      fontWeight: 600,
                    }}
                  >
                    🔑 Contraseña del PDF / Cédula del Titular (si está protegido)
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Ej. Cédula de ciudadanía o NIT"
                    className="input"
                    style={{ width: "100%" }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.85rem",
                      color: "#cbd5e1",
                      marginBottom: 6,
                      fontWeight: 600,
                    }}
                  >
                    🗓️ Año inicial
                  </label>
                  <input
                    type="number"
                    value={startYear}
                    onChange={(e) => setStartYear(Number(e.target.value))}
                    placeholder="2024"
                    className="input"
                    style={{ width: "100%" }}
                  />
                </div>
              </div>

              <div style={{ marginTop: -6, display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  id="remember-cedula"
                  checked={savePasswordLocally}
                  onChange={(e) => setSavePasswordLocally(e.target.checked)}
                />
                <label
                  htmlFor="remember-cedula"
                  style={{ fontSize: "0.78rem", color: "#94a3b8", cursor: "pointer" }}
                >
                  Recordar esta clave localmente en el navegador para futuros extractos
                </label>
              </div>

              {/* Progress Indicator while analyzing */}
              {isUploading && (
                <div
                  style={{
                    padding: 14,
                    background: "rgba(56, 189, 248, 0.08)",
                    borderRadius: 10,
                    border: "1px solid rgba(56, 189, 248, 0.25)",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      color: "#38bdf8",
                      marginBottom: 8,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                    }}
                  >
                    <span className="spin">⏳</span> Analizando y extrayendo {files.length}{" "}
                    archivo(s)... Por favor espera unos segundos
                  </div>
                  <div
                    style={{
                      width: "100%",
                      height: 6,
                      background: "rgba(255,255,255,0.1)",
                      borderRadius: 3,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        background: "linear-gradient(90deg, #38bdf8, #818cf8, #38bdf8)",
                        borderRadius: 3,
                        animation: "pulse 1.2s infinite",
                      }}
                    />
                  </div>
                </div>
              )}

              <button
                onClick={handleProcessFile}
                disabled={isUploading || files.length === 0}
                className="btn-primary"
                style={{
                  padding: "12px",
                  fontSize: "0.95rem",
                  width: "100%",
                  marginTop: 4,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                {isUploading
                  ? "⏳ Procesando Analizador OCR..."
                  : `🔍 Analizar e Ingestar ${files.length > 0 ? files.length : ""} Archivo(s) en Lote`}
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {/* Bank Entity Target Selector */}
              <div
                style={{
                  padding: "14px 16px",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 12,
                }}
              >
                <label
                  style={{
                    display: "block",
                    fontSize: "0.82rem",
                    color: "#38bdf8",
                    fontWeight: 700,
                    marginBottom: 8,
                  }}
                >
                  🏦 Entidad Bancaria Destino para Importar:
                </label>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: "1.5rem" }}>
                    {extractedData.bankEntity?.icon || "🏦"}
                  </span>
                  <select
                    value={targetEntityId}
                    onChange={(e) => setTargetEntityId(e.target.value)}
                    className="input"
                    style={{ flex: 1, background: "#020617", color: "#f8fafc", fontWeight: 700 }}
                  >
                    <option value="ent_nu">💜 Nu Colombia</option>
                    <option value="ent_finandina">🏦 Banco Finandina</option>
                    <option value="ent_lulo">⚡ Lulo Bank</option>
                    <option value="ent_pibank">🏦 Pibank</option>
                    <option value="ent_rappi">💳 RappiPay (RappiCuenta)</option>
                    <option value="ent_bancolombia">🟡 Bancolombia</option>
                    <option value="ent_davivienda">🔴 Davivienda</option>
                    <option value="ent_uala">🔴 Ualá Colombia</option>
                    <option value="ent_bogota">🏦 Banco de Bogotá</option>
                    <option value="ent_falabella">🟢 Banco Falabella</option>
                    <option value="ent_serfinanza">🏦 Banco Serfinanza</option>
                    <option value="ent_ibkr">💵 Interactive Brokers</option>
                  </select>
                </div>
                <div style={{ fontSize: "0.73rem", color: "#94a3b8", marginTop: 6 }}>
                  Entidad sugerida por análisis de texto:{" "}
                  <strong style={{ color: "#e2e8f0" }}>
                    {extractedData.bankEntity?.name || "Nu Colombia"}
                  </strong>{" "}
                  ({extractedData.processedFilesCount || files.length} archivos procesados)
                </div>
              </div>

              {/* Accounts / Cajitas Detected */}
              {extractedData.parsedData?.accounts?.length > 0 && (
                <div>
                  <h4 style={{ margin: "0 0 8px 0", fontSize: "0.9rem", color: "#38bdf8" }}>
                    💳 Cuentas / Cajitas Extraídas ({extractedData.parsedData.accounts.length})
                  </h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {extractedData.parsedData.accounts.map((acc, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "10px 14px",
                          background: "rgba(255,255,255,0.03)",
                          borderRadius: 8,
                          border: "1px solid rgba(255,255,255,0.08)",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedAccounts.includes(idx)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedAccounts([...selectedAccounts, idx]);
                            else setSelectedAccounts(selectedAccounts.filter((i) => i !== idx));
                          }}
                          style={{ cursor: "pointer" }}
                        />
                        <div
                          style={{
                            flex: 1,
                            display: "grid",
                            gridTemplateColumns: "1.5fr 1fr",
                            gap: 8,
                            alignItems: "center",
                          }}
                        >
                          <input
                            type="text"
                            value={acc.name}
                            onChange={(e) => {
                              const updated = { ...extractedData };
                              updated.parsedData.accounts[idx].name = e.target.value;
                              setExtractedData(updated);
                            }}
                            className="input"
                            style={{
                              padding: "4px 8px",
                              fontSize: "0.8rem",
                              background: "#020617",
                            }}
                            title="Nombre de la Cuenta/Cajita"
                          />
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ color: "#94a3b8", fontSize: "0.8rem" }}>$</span>
                            {console.log("Rendering balance input for account:", acc.name, "with value:", acc.balance)}
                            <input
                              type="text"
                              value={acc.balance}
                              onChange={(e) => {
                                const updated = { ...extractedData };
                                updated.parsedData.accounts[idx].balance = e.target.value;
                                setExtractedData(updated);
                              }}
                              className="input"
                              style={{
                                padding: "4px 8px",
                                fontSize: "0.8rem",
                                background: "#020617",
                                width: "100%",
                              }}
                              title="Saldo / Balance"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* CDTs Detected */}
              {extractedData.parsedData?.cdts?.length > 0 && (
                <div>
                  <h4 style={{ margin: "0 0 8px 0", fontSize: "0.9rem", color: "#10b981" }}>
                    📜 CDTs Extraídos ({extractedData.parsedData.cdts.length})
                  </h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {extractedData.parsedData.cdts.map((cdt, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "10px 14px",
                          background: "rgba(16, 185, 129, 0.05)",
                          borderRadius: 8,
                          border: "1px solid rgba(16, 185, 129, 0.2)",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedCDTs.includes(idx)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedCDTs([...selectedCDTs, idx]);
                            else setSelectedCDTs(selectedCDTs.filter((i) => i !== idx));
                          }}
                          style={{ cursor: "pointer" }}
                        />
                        <div
                          style={{
                            flex: 1,
                            display: "grid",
                            gridTemplateColumns: "1.5fr 1fr 0.8fr 1fr",
                            gap: 8,
                            alignItems: "center",
                          }}
                        >
                          <input
                            type="text"
                            value={cdt.name}
                            onChange={(e) => {
                              const updated = { ...extractedData };
                              updated.parsedData.cdts[idx].name = e.target.value;
                              setExtractedData(updated);
                            }}
                            className="input"
                            style={{
                              padding: "4px 8px",
                              fontSize: "0.78rem",
                              background: "#020617",
                            }}
                            title="Nombre del CDT"
                          />
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span
                              style={{
                                color: cdt.status === "matured" ? "#f43f5e" : "#94a3b8",
                                fontSize: "0.78rem",
                                fontWeight: cdt.status === "matured" ? "bold" : "normal",
                              }}
                            >
                              $
                            </span>
                            <input
                              type="text"
                              value={cdt.capital}
                              onChange={(e) => {
                                const updated = { ...extractedData };
                                updated.parsedData.cdts[idx].capital = e.target.value;
                                setExtractedData(updated);
                              }}
                              className="input"
                              style={{
                                padding: "4px 8px",
                                fontSize: "0.78rem",
                                background: "#020617",
                                color: cdt.status === "matured" ? "#f43f5e" : "#e2e8f0",
                                fontWeight: cdt.status === "matured" ? 700 : "normal",
                                width: "100%",
                              }}
                              title="Capital / Monto"
                            />
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <input
                              type="text"
                              value={cdt.interestRateEA}
                              onChange={(e) => {
                                const updated = { ...extractedData };
                                updated.parsedData.cdts[idx].interestRateEA = e.target.value;
                                setExtractedData(updated);
                              }}
                              className="input"
                              style={{
                                padding: "4px 8px",
                                fontSize: "0.78rem",
                                background: "#020617",
                                width: "100%",
                              }}
                              title="Tasa EA %"
                            />
                            <span style={{ color: "#94a3b8", fontSize: "0.78rem" }}>%</span>
                          </div>
                          <input
                            type="text"
                            value={cdt.startDate}
                            onChange={(e) => {
                              const updated = { ...extractedData };
                              updated.parsedData.cdts[idx].startDate = e.target.value;
                              setExtractedData(updated);
                            }}
                            placeholder="YYYY-MM-DD"
                            className="input"
                            style={{
                              padding: "4px 8px",
                              fontSize: "0.78rem",
                              background: "#020617",
                            }}
                            title="Fecha de Inicio"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Movements Detected */}
              {extractedData.parsedData?.movements?.length > 0 && (
                <div>
                  <h4 style={{ margin: "0 0 8px 0", fontSize: "0.9rem", color: "#f59e0b" }}>
                    💸 Movimientos Extraídos ({extractedData.parsedData.movements.length})
                  </h4>
                  <div
                    style={{
                      maxHeight: 180,
                      overflowY: "auto",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      paddingRight: 4,
                    }}
                  >
                    {extractedData.parsedData.movements.map((m, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1.2fr 2fr 1fr",
                          gap: 8,
                          fontSize: "0.78rem",
                          padding: "6px 10px",
                          background: "rgba(0,0,0,0.3)",
                          borderRadius: 6,
                          alignItems: "center",
                        }}
                      >
                        <input
                          type="text"
                          value={m.date || ""}
                          onChange={(e) => {
                            const updated = { ...extractedData };
                            updated.parsedData.movements[idx].date = e.target.value;
                            setExtractedData(updated);
                          }}
                          placeholder="AAAA-MM-DD (Obligatoria)"
                          className="input"
                          style={{ 
                            padding: "3px 6px", 
                            fontSize: "0.75rem", 
                            background: "#020617",
                            borderColor: !m.date || m.date.trim() === "" ? "#f43f5e" : "rgba(255,255,255,0.1)",
                            borderWidth: "1px",
                            borderStyle: "solid"
                          }}
                          title="Fecha de Transacción (AAAA-MM-DD) - ¡Obligatoria!"
                        />
                        <input
                          type="text"
                          value={m.description}
                          onChange={(e) => {
                            const updated = { ...extractedData };
                            updated.parsedData.movements[idx].description = e.target.value;
                            setExtractedData(updated);
                          }}
                          className="input"
                          style={{ padding: "3px 6px", fontSize: "0.75rem", background: "#020617" }}
                          title="Descripción"
                        />
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span
                            style={{
                              color: m.amount >= 0 ? "#22c55e" : "#ef4444",
                              fontSize: "0.8rem",
                              fontWeight: "bold",
                            }}
                          >
                            $
                          </span>
                          <input
                            type="text"
                            value={m.amount}
                            onChange={(e) => {
                              const updated = { ...extractedData };
                              const val = e.target.value;
                              updated.parsedData.movements[idx].amount = val;
                              updated.parsedData.movements[idx].type =
                                Number(val) >= 0 ? "credit" : "debit";
                              setExtractedData(updated);
                            }}
                            className="input"
                            style={{
                              padding: "3px 6px",
                              fontSize: "0.75rem",
                              background: "#020617",
                              color: Number(m.amount) >= 0 ? "#22c55e" : "#ef4444",
                              fontWeight: 700,
                              width: "100%",
                            }}
                            title="Monto (Negativo = Ingresa/Suma a Cajita, Positivo = Retira/Resta)"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
                <button
                  onClick={() => {
                    setExtractedData(null);
                    setFiles([]);
                  }}
                  style={{
                    flex: 1,
                    padding: 10,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#e2e8f0",
                    borderRadius: 8,
                    cursor: "pointer",
                  }}
                >
                  🔙 Elegir otros archivos
                </button>

                <button
                  onClick={handleConfirmImport}
                  disabled={isImporting}
                  className="btn-primary"
                  style={{ flex: 2, padding: 10, fontSize: "0.95rem" }}
                >
                  {isImporting ? "⏳ Importando..." : "✅ Confirmar e Ingestar al Portafolio"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
