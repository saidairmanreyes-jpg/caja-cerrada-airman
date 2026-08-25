import React, { useState } from 'react'
import {
  Clock, ShieldAlert, Sparkles, X, ChevronRight, Truck,
  Scissors, Factory, Globe, ArrowRight, Layers, CheckCircle2,
  Calendar, BarChart3, HelpCircle, Sliders
} from 'lucide-react'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ── SIMULADOR DE CUMULATIVE LEAD TIME & PUNTO DE REORDEN DINÁMICO (ROP) ──
 * ═══════════════════════════════════════════════════════════════════════════
 * Permite al usuario auditar y validar la genealogía de SKU, la sumatoria
 * de tiempos acumulados (Guatemala -> Planta TEH/AGS -> Maquila -> Sucursal)
 * y el cálculo exacto del Punto de Reorden por Días de Cobertura.
 */
export default function KanbanLeadTimeSimulatorModal({ item, onClose, globalSafetyDays = 30 }) {
  if (!item) return null

  // 1. Determine Fabric Genealogy (Genealogía de SKU)
  const isFantasia = item.comportamiento_tela === 'FANTASIA' ||
    ['CUADRO', 'MICRO CUADRO', 'RAYA', 'MICRO RAYA', 'MEZCLILLA', 'DENIM'].some(k => (item.fabric_name || item.description || item.code || '').toUpperCase().includes(k))

  const genealogyType = isFantasia ? 'BASE_FANTASIA_MTO' : 'BASE_CRUDA_TEÑIBLE'
  const fabricCode = item.fabric_code || (isFantasia ? 'TEL-FAN-CUA' : 'TEL-GAB-ISA')
  const fabricName = item.fabric_name || (isFantasia ? 'TELA FANTASÍA MAKE-TO-ORDER (CUADROS/RAYAS/MEZCLILLA)' : 'GABARDINA ISABEL (BASE CRUDA TEÑIBLE)')
  const receivingPlant = item.receiving_plant || (item.warehouse_dest === 'MONTERREY' ? 'HACIENDA (AGS)' : 'PLANTA (TEH)')

  // 2. Lead Time Breakdown Variables
  const [tTeñidoTejido, setTTeñidoTejido] = useState(isFantasia ? 50 : 15)
  const [tFleteGuatemala, setTFleteGuatemala] = useState(4)
  const [tMaquilaConfeccion, setTMaquilaConfeccion] = useState(8)
  const [tFleteSucursal, setTFleteSucursal] = useState(2)

  // 3. Demand and Safety Stock Variables
  const initialMonthlyDemand = Number(item.monthly_consumption || item.avg_monthly_demand || 150)
  const [monthlyDemand, setMonthlyDemand] = useState(initialMonthlyDemand)
  const [safetyDays, setSafetyDays] = useState(Number(item.safety_stock_days || globalSafetyDays || 30))

  // 4. Mathematical Calculations
  const cumulativeLeadTime = Number(tTeñidoTejido) + Number(tFleteGuatemala) + Number(tMaquilaConfeccion) + Number(tFleteSucursal)
  const dailyAverageConsumption = Math.max(0.1, Number((monthlyDemand / 30).toFixed(2)))
  
  // Pipeline consumption during transit/production
  const leadTimeDemand = Math.round(dailyAverageConsumption * cumulativeLeadTime)
  
  // Safety stock in units
  const safetyStockUnits = Math.round(dailyAverageConsumption * safetyDays)
  
  // Dynamic Reorder Point (ROP)
  const dynamicROP = leadTimeDemand + safetyStockUnits

  // Current stock comparison
  const currentVirtualStock = Number(item.dest_stock ?? item.current_stock ?? item.quantity ?? 120)
  const isTriggered = currentVirtualStock <= dynamicROP
  const stockGap = Math.max(0, dynamicROP - currentVirtualStock)
  const daysOfCoverageRemaining = Math.max(0, Math.round(currentVirtualStock / dailyAverageConsumption))

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, 0.88)', backdropFilter: 'blur(12px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1400, padding: '1.5rem'
    }} className="animate-fade-in">
      <div style={{
        background: '#0b1329', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: '1.75rem',
        maxWidth: '850px', width: '100%', maxHeight: '92vh', overflowY: 'auto', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem',
        boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.85)'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '1.25rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.62rem', fontWeight: 900, padding: '0.2rem 0.6rem', borderRadius: '0.4rem', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                🧬 GENEALOGÍA & CUMULATIVE LEAD TIME (CLT)
              </span>
              <span style={{ fontSize: '0.62rem', fontWeight: 900, padding: '0.2rem 0.6rem', borderRadius: '0.4rem', background: isFantasia ? 'rgba(245, 158, 11, 0.15)' : 'rgba(34, 197, 94, 0.15)', color: isFantasia ? '#f59e0b' : '#22c55e' }}>
                {isFantasia ? 'RUTA B: FANTASÍA (MTO PRODUCCIÓN CERO)' : 'RUTA A: LISO (BASE CRUDA EN GREIGE)'}
              </span>
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 900, color: 'white', textTransform: 'uppercase', marginTop: '0.4rem' }}>
              AUDITORÍA DE REORDEN DINÁMICO: {item.code} {item.talla ? `(${item.talla})` : ''}
            </h3>
            <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.15rem' }}>
              Destino: <strong style={{ color: 'white' }}>{item.warehouse_dest || item.warehouse || 'CDMX'}</strong> · Insumo Base: <strong style={{ color: '#38bdf8' }}>{fabricName}</strong>
            </p>
          </div>

          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0.5rem', borderRadius: '0.6rem' }}>
            <X size={20} />
          </button>
        </div>

        {/* ── SECCIÓN 1: GENEALOGÍA DE SKU & MAPEO DE ORIGEN ── */}
        <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '1rem', padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <span style={{ fontSize: '0.65rem', fontWeight: 900, color: '#38bdf8', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Layers size={14} /> 1. MAPEO DE GENEALOGÍA TEXTIL (ORIGEN DEL SKU)
          </span>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.75rem', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ fontSize: '0.58rem', fontWeight: 800, color: '#64748b', display: 'block' }}>ESTRUCTURA DE FABRICACIÓN</span>
              <span style={{ fontSize: '0.78rem', fontWeight: 900, color: isFantasia ? '#f59e0b' : '#22c55e' }}>
                {isFantasia ? '🟡 MAKE-TO-ORDER (Hilo Teñido Previo)' : '🟢 STOCK EN CRUDO / GREIGE'}
              </span>
              <p style={{ fontSize: '0.6rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                {isFantasia ? 'Requiere urdido y tejido completo desde cero en molino.' : 'Existe rollo sin teñir en molino Guatemala; solo requiere teñido a tono.'}
              </p>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.75rem', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ fontSize: '0.58rem', fontWeight: 800, color: '#64748b', display: 'block' }}>ALMACÉN DE RECEPCIÓN FÍSICA</span>
              <span style={{ fontSize: '0.78rem', fontWeight: 900, color: '#38bdf8' }}>
                🏢 {receivingPlant}
              </span>
              <p style={{ fontSize: '0.6rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                Recepción aduanal y almacenamiento primario de rollos para habilitación.
              </p>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.75rem', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ fontSize: '0.58rem', fontWeight: 800, color: '#64748b', display: 'block' }}>CÓDIGO INSUMO PROVEEDOR</span>
              <span style={{ fontSize: '0.78rem', fontWeight: 900, color: 'white', fontFamily: 'monospace' }}>
                {fabricCode}
              </span>
              <p style={{ fontSize: '0.6rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                Proveedor: TEXTILES DEL PACÍFICO (MOLINO GUATEMALA)
              </p>
            </div>
          </div>
        </div>

        {/* ── SECCIÓN 2: CADENA DE TIEMPOS ACUMULADOS (CUMULATIVE LEAD TIME) ── */}
        <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '1rem', padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 900, color: '#a78bfa', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Clock size={14} /> 2. COMPENSACIÓN DE TIEMPOS ACUMULADOS (CUMULATIVE LEAD TIME: {cumulativeLeadTime} DÍAS)
            </span>
            <span style={{ fontSize: '0.72rem', fontWeight: 900, color: '#e9d5ff', background: 'rgba(168, 85, 247, 0.2)', padding: '0.2rem 0.65rem', borderRadius: '0.5rem', border: '1px solid rgba(168, 85, 247, 0.4)' }}>
              CLT TOTAL = {cumulativeLeadTime} DÍAS HÁBILES
            </span>
          </div>

          {/* Stepper Visual Chain */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.65rem' }}>
            {/* Step 1: Molino Guatemala */}
            <div style={{ background: 'rgba(0,0,0,0.35)', padding: '0.85rem', borderRadius: '0.75rem', border: '1px solid rgba(56, 189, 248, 0.2)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#38bdf8', fontSize: '0.62rem', fontWeight: 900 }}>
                <Factory size={13} /> PASO 1: GUATEMALA
              </div>
              <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'white' }}>
                {isFantasia ? 'Tejido + Acabado' : 'Teñido de Crudo'}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: 'auto' }}>
                <input
                  type="number"
                  value={tTeñidoTejido}
                  onChange={(e) => setTTeñidoTejido(Math.max(1, parseInt(e.target.value) || 1))}
                  style={{ width: '55px', background: '#020617', border: '1px solid rgba(56, 189, 248, 0.4)', borderRadius: '0.4rem', padding: '0.25rem 0.4rem', color: '#38bdf8', fontWeight: 900, fontSize: '0.75rem', textAlign: 'center' }}
                />
                <span style={{ fontSize: '0.6rem', color: '#94a3b8' }}>días</span>
              </div>
            </div>

            {/* Step 2: Flete a Planta TEH/AGS */}
            <div style={{ background: 'rgba(0,0,0,0.35)', padding: '0.85rem', borderRadius: '0.75rem', border: '1px solid rgba(245, 158, 11, 0.2)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#f59e0b', fontSize: '0.62rem', fontWeight: 900 }}>
                <Globe size={13} /> PASO 2: ADUANA/FLETE
              </div>
              <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'white' }}>
                Tránsito a {receivingPlant}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: 'auto' }}>
                <input
                  type="number"
                  value={tFleteGuatemala}
                  onChange={(e) => setTFleteGuatemala(Math.max(1, parseInt(e.target.value) || 1))}
                  style={{ width: '55px', background: '#020617', border: '1px solid rgba(245, 158, 11, 0.4)', borderRadius: '0.4rem', padding: '0.25rem 0.4rem', color: '#f59e0b', fontWeight: 900, fontSize: '0.75rem', textAlign: 'center' }}
                />
                <span style={{ fontSize: '0.6rem', color: '#94a3b8' }}>días</span>
              </div>
            </div>

            {/* Step 3: Maquila / Confección */}
            <div style={{ background: 'rgba(0,0,0,0.35)', padding: '0.85rem', borderRadius: '0.75rem', border: '1px solid rgba(236, 72, 153, 0.2)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#f472b6', fontSize: '0.62rem', fontWeight: 900 }}>
                <Scissors size={13} /> PASO 3: MAQUILA
              </div>
              <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'white' }}>
                Armado de Prenda
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: 'auto' }}>
                <input
                  type="number"
                  value={tMaquilaConfeccion}
                  onChange={(e) => setTMaquilaConfeccion(Math.max(1, parseInt(e.target.value) || 1))}
                  style={{ width: '55px', background: '#020617', border: '1px solid rgba(236, 72, 153, 0.4)', borderRadius: '0.4rem', padding: '0.25rem 0.4rem', color: '#f472b6', fontWeight: 900, fontSize: '0.75rem', textAlign: 'center' }}
                />
                <span style={{ fontSize: '0.6rem', color: '#94a3b8' }}>días</span>
              </div>
            </div>

            {/* Step 4: Flete Local a Sucursal Destino */}
            <div style={{ background: 'rgba(0,0,0,0.35)', padding: '0.85rem', borderRadius: '0.75rem', border: '1px solid rgba(34, 197, 94, 0.2)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#22c55e', fontSize: '0.62rem', fontWeight: 900 }}>
                <Truck size={13} /> PASO 4: DESTINO
              </div>
              <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'white' }}>
                Flete a {item.warehouse_dest || 'CDMX'}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: 'auto' }}>
                <input
                  type="number"
                  value={tFleteSucursal}
                  onChange={(e) => setTFleteSucursal(Math.max(1, parseInt(e.target.value) || 1))}
                  style={{ width: '55px', background: '#020617', border: '1px solid rgba(34, 197, 94, 0.4)', borderRadius: '0.4rem', padding: '0.25rem 0.4rem', color: '#22c55e', fontWeight: 900, fontSize: '0.75rem', textAlign: 'center' }}
                />
                <span style={{ fontSize: '0.6rem', color: '#94a3b8' }}>días</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── SECCIÓN 3: PUNTO DE REORDEN DINÁMICO & FÓRMULA MATEMÁTICA ── */}
        <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '1rem', padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 900, color: '#38bdf8', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <BarChart3 size={14} /> 3. CÁLCULO DEL PUNTO DE REORDEN DINÁMICO (ROP)
            </span>
            <span style={{ fontSize: '0.68rem', fontWeight: 900, color: isTriggered ? '#ef4444' : '#22c55e', background: isTriggered ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)', padding: '0.2rem 0.6rem', borderRadius: '0.5rem' }}>
              {isTriggered ? `🚨 ALERTA KANBAN ACTIVA (DEFICIT: ${stockGap} PZAS)` : '✅ STOCK EN COBERTURA NORMAL'}
            </span>
          </div>

          {/* Variables Controls */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', background: 'rgba(0,0,0,0.3)', padding: '0.85rem', borderRadius: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.6rem', fontWeight: 800, color: '#94a3b8', display: 'block', marginBottom: '0.25rem' }}>
                DEMANDA PROMEDIO MENSUAL (PZAS/MES)
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="number"
                  value={monthlyDemand}
                  onChange={(e) => setMonthlyDemand(Math.max(1, parseInt(e.target.value) || 1))}
                  style={{ width: '100px', background: '#020617', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.5rem', padding: '0.4rem 0.6rem', color: 'white', fontWeight: 900, fontSize: '0.8rem' }}
                />
                <span style={{ fontSize: '0.65rem', color: '#64748b' }}>
                  → Consumo Diario: <strong style={{ color: '#38bdf8' }}>{dailyAverageConsumption} pzas/día</strong>
                </span>
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.6rem', fontWeight: 800, color: '#f59e0b', display: 'block', marginBottom: '0.25rem' }}>
                DÍAS DE COBERTURA DE SEGURIDAD (EDITABLE)
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="number"
                  value={safetyDays}
                  onChange={(e) => setSafetyDays(Math.max(0, parseInt(e.target.value) || 0))}
                  style={{ width: '100px', background: '#020617', border: '1px solid rgba(245, 158, 11, 0.4)', borderRadius: '0.5rem', padding: '0.4rem 0.6rem', color: '#f59e0b', fontWeight: 900, fontSize: '0.8rem' }}
                />
                <span style={{ fontSize: '0.65rem', color: '#64748b' }}>
                  ({(safetyDays / 30).toFixed(1)} Meses) → <strong style={{ color: '#f59e0b' }}>{safetyStockUnits} pzas de colchón</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Mathematical Formula Breakdown Grid */}
          <div style={{ background: 'rgba(2, 6, 23, 0.7)', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: '0.75rem', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
              <span style={{ color: '#94a3b8' }}>Demanda en Pipeline (CDP × CLT = {dailyAverageConsumption} × {cumulativeLeadTime}d):</span>
              <strong style={{ color: '#38bdf8' }}>{leadTimeDemand} pzas</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
              <span style={{ color: '#94a3b8' }}>Stock de Seguridad (CDP × Días Cobertura = {dailyAverageConsumption} × {safetyDays}d):</span>
              <strong style={{ color: '#f59e0b' }}>+ {safetyStockUnits} pzas</strong>
            </div>

            <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '0.2rem 0' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.88rem' }}>
              <span style={{ color: 'white', fontWeight: 900 }}>PUNTO DE REORDEN DINÁMICO (ROP):</span>
              <span style={{ color: '#22c55e', fontWeight: 900, fontSize: '1.1rem' }}>
                {dynamicROP} PZAS
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', background: 'rgba(0,0,0,0.3)', padding: '0.4rem 0.6rem', borderRadius: '0.4rem' }}>
              <span style={{ color: '#94a3b8' }}>Inventario Virtual Actual en Sucursal:</span>
              <span style={{ color: isTriggered ? '#ef4444' : '#22c55e', fontWeight: 900 }}>
                {currentVirtualStock} pzas ({daysOfCoverageRemaining} días de cobertura restantes)
              </span>
            </div>
          </div>

          {/* 💡 Explicación del Motor MRP */}
          <div style={{ background: 'rgba(56, 189, 248, 0.05)', border: '1px solid rgba(56, 189, 248, 0.15)', borderRadius: '0.75rem', padding: '0.85rem', display: 'flex', gap: '0.65rem' }}>
            <Sparkles size={18} style={{ color: '#38bdf8', flexShrink: 0, marginTop: '0.1rem' }} />
            <div style={{ fontSize: '0.68rem', color: '#cbd5e1', lineHeight: 1.45 }}>
              <strong style={{ color: '#38bdf8', display: 'block', marginBottom: '0.2rem' }}>JUSTIFICACIÓN DEL DISPARO KANBAN:</strong>
              El sistema no espera a que la sucursal agote su stock de seguridad. Al ordenar hoy ({cumulativeLeadTime} días de anticipación), durante todo el trayecto desde Guatemala y la confección en México se consumirán exactamente <b>{leadTimeDemand} piezas</b>. Cuando el pedido arribe a {item.warehouse_dest || 'destino'}, el almacén aún conservará matemáticamente sus <b>{safetyStockUnits} piezas de seguridad</b> ({safetyDays} días de cobertura) 100% intactas.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1.25rem' }}>
          <button
            onClick={onClose}
            style={{
              padding: '0.75rem 1.75rem',
              background: '#0284c7',
              color: 'white',
              border: 'none',
              borderRadius: '0.75rem',
              fontWeight: 900,
              fontSize: '0.75rem',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)'
            }}
          >
            ENTENDIDO / CERRAR SIMULADOR
          </button>
        </div>
      </div>
    </div>
  )
}
