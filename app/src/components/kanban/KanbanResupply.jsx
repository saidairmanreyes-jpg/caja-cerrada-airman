import React, { useState, useEffect } from 'react'
import { db } from '../../firebase'
import { collection, doc, setDoc, updateDoc, onSnapshot, query, orderBy, getDocs } from 'firebase/firestore'
import { generateResupplyPDF, generateResupplyZip } from '../../utils/kanbanPDFGenerator'
import KanbanJustificationModal from './KanbanJustificationModal'
import {
  Package, AlertTriangle, ArrowRight, FileText, Download, CheckCircle2,
  XCircle, Filter, RefreshCw, Truck, ShieldAlert, Check, Search, MapPin, Archive
} from 'lucide-react'

export default function KanbanResupply({ canEdit = true, userEmail = '', showMessage }) {
  const [activeTab, setActiveTab] = useState('alerts') // 'alerts' | 'orders'
  const [loading, setLoading] = useState(false)

  // Data states
  const [thresholds, setThresholds] = useState([])
  const [erpStock, setErpStock] = useState([])
  const [routingRules, setRoutingRules] = useState([])
  const [transferOrders, setTransferOrders] = useState([])

  // Selection for bulk transfer creation
  const [selectedGaps, setSelectedGaps] = useState({}) // { [gapKey]: true }
  const [filterWh, setFilterWh] = useState('ALL')
  const [search, setSearch] = useState('')

  // Cancellation Modal State
  const [cancellationModal, setCancellationModal] = useState({
    isOpen: false,
    orderId: null,
    targetInfo: '',
    type: 'ORDER' // 'ORDER' or 'EXCLUDE_DEST'
  })

  // Real-time Firestore Listeners
  useEffect(() => {
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

    const unsubRouting = onSnapshot(collection(db, 'kanban_routing'), snap => {
      const list = []
      snap.forEach(d => list.push({ id: d.id, ...d.data() }))
      setRoutingRules(list)
    })

    const unsubOrders = onSnapshot(collection(db, 'kanban_transfer_orders'), snap => {
      const list = []
      snap.forEach(d => list.push({ id: d.id, ...d.data() }))
      list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      setTransferOrders(list)
    })

    return () => {
      unsubThresh()
      unsubErp()
      unsubRouting()
      unsubOrders()
    }
  }, [])

  // Calculate In-Transit quantities
  const inTransitMap = {}
  transferOrders
    .filter(o => o.status === 'POR_SURTIR' || o.status === 'EN_TRANSITO')
    .forEach(o => {
      if (o.lines && o.lines.length > 0) {
        o.lines.forEach(l => {
          const key = `${l.code}_${l.talla}_${o.warehouse_dest}`
          inTransitMap[key] = (inTransitMap[key] || 0) + (l.cajas_solicitadas || l.quantity || 0)
        })
      }
    })

  // Calculate Stock by Warehouse with alias mapping (CDMX, MTY, etc.)
  const stockMap = {}
  erpStock.forEach(s => {
    const key = `${s.code}_${s.talla}_${s.warehouse}`
    const qty = Number(s.stock || 0)
    stockMap[key] = (stockMap[key] || 0) + qty

    // Map common aliases
    if (s.warehouse === 'MEXICO') {
      stockMap[`${s.code}_${s.talla}_CDMX`] = (stockMap[`${s.code}_${s.talla}_CDMX`] || 0) + qty
      stockMap[`${s.code}_${s.talla}_MEXICO (CDMX)`] = (stockMap[`${s.code}_${s.talla}_MEXICO (CDMX)`] || 0) + qty
    }
    if (s.warehouse === 'MONTERREY') {
      stockMap[`${s.code}_${s.talla}_MTY`] = (stockMap[`${s.code}_${s.talla}_MTY`] || 0) + qty
      stockMap[`${s.code}_${s.talla}_MONTERREY (MTY)`] = (stockMap[`${s.code}_${s.talla}_MONTERREY (MTY)`] || 0) + qty
    }
  })

  // ── Pull Analysis Engine: Detect Gaps and calculate Multi-Origin distribution ──
  const pullAnalysis = thresholds.map(th => {
    const destKey = `${th.code}_${th.talla}_${th.warehouse}`
    const currentStock = stockMap[destKey] || 0
    const inTransit = inTransitMap[destKey] || 0
    const virtualStock = currentStock + inTransit
    const minStock = th.min_stock || 10
    const maxStock = th.max_stock || 50

    // Only triggers when below or equal to min stock
    if (virtualStock <= minStock) {
      const deficit = Math.max(0, maxStock - virtualStock)

      // Check Multidirectional Routing
      const routing = routingRules.find(r => r.destination === th.warehouse) || {
        primary_origin: 'PLANTA',
        primary_percentage: 100,
        secondary_origin: 'MONTERREY',
        secondary_percentage: 0,
        mode: 'DIRECTO'
      }

      const primOriginKey = routing.primary_origin === 'MTY' ? 'MONTERREY' : routing.primary_origin === 'CDMX' ? 'MEXICO' : routing.primary_origin
      const secOriginKey = routing.secondary_origin === 'MTY' ? 'MONTERREY' : routing.secondary_origin === 'CDMX' ? 'MEXICO' : routing.secondary_origin

      const primaryStock = stockMap[`${th.code}_${th.talla}_${primOriginKey}`] || stockMap[`${th.code}_${th.talla}_${routing.primary_origin}`] || 0
      const secondaryStock = secOriginKey !== 'NINGUNO' ? (stockMap[`${th.code}_${th.talla}_${secOriginKey}`] || stockMap[`${th.code}_${th.talla}_${routing.secondary_origin}`] || 0) : 0
      const totalAvailableInOrigins = primaryStock + secondaryStock

      // If at least one origin has stock, this is a Resupply (Traspaso) Candidate!
      const canResupply = totalAvailableInOrigins > 0

      // Calculate allocation per origin
      let primaryAlloc = 0
      let secondaryAlloc = 0

      if (routing.mode === 'COMBINADO') {
        const primTarget = Math.round(deficit * ((routing.primary_percentage || 70) / 100))
        const secTarget = deficit - primTarget
        primaryAlloc = Math.min(primaryStock, primTarget)
        secondaryAlloc = Math.min(secondaryStock, secTarget)

        // Compensate deficit if one origin has extra stock
        if (primaryAlloc < primTarget && secondaryStock > secondaryAlloc) {
          secondaryAlloc = Math.min(secondaryStock, deficit - primaryAlloc)
        }
        if (secondaryAlloc < secTarget && primaryStock > primaryAlloc) {
          primaryAlloc = Math.min(primaryStock, deficit - secondaryAlloc)
        }
      } else {
        // Direct origin routing
        primaryAlloc = Math.min(primaryStock, deficit)
        if (primaryAlloc < deficit && secondaryStock > 0) {
          secondaryAlloc = Math.min(secondaryStock, deficit - primaryAlloc)
        }
      }

      const allocations = [
        { origin: routing.primary_origin, qty: primaryAlloc, stock: primaryStock },
        { origin: routing.secondary_origin, qty: secondaryAlloc, stock: secondaryStock }
      ].filter(a => a.qty > 0)

      const isMultiOrigin = allocations.length > 1
      let assignedOriginLabel = routing.primary_origin
      if (isMultiOrigin) {
        assignedOriginLabel = allocations.map(a => `${a.origin} (${a.qty} pz)`).join(' + ')
      } else if (allocations.length === 1) {
        assignedOriginLabel = allocations[0].origin
      }

      return {
        key: destKey,
        code: th.code,
        description: th.description || 'Prenda Airman',
        talla: th.talla,
        warehouse_dest: th.warehouse,
        current_stock: currentStock,
        in_transit: inTransit,
        virtual_stock: virtualStock,
        min_stock: minStock,
        max_stock: maxStock,
        needed: deficit,
        can_resupply: canResupply,
        assigned_origin: assignedOriginLabel,
        is_multi_origin: isMultiOrigin,
        allocations: allocations.length > 0 ? allocations : [{ origin: routing.primary_origin, qty: Math.min(primaryStock, deficit), stock: primaryStock }],
        origin_stock: totalAvailableInOrigins,
        routing_mode: routing.mode || 'DIRECTO'
      }
    }
    return null
  }).filter(Boolean)

  const resupplyCandidates = pullAnalysis.filter(a => a.can_resupply)

  // Toggle selection
  const handleToggleSelect = (key) => {
    setSelectedGaps(prev => ({
      ...prev,
      [key]: !prev[key]
    }))
  }

  const handleSelectAll = () => {
    if (Object.keys(selectedGaps).length === resupplyCandidates.length) {
      setSelectedGaps({})
    } else {
      const all = {}
      resupplyCandidates.forEach(c => all[c.key] = true)
      setSelectedGaps(all)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ── Generar Órdenes de Traspaso Multiorigen & Descarga en PDF / .ZIP ──
  // ═══════════════════════════════════════════════════════════════════════════
  const handleGenerateTransferOrder = async () => {
    if (!canEdit) return showMessage('error', 'No tienes permisos de edición.')
    const selectedItems = resupplyCandidates.filter(c => selectedGaps[c.key])
    if (selectedItems.length === 0) return showMessage('error', 'Selecciona al menos un SKU para surtir.')

    setLoading(true)
    try {
      // Group line items STRICTLY by (warehouse_dest, warehouse_origin)
      // Any multi-origin SKU will be split into separate independent orders and separate picking documents!
      const ordersMap = {}

      selectedItems.forEach(item => {
        const allocs = item.allocations && item.allocations.length > 0
          ? item.allocations
          : [{ origin: item.assigned_origin || 'PLANTA', qty: Math.min(item.needed, item.origin_stock || item.needed) }]

        allocs.forEach(alloc => {
          if (alloc.qty <= 0) return
          const groupKey = `${item.warehouse_dest}__${alloc.origin}`
          if (!ordersMap[groupKey]) {
            ordersMap[groupKey] = {
              warehouse_origin: alloc.origin,
              warehouse_dest: item.warehouse_dest,
              lines: []
            }
          }
          ordersMap[groupKey].lines.push({
            code: item.code,
            description: item.description,
            talla: item.talla,
            cajas_solicitadas: alloc.qty,
            pzas_por_caja: 12,
            assigned_location: 'CEDIS CENTRAL',
            status: 'PENDIENTE'
          })
        })
      })

      const generatedOrdersList = []

      for (const key in ordersMap) {
        const group = ordersMap[key]
        const originClean = group.warehouse_origin.replace(/[^A-Z0-9]/gi, '').toUpperCase() || 'ORIGEN'
        const folio = `KAN-TRASP-${originClean}-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 1000)}`

        const orderData = {
          folio,
          warehouse_origin: group.warehouse_origin,
          warehouse_dest: group.warehouse_dest,
          status: 'POR_SURTIR', // Independent lifecycle per origin
          created_at: new Date().toISOString(),
          created_by: userEmail || 'Planeación Kanban',
          lines: group.lines,
          total_items: group.lines.reduce((acc, l) => acc + l.cajas_solicitadas, 0),
          notes: `Orden de surtido independiente desde ${group.warehouse_origin} hacia ${group.warehouse_dest}`
        }

        await setDoc(doc(db, 'kanban_transfer_orders', folio), orderData)
        generatedOrdersList.push({ order: orderData, lines: group.lines })
      }

      // If multi-origin (multiple orders created), generate and download a .ZIP bundle containing independent PDFs
      if (generatedOrdersList.length > 1) {
        await generateResupplyZip(generatedOrdersList, `Traspasos_Multiorigen_Kanban_${new Date().toISOString().slice(0, 10)}`)
        showMessage('success', `${generatedOrdersList.length} ÓRDENES INDEPENDIENTES GENERADAS (PAQUETE .ZIP DESCARGADO)`)
      } else if (generatedOrdersList.length === 1) {
        generateResupplyPDF(generatedOrdersList[0].order, generatedOrdersList[0].lines)
        showMessage('success', `ORDEN ${generatedOrdersList[0].order.folio} GENERADA Y HOJA DE PICKING DESCARGADA`)
      }

      setSelectedGaps({})
      setActiveTab('orders')
    } catch (err) {
      console.error(err)
      showMessage('error', 'Error al generar órdenes de traspaso: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // Batch Export all Active Orders as ZIP
  const handleDownloadAllActiveOrdersZip = async () => {
    const active = transferOrders.filter(o => o.status !== 'CANCELADO_JUSTIFICADO')
    if (active.length === 0) return showMessage('error', 'No hay órdenes activas para exportar.')
    setLoading(true)
    try {
      const list = active.map(o => ({ order: o, lines: o.lines || [] }))
      await generateResupplyZip(list, `Ordenes_Traspaso_Kanban_${new Date().toISOString().slice(0, 10)}`)
      showMessage('success', `PAQUETE .ZIP CON ${active.length} ÓRDENES INDEPENDIENTES DESCARGADO CON ÉXITO`)
    } catch (e) {
      showMessage('error', 'Error al generar archivo .zip: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ── Cancelación Restringida con Modal Obligatorio ──
  // ═══════════════════════════════════════════════════════════════════════════
  const handleOpenCancelModal = (order) => {
    setCancellationModal({
      isOpen: true,
      orderId: order.folio || order.id,
      targetInfo: `Orden de Traspaso ${order.folio} (${order.warehouse_origin} -> ${order.warehouse_dest})`,
      type: 'ORDER'
    })
  }

  const handleConfirmCancellation = async (justification) => {
    if (!canEdit) return showMessage('error', 'No tienes permisos de cancelación.')
    setLoading(true)
    try {
      const orderRef = doc(db, 'kanban_transfer_orders', cancellationModal.orderId)
      await updateDoc(orderRef, {
        status: 'CANCELADO_JUSTIFICADO',
        cancellation_reason: justification,
        cancelled_by: userEmail || 'Usuario Actual',
        cancelled_at: new Date().toISOString()
      })

      showMessage('success', `ORDEN ${cancellationModal.orderId} CANCELADA CON JUSTIFICACIÓN AUDITADA`)
      setCancellationModal({ isOpen: false, orderId: null, targetInfo: '', type: 'ORDER' })
    } catch (e) {
      console.error(e)
      showMessage('error', 'Error al cancelar la orden: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  // Status transitions
  const handleAdvanceStatus = async (order, nextStatus) => {
    if (!canEdit) return showMessage('error', 'No tienes permisos de edición.')
    try {
      await updateDoc(doc(db, 'kanban_transfer_orders', order.folio || order.id), {
        status: nextStatus,
        updated_at: new Date().toISOString(),
        updated_by: userEmail
      })
      showMessage('success', `ORDEN ${order.folio} ACTUALIZADA A ${nextStatus}`)
    } catch (e) {
      showMessage('error', 'Error al actualizar estatus')
    }
  }

  // Filtered views
  const filteredCandidates = resupplyCandidates.filter(c => {
    const matchSearch = (c.code || '').toLowerCase().includes(search.toLowerCase()) ||
                        (c.description || '').toLowerCase().includes(search.toLowerCase())
    const matchWh = filterWh === 'ALL' || c.warehouse_dest === filterWh
    return matchSearch && matchWh
  })

  const filteredOrders = transferOrders.filter(o => {
    const matchSearch = (o.folio || '').toLowerCase().includes(search.toLowerCase()) ||
                        (o.warehouse_dest || '').toLowerCase().includes(search.toLowerCase())
    const matchWh = filterWh === 'ALL' || o.warehouse_dest === filterWh
    return matchSearch && matchWh
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} className="animate-fade-in">
      {/* Sub tabs & Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(255,255,255,0.03)', padding: '0.35rem', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            onClick={() => setActiveTab('alerts')}
            style={{
              padding: '0.65rem 1.25rem',
              borderRadius: '0.75rem',
              fontWeight: 900,
              fontSize: '0.7rem',
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'alerts' ? '#0284c7' : 'transparent',
              color: activeTab === 'alerts' ? 'white' : '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <AlertTriangle size={15} /> FALTANTES CRÍTICOS
            <span style={{ background: 'rgba(255,255,255,0.2)', padding: '0.1rem 0.4rem', borderRadius: '999px', fontSize: '0.6rem' }}>
              {resupplyCandidates.length}
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
            <Package size={15} /> ÓRDENES DE TRASPASO
            <span style={{ background: 'rgba(255,255,255,0.2)', padding: '0.1rem 0.4rem', borderRadius: '999px', fontSize: '0.6rem' }}>
              {transferOrders.filter(o => o.status !== 'COMPLETADO' && o.status !== 'CANCELADO_JUSTIFICADO').length}
            </span>
          </button>
        </div>

        {/* Filter / Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ position: 'relative', width: '220px' }}>
            <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
            <input
              type="text"
              placeholder="BUSCAR..."
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
      {/* ── VIEW 1: Faltantes Críticos & Generación de Reabastecimiento ── */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'alerts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Action Header Card */}
          <div className="glass" style={{ padding: '1.25rem 1.5rem', borderRadius: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button
                onClick={handleSelectAll}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'white',
                  borderRadius: '0.5rem',
                  padding: '0.45rem 0.85rem',
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                {Object.keys(selectedGaps).length === resupplyCandidates.length && resupplyCandidates.length > 0
                  ? 'DESELECCIONAR TODOS'
                  : 'SELECCIONAR TODOS'}
              </button>
              <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                <strong style={{ color: '#38bdf8' }}>{Object.keys(selectedGaps).filter(k => selectedGaps[k]).length}</strong> SKUs seleccionados
              </span>
            </div>

            <button
              onClick={handleGenerateTransferOrder}
              disabled={loading || Object.keys(selectedGaps).filter(k => selectedGaps[k]).length === 0 || !canEdit}
              style={{
                background: Object.keys(selectedGaps).filter(k => selectedGaps[k]).length > 0 ? '#16a34a' : 'rgba(255,255,255,0.05)',
                color: 'white',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '0.75rem',
                fontWeight: 900,
                fontSize: '0.75rem',
                cursor: Object.keys(selectedGaps).filter(k => selectedGaps[k]).length > 0 && canEdit ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                boxShadow: Object.keys(selectedGaps).filter(k => selectedGaps[k]).length > 0 ? '0 4px 14px rgba(22, 163, 74, 0.4)' : 'none',
                textTransform: 'uppercase'
              }}
            >
              <FileText size={16} />
              {loading ? 'GENERANDO...' : 'GENERAR TRASPASO & HOJA DE PICKING (PDF)'}
            </button>
          </div>

          {/* Table */}
          <div className="glass" style={{ borderRadius: '1.25rem', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)', color: '#64748b', textAlign: 'left' }}>
                  <th style={{ padding: '1rem', width: '40px', textAlign: 'center' }}>SEL</th>
                  <th style={{ padding: '1rem' }}>CÓDIGO & DESCRIPCIÓN</th>
                  <th style={{ padding: '1rem', textAlign: 'center' }}>TALLA</th>
                  <th style={{ padding: '1rem', textAlign: 'center' }}>DESTINO</th>
                  <th style={{ padding: '1rem', textAlign: 'center' }}>STOCK VIRTUAL (ACT+TRÁNS)</th>
                  <th style={{ padding: '1rem', textAlign: 'center' }}>MÍN / MÁX</th>
                  <th style={{ padding: '1rem', textAlign: 'center' }}>FALTANTE PULL</th>
                  <th style={{ padding: '1rem', textAlign: 'center' }}>ORIGEN ASIGNADO</th>
                  <th style={{ padding: '1rem', textAlign: 'center' }}>EXISTENCIA ORIGEN</th>
                </tr>
              </thead>
              <tbody>
                {filteredCandidates.map(c => {
                  const isSelected = !!selectedGaps[c.key]
                  return (
                    <tr
                      key={c.key}
                      onClick={() => handleToggleSelect(c.key)}
                      style={{
                        borderBottom: '1px solid rgba(255,255,255,0.02)',
                        color: 'white',
                        cursor: 'pointer',
                        background: isSelected ? 'rgba(14, 165, 233, 0.08)' : 'transparent'
                      }}
                    >
                      <td style={{ padding: '1rem', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          style={{ cursor: 'pointer', accentColor: '#0ea5e9' }}
                        />
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <div style={{ fontWeight: 800, color: '#f1f5f9' }}>{c.code}</div>
                        <div style={{ fontSize: '0.62rem', color: '#64748b' }}>{c.description}</div>
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center', fontWeight: 900 }}>{c.talla}</td>
                      <td style={{ padding: '1rem', textAlign: 'center' }}>
                        <span style={{ color: '#38bdf8', fontWeight: 800 }}>{c.warehouse_dest}</span>
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center' }}>
                        <span style={{ fontWeight: 900, color: '#f59e0b' }}>{c.virtual_stock}</span>
                        <span style={{ fontSize: '0.6rem', color: '#64748b', display: 'block' }}>({c.current_stock} + {c.in_transit} trans)</span>
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center', color: '#94a3b8' }}>
                        {c.min_stock} / {c.max_stock}
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center', fontWeight: 900, color: '#ef4444', fontSize: '0.85rem' }}>
                        {c.needed}
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center' }}>
                        <span style={{ fontSize: '0.65rem', fontWeight: 800, background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', padding: '0.2rem 0.5rem', borderRadius: '0.4rem' }}>
                          {c.assigned_origin}
                        </span>
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center', fontWeight: 900, color: '#22c55e' }}>
                        {c.origin_stock} pzas
                      </td>
                    </tr>
                  )
                })}
                {filteredCandidates.length === 0 && (
                  <tr>
                    <td colSpan="9" style={{ padding: '3.5rem', textAlign: 'center', color: '#64748b' }}>
                      <CheckCircle2 size={32} style={{ color: '#22c55e', margin: '0 auto 0.5rem', opacity: 0.8 }} />
                      <p style={{ fontWeight: 800, textTransform: 'uppercase' }}>TODAS LAS SUCURSALES TIENEN STOCK ÓPTIMO</p>
                      <p style={{ fontSize: '0.65rem', marginTop: '0.25rem' }}>No hay SKUs por debajo del stock mínimo con mercancía disponible en origen.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* ── VIEW 2: Órdenes de Traspaso / Picking & Cancelación Restringida ── */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'orders' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Header with Batch ZIP Export */}
          <div className="glass" style={{ padding: '1rem 1.5rem', borderRadius: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 900, color: 'white', textTransform: 'uppercase' }}>
                MONITOR DE ÓRDENES DE TRASPASO INDEPENDIENTES
              </h3>
              <p style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                Órdenes generadas por origen. Cada origen gestiona su estatus de surtido de forma autónoma.
              </p>
            </div>

            <button
              onClick={handleDownloadAllActiveOrdersZip}
              disabled={loading || transferOrders.length === 0}
              style={{
                background: '#0284c7',
                color: 'white',
                border: 'none',
                padding: '0.65rem 1.25rem',
                borderRadius: '0.75rem',
                fontWeight: 900,
                fontSize: '0.72rem',
                cursor: transferOrders.length > 0 ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)'
              }}
            >
              <Archive size={16} /> EXPORTAR TODAS LAS ÓRDENES (.ZIP)
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.25rem' }}>
          {filteredOrders.map(order => {
            const isCancelled = order.status === 'CANCELADO_JUSTIFICADO'
            const isCompleted = order.status === 'COMPLETADO'
            const isInTransit = order.status === 'EN_TRANSITO'
            const isPending = order.status === 'POR_SURTIR'

            return (
              <div
                key={order.folio || order.id}
                className="glass"
                style={{
                  borderRadius: '1.25rem',
                  padding: '1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                  border: isCancelled ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(255,255,255,0.06)',
                  opacity: isCancelled ? 0.75 : 1
                }}
              >
                {/* Card Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{
                      fontSize: '0.6rem', fontWeight: 900, padding: '0.2rem 0.55rem', borderRadius: '0.4rem',
                      background: isCompleted ? 'rgba(34, 197, 94, 0.15)' : isInTransit ? 'rgba(234, 179, 8, 0.15)' : isCancelled ? 'rgba(239, 68, 68, 0.15)' : 'rgba(14, 165, 233, 0.15)',
                      color: isCompleted ? '#22c55e' : isInTransit ? '#facc15' : isCancelled ? '#ef4444' : '#38bdf8'
                    }}>
                      {order.status}
                    </span>
                    <h4 style={{ fontSize: '1.05rem', fontWeight: 900, color: 'white', marginTop: '0.4rem' }}>
                      {order.folio}
                    </h4>
                    <p style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
                      {order.created_at ? new Date(order.created_at).toLocaleString('es-MX') : 'Reciente'}
                    </p>
                  </div>

                  <button
                    onClick={() => generateResupplyPDF(order, order.lines)}
                    title="Descargar Hoja de Picking PDF"
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

                {/* Route badge */}
                <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '0.75rem', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem' }}>
                  <div>
                    <span style={{ fontSize: '0.55rem', color: '#64748b', fontWeight: 800, display: 'block' }}>ORIGEN</span>
                    <span style={{ color: '#f1f5f9', fontWeight: 900 }}>{order.warehouse_origin}</span>
                  </div>
                  <ArrowRight size={16} style={{ color: '#0ea5e9' }} />
                  <div>
                    <span style={{ fontSize: '0.55rem', color: '#64748b', fontWeight: 800, display: 'block' }}>DESTINO</span>
                    <span style={{ color: '#38bdf8', fontWeight: 900 }}>{order.warehouse_dest}</span>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.55rem', color: '#64748b', fontWeight: 800, display: 'block' }}>TOTAL</span>
                    <span style={{ color: '#22c55e', fontWeight: 900 }}>{order.total_items || order.lines?.length || 0} pzas</span>
                  </div>
                </div>

                {/* Items preview */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.68rem' }}>
                  {order.lines?.slice(0, 3).map((l, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1' }}>
                      <span>• {l.code} ({l.talla})</span>
                      <span style={{ fontWeight: 800, color: 'white' }}>{l.cajas_solicitadas} pzas</span>
                    </div>
                  ))}
                  {order.lines?.length > 3 && (
                    <span style={{ fontSize: '0.62rem', color: '#64748b' }}>+ {order.lines.length - 3} items adicionales en PDF...</span>
                  )}
                </div>

                {/* Cancellation Audit Notice if cancelled */}
                {isCancelled && order.cancellation_reason && (
                  <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '0.65rem 0.85rem', borderRadius: '0.6rem', fontSize: '0.65rem', color: '#fca5a5' }}>
                    <div style={{ fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <ShieldAlert size={12} /> MOTIVO DE CANCELACIÓN:
                    </div>
                    <div style={{ marginTop: '0.2rem', fontStyle: 'italic' }}>"{order.cancellation_reason}"</div>
                    <div style={{ marginTop: '0.2rem', fontSize: '0.58rem', color: '#94a3b8' }}>Por: {order.cancelled_by} ({order.cancelled_at ? new Date(order.cancelled_at).toLocaleDateString('es-MX') : ''})</div>
                  </div>
                )}

                {/* Action footer */}
                {!isCancelled && !isCompleted && (
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    {isPending && (
                      <button
                        onClick={() => handleAdvanceStatus(order, 'EN_TRANSITO')}
                        disabled={!canEdit}
                        style={{ flex: 1, background: '#0284c7', color: 'white', border: 'none', padding: '0.55rem', borderRadius: '0.6rem', fontWeight: 900, fontSize: '0.65rem', cursor: canEdit ? 'pointer' : 'not-allowed' }}
                      >
                        DESPACHAR A TRÁNSITO
                      </button>
                    )}

                    {isInTransit && (
                      <button
                        onClick={() => handleAdvanceStatus(order, 'COMPLETADO')}
                        disabled={!canEdit}
                        style={{ flex: 1, background: '#16a34a', color: 'white', border: 'none', padding: '0.55rem', borderRadius: '0.6rem', fontWeight: 900, fontSize: '0.65rem', cursor: canEdit ? 'pointer' : 'not-allowed' }}
                      >
                        CONFIRMAR RECEPCIÓN
                      </button>
                    )}

                    <button
                      onClick={() => handleOpenCancelModal(order)}
                      disabled={!canEdit}
                      style={{
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.25)',
                        color: '#ef4444',
                        padding: '0.55rem 0.85rem',
                        borderRadius: '0.6rem',
                        fontWeight: 900,
                        fontSize: '0.65rem',
                        cursor: canEdit ? 'pointer' : 'not-allowed'
                      }}
                    >
                      CANCELAR
                    </button>
                  </div>
                )}
              </div>
            )
          })}
          {filteredOrders.length === 0 && (
            <div style={{ padding: '3.5rem', textAlign: 'center', color: '#64748b', gridColumn: '1 / -1' }}>
              No hay órdenes de traspaso registradas.
            </div>
          )}
          </div>
        </div>
      )}

      {/* Mandatory Justification Modal for Cancellations */}
      <KanbanJustificationModal
        isOpen={cancellationModal.isOpen}
        onClose={() => setCancellationModal({ isOpen: false, orderId: null, targetInfo: '', type: 'ORDER' })}
        onConfirm={handleConfirmCancellation}
        title="CANCELACIÓN RESTRINGIDA DE SURTIDO"
        subtitle="Para cancelar esta orden de traspaso o excluir el surtido, es obligatorio capturar el motivo para fines de auditoría."
        actionType="CONFIRMAR CANCELACIÓN"
        targetInfo={cancellationModal.targetInfo}
        minLength={10}
        loading={loading}
      />
    </div>
  )
}
