import React, { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { useTheme } from '../context/ThemeContext';
import { parseXtbTrades } from '../utils/xtbParser';
import { getMarketOpenTime } from '../utils/marketHours';
import { getAssetName } from '../utils/assetNames';
import { DynamicDatePicker } from './Common';

export default function XtbImportModal({
  isOpen,
  onClose,
  currentPortfolioId,
  purchasePortfolios = [],
  onImportPurchases,
  onCreatePortfolio,
  onSelectPortfolio,
}) {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  const [targetMode, setTargetMode] = useState('existing'); // 'existing' | 'new'
  const [selectedPortId, setSelectedPortId] = useState(currentPortfolioId || 'hist_default');
  const [newPortfolioName, setNewPortfolioName] = useState('Compras XTB');
  const [defaultDate, setDefaultDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [rawText, setRawText] = useState('');
  const [parsedTrades, setParsedTrades] = useState([]);
  const [parseError, setParseError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedPortId(currentPortfolioId || 'hist_default');
      setTargetMode('existing');
      setRawText('');
      setParsedTrades([]);
      setParseError('');
      setIsProcessing(false);
    }
  }, [isOpen, currentPortfolioId]);

  // Handle parsing whenever rawText changes
  useEffect(() => {
    if (!rawText.trim()) {
      setParsedTrades([]);
      setParseError('');
      return;
    }

    const res = parseXtbTrades(rawText, defaultDate);
    if (res.success && res.trades.length > 0) {
      setParsedTrades(res.trades);
      setParseError('');
    } else {
      setParsedTrades([]);
      setParseError(res.error || 'No se reconocieron posiciones en el texto.');
    }
  }, [rawText]);

  // Handle change in defaultDate: update trades that don't have auto-detected dates
  const handleDefaultDateChange = (newDate) => {
    setDefaultDate(newDate);
    setParsedTrades(prev => prev.map(t => {
      if (!t.isDateAutoDetected) {
        return { ...t, date: newDate };
      }
      return t;
    }));
  };

  const totalInvested = useMemo(() => {
    return parsedTrades.reduce((sum, t) => sum + (t.investedAmount || 0), 0);
  }, [parsedTrades]);

  const handleRemoveTrade = (idToRemove) => {
    setParsedTrades(prev => prev.filter(t => t.id !== idToRemove));
  };

  const handleUpdateTrade = (id, field, value) => {
    setParsedTrades(prev => prev.map(t => {
      if (t.id !== id) return t;
      const updated = { ...t, [field]: value };
      if (field === 'shares' || field === 'purchasePrice') {
        const sh = field === 'shares' ? Number(value) : t.shares;
        const pr = field === 'purchasePrice' ? Number(value) : t.purchasePrice;
        if (sh > 0 && pr > 0) {
          updated.investedAmount = Number((sh * pr).toFixed(2));
        }
      }
      return updated;
    }));
  };

  const handleExecuteImport = async () => {
    if (parsedTrades.length === 0) {
      toast.error('No hay compras válidas para importar.');
      return;
    }

    setIsProcessing(true);
    const toastId = toast.loading('Importando compras desde xStation...');

    try {
      let finalPortId = selectedPortId;

      if (targetMode === 'new') {
        const portName = newPortfolioName.trim() || 'Compras XTB';
        if (onCreatePortfolio) {
          const newPort = await onCreatePortfolio(portName);
          if (newPort && newPort.id) {
            finalPortId = newPort.id;
          }
        }
      }

      // Convert parsed trades to purchase items
      const newPurchases = parsedTrades.map(t => {
        const openTime = t.purchaseTime || getMarketOpenTime(t.ticker);
        return {
          id: `buy_${Date.now()}_${Math.floor(Math.random() * 1000000)}_${t.ticker}`,
          portfolioId: finalPortId,
          ticker: t.ticker.toUpperCase().trim(),
          name: t.name ? getAssetName(t.ticker, t.name) : getAssetName(t.ticker),
          date: t.date || defaultDate,
          purchaseTime: openTime,
          purchasePrice: Number(t.purchasePrice) || 0,
          shares: Number(t.shares) || 0,
          investedAmount: Number(t.investedAmount) || 0,
          manualCurrentPrice: Number(t.currentPrice) || 0,
        };
      });

      if (onImportPurchases) {
        await onImportPurchases(newPurchases);
      }

      if (onSelectPortfolio && finalPortId) {
        onSelectPortfolio(finalPortId);
      }

      toast.success(`🎉 ¡${newPurchases.length} compras importadas exitosamente!`, { id: toastId });
      onClose();
    } catch (err) {
      console.error('Error importing XTB trades:', err);
      toast.error('Error al importar las compras. Revisa los datos.', { id: toastId });
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(5px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        className="card fade-up"
        style={{
          width: '100%',
          maxWidth: '920px',
          maxHeight: '94vh',
          background: isLight ? '#ffffff' : 'var(--bg-card, #111827)',
          border: isLight ? '1px solid rgba(0, 0, 0, 0.12)' : '1px solid rgba(0, 229, 255, 0.25)',
          borderRadius: '16px',
          boxShadow: isLight ? '0 25px 50px -12px rgba(0, 0, 0, 0.15)' : '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: isLight ? '#0f172a' : '#f1f5f9',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: isLight ? '1px solid rgba(0, 0, 0, 0.08)' : '1px solid var(--border, rgba(255, 255, 255, 0.08))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: isLight ? 'rgba(0, 229, 255, 0.05)' : 'rgba(0, 229, 255, 0.03)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '1.6rem' }}>📥</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: isLight ? '#0f172a' : '#f1f5f9' }}>
                Importar Compras desde xStation (XTB)
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: isLight ? '#475569' : 'var(--text-secondary, #94a3b8)' }}>
                Pega la tabla HTML o texto copiado de xStation 5 para generar todas tus compras con fechas, lotes y precios.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-sm btn-ghost"
            style={{ fontSize: '1.2rem', color: isLight ? '#64748b' : 'var(--text-muted, #64748b)', padding: '4px 8px' }}
          >
            ✕
          </button>
        </div>

        {/* MODAL BODY */}
        <div style={{ padding: '18px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          
          {/* RECOMMENDED COLUMNS GUIDE & PRO TIP */}
          <div
            style={{
              background: isLight ? 'rgba(0, 229, 255, 0.06)' : 'rgba(0, 229, 255, 0.04)',
              border: isLight ? '1px solid rgba(0, 180, 216, 0.3)' : '1px solid rgba(0, 229, 255, 0.2)',
              borderRadius: '12px',
              padding: '12px 16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '1.1rem' }}>📋</span>
                <strong style={{ fontSize: '0.84rem', color: isLight ? '#0369a1' : '#00e5ff' }}>
                  Columnas recomendadas en tu tabla de xStation 5
                </strong>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(!showGuide)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '0.75rem',
                  color: isLight ? '#0284c7' : '#38bdf8',
                  cursor: 'pointer',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {showGuide ? 'Ocultar detalles ▲' : 'Ver guía de columnas ▼'}
              </button>
            </div>

            {/* Quick summary badges */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              <span style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: 6, background: isLight ? '#e0f2fe' : 'rgba(0,229,255,0.12)', color: isLight ? '#0369a1' : '#38bdf8', fontWeight: 600 }}>
                ✓ Instrumento (Posición)
              </span>
              <span style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: 6, background: isLight ? '#e0f2fe' : 'rgba(0,229,255,0.12)', color: isLight ? '#0369a1' : '#38bdf8', fontWeight: 600 }}>
                ✓ Volumen (Títulos)
              </span>
              <span style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: 6, background: isLight ? '#e0f2fe' : 'rgba(0,229,255,0.12)', color: isLight ? '#0369a1' : '#38bdf8', fontWeight: 600 }}>
                ✓ Precio apertura / orden
              </span>
              <span style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: 6, background: isLight ? '#dcfce7' : 'rgba(16,185,129,0.15)', color: isLight ? '#15803d' : '#34d399', fontWeight: 700 }}>
                ⭐ Hora de apertura (Fecha)
              </span>
              <span style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: 6, background: isLight ? '#e0f2fe' : 'rgba(0,229,255,0.12)', color: isLight ? '#0369a1' : '#38bdf8', fontWeight: 600 }}>
                ✓ Valor de apertura
              </span>
            </div>

            {/* Expanded Guide */}
            {showGuide && (
              <div
                style={{
                  marginTop: 12,
                  paddingTop: 12,
                  borderTop: isLight ? '1px dashed rgba(0, 0, 0, 0.1)' : '1px dashed rgba(255, 255, 255, 0.1)',
                  fontSize: '0.76rem',
                  lineHeight: '1.45',
                  color: isLight ? '#334155' : '#cbd5e1',
                }}
              >
                <p style={{ margin: '0 0 8px' }}>
                  En xStation 5 puedes hacer clic en el engranaje ⚙️ de la tabla de <strong>Posiciones Abiertas</strong> y asegurarte de tener activas únicamente estas columnas para un pegado limpio y sin errores.
                </p>
                <div
                  style={{
                    background: isLight ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 185, 129, 0.06)',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    borderRadius: 8,
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: '1rem', marginTop: 1 }}>💡</span>
                  <div>
                    <strong style={{ color: isLight ? '#15803d' : '#34d399' }}>¿Cómo capturar la fecha exacta de cada orden?</strong>
                    <div style={{ marginTop: 2 }}>
                      En xStation 5 las filas agrupadas resumen todas las compras pero no muestran la fecha en el encabezado.
                      Antes de copiar, <strong>haz clic en la flecha `&gt;`</strong> para desplegar las operaciones individuales de cada acción. ¡Así se detectarán la fecha y hora exacta de cada lote de compra automáticamente!
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* DESTINATION PORTFOLIO & DEFAULT DATE */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 16,
              background: isLight ? '#f8fafc' : 'rgba(255, 255, 255, 0.02)',
              padding: '16px',
              borderRadius: '10px',
              border: isLight ? '1px solid rgba(0, 0, 0, 0.08)' : '1px solid var(--border, rgba(255, 255, 255, 0.06))',
            }}
          >
            {/* Portfolio Selector */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: isLight ? '#334155' : 'var(--text-secondary, #cbd5e1)', marginBottom: 6 }}>
                📁 Portafolio de Destino:
              </label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button
                  type="button"
                  onClick={() => setTargetMode('existing')}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    fontSize: '0.75rem',
                    borderRadius: 6,
                    border: targetMode === 'existing' ? (isLight ? '1px solid #0284c7' : '1px solid #00e5ff') : (isLight ? '1px solid #cbd5e1' : '1px solid rgba(255, 255, 255, 0.1)'),
                    background: targetMode === 'existing' ? (isLight ? 'rgba(2, 132, 199, 0.1)' : 'rgba(0, 229, 255, 0.12)') : 'transparent',
                    color: targetMode === 'existing' ? (isLight ? '#0284c7' : '#00e5ff') : (isLight ? '#64748b' : 'var(--text-muted, #94a3b8)'),
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Existente
                </button>
                <button
                  type="button"
                  onClick={() => setTargetMode('new')}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    fontSize: '0.75rem',
                    borderRadius: 6,
                    border: targetMode === 'new' ? (isLight ? '1px solid #16a34a' : '1px solid #10b981') : (isLight ? '1px solid #cbd5e1' : '1px solid rgba(255, 255, 255, 0.1)'),
                    background: targetMode === 'new' ? (isLight ? 'rgba(22, 163, 74, 0.1)' : 'rgba(16, 185, 129, 0.12)') : 'transparent',
                    color: targetMode === 'new' ? (isLight ? '#16a34a' : '#10b981') : (isLight ? '#64748b' : 'var(--text-muted, #94a3b8)'),
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  + Nuevo Portafolio
                </button>
              </div>

              {targetMode === 'existing' ? (
                <select
                  value={selectedPortId}
                  onChange={(e) => setSelectedPortId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: isLight ? '#ffffff' : 'var(--bg-surface, #1e293b)',
                    border: isLight ? '1px solid #cbd5e1' : '1px solid var(--border, rgba(255, 255, 255, 0.15))',
                    color: isLight ? '#0f172a' : '#fff',
                    fontSize: '0.82rem',
                    outline: 'none',
                  }}
                >
                  {purchasePortfolios.map((p) => (
                    <option key={p.id} value={p.id}>
                      📁 {p.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={newPortfolioName}
                  onChange={(e) => setNewPortfolioName(e.target.value)}
                  placeholder="Nombre del nuevo portafolio..."
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: isLight ? '#ffffff' : 'var(--bg-surface, #1e293b)',
                    border: isLight ? '1px solid #16a34a' : '1px solid #10b981',
                    color: isLight ? '#0f172a' : '#fff',
                    fontSize: '0.82rem',
                    outline: 'none',
                  }}
                />
              )}
            </div>

            {/* Default Date */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: isLight ? '#334155' : 'var(--text-secondary, #cbd5e1)', marginBottom: 6 }}>
                📅 Fecha por defecto (para posiciones agrupadas):
              </label>
              <DynamicDatePicker
                value={defaultDate}
                onChange={(val) => handleDefaultDateChange(val)}
              />
              <span style={{ display: 'block', fontSize: '0.7rem', color: isLight ? '#64748b' : 'var(--text-muted, #64748b)', marginTop: 4 }}>
                Se asignará a filas que no incluyan fecha de apertura explícita.
              </span>
            </div>
          </div>

          {/* PASTE AREA */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: isLight ? '#334155' : 'var(--text-secondary, #cbd5e1)' }}>
                📋 Pega aquí la tabla copiada de xStation 5:
              </label>
              {rawText && (
                <button
                  type="button"
                  onClick={() => setRawText('')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#ef4444',
                    fontSize: '0.74rem',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Limpiar texto
                </button>
              )}
            </div>
            <textarea
              rows={4}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Haz clic derecho en la tabla de Posiciones Abiertas de xStation 5 ➔ Inspeccionar ➔ Copiar elemento (o selecciona las celdas y presiona Ctrl+C), y pégalo aquí..."
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '10px',
                background: isLight ? '#ffffff' : 'var(--bg-surface, #0f172a)',
                border: parseError ? '1px solid #ef4444' : parsedTrades.length > 0 ? (isLight ? '1px solid #16a34a' : '1px solid #10b981') : (isLight ? '1px solid #cbd5e1' : '1px solid var(--border, rgba(255, 255, 255, 0.15))'),
                color: isLight ? '#0f172a' : '#e2e8f0',
                fontSize: '0.8rem',
                fontFamily: 'monospace',
                outline: 'none',
                resize: 'vertical',
              }}
            />
            {parseError && (
              <div style={{ fontSize: '0.74rem', color: '#ef4444', marginTop: 4 }}>
                ⚠️ {parseError}
              </div>
            )}
          </div>

          {/* PREVIEW OF DETECTED TRADES */}
          {parsedTrades.length > 0 && (
            <div
              style={{
                background: isLight ? 'rgba(16, 185, 129, 0.04)' : 'rgba(16, 185, 129, 0.04)',
                border: isLight ? '1px solid rgba(22, 163, 74, 0.3)' : '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: '12px',
                padding: '16px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: isLight ? '#15803d' : '#10b981', fontWeight: 800, fontSize: '0.95rem' }}>
                    ✓ {parsedTrades.length} Posición(es) detectada(s)
                  </span>
                  <span style={{ fontSize: '0.75rem', color: isLight ? '#475569' : 'var(--text-muted, #94a3b8)' }}>
                    Total Inversión: <strong style={{ color: isLight ? '#0f172a' : '#f1f5f9' }}>${totalInvested.toFixed(2)} USD</strong>
                  </span>
                </div>
                <span style={{ fontSize: '0.7rem', color: isLight ? '#64748b' : 'var(--text-muted, #64748b)' }}>
                  Puedes ajustar la fecha, valores o eliminar filas antes de importar
                </span>
              </div>

              <div style={{ overflowX: 'auto', maxHeight: '320px', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ background: isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)', color: isLight ? '#475569' : 'var(--text-muted, #94a3b8)', textAlign: 'left' }}>
                      <th style={{ padding: '8px 10px' }}>Ticker</th>
                      <th style={{ padding: '8px 10px' }}>Empresa</th>
                      <th style={{ padding: '8px 10px' }}>Fecha Apertura</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Acciones</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Precio Apertura</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Inversión (USD)</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Precio Actual</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center' }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedTrades.map((t) => {
                      const displayName = getAssetName(t.ticker, t.name);
                      return (
                        <tr key={t.id} style={{ borderBottom: isLight ? '1px solid rgba(0, 0, 0, 0.06)' : '1px solid rgba(255, 255, 255, 0.05)' }}>
                          <td style={{ padding: '8px 10px', fontWeight: 700, color: isLight ? '#0284c7' : '#00e5ff' }}>
                            <input
                              type="text"
                              value={t.ticker}
                              onChange={(e) => handleUpdateTrade(t.id, 'ticker', e.target.value.toUpperCase())}
                              style={{
                                width: '70px',
                                background: isLight ? '#ffffff' : 'transparent',
                                border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(255,255,255,0.15)',
                                borderRadius: 4,
                                color: isLight ? '#0284c7' : '#00e5ff',
                                fontWeight: 700,
                                padding: '2px 4px',
                              }}
                            />
                          </td>
                          <td style={{ padding: '8px 10px', color: isLight ? '#334155' : '#cbd5e1', maxWidth: '160px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={displayName}>
                            {displayName}
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <DynamicDatePicker
                                value={t.date || defaultDate}
                                onChange={(val) => handleUpdateTrade(t.id, 'date', val)}
                                showPresets={false}
                                style={{ minWidth: '155px' }}
                              />
                              <span style={{ fontSize: '0.66rem', color: t.isDateAutoDetected ? (isLight ? '#15803d' : '#34d399') : (isLight ? '#64748b' : '#94a3b8'), fontWeight: 600 }}>
                                {t.isDateAutoDetected ? `🟢 Auto ${t.purchaseTime ? `(${t.purchaseTime.slice(0, 5)})` : '✓'}` : '⚪ Por defecto'}
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: isLight ? '#0f172a' : '#f1f5f9' }}>
                            <input
                              type="number"
                              step="any"
                              value={t.shares}
                              onChange={(e) => handleUpdateTrade(t.id, 'shares', e.target.value)}
                              style={{
                                width: '75px',
                                textAlign: 'right',
                                background: isLight ? '#ffffff' : 'transparent',
                                border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(255,255,255,0.15)',
                                borderRadius: 4,
                                color: isLight ? '#0f172a' : '#f1f5f9',
                                padding: '2px 4px',
                              }}
                            />
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: isLight ? '#0f172a' : '#f1f5f9' }}>
                            <input
                              type="number"
                              step="any"
                              value={t.purchasePrice}
                              onChange={(e) => handleUpdateTrade(t.id, 'purchasePrice', e.target.value)}
                              style={{
                                width: '80px',
                                textAlign: 'right',
                                background: isLight ? '#ffffff' : 'transparent',
                                border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(255,255,255,0.15)',
                                borderRadius: 4,
                                color: isLight ? '#0f172a' : '#f1f5f9',
                                padding: '2px 4px',
                              }}
                            />
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: isLight ? '#15803d' : '#10b981' }}>
                            ${t.investedAmount.toFixed(2)}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: isLight ? '#64748b' : '#94a3b8' }}>
                            ${t.currentPrice ? t.currentPrice.toFixed(2) : '-'}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => handleRemoveTrade(t.id)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#ef4444',
                                cursor: 'pointer',
                                padding: '2px 6px',
                                fontSize: '0.85rem',
                              }}
                              title="Eliminar posición"
                            >
                              🗑️
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: isLight ? '1px solid rgba(0, 0, 0, 0.08)' : '1px solid var(--border, rgba(255, 255, 255, 0.08))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 12,
            background: isLight ? 'rgba(0, 0, 0, 0.02)' : 'rgba(255, 255, 255, 0.01)',
          }}
        >
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            disabled={isProcessing}
            style={{ fontSize: '0.85rem', color: isLight ? '#475569' : undefined }}
          >
            Cancelar
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleExecuteImport}
            disabled={parsedTrades.length === 0 || isProcessing}
            style={{
              background: parsedTrades.length > 0 ? 'linear-gradient(135deg, #00e5ff 0%, #3b82f6 100%)' : undefined,
              color: '#000',
              fontWeight: 700,
              fontSize: '0.85rem',
              padding: '8px 20px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: parsedTrades.length > 0 ? 'pointer' : 'not-allowed',
            }}
          >
            {isProcessing ? (
              <span>⏳ Importando...</span>
            ) : (
              <span>🚀 Importar {parsedTrades.length} Compras</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
