import React, { useState, useEffect, useMemo } from 'react'
import { db } from '../../firebase'
import { collection, onSnapshot, doc, getDoc } from 'firebase/firestore'
import * as XLSX from 'xlsx'
import {
  TrendingUp, Calendar, Layers, Download, Filter, Search, ShieldCheck,
  AlertCircle, Sparkles, Box, Scissors, Truck, RefreshCw, ChevronRight,
  ArrowUpRight, BarChart3, CheckCircle2, Factory, Globe2, Clock
} from 'lucide-react'

// Telas restringidas Tipo A: Lisos (Permite stock en Crudo / Greige)
export const RESTRICTED_LISOS = [
  'GABARDINA ISABEL',
  'HAWA ELASTANO',
  'GABARDINA AMIN ELASTANO',
  'TWILL MECHANICAL',
  'WARP PIQUE',
  'CLEVELAND'
]

// Telas Tipo B: Fantasía (Make-to-Order / Producción Cero)
export const FANTASIA_PATTERNS = [
  'CUADRO',
  'MICRO CUADRO',
  'RAYA',
  'MICRO RAYA',
  'MEZCLILLA'
]

export default function KanbanDemandPlanning({ canEdit = true, userEmail = '', showMessage }) {
  const [boms, setBoms] = useState([])
  const [thresholds, setThresholds] = useState([])
  const [erpStock, setErpStock] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(false)

  // Filter & Projection Controls
  const [timeHorizon, setTimeHorizon] = useState('6M') // '6M' | 'Q_CURRENT' | 'Q_NEXT' | 'Q_PLUS2'
  const [filterType, setFilterType] = useState('ALL') // 'ALL' | 'TELA' | 'AVÍO'
  const [filterBehavior, setFilterBehavior] = useState('ALL') // 'ALL' | 'LISO' | 'FANTASIA'
  const [filterSupplier, setFilterSupplier] = useState('ALL')
  const [search, setSearch] = useState('')
  const [safetyBufferPercent, setSafetyBufferPercent] = useState(10) // +10% buffer de seguridad para mermas/desviación

  // Real-time Firestore Listeners
  useEffect(() => {
    const unsubBoms = onSnapshot(collection(db, 'kanban_boms'), snap => {
      const list = []
      snap.forEach(d => list.push({ id: d.id, ...d.data() }))
      setBoms(list)
    })

    const unsubThresh = onSnapshot(collection(db, 'kanban_thresholds'), snap => {
      const list = []
      snap.forEach(d => list.push({ id: d.id, ...d.data() }))
      setThresholds(list)
    })

    const unsubErp = onSnapshot(collection(db, 'kanban_erp_sync'), snap => {
      const list = []
      snap.forEach(d => list.push({ id: d.id, ...d.data() }))
      setErpStock(list)
    })

    const unsubSuppliers = onSnapshot(collection(db, 'kanban_suppliers'), snap => {
      const list = []
      snap.forEach(d => list.push({ id: d.id, ...d.data() }))
      setSuppliers(list)
    })

    return () => {
      unsubBoms()
      unsubThresh()
      unsubErp()
      unsubSuppliers()
    }
  }, [])

  // ═════════════════════════════════════════════════════════════════════════════
  // ── MOTOR DE CÁLCULO DE CONSUMO MENSUAL PROMEDIO DE PRENDAS TERMINADAS ──
  // ═════════════════════════════════════════════════════════════════════════════
  // El sistema calcula el consumo mensual base a partir del nivel de reposición Kanban
  // (Stock Máximo - Stock de Seguridad) o promedio mensual de demanda por modelo.
  const garmentMonthlyDemand = useMemo(() => {
    const demandMap = {} // { [code]: { code, description, gender, monthlyUnits, sizes: { [sz]: units } } }

    thresholds.forEach(th => {
      if (!demandMap[th.code]) {
        const bom = boms.find(b => b.code === th.code)
        demandMap[th.code] = {
          code: th.code,
          description: th.description || bom?.description || 'Prenda Airman',
          gender: bom?.gender || 'CABALLERO',
          category: bom?.category || 'PANTALONES',
          monthlyUnits: 0,
          sizes: {}
        }
      }

      // Consumo estimado mensual = (Max Stock - Safety Stock) por almacén o rotación estándar
      const monthlyPzas = Math.max(15, (Number(th.max_stock || 40) - Number(th.safety_stock || 10)))
      demandMap[th.code].monthlyUnits += monthlyPzas
      demandMap[th.code].sizes[th.talla] = (demandMap[th.code].sizes[th.talla] || 0) + monthlyPzas
    })

    // Fallback: Si no hay thresholds pero sí hay BOMs, proyectar 150 pzas/mes por modelo estándar
    boms.forEach(b => {
      if (!demandMap[b.code]) {
        const defaultSizes = b.sizes || ['CH', 'M', 'G', 'XG']
        const perSize = Math.round(150 / defaultSizes.length)
        const sizeMap = {}
        defaultSizes.forEach(s => { sizeMap[s] = perSize })

        demandMap[b.code] = {
          code: b.code,
          description: b.description,
          gender: b.gender || 'CABALLERO',
          category: b.category || 'GENERAL',
          monthlyUnits: 150,
          sizes: sizeMap
        }
      }
    })

    return demandMap
  }, [thresholds, boms])

  // ═════════════════════════════════════════════════════════════════════════════
  // ── EXPLOSIÓN DE REQUERIMIENTOS DE MATERIA PRIMA A 6 MESES & TRIMESTRES ──
  // ═════════════════════════════════════════════════════════════════════════════
  const materialExplosion = useMemo(() => {
    const materialMap = {} // { [matCode]: { ...materialDetails, monthlyMts, q1, q2, total6M, etc. } }

    // Multiplier based on time horizon
    // 6M: 6 meses completos
    // Q_CURRENT: Meses 1, 2, 3 (Trimestre en Curso)
    // Q_NEXT: Meses 4, 5, 6 (Trimestre Proyectado Siguiente)

    Object.values(garmentMonthlyDemand).forEach(garment => {
      const bom = boms.find(b => b.code === garment.code)
      if (!bom || !bom.materials) return

      const sizeConsumptions = bom.size_consumptions || {}
      const defaultMaterials = bom.materials || []

      defaultMaterials.forEach(mat => {
        const matKey = mat.code || mat.id || mat.name
        const cleanMatCode = mat.code || `INS-${mat.name?.slice(0, 10)}`
        const isFabric = (mat.type || '').toUpperCase() === 'TELA'

        // 1. Determinar COMPORTAMIENTO_TELA estricto
        let comportamiento = mat.comportamiento_tela || (isFabric ? 'LISO' : 'N/A')
        const upperName = (mat.name || '').toUpperCase()

        // Verificar regla estricta de LISOS
        const isRestrictedLiso = RESTRICTED_LISOS.some(liso => upperName.includes(liso) || (cleanMatCode || '').includes(liso.slice(0, 4)))
        // Verificar regla de FANTASÍA
        const isFantasia = FANTASIA_PATTERNS.some(fan => upperName.includes(fan) || (cleanMatCode || '').includes(fan.slice(0, 3)))

        if (isRestrictedLiso) {
          comportamiento = 'LISO'
        } else if (isFantasia) {
          comportamiento = 'FANTASIA'
        }

        // 2. Calcular consumo mensual exacto por curva de tallas
        let monthlyTotalMat = 0
        Object.entries(garment.sizes).forEach(([talla, qtyGarments]) => {
          let exactUnitCons = sizeConsumptions[talla]?.[matKey]
          if (exactUnitCons === undefined || exactUnitCons === '' || isNaN(Number(exactUnitCons))) {
            exactUnitCons = Number(mat.consumption || (isFabric ? 1.35 : 1))
          }
          monthlyTotalMat += Number(exactUnitCons) * Number(qtyGarments)
        })

        // Buffer de seguridad para mermas / tejido
        const bufferFactor = 1 + (safetyBufferPercent / 100)
        const adjustedMonthly = monthlyTotalMat * bufferFactor

        if (!materialMap[cleanMatCode]) {
          // Identify probable supplier (Guatemala vs Local)
          const isGuatemalaTarget = isFabric
          const defaultSupplier = isGuatemalaTarget
            ? (suppliers.find(s => s.origin_country === 'GUATEMALA' || (s.name || '').toUpperCase().includes('GUATEMALA')) || suppliers.find(s => s.type === 'TELA') || { name: 'MOLINO GUATEMALA (TEXTILES DEL PACÍFICO)', origin_country: 'GUATEMALA', mill_loom_monthly_capacity: 80000 })
            : (suppliers.find(s => s.type === 'AVÍO') || { name: 'DISTRIBUIDORA NACIONAL DE AVÍOS', origin_country: 'MÉXICO' })

          materialMap[cleanMatCode] = {
            code: cleanMatCode,
            name: mat.name || cleanMatCode,
            type: mat.type || 'TELA',
            unit: mat.unit || (isFabric ? 'MTS' : 'PZAS'),
            comportamiento: comportamiento,
            is_restricted_liso: isRestrictedLiso,
            allows_greige_stock: comportamiento === 'LISO',
            supplier_name: defaultSupplier.name || 'MOLINO GUATEMALA',
            supplier_origin: defaultSupplier.origin_country || (isFabric ? 'GUATEMALA' : 'MÉXICO'),
            lead_time_days: comportamiento === 'LISO' ? 18 : comportamiento === 'FANTASIA' ? 55 : 5,
            notes: mat.notes || '',
            monthly_consumption: 0,
            parent_garments: new Set()
          }
        }

        materialMap[cleanMatCode].monthly_consumption += adjustedMonthly
        materialMap[cleanMatCode].parent_garments.add(`${garment.code} (${garment.description})`)
      })
    })

    // Construir proyección mensualizada para 6 meses y trimestres
    const result = Object.values(materialMap).map(m => {
      const mBase = m.monthly_consumption
      const m1 = mBase * 1.00 // Mes en curso
      const m2 = mBase * 1.02 // +2% crecimiento proyectado
      const m3 = mBase * 1.05 // +5%
      const m4 = mBase * 1.08 // +8%
      const m5 = mBase * 1.10 // +10%
      const m6 = mBase * 1.12 // +12%

      const q1Total = m1 + m2 + m3 // Q Actual (Meses 1-3)
      const q2Total = m4 + m5 + m6 // Q Siguiente (Meses 4-6)
      const total6M = q1Total + q2Total

      // Desglose de estado (Crudo / Greige vs Terminado / Teñido)
      // Para LISOS: El requerimiento crudo se aparta como base (greige en molino) y se programa teñido
      // Para FANTASÍA: 100% Producción desde cero en telar (MTO)
      let greigeRequirementMts = 0
      let finishedRequirementMts = 0
      let mtoFantasiaMts = 0

      if (m.type === 'TELA') {
        if (m.comportamiento === 'LISO') {
          greigeRequirementMts = total6M // Metros en crudo a apartar en molino
          finishedRequirementMts = q1Total // Metros a mandar a teñir para consumo inmediato Q1
        } else {
          mtoFantasiaMts = total6M // Make-to-Order directo en telar
        }
      }

      return {
        ...m,
        parent_garments_list: Array.from(m.parent_garments),
        m1: Math.round(m1),
        m2: Math.round(m2),
        m3: Math.round(m3),
        m4: Math.round(m4),
        m5: Math.round(m5),
        m6: Math.round(m6),
        q1_total: Math.round(q1Total),
        q2_total: Math.round(q2Total),
        total_6m: Math.round(total6M),
        greige_requirement_mts: Math.round(greigeRequirementMts),
        finished_requirement_mts: Math.round(finishedRequirementMts),
        mto_fantasia_mts: Math.round(mtoFantasiaMts)
      }
    })

    return result
  }, [garmentMonthlyDemand, boms, safetyBufferPercent, suppliers])

  // ═════════════════════════════════════════════════════════════════════════════
  // ── RESUMEN EJECUTIVO Y CAPACIDAD DE TELARES EN GUATEMALA ──
  // ═════════════════════════════════════════════════════════════════════════════
  const executiveMetrics = useMemo(() => {
    let totalMts6M = 0
    let totalLisosMts = 0
    let totalFantasiaMts = 0
    let totalAviosUnits = 0
    let q1FabricMts = 0
    let q2FabricMts = 0

    materialExplosion.forEach(item => {
      if (item.type === 'TELA') {
        totalMts6M += item.total_6m
        q1FabricMts += item.q1_total
        q2FabricMts += item.q2_total

        if (item.comportamiento === 'LISO') {
          totalLisosMts += item.total_6m
        } else {
          totalFantasiaMts += item.total_6m
        }
      } else {
        totalAviosUnits += item.total_6m
      }
    })

    // Capacidad de telares en Molino Guatemala (ej. 80,000 mts/mes -> 240,000 mts/trimestre)
    const guatemalaSupplier = suppliers.find(s => s.origin_country === 'GUATEMALA' || (s.name || '').includes('GUATEMALA'))
    const monthlyLoomCapacity = Number(guatemalaSupplier?.mill_loom_monthly_capacity || 80000)
    const quarterlyLoomCapacity = monthlyLoomCapacity * 3

    const q1CapacityOccupancyPercent = Math.min(100, (q1FabricMts / quarterlyLoomCapacity) * 100)
    const q2CapacityOccupancyPercent = Math.min(100, (q2FabricMts / quarterlyLoomCapacity) * 100)

    return {
      totalMts6M,
      totalLisosMts,
      totalFantasiaMts,
      totalAviosUnits,
      q1FabricMts,
      q2FabricMts,
      monthlyLoomCapacity,
      quarterlyLoomCapacity,
      q1CapacityOccupancyPercent: q1CapacityOccupancyPercent.toFixed(1),
      q2CapacityOccupancyPercent: q2CapacityOccupancyPercent.toFixed(1)
    }
  }, [materialExplosion, suppliers])

  // ═════════════════════════════════════════════════════════════════════════════
  // ── FILTRADO DE LA TABLA DE EXPLOSIÓN TRIMESTRAL ──
  // ═════════════════════════════════════════════════════════════════════════════
  const filteredMaterials = useMemo(() => {
    return materialExplosion.filter(m => {
      const matchSearch = (m.code || '').toLowerCase().includes(search.toLowerCase()) ||
                          (m.name || '').toLowerCase().includes(search.toLowerCase()) ||
                          (m.supplier_name || '').toLowerCase().includes(search.toLowerCase())

      const matchType = filterType === 'ALL' || m.type === filterType
      const matchBehavior = filterBehavior === 'ALL' || m.comportamiento === filterBehavior
      const matchSupplier = filterSupplier === 'ALL' || m.supplier_origin === filterSupplier

      return matchSearch && matchType && matchBehavior && matchSupplier
    })
  }, [materialExplosion, search, filterType, filterBehavior, filterSupplier])

  // ═════════════════════════════════════════════════════════════════════════════
  // ── EXPORTACIÓN A EXCEL: REPORTE DE CONSUMO TRIMESTRAL DE TELA (GUATEMALA) ──
  // ═════════════════════════════════════════════════════════════════════════════
  const handleExportDemandPlanExcel = () => {
    // 1. Hoja Consumo Trimestral Consolidado
    const rowsConsumo = materialExplosion.map(m => ({
      'Código Insumo': m.code,
      'Descripción': m.name,
      'Tipo': m.type,
      'Comportamiento Tela': m.comportamiento,
      'Permite Stock en Crudo': m.allows_greige_stock ? 'SÍ (Greige en Molino)' : 'NO (Make-to-Order)',
      'Proveedor Sugerido': m.supplier_name,
      'Origen Proveedor': m.supplier_origin,
      'Lead Time (Días)': m.lead_time_days,
      'Mes 1 (Mts/Pzas)': m.m1,
      'Mes 2 (Mts/Pzas)': m.m2,
      'Mes 3 (Mts/Pzas)': m.m3,
      'TOTAL TRIMESTRE Q1': m.q1_total,
      'Mes 4 (Mts/Pzas)': m.m4,
      'Mes 5 (Mts/Pzas)': m.m5,
      'Mes 6 (Mts/Pzas)': m.m6,
      'TOTAL TRIMESTRE Q2': m.q2_total,
      'PROYECCIÓN SEMESTRAL (6M)': m.total_6m,
      'Unidad': m.unit,
      'Reserva Crudo Greige (Mts)': m.greige_requirement_mts,
      'Teñido Programado Q1 (Mts)': m.finished_requirement_mts,
      'Producción Cero MTO Fantasía (Mts)': m.mto_fantasia_mts,
      'Prendas Vinculadas': m.parent_garments_list.join('; ')
    }))

    // 2. Hoja Apartado de Capacidad Molino Guatemala
    const guatemalaFabrics = materialExplosion.filter(m => m.type === 'TELA')
    const rowsGuatemala = guatemalaFabrics.map(g => ({
      'Tela': g.name,
      'Código SKU': g.code,
      'Tipología': g.comportamiento === 'LISO' ? 'LISO (STOCK EN CRUDO / GREIGE)' : 'FANTASÍA (PRODUCCIÓN CERO / MAKE-TO-ORDER)',
      'Metros Q1 (Apartado Inmediato)': g.q1_total,
      'Metros Q2 (Reserva Capacidad)': g.q2_total,
      'Total Metros Semestre': g.total_6m,
      'Mts a Teñir desde Crudo': g.finished_requirement_mts,
      'Mts Tejido Telar Completo (MTO)': g.mto_fantasia_mts,
      'Lead Time Molino Guatemala': `${g.lead_time_days} Días`,
      'Prendas Destino': g.parent_garments_list.join(', ')
    }))

    // Totales de capacidad
    rowsGuatemala.push({
      'Tela': 'TOTAL METROS TELA REQUERIDOS',
      'Código SKU': '—',
      'Tipología': 'TOTAL',
      'Metros Q1 (Apartado Inmediato)': executiveMetrics.q1FabricMts,
      'Metros Q2 (Reserva Capacidad)': executiveMetrics.q2FabricMts,
      'Total Metros Semestre': executiveMetrics.totalMts6M,
      'Mts a Teñir desde Crudo': executiveMetrics.totalLisosMts,
      'Mts Tejido Telar Completo (MTO)': executiveMetrics.totalFantasiaMts,
      'Lead Time Molino Guatemala': 'Capacidad Trimestral: ' + executiveMetrics.quarterlyLoomCapacity + ' Mts',
      'Prendas Destino': 'Ocupación Q1: ' + executiveMetrics.q1CapacityOccupancyPercent + '%'
    })

    const wb = XLSX.utils.book_new()
    const ws1 = XLSX.utils.json_to_sheet(rowsConsumo)
    const ws2 = XLSX.utils.json_to_sheet(rowsGuatemala)

    XLSX.utils.book_append_sheet(wb, ws1, 'Consumo_Trimestral_MRP')
    XLSX.utils.book_append_sheet(wb, ws2, 'Apartado_Capacidad_Guatemala')

    const dateStr = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `Consumo_Trimestral_Tela_Apartado_Capacidad_Guatemala_${dateStr}.xlsx`)
    showMessage('success', 'REPORTE DE CONSUMO TRIMESTRAL Y APARTADO DE TELARES EXPORTADO EXITOSAMENTE')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} className="animate-fade-in">
      {/* Top Banner */}
      <div className="glass" style={{
        padding: '1.5rem 1.75rem',
        borderRadius: '1.5rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1.25rem',
        border: '1px solid rgba(14, 165, 233, 0.2)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{
            width: '52px',
            height: '52px',
            borderRadius: '1rem',
            background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.2), rgba(2, 132, 199, 0.4))',
            color: '#38bdf8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            boxShadow: '0 8px 24px rgba(14, 165, 233, 0.25)'
          }}>
            <TrendingUp size={28} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.25rem' }}>
              <span style={{
                background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                padding: '0.2rem 0.6rem',
                borderRadius: '0.4rem',
                fontSize: '0.65rem',
                fontWeight: 900,
                color: 'white',
                letterSpacing: '0.08em'
              }}>
                MRP DEMAND PLANNING 2026
              </span>
              <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 800 }}>•</span>
              <span style={{ fontSize: '0.7rem', color: '#38bdf8', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Globe2 size={13} /> MOLINO GUATEMALA & CONFECCIÓN
              </span>
            </div>
            <h3 style={{ fontSize: '1.35rem', fontWeight: 900, color: 'white', textTransform: 'uppercase', letterSpacing: '-0.01em' }}>
              PLANEACIÓN DE DEMANDA & FORECASTING DE TELAS
            </h3>
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.2rem' }}>
              PROYECCIÓN A 6 MESES Y CORTES TRIMESTRALES DE MATERIAS PRIMAS (LISOS EN CRUDO VS FANTASÍAS MTO) PARA APARTADO DE CAPACIDAD EN TELAR.
            </p>
          </div>
        </div>

        {/* Actions & Buffer Control */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.08)',
            padding: '0.45rem 0.85rem',
            borderRadius: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 900, color: '#94a3b8' }}>BUFFER MERMA:</span>
            <select
              value={safetyBufferPercent}
              onChange={(e) => setSafetyBufferPercent(Number(e.target.value))}
              style={{
                background: '#020617',
                border: '1px solid rgba(14, 165, 233, 0.4)',
                color: '#38bdf8',
                borderRadius: '0.4rem',
                padding: '0.2rem 0.5rem',
                fontSize: '0.7rem',
                fontWeight: 900,
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value={0}>0% (Neto)</option>
              <option value={5}>+5% (Estándar)</option>
              <option value={10}>+10% (Recomendado)</option>
              <option value={15}>+15% (Pico Alta Demanda)</option>
            </select>
          </div>

          <button
            onClick={handleExportDemandPlanExcel}
            style={{
              background: 'linear-gradient(135deg, #059669, #047857)',
              color: 'white',
              border: 'none',
              padding: '0.7rem 1.35rem',
              borderRadius: '0.875rem',
              fontWeight: 900,
              fontSize: '0.75rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: '0 4px 14px rgba(5, 150, 105, 0.4)'
            }}
          >
            <Download size={16} /> EXPORTAR REPORTE TRIMESTRAL (EXCEL)
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {/* ── KPI METRICS CARDS & GUATEMALA LOOM OCCUPANCY ── */}
      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
        {/* Card 1: Total Telas Semestral */}
        <div className="glass" style={{ padding: '1.25rem', borderRadius: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', borderLeft: '4px solid #0ea5e9' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase' }}>
              CONSUMO TOTAL TELAS (6 MESES)
            </span>
            <Scissors size={18} color="#0ea5e9" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'white' }}>
            {executiveMetrics.totalMts6M.toLocaleString()} <span style={{ fontSize: '0.9rem', color: '#38bdf8' }}>MTS</span>
          </div>
          <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
            Q1: <strong style={{ color: '#f1f5f9' }}>{executiveMetrics.q1FabricMts.toLocaleString()} mts</strong> • Q2: <strong style={{ color: '#f1f5f9' }}>{executiveMetrics.q2FabricMts.toLocaleString()} mts</strong>
          </div>
        </div>

        {/* Card 2: Telas Lisas (Greige / Crudo) */}
        <div className="glass" style={{ padding: '1.25rem', borderRadius: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', borderLeft: '4px solid #22c55e' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase' }}>
              TELAS LISAS (STOCK CRUDO / GREIGE)
            </span>
            <Factory size={18} color="#22c55e" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#22c55e' }}>
            {executiveMetrics.totalLisosMts.toLocaleString()} <span style={{ fontSize: '0.9rem', color: '#86efac' }}>MTS</span>
          </div>
          <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
            Permite stock en crudo • Lead Time: <strong style={{ color: '#22c55e' }}>18 días (Teñido + Tránsito)</strong>
          </div>
        </div>

        {/* Card 3: Telas Fantasía (Make to Order) */}
        <div className="glass" style={{ padding: '1.25rem', borderRadius: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase' }}>
              FANTASÍAS (PRODUCCIÓN CERO MTO)
            </span>
            <AlertCircle size={18} color="#f59e0b" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#f59e0b' }}>
            {executiveMetrics.totalFantasiaMts.toLocaleString()} <span style={{ fontSize: '0.9rem', color: '#fde68a' }}>MTS</span>
          </div>
          <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
            Sin stock crudo • Lead Time: <strong style={{ color: '#f59e0b' }}>55 días (Hilado + Tejido + Acabado)</strong>
          </div>
        </div>

        {/* Card 4: Apartado Capacidad Guatemala */}
        <div className="glass" style={{ padding: '1.25rem', borderRadius: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', borderLeft: '4px solid #8b5cf6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase' }}>
              TELARES MOLINO GUATEMALA
            </span>
            <Globe2 size={18} color="#8b5cf6" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.8rem', fontWeight: 900, color: '#c084fc' }}>
              {executiveMetrics.q1CapacityOccupancyPercent}%
            </span>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 800 }}>OCUPACIÓN Q1</span>
          </div>
          {/* Progress bar */}
          <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '999px', overflow: 'hidden' }}>
            <div style={{ width: `${executiveMetrics.q1CapacityOccupancyPercent}%`, height: '100%', background: 'linear-gradient(90deg, #8b5cf6, #ec4899)', borderRadius: '999px' }} />
          </div>
          <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
            Capacidad: <strong>{executiveMetrics.monthlyLoomCapacity.toLocaleString()} mts/mes</strong> ({executiveMetrics.quarterlyLoomCapacity.toLocaleString()} mts/trimestre)
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {/* ── SECCIÓN INFORMATIVA: REGLAS ESTRICTAS DE TIPOLOGÍA DE TELA ── */}
      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      <div style={{
        background: 'rgba(15, 23, 42, 0.6)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '1.25rem',
        padding: '1.25rem 1.5rem',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '1.25rem'
      }}>
        {/* Col 1: LISOS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ background: '#059669', color: 'white', fontSize: '0.6rem', fontWeight: 900, padding: '0.15rem 0.5rem', borderRadius: '0.3rem' }}>
              TIPO A: LISOS
            </span>
            <strong style={{ fontSize: '0.75rem', color: '#34d399' }}>PERMITE STOCK EN CRUDO / GREIGE (MOLINO GUATEMALA)</strong>
          </div>
          <p style={{ fontSize: '0.68rem', color: '#94a3b8', lineHeight: 1.4 }}>
            Estas telas se fabrican y almacenan en estado "Crudo" (sin teñir). Al detonarse el requerimiento, solo se suma el tiempo de teñido + tránsito logístico.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.2rem' }}>
            {RESTRICTED_LISOS.map(l => (
              <span key={l} style={{ fontSize: '0.62rem', fontWeight: 900, background: 'rgba(16, 185, 129, 0.15)', color: '#6ee7b7', padding: '0.2rem 0.5rem', borderRadius: '0.4rem', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                ✓ {l}
              </span>
            ))}
          </div>
        </div>

        {/* Col 2: FANTASÍAS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ background: '#d97706', color: 'white', fontSize: '0.6rem', fontWeight: 900, padding: '0.15rem 0.5rem', borderRadius: '0.3rem' }}>
              TIPO B: FANTASÍA
            </span>
            <strong style={{ fontSize: '0.75rem', color: '#fbbf24' }}>PRODUCCIÓN CERO / MAKE-TO-ORDER (NO PERMITE CRUDO)</strong>
          </div>
          <p style={{ fontSize: '0.68rem', color: '#94a3b8', lineHeight: 1.4 }}>
            Su construcción requiere hilos teñidos previamente. No pueden tener stock en crudo. El Lead Time contempla la cadena completa: Compra hilo + Teñido hilo + Urdido + Tejido + Acabado + Tránsito.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.2rem' }}>
            {FANTASIA_PATTERNS.map(f => (
              <span key={f} style={{ fontSize: '0.62rem', fontWeight: 900, background: 'rgba(245, 158, 11, 0.15)', color: '#fde047', padding: '0.2rem 0.5rem', borderRadius: '0.4rem', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                ⚙ {f}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {/* ── FILTER & CONTROL BAR ── */}
      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      <div className="glass" style={{ padding: '1rem 1.25rem', borderRadius: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          {/* Search */}
          <div style={{ position: 'relative', width: '240px' }}>
            <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
            <input
              type="text"
              placeholder="BUSCAR INSUMO O TELA..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '0.75rem',
                padding: '0.5rem 0.75rem 0.5rem 2.2rem',
                color: 'white',
                fontSize: '0.72rem',
                outline: 'none',
                textTransform: 'uppercase'
              }}
            />
          </div>

          {/* Filter Type */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            style={{
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '0.75rem',
              padding: '0.5rem 0.85rem',
              color: 'white',
              fontSize: '0.72rem',
              fontWeight: 800,
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="ALL">TODOS LOS INSUMOS ({materialExplosion.length})</option>
            <option value="TELA">🧵 TELAS ({materialExplosion.filter(m => m.type === 'TELA').length})</option>
            <option value="AVÍO">🔘 AVÍOS & FORNITURAS ({materialExplosion.filter(m => m.type !== 'TELA').length})</option>
          </select>

          {/* Filter Behavior */}
          <select
            value={filterBehavior}
            onChange={(e) => setFilterBehavior(e.target.value)}
            style={{
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '0.75rem',
              padding: '0.5rem 0.85rem',
              color: 'white',
              fontSize: '0.72rem',
              fontWeight: 800,
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="ALL">TODAS LAS TIPOLOGÍAS</option>
            <option value="LISO">🟢 LISOS (PERMITE CRUDO)</option>
            <option value="FANTASIA">🟡 FANTASÍA (PRODUCCIÓN CERO)</option>
          </select>

          {/* Filter Supplier Origin */}
          <select
            value={filterSupplier}
            onChange={(e) => setFilterSupplier(e.target.value)}
            style={{
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '0.75rem',
              padding: '0.5rem 0.85rem',
              color: 'white',
              fontSize: '0.72rem',
              fontWeight: 800,
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="ALL">TODOS LOS ORÍGENES</option>
            <option value="GUATEMALA">🇬🇹 MOLINO GUATEMALA</option>
            <option value="MÉXICO">🇲🇽 PROVEEDORES NACIONALES</option>
          </select>
        </div>

        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#38bdf8', background: 'rgba(14, 165, 233, 0.1)', padding: '0.4rem 0.8rem', borderRadius: '999px', border: '1px solid rgba(14, 165, 233, 0.2)' }}>
          {filteredMaterials.length} INSUMOS EN PROYECCIÓN
        </span>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {/* ── TABLA DE EXPLOSIÓN Y FORECASTING TRIMESTRAL / SEMESTRAL ── */}
      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      <div className="glass" style={{ borderRadius: '1.25rem', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ overflowX: 'auto', maxHeight: '600px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
            <thead>
              <tr style={{ background: '#0b1120', color: '#94a3b8', borderBottom: '2px solid rgba(14, 165, 233, 0.3)', textAlign: 'left', position: 'sticky', top: 0, zIndex: 10 }}>
                <th style={{ padding: '1rem', minWidth: '180px' }}>CÓDIGO & MATERIA PRIMA</th>
                <th style={{ padding: '1rem', textAlign: 'center', minWidth: '130px' }}>TIPOLOGÍA TELA</th>
                <th style={{ padding: '1rem', textAlign: 'center', minWidth: '120px' }}>ESTADO / GREIGE</th>
                <th style={{ padding: '1rem', textAlign: 'center', minWidth: '100px' }}>LEAD TIME</th>
                <th style={{ padding: '1rem', textAlign: 'right', minWidth: '90px', background: 'rgba(14, 165, 233, 0.05)' }}>MES 1</th>
                <th style={{ padding: '1rem', textAlign: 'right', minWidth: '90px', background: 'rgba(14, 165, 233, 0.05)' }}>MES 2</th>
                <th style={{ padding: '1rem', textAlign: 'right', minWidth: '90px', background: 'rgba(14, 165, 233, 0.05)' }}>MES 3</th>
                <th style={{ padding: '1rem', textAlign: 'right', minWidth: '110px', background: 'rgba(14, 165, 233, 0.15)', color: '#38bdf8', fontWeight: 900 }}>TOTAL Q1</th>
                <th style={{ padding: '1rem', textAlign: 'right', minWidth: '90px', background: 'rgba(139, 92, 246, 0.05)' }}>MES 4</th>
                <th style={{ padding: '1rem', textAlign: 'right', minWidth: '90px', background: 'rgba(139, 92, 246, 0.05)' }}>MES 5</th>
                <th style={{ padding: '1rem', textAlign: 'right', minWidth: '90px', background: 'rgba(139, 92, 246, 0.05)' }}>MES 6</th>
                <th style={{ padding: '1rem', textAlign: 'right', minWidth: '110px', background: 'rgba(139, 92, 246, 0.15)', color: '#c084fc', fontWeight: 900 }}>TOTAL Q2</th>
                <th style={{ padding: '1rem', textAlign: 'right', minWidth: '120px', background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', fontWeight: 900 }}>TOTAL 6 MESES</th>
              </tr>
            </thead>
            <tbody>
              {filteredMaterials.map((m, idx) => (
                <tr
                  key={m.code}
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                    background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                    transition: 'background 0.15s'
                  }}
                >
                  {/* Item Description & SKU */}
                  <td style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{
                        fontSize: '0.55rem',
                        fontWeight: 900,
                        padding: '0.12rem 0.4rem',
                        borderRadius: '0.3rem',
                        background: m.type === 'TELA' ? 'rgba(14, 165, 233, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                        color: m.type === 'TELA' ? '#38bdf8' : '#fbbf24'
                      }}>
                        {m.type}
                      </span>
                      <strong style={{ fontFamily: 'monospace', color: '#f1f5f9', fontSize: '0.75rem' }}>{m.code}</strong>
                    </div>
                    <div style={{ color: '#cbd5e1', fontWeight: 800, marginTop: '0.15rem' }}>{m.name}</div>
                    <div style={{ fontSize: '0.62rem', color: '#64748b', marginTop: '0.1rem' }}>
                      Prov: {m.supplier_name} ({m.supplier_origin})
                    </div>
                  </td>

                  {/* Comportamiento Tela */}
                  <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                    {m.type === 'TELA' ? (
                      <span style={{
                        fontSize: '0.62rem',
                        fontWeight: 900,
                        padding: '0.2rem 0.55rem',
                        borderRadius: '0.4rem',
                        background: m.comportamiento === 'LISO' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                        color: m.comportamiento === 'LISO' ? '#4ade80' : '#fde047',
                        border: m.comportamiento === 'LISO' ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)'
                      }}>
                        {m.comportamiento === 'LISO' ? 'TIPO A: LISO' : 'TIPO B: FANTASÍA'}
                      </span>
                    ) : (
                      <span style={{ color: '#64748b', fontSize: '0.65rem' }}>AVÍO / FORNITURA</span>
                    )}
                  </td>

                  {/* Estado / Greige */}
                  <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                    {m.type === 'TELA' ? (
                      m.allows_greige_stock ? (
                        <div style={{ fontSize: '0.65rem', color: '#22c55e', fontWeight: 800 }}>
                          ✓ STOCK EN CRUDO ({m.greige_requirement_mts.toLocaleString()} mts)
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.65rem', color: '#f59e0b', fontWeight: 800 }}>
                          ⚙ MTO / TEÑIDO PREVIO ({m.mto_fantasia_mts.toLocaleString()} mts)
                        </div>
                      )
                    ) : (
                      <span style={{ color: '#94a3b8' }}>DIRECTO ({m.unit})</span>
                    )}
                  </td>

                  {/* Lead Time */}
                  <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                    <span style={{
                      fontFamily: 'monospace',
                      fontWeight: 900,
                      color: m.lead_time_days > 30 ? '#f59e0b' : '#38bdf8',
                      background: 'rgba(0,0,0,0.3)',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '0.4rem'
                    }}>
                      {m.lead_time_days} DÍAS
                    </span>
                  </td>

                  {/* Monthly Q1 Breakdown */}
                  <td style={{ padding: '0.85rem 1rem', textAlign: 'right', background: 'rgba(14, 165, 233, 0.02)', color: '#cbd5e1' }}>
                    {m.m1.toLocaleString()} {m.unit}
                  </td>
                  <td style={{ padding: '0.85rem 1rem', textAlign: 'right', background: 'rgba(14, 165, 233, 0.02)', color: '#cbd5e1' }}>
                    {m.m2.toLocaleString()} {m.unit}
                  </td>
                  <td style={{ padding: '0.85rem 1rem', textAlign: 'right', background: 'rgba(14, 165, 233, 0.02)', color: '#cbd5e1' }}>
                    {m.m3.toLocaleString()} {m.unit}
                  </td>

                  {/* Total Q1 */}
                  <td style={{ padding: '0.85rem 1rem', textAlign: 'right', background: 'rgba(14, 165, 233, 0.1)', color: '#38bdf8', fontWeight: 900, fontSize: '0.78rem' }}>
                    {m.q1_total.toLocaleString()} {m.unit}
                  </td>

                  {/* Monthly Q2 Breakdown */}
                  <td style={{ padding: '0.85rem 1rem', textAlign: 'right', background: 'rgba(139, 92, 246, 0.02)', color: '#cbd5e1' }}>
                    {m.m4.toLocaleString()} {m.unit}
                  </td>
                  <td style={{ padding: '0.85rem 1rem', textAlign: 'right', background: 'rgba(139, 92, 246, 0.02)', color: '#cbd5e1' }}>
                    {m.m5.toLocaleString()} {m.unit}
                  </td>
                  <td style={{ padding: '0.85rem 1rem', textAlign: 'right', background: 'rgba(139, 92, 246, 0.02)', color: '#cbd5e1' }}>
                    {m.m6.toLocaleString()} {m.unit}
                  </td>

                  {/* Total Q2 */}
                  <td style={{ padding: '0.85rem 1rem', textAlign: 'right', background: 'rgba(139, 92, 246, 0.1)', color: '#c084fc', fontWeight: 900, fontSize: '0.78rem' }}>
                    {m.q2_total.toLocaleString()} {m.unit}
                  </td>

                  {/* Total 6 Meses */}
                  <td style={{ padding: '0.85rem 1rem', textAlign: 'right', background: 'rgba(34, 197, 94, 0.1)', color: '#4ade80', fontWeight: 900, fontSize: '0.82rem' }}>
                    {m.total_6m.toLocaleString()} {m.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
