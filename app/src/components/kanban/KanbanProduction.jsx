import React, { useState, useEffect } from 'react'
import { db } from '../../firebase'
import { supabase } from '../../supabaseClient'
import { collection, doc, setDoc, updateDoc, onSnapshot, getDocs } from 'firebase/firestore'
import { generateWorkOrderPDF } from '../../utils/kanbanPDFGenerator'
import {
  Scissors, Layers, Download, CheckCircle, Clock, AlertTriangle,
  FileSpreadsheet, Plus, ExternalLink, Calendar, Truck, UserCheck, Search, Edit3,
  Box, Package, ShieldAlert
} from 'lucide-react'

export default function KanbanProduction({ canEdit = true, userEmail = '', showMessage }) {
  const [loading, setLoading] = useState(false)
  const [boms, setBoms] = useState([])
  const [thresholds, setThresholds] = useState([])
  const [erpStock, setErpStock] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [productionOrders, setProductionOrders] = useState([])
  const [standards, setStandards] = useState([])

  const [activeTab, setActiveTab] = useState('deficit') // 'deficit' | 'orders'
  const [search, setSearch] = useState('')
  const [filterWh, setFilterWh] = useState('ALL')

  // Partial Production Warning Modal
  const [partialModal, setPartialModal] = useState(null)

  // Manual ERP Edit Modal
  const [editingErpModal, setEditingErpModal] = useState(null) // order object

  // Real-time listeners
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

    const unsubOps = onSnapshot(collection(db, 'kanban_production_orders'), snap => {
      const list = []
      snap.forEach(d => list.push({ id: d.id, ...d.data() }))
      list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      setProductionOrders(list)
    })

    // Fetch Packing Standards from Supabase
    const fetchStandards = async () => {
      try {
        const { data } = await supabase.from('maquila_box_standards').select('*')
        if (data) setStandards(data)
      } catch (e) {
        console.error('Error fetching standards in KanbanProduction:', e)
      }
    }
    fetchStandards()

    return () => {
      unsubBoms()
      unsubThresh()
      unsubErp()
      unsubSuppliers()
      unsubOps()
    }
  }, [])

  // Stock Map with alias mapping
  const stockMap = {}
  erpStock.forEach(s => {
    const key = `${s.code}_${s.talla}_${s.warehouse}`
    const qty = Number(s.stock || 0)
    stockMap[key] = (stockMap[key] || 0) + qty

    if (s.warehouse === 'MEXICO') {
      stockMap[`${s.code}_${s.talla}_CDMX`] = (stockMap[`${s.code}_${s.talla}_CDMX`] || 0) + qty
      stockMap[`${s.code}_${s.talla}_MEXICO (CDMX)`] = (stockMap[`${s.code}_${s.talla}_MEXICO (CDMX)`] || 0) + qty
    }
    if (s.warehouse === 'MONTERREY') {
      stockMap[`${s.code}_${s.talla}_MTY`] = (stockMap[`${s.code}_${s.talla}_MTY`] || 0) + qty
      stockMap[`${s.code}_${s.talla}_MONTERREY (MTY)`] = (stockMap[`${s.code}_${s.talla}_MONTERREY (MTY)`] || 0) + qty
    }
  })

  // ── Calculate Production Deficits with Packaging Standards ──
  const productionDeficits = thresholds.map(th => {
    const destKey = `${th.code}_${th.talla}_${th.warehouse}`
    const destStock = stockMap[destKey] || 0

    // Virtual stock
    if (destStock <= (th.min_stock || 10)) {
      // Check if origins (Planta / Matriz / Mty) also lack stock
      const plantaStock = stockMap[`${th.code}_${th.talla}_PLANTA`] || 0
      const matrizStock = stockMap[`${th.code}_${th.talla}_MATRIZ`] || 0
      const totalAvailable = plantaStock + matrizStock

      // If origin does NOT have enough stock, Detonate Production BOM Explosion!
      const neededQty = Math.max(0, (th.max_stock || 50) - destStock)

      if (totalAvailable < neededQty) {
        const bom = boms.find(b => b.code === th.code)
        const std = standards.find(s => s.code === th.code && s.talla === th.talla)
        const pzasPorCaja = std ? Number(std.pzas_por_caja || 0) : 0
        const needed = neededQty - totalAvailable
        
        const fullBoxes = pzasPorCaja > 0 ? Math.floor(needed / pzasPorCaja) : 0
        const remainder = pzasPorCaja > 0 ? (needed % pzasPorCaja) : 0
        const suggestedQty = pzasPorCaja > 0 ? Math.ceil(needed / pzasPorCaja) * pzasPorCaja : needed
        const isPartial = pzasPorCaja > 0 && (needed % pzasPorCaja !== 0 || needed < pzasPorCaja)

        return {
          key: destKey,
          code: th.code,
          description: th.description || bom?.description || 'Prenda Airman',
          talla: th.talla,
          warehouse_dest: th.warehouse,
          dest_stock: destStock,
          origin_stock: totalAvailable,
          min_stock: th.min_stock || 10,
          max_stock: th.max_stock || 50,
          needed: needed,
          bom: bom || null,
          has_bom: !!bom,
          pzas_por_caja: pzasPorCaja,
          full_boxes: fullBoxes,
          remainder: remainder,
          suggested_qty: suggestedQty,
          is_partial: isPartial
        }
      }
    }
    return null
  }).filter(Boolean)

  // ═══════════════════════════════════════════════════════════════════════════
  // ── Emitir Orden de Producción con Validación de Estándar de Empaque ──
  // ═══════════════════════════════════════════════════════════════════════════
  const handleCreateProductionOrder = (item, supplierId) => {
    if (!canEdit) return showMessage('error', 'No tienes permisos de edición.')
    if (!item.has_bom) {
      return showMessage('error', `El producto ${item.code} no tiene una BOM configurada. Ve a Configuración Maestra primero.`)
    }

    const pzasPorCaja = Number(item.pzas_por_caja || 0)
    const needed = Number(item.needed || 0)

    // Si tiene estándar de caja y la cantidad no es múltiplo o es menor, detonar advertencia de Producción Parcial
    if (pzasPorCaja > 0 && (needed % pzasPorCaja !== 0 || needed < pzasPorCaja)) {
      setPartialModal({
        item,
        supplierId,
        requestedQty: needed,
        pzasPorCaja,
        suggestedQty: item.suggested_qty || Math.ceil(needed / pzasPorCaja) * pzasPorCaja,
        fullBoxes: item.full_boxes || Math.floor(needed / pzasPorCaja),
        remainder: item.remainder || (needed % pzasPorCaja)
      })
      return
    }

    // Producción con estándar de caja cerrada exacto o sin estándar registrado
    executeCreateProductionOrder(item, supplierId, needed, false)
  }

  const executeCreateProductionOrder = async (item, supplierId, totalGarments, isPartial = false) => {
    const supplier = suppliers.find(s => s.id === supplierId) || suppliers[0] || {
      id: 'SUP-001',
      name: 'TALLER GENERAL',
      lead_time_days: 7,
      logistics_days: 2
    }

    setLoading(true)
    try {
      const folio = `OP-${item.code}-${Date.now().toString().slice(-5)}`
      const pzasPorCaja = Number(item.pzas_por_caja || 0)

      // Explode BOM using the EXACT granular consumption configured for item.talla
      const sizeCons = item.bom?.size_consumptions?.[item.talla] || {}
      const bomBreakdown = (item.bom?.materials || []).map(m => {
        const matKey = m.code || m.id || m.name
        let exactConsumption = sizeCons[matKey]
        if (exactConsumption === undefined || exactConsumption === '' || isNaN(Number(exactConsumption))) {
          // Fallback to average/default consumption
          exactConsumption = m.consumption || (m.type === 'TELA' ? 1.35 : 1)
        }
        exactConsumption = Number(exactConsumption)

        return {
          material_type: m.type,
          material_name: m.name,
          material_code: m.code || matKey,
          consumption_per_unit: exactConsumption,
          total_required: (exactConsumption * totalGarments).toFixed(2),
          unit: m.unit,
          notes: m.notes || `Consumo exacto para talla ${item.talla}`
        }
      })

      // Calculate committed delivery date based on lead times
      const totalDays = (supplier.lead_time_days || 7) + (supplier.logistics_days || 1)
      const committedDate = new Date(Date.now() + totalDays * 86400000).toISOString().slice(0, 10)

      const newOp = {
        folio,
        code: item.code,
        description: item.description,
        gender: item.bom?.gender || 'CABALLERO',
        talla: item.talla,
        quantity: totalGarments,
        warehouse_dest: item.warehouse_dest,
        supplier_id: supplier.id,
        supplier_name: supplier.name,
        supplier_lead_time_days: supplier.lead_time_days || 7,
        supplier_logistics_days: supplier.logistics_days || 1,
        created_at: new Date().toISOString(),
        created_by: userEmail || 'Planeación Automática',
        committed_delivery_date: committedDate,
        status: 'PENDIENTE_AUTORIZACION', // Sent to Planning Inbox!
        bom_breakdown: bomBreakdown,
        erp_op_number: '',
        erp_sm_number: '',
        delay_comments: [],
        box_standard: pzasPorCaja,
        is_partial_production: isPartial,
        boxes_count: pzasPorCaja > 0 ? (totalGarments / pzasPorCaja).toFixed(1) : 'N/A',
        notes: `Explosión de BOM talla ${item.talla} (${item.bom?.gender || 'CABALLERO'})${isPartial ? ' [PRODUCCIÓN PARCIAL AUTORIZADA]' : ' [CAJA CERRADA]'}`
      }

      await setDoc(doc(db, 'kanban_production_orders', folio), newOp)

      // Automatically generate Work Order PDF with linear horizontal size matrix and standards
      generateWorkOrderPDF(newOp, bomBreakdown, supplier, standards)

      showMessage('success', `ORDEN ${folio} GENERADA (${totalGarments} PZAS${isPartial ? ' - PRODUCCIÓN PARCIAL' : ' - CAJA CERRADA'}) Y ENVIADA AL BUZÓN`)
      setPartialModal(null)
      setActiveTab('orders')
    } catch (err) {
      console.error(err)
      showMessage('error', 'Error al generar Orden de Producción: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ── Sincronización Manual de Campos ERP (# SM y # OP) ──
  // ═══════════════════════════════════════════════════════════════════════════
  const handleSaveErpFields = async (folio, opNumber, smNumber) => {
    if (!canEdit) return showMessage('error', 'No tienes permisos de edición.')
    try {
      await updateDoc(doc(db, 'kanban_production_orders', folio), {
        erp_op_number: opNumber.trim().toUpperCase(),
        erp_sm_number: smNumber.trim().toUpperCase(),
        erp_synced_at: new Date().toISOString(),
        erp_synced_by: userEmail
      })
      showMessage('success', `CAMPOS ERP ACTUALIZADOS EN ${folio}`)
      setEditingErpModal(null)
    } catch (e) {
      showMessage('error', 'Error al guardar referencias del ERP')
    }
  }

  // Filtered lists
  const filteredDeficits = productionDeficits.filter(d => {
    const matchSearch = (d.code || '').toLowerCase().includes(search.toLowerCase()) ||
                        (d.description || '').toLowerCase().includes(search.toLowerCase())
    const matchWh = filterWh === 'ALL' || d.warehouse_dest === filterWh
    return matchSearch && matchWh
  })

  const filteredOrders = productionOrders.filter(o => {
    const matchSearch = (o.folio || '').toLowerCase().includes(search.toLowerCase()) ||
                        (o.code || '').toLowerCase().includes(search.toLowerCase()) ||
                        (o.supplier_name || '').toLowerCase().includes(search.toLowerCase())
    const matchWh = filterWh === 'ALL' || o.warehouse_dest === filterWh
    return matchSearch && matchWh
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} className="animate-fade-in">
      {/* Sub tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(255,255,255,0.03)', padding: '0.35rem', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            onClick={() => setActiveTab('deficit')}
            style={{
              padding: '0.65rem 1.25rem',
              borderRadius: '0.75rem',
              fontWeight: 900,
              fontSize: '0.7rem',
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'deficit' ? '#0284c7' : 'transparent',
              color: activeTab === 'deficit' ? 'white' : '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <Scissors size={15} /> DETONADORES DE PRODUCCIÓN (EXPLOSIÓN BOM)
            <span style={{ background: 'rgba(255,255,255,0.2)', padding: '0.1rem 0.4rem', borderRadius: '999px', fontSize: '0.6rem' }}>
              {productionDeficits.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('orders')}
            style={{
              padding: '0.65rem 1.25rem',
              borderRadius: '0.75rem',
              fontWeight: 900,
              fontSize: '0.7rem',
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'orders' ? '#0284c7' : 'transparent',
              color: activeTab === 'orders' ? 'white' : '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <Layers size={15} /> ÓRDENES DE PRODUCCIÓN EMITIDAS
            <span style={{ background: 'rgba(255,255,255,0.2)', padding: '0.1rem 0.4rem', borderRadius: '999px', fontSize: '0.6rem' }}>
              {productionOrders.length}
            </span>
          </button>
        </div>

        {/* Filter / Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ position: 'relative', width: '220px' }}>
            <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
            <input
              type="text"
              placeholder="BUSCAR OP O CÓDIGO..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '0.75rem',
                padding: '0.5rem 0.75rem 0.5rem 2.2rem',
                color: 'white',
                fontSize: '0.7rem',
                outline: 'none',
                textTransform: 'uppercase'
              }}
            />
          </div>

          <select
            value={filterWh}
            onChange={(e) => setFilterWh(e.target.value)}
            style={{
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '0.75rem',
              padding: '0.5rem 0.75rem',
              color: 'white',
              fontSize: '0.7rem',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="ALL">TODAS LAS SUCURSALES</option>
            {['MEXICO', 'MONTERREY', 'MATRIZ'].map(wh => <option key={wh} value={wh} style={{ background: '#0b0e14' }}>{wh}</option>)}
          </select>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* ── TAB 1: Detonadores de Producción & Explosión de BOM ── */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'deficit' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="glass" style={{ padding: '1.25rem 1.5rem', borderRadius: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 900, color: 'white', textTransform: 'uppercase' }}>
                DETECCIÓN DE FALTANTE EN ORIGEN &gt; EXPLOSIÓN AUTOMÁTICA DE BOM
              </h3>
              <p style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                SKUs que cayeron al mínimo pero los almacenes origen no tienen existencias suficientes. Detona la explosión de tela y avíos para emitir OP al taller maquilero.
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.25rem' }}>
            {filteredDeficits.map(item => {
              return (
                <div
                  key={item.key}
                  className="glass"
                  style={{
                    borderRadius: '1.25rem',
                    padding: '1.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    border: '1px solid rgba(255,255,255,0.06)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span style={{ fontSize: '0.6rem', fontWeight: 900, color: '#ef4444', background: 'rgba(239, 68, 68, 0.15)', padding: '0.2rem 0.5rem', borderRadius: '0.4rem' }}>
                        FALTANTE EN FÁBRICA
                      </span>
                      <h4 style={{ fontSize: '1.1rem', fontWeight: 900, color: 'white', marginTop: '0.4rem' }}>
                        {item.code} - {item.talla}
                      </h4>
                      <p style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                        {item.description}
                      </p>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '0.58rem', color: '#64748b', fontWeight: 800, display: 'block' }}>REQUERIDO</span>
                      <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#f59e0b' }}>
                        {item.needed} pzas
                      </span>
                    </div>
                  </div>

                  {/* Stock Metrics */}
                  <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '0.75rem', padding: '0.75rem 1rem', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', fontSize: '0.68rem', textAlign: 'center' }}>
                    <div>
                      <span style={{ color: '#64748b', fontSize: '0.55rem', fontWeight: 800, display: 'block' }}>EN DESTINO ({item.warehouse_dest})</span>
                      <span style={{ color: '#ef4444', fontWeight: 900 }}>{item.dest_stock} pzas</span>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', fontSize: '0.55rem', fontWeight: 800, display: 'block' }}>EN ORIGEN (CEDIS)</span>
                      <span style={{ color: '#94a3b8', fontWeight: 900 }}>{item.origin_stock} pzas</span>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', fontSize: '0.55rem', fontWeight: 800, display: 'block' }}>TECHO MÁXIMO</span>
                      <span style={{ color: '#22c55e', fontWeight: 900 }}>{item.max_stock} pzas</span>
                    </div>
                  </div>

                  {/* Packaging Standard & Closed Box Suggestion */}
                  <div style={{
                    background: item.pzas_por_caja > 0 ? (item.is_partial ? 'rgba(245, 158, 11, 0.08)' : 'rgba(34, 197, 94, 0.08)') : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${item.pzas_por_caja > 0 ? (item.is_partial ? 'rgba(245, 158, 11, 0.25)' : 'rgba(34, 197, 94, 0.25)') : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: '0.75rem',
                    padding: '0.65rem 0.85rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#c4b5fd', fontSize: '0.68rem', fontWeight: 800 }}>
                        <Box size={13} color="#a78bfa" />
                        <span>ESTÁNDAR: <b style={{ color: 'white' }}>{item.pzas_por_caja > 0 ? `${item.pzas_por_caja} PZAS / CAJA` : 'SIN REGISTRAR'}</b></span>
                      </div>
                      {item.pzas_por_caja > 0 && (
                        <span style={{
                          fontSize: '0.58rem',
                          fontWeight: 900,
                          color: item.is_partial ? '#f59e0b' : '#22c55e',
                          background: item.is_partial ? 'rgba(245, 158, 11, 0.18)' : 'rgba(34, 197, 94, 0.18)',
                          padding: '0.15rem 0.45rem',
                          borderRadius: '0.35rem'
                        }}>
                          {item.is_partial ? `⚠️ PARCIAL (${item.full_boxes} CJ + ${item.remainder} PZA)` : `✓ ${item.full_boxes} CAJAS CERRADAS`}
                        </span>
                      )}
                    </div>
                    {item.pzas_por_caja > 0 && item.is_partial && (
                      <p style={{ fontSize: '0.62rem', color: '#cbd5e1', margin: 0 }}>
                        💡 Sugerencia: <b>{Math.ceil(item.needed / item.pzas_por_caja)} cajas cerradas ({item.suggested_qty} pzas)</b> para optimizar empaque.
                      </p>
                    )}
                  </div>

                  {/* BOM Materials preview */}
                  {item.has_bom ? (
                    <div style={{ background: 'rgba(2, 132, 199, 0.05)', border: '1px solid rgba(2, 132, 199, 0.15)', borderRadius: '0.75rem', padding: '0.75rem', fontSize: '0.65rem' }}>
                      <div style={{ fontWeight: 900, color: '#38bdf8', marginBottom: '0.35rem', display: 'flex', justifyContent: 'space-between' }}>
                        <span>EXPLOSIÓN DE INSUMOS ({item.bom.materials?.length || 0})</span>
                        <span>TOTAL CALC.</span>
                      </div>
                      {item.bom.materials?.map((m, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1', paddingTop: '0.2rem' }}>
                          <span>• {m.name} ({m.type})</span>
                          <span style={{ color: 'white', fontWeight: 800 }}>{(m.consumption * item.needed).toFixed(2)} {m.unit}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px dashed rgba(239, 68, 68, 0.3)', padding: '0.75rem', borderRadius: '0.75rem', fontSize: '0.65rem', color: '#fca5a5' }}>
                      ⚠️ <strong>Sin Lista de Materiales (BOM):</strong> Configura la BOM de {item.code} en la pestaña "Configuración Maestra" para permitir la explosión de insumos.
                    </div>
                  )}

                  {/* Supplier selector & action */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: 'auto' }}>
                    <label style={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 800 }}>ASIGNAR MAQUILERO / TALLER</label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <select
                        id={`sup_${item.key}`}
                        defaultValue={suppliers[0]?.id || ''}
                        disabled={!canEdit || !item.has_bom}
                        style={{ flex: 1, background: '#020617', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.6rem', padding: '0.5rem', color: 'white', fontSize: '0.7rem' }}
                      >
                        {suppliers.map(s => (
                          <option key={s.id} value={s.id} style={{ background: '#0b0e14' }}>
                            {s.name} ({s.lead_time_days}d conv + {s.logistics_days}d trasl)
                          </option>
                        ))}
                      </select>

                      <button
                        onClick={() => {
                          const supSelect = document.getElementById(`sup_${item.key}`)
                          handleCreateProductionOrder(item, supSelect?.value)
                        }}
                        disabled={!canEdit || !item.has_bom || loading}
                        style={{
                          background: item.has_bom ? '#0284c7' : 'rgba(255,255,255,0.05)',
                          color: 'white',
                          border: 'none',
                          padding: '0.5rem 1rem',
                          borderRadius: '0.6rem',
                          fontWeight: 900,
                          fontSize: '0.68rem',
                          cursor: item.has_bom && canEdit ? 'pointer' : 'not-allowed',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        <Download size={13} /> EMITIR OP (PDF)
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
            {filteredDeficits.length === 0 && (
              <div style={{ padding: '3.5rem', textAlign: 'center', color: '#64748b', gridColumn: '1 / -1' }}>
                <CheckCircle size={32} style={{ color: '#22c55e', margin: '0 auto 0.5rem' }} />
                <p style={{ fontWeight: 800, textTransform: 'uppercase' }}>NO HAY DÉFICITS PENDIENTES DE FABRICACIÓN</p>
                <p style={{ fontSize: '0.65rem', marginTop: '0.25rem' }}>Todos los almacenes cuentan con inventario o traspasos activos.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* ── TAB 2: Órdenes de Producción Emitidas & Captura ERP ── */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'orders' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.25rem' }}>
          {filteredOrders.map(op => {
            const isPendingAuth = op.status === 'PENDIENTE_AUTORIZACION'
            const isApproved = op.status === 'EN_CONFECCION' || op.status === 'EN_TRANSITO'
            const isRejected = op.status === 'CANCELADO_PLANIFICACION' || op.status === 'RECHAZADO'

            return (
              <div
                key={op.folio || op.id}
                className="glass"
                style={{
                  borderRadius: '1.25rem',
                  padding: '1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                  border: isPendingAuth ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(255,255,255,0.06)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{
                      fontSize: '0.6rem', fontWeight: 900, padding: '0.2rem 0.55rem', borderRadius: '0.4rem',
                      background: isPendingAuth ? 'rgba(245, 158, 11, 0.15)' : isApproved ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: isPendingAuth ? '#f59e0b' : isApproved ? '#22c55e' : '#ef4444'
                    }}>
                      {op.status}
                    </span>
                    <h4 style={{ fontSize: '1.1rem', fontWeight: 900, color: 'white', marginTop: '0.4rem' }}>
                      {op.folio}
                    </h4>
                    <p style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                      {op.code} ({op.talla}) · {op.quantity} prendas
                    </p>
                  </div>

                  <button
                    onClick={() => generateWorkOrderPDF(op, op.bom_breakdown, { name: op.supplier_name })}
                    title="Descargar Hoja de Trabajo PDF"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#38bdf8',
                      padding: '0.5rem',
                      borderRadius: '0.5rem',
                      cursor: 'pointer'
                    }}
                  >
                    <Download size={15} />
                  </button>
                </div>

                {/* Details Grid */}
                <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '0.75rem', padding: '0.75rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.68rem' }}>
                  <div>
                    <span style={{ color: '#64748b', fontSize: '0.55rem', fontWeight: 800, display: 'block' }}>MAQUILERO ASIGNADO</span>
                    <span style={{ color: 'white', fontWeight: 800 }}>{op.supplier_name}</span>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', fontSize: '0.55rem', fontWeight: 800, display: 'block' }}>FECHA COMPROMISO</span>
                    <span style={{ color: '#f59e0b', fontWeight: 900 }}>{op.committed_delivery_date || 'N/A'}</span>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', fontSize: '0.55rem', fontWeight: 800, display: 'block' }}># ORDEN ERP (OP)</span>
                    <span style={{ color: op.erp_op_number ? '#38bdf8' : '#ef4444', fontWeight: 900 }}>
                      {op.erp_op_number || 'PENDIENTE CAPTURA'}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', fontSize: '0.55rem', fontWeight: 800, display: 'block' }}># SALIDA MATERIAL (SM)</span>
                    <span style={{ color: op.erp_sm_number ? '#38bdf8' : '#ef4444', fontWeight: 900 }}>
                      {op.erp_sm_number || 'PENDIENTE CAPTURA'}
                    </span>
                  </div>
                </div>

                {/* Edit ERP Button */}
                <button
                  onClick={() => setEditingErpModal(op)}
                  disabled={!canEdit}
                  style={{
                    background: 'rgba(59, 130, 246, 0.1)',
                    border: '1px solid rgba(59, 130, 246, 0.25)',
                    color: '#60a5fa',
                    padding: '0.55rem',
                    borderRadius: '0.6rem',
                    fontWeight: 800,
                    fontSize: '0.65rem',
                    cursor: canEdit ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.4rem',
                    marginTop: 'auto'
                  }}
                >
                  <Edit3 size={13} /> CAPTURAR / EDITAR FOLIOS ERP (# SM y # OP)
                </button>
              </div>
            )
          })}
          {filteredOrders.length === 0 && (
            <div style={{ padding: '3.5rem', textAlign: 'center', color: '#64748b', gridColumn: '1 / -1' }}>
              No hay órdenes de producción emitidas.
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* ── MODAL: Captura Manual ERP (# SM y # OP) ── */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {editingErpModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '1.5rem'
        }}>
          <div style={{
            background: '#0f172a', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '1.5rem',
            maxWidth: '460px', width: '100%', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem'
          }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 900, color: 'white', textTransform: 'uppercase' }}>
              SINCRONIZACIÓN MANUAL ERP: {editingErpModal.folio}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>
                  # NÚMERO DE ORDEN DE PRODUCCIÓN ERP (OP) *
                </label>
                <input
                  type="text"
                  id="erp_op_input"
                  defaultValue={editingErpModal.erp_op_number || ''}
                  placeholder="EJ. OP-88492"
                  style={{ width: '100%', background: '#020617', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem', padding: '0.65rem', color: 'white', fontSize: '0.8rem', fontWeight: 800 }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>
                  # NÚMERO DE SALIDA DE MATERIAL ERP (SM) *
                </label>
                <input
                  type="text"
                  id="erp_sm_input"
                  defaultValue={editingErpModal.erp_sm_number || ''}
                  placeholder="EJ. SM-10294"
                  style={{ width: '100%', background: '#020617', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem', padding: '0.65rem', color: 'white', fontSize: '0.8rem', fontWeight: 800 }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '1rem' }}>
              <button
                onClick={() => setEditingErpModal(null)}
                style={{ padding: '0.7rem 1.2rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', borderRadius: '0.75rem', fontWeight: 800, fontSize: '0.72rem', cursor: 'pointer' }}
              >
                CANCELAR
              </button>
              <button
                onClick={() => {
                  const opVal = document.getElementById('erp_op_input').value
                  const smVal = document.getElementById('erp_sm_input').value
                  handleSaveErpFields(editingErpModal.folio, opVal, smVal)
                }}
                style={{ padding: '0.7rem 1.4rem', background: '#0284c7', color: 'white', border: 'none', borderRadius: '0.75rem', fontWeight: 900, fontSize: '0.72rem', cursor: 'pointer' }}
              >
                GUARDAR CAMBIOS ERP
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* ── MODAL: Advertencia de Producción Parcial (Empaque No Estándar) ── */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {partialModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1300, padding: '1.5rem'
        }}>
          <div style={{
            background: '#0f172a', border: '1px solid rgba(245, 158, 11, 0.35)', borderRadius: '1.5rem',
            maxWidth: '520px', width: '100%', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(245, 158, 11, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b', flexShrink: 0 }}>
                <AlertTriangle size={24} />
              </div>
              <div>
                <span style={{ fontSize: '0.62rem', fontWeight: 900, color: '#f59e0b', letterSpacing: '0.05em' }}>
                  CONTROL DE EMPAQUE Y ESTÁNDARES
                </span>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 900, color: 'white', textTransform: 'uppercase' }}>
                  ADVERTENCIA: PRODUCCIÓN PARCIAL
                </h3>
              </div>
            </div>

            <p style={{ fontSize: '0.75rem', color: '#94a3b8', lineHeight: 1.5, margin: 0 }}>
              La cantidad calculada para <b>{partialModal.item?.code} ({partialModal.item?.talla})</b> rompe el estándar de caja cerrada configurado.
            </p>

            <div style={{ background: 'rgba(0,0,0,0.35)', borderRadius: '1rem', padding: '1rem 1.25rem', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem' }}>
                <span style={{ color: '#64748b', fontWeight: 800 }}>ESTÁNDAR DE CAJA CERRADA:</span>
                <span style={{ color: '#a78bfa', fontWeight: 900 }}>{partialModal.pzasPorCaja} pzas / caja</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem' }}>
                <span style={{ color: '#64748b', fontWeight: 800 }}>CANTIDAD CALCULADA (DÉFICIT):</span>
                <span style={{ color: '#f59e0b', fontWeight: 900 }}>{partialModal.requestedQty} prendas ({partialModal.fullBoxes} cajas + {partialModal.remainder} pzas sueltas)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.5rem' }}>
                <span style={{ color: '#38bdf8', fontWeight: 800 }}>SUGERENCIA CAJA CERRADA:</span>
                <span style={{ color: '#22c55e', fontWeight: 900 }}>{partialModal.suggestedQty} prendas ({Math.ceil(partialModal.requestedQty / partialModal.pzasPorCaja)} cajas completas)</span>
              </div>
            </div>

            <p style={{ fontSize: '0.7rem', color: '#fca5a5', background: 'rgba(239, 68, 68, 0.08)', border: '1px dashed rgba(239, 68, 68, 0.25)', padding: '0.65rem 0.85rem', borderRadius: '0.6rem', margin: 0 }}>
              ⚠️ Para procesar como orden parcial se requiere tu confirmación explícita, o puedes ajustar automáticamente al estándar de caja cerrada.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.25rem' }}>
              <button
                onClick={() => executeCreateProductionOrder(partialModal.item, partialModal.supplierId, partialModal.suggestedQty, false)}
                style={{
                  background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.75rem',
                  padding: '0.85rem 1.25rem',
                  fontWeight: 900,
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  boxShadow: '0 4px 14px rgba(2, 132, 199, 0.35)'
                }}
              >
                <Package size={16} /> AJUSTAR A CAJA CERRADA ({partialModal.suggestedQty} PZAS)
              </button>

              <button
                onClick={() => executeCreateProductionOrder(partialModal.item, partialModal.supplierId, partialModal.requestedQty, true)}
                style={{
                  background: 'rgba(245, 158, 11, 0.15)',
                  color: '#f59e0b',
                  border: '1px solid rgba(245, 158, 11, 0.35)',
                  borderRadius: '0.75rem',
                  padding: '0.8rem 1.25rem',
                  fontWeight: 900,
                  fontSize: '0.72rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem'
                }}
              >
                <ShieldAlert size={16} /> CONFIRMAR Y AUTORIZAR PRODUCCIÓN PARCIAL ({partialModal.requestedQty} PZAS)
              </button>

              <button
                onClick={() => setPartialModal(null)}
                style={{
                  background: 'transparent',
                  color: '#94a3b8',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '0.75rem',
                  padding: '0.65rem 1.25rem',
                  fontWeight: 800,
                  fontSize: '0.7rem',
                  cursor: 'pointer'
                }}
              >
                CANCELAR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
