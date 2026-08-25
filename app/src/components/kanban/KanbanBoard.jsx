import React, { useState, useEffect } from 'react'
import { db } from '../../firebase'
import { collection, doc, updateDoc, onSnapshot, arrayUnion } from 'firebase/firestore'
import { generateWorkOrderPDF, generateResupplyPDF } from '../../utils/kanbanPDFGenerator'
import KanbanLeadTimeSimulatorModal from './KanbanLeadTimeSimulatorModal'
import {
  LayoutDashboard, AlertTriangle, Clock, CheckCircle2, MessageSquarePlus,
  Truck, Scissors, Package, Layers, ShieldAlert, ArrowRight, Download,
  Filter, Search, MessageSquare, AlertCircle, Plus, Sparkles
} from 'lucide-react'

const COLUMNS = [
  { id: 'POR_SURTIR', label: '1. POR SURTIR', color: '#0ea5e9', icon: <Package size={16} />, desc: 'Traspasos entre almacenes' },
  { id: 'FALTANTE_INSUMOS', label: '2. FALTANTE INSUMOS', color: '#f59e0b', icon: <Scissors size={16} />, desc: 'Esperando tela / avíos' },
  { id: 'PENDIENTE_AUTORIZACION', label: '3. PEND. AUTORIZACIÓN', color: '#8b5cf6', icon: <Clock size={16} />, desc: 'Buzón de planeación' },
  { id: 'EN_CONFECCION', label: '4. EN CONFECCIÓN', color: '#ec4899', icon: <Layers size={16} />, desc: 'En taller maquilero' },
  { id: 'EN_TRANSITO', label: '5. EN TRÁNSITO', color: '#38bdf8', icon: <Truck size={16} />, desc: 'En ruta a sucursal' },
  { id: 'COMPLETADO', label: '6. COMPLETADO', color: '#22c55e', icon: <CheckCircle2 size={16} />, desc: 'Recibido en almacén' },
]

export default function KanbanBoard({ canEdit = true, userEmail = '', showMessage }) {
  const [productionOrders, setProductionOrders] = useState([])
  const [transferOrders, setTransferOrders] = useState([])
  const [thresholds, setThresholds] = useState([])
  const [erpStock, setErpStock] = useState([])
  const [globalSafetyDays, setGlobalSafetyDays] = useState(30)
  const [simulatorModalItem, setSimulatorModalItem] = useState(null)

  const [search, setSearch] = useState('')
  const [filterWh, setFilterWh] = useState('ALL')
  const [showArchived, setShowArchived] = useState(false)

  // Delay Comment Modal state
  const [delayModal, setDelayModal] = useState({
    isOpen: false,
    item: null,
    type: 'PROD' // 'PROD' or 'TRANSFER'
  })
  const [delayCommentText, setDelayCommentText] = useState('')

  // Real-time listener
  useEffect(() => {
    const unsubGlobal = onSnapshot(doc(db, 'kanban_global_config', 'parameters'), d => {
      if (d.exists()) {
        const data = d.data()
        if (data.safety_stock_days) setGlobalSafetyDays(Number(data.safety_stock_days))
      }
    })

    const unsubOps = onSnapshot(collection(db, 'kanban_production_orders'), snap => {
      const list = []
      snap.forEach(d => list.push({ id: d.id, ...d.data(), isProdOrder: true }))
      setProductionOrders(list)
    })

    const unsubTrans = onSnapshot(collection(db, 'kanban_transfer_orders'), snap => {
      const list = []
      snap.forEach(d => list.push({ id: d.id, ...d.data(), isTransferOrder: true }))
      setTransferOrders(list)
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

    return () => {
      unsubGlobal()
      unsubOps()
      unsubTrans()
      unsubThresh()
      unsubErp()
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

  // Helper to calculate semaphore color and urgency
  const calculateSemaphore = (item) => {
    if (item.status === 'COMPLETADO' || item.status === 'CANCELADO_JUSTIFICADO' || item.status === 'CANCELADO_PLANIFICACION') {
      return { status: 'DONE', label: 'FINALIZADO', color: '#64748b', bg: 'rgba(100, 116, 139, 0.15)' }
    }

    const targetDate = item.committed_delivery_date ? new Date(item.committed_delivery_date) : null
    if (!targetDate) {
      return { status: 'GREEN', label: 'A TIEMPO', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)' }
    }

    const now = new Date()
    const diffDays = (targetDate - now) / (1000 * 60 * 60 * 24)

    if (diffDays < 0) {
      return { status: 'RED', label: 'RETRASADO', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.2)' }
    } else if (diffDays <= 2) {
      return { status: 'YELLOW', label: 'PRÓXIMO A VENCER', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.2)' }
    } else {
      return { status: 'GREEN', label: 'A TIEMPO', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)' }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ── Bloqueo de Operaciones que Excedan el Stock Máximo ──
  // ═══════════════════════════════════════════════════════════════════════════
  const validateMaxStockExceeded = (code, talla, destWh, addQuantity) => {
    const thresh = thresholds.find(t => t.code === code && t.talla === talla && t.warehouse === destWh)
    if (!thresh || !thresh.max_stock) return { allowed: true }

    const currentStock = stockMap[`${code}_${talla}_${destWh}`] || 0
    const potentialTotal = currentStock + addQuantity

    if (potentialTotal > thresh.max_stock) {
      return {
        allowed: false,
        maxStock: thresh.max_stock,
        currentStock,
        excess: potentialTotal - thresh.max_stock
      }
    }
    return { allowed: true }
  }

  // Handle Drag / Move between Columns
  const handleMoveColumn = async (item, targetColumnId) => {
    if (!canEdit) return showMessage('error', 'No tienes permisos de edición.')

    // Rule: Validate Maximum Stock Protection
    if (targetColumnId !== 'COMPLETADO' && targetColumnId !== 'CANCELADO') {
      const check = validateMaxStockExceeded(item.code, item.talla, item.warehouse_dest, item.quantity || 1)
      if (!check.allowed) {
        showMessage('error', `OPERACIÓN BLOQUEADA: Excede el Stock Máximo configurado (${check.maxStock} pzas). Stock actual + orden = ${check.currentStock + (item.quantity || 1)} pzas.`)
        return
      }
    }

    try {
      const collectionName = item.isProdOrder ? 'kanban_production_orders' : 'kanban_transfer_orders'
      const docRef = doc(db, collectionName, item.folio || item.id)

      await updateDoc(docRef, {
        status: targetColumnId,
        updated_at: new Date().toISOString(),
        updated_by: userEmail
      })
      showMessage('success', `TARJETA ${item.folio} MOVIDA A ${targetColumnId}`)
    } catch (e) {
      console.error(e)
      showMessage('error', 'Error al actualizar columna')
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ── Guardar Comentario de Retraso en Bitácora Visible ──
  // ═══════════════════════════════════════════════════════════════════════════
  const handleSaveDelayComment = async () => {
    if (!delayCommentText.trim()) return
    const item = delayModal.item
    try {
      const collectionName = item.isProdOrder ? 'kanban_production_orders' : 'kanban_transfer_orders'
      const docRef = doc(db, collectionName, item.folio || item.id)

      const commentEntry = {
        text: delayCommentText.trim(),
        author: userEmail || 'Supervisor Kanban',
        timestamp: new Date().toISOString()
      }

      await updateDoc(docRef, {
        delay_comments: arrayUnion(commentEntry),
        last_delay_note: commentEntry.text,
        last_delay_author: commentEntry.author,
        last_delay_date: commentEntry.timestamp
      })

      showMessage('success', `NOTA DE RETRASO REGISTRADA EN ${item.folio}`)
      setDelayModal({ isOpen: false, item: null, type: 'PROD' })
      setDelayCommentText('')
    } catch (e) {
      showMessage('error', 'Error al guardar comentario de retraso')
    }
  }

  // Combine unified cards
  const allCards = [
    ...productionOrders.map(p => ({
      ...p,
      type: 'PRODUCCIÓN',
      columnId: p.status === 'EN_CONFECCION' ? 'EN_CONFECCION' :
                p.status === 'PENDIENTE_AUTORIZACION' ? 'PENDIENTE_AUTORIZACION' :
                p.status === 'FALTANTE_INSUMOS' ? 'FALTANTE_INSUMOS' :
                p.status === 'EN_TRANSITO' ? 'EN_TRANSITO' :
                p.status === 'COMPLETADO' ? 'COMPLETADO' : 'PENDIENTE_AUTORIZACION'
    })),
    ...transferOrders.map(t => ({
      ...t,
      type: 'TRASPASO',
      quantity: t.total_items || t.lines?.reduce((a, b) => a + (b.cajas_solicitadas || 0), 0) || 0,
      code: t.lines?.[0]?.code || 'VARIOS',
      talla: t.lines?.[0]?.talla || 'MIX',
      columnId: t.status === 'POR_SURTIR' ? 'POR_SURTIR' :
                t.status === 'EN_TRANSITO' ? 'EN_TRANSITO' :
                t.status === 'COMPLETADO' ? 'COMPLETADO' : 'POR_SURTIR'
    }))
  ]

  const filteredCards = allCards.filter(c => {
    const matchSearch = (c.folio || '').toLowerCase().includes(search.toLowerCase()) ||
                        (c.code || '').toLowerCase().includes(search.toLowerCase()) ||
                        (c.supplier_name || '').toLowerCase().includes(search.toLowerCase()) ||
                        (c.warehouse_dest || '').toLowerCase().includes(search.toLowerCase())
    const matchWh = filterWh === 'ALL' || c.warehouse_dest === filterWh
    const matchArchived = showArchived ? true : c.columnId !== 'COMPLETADO'
    return matchSearch && matchWh && matchArchived
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} className="animate-fade-in">
      {/* Controls Bar */}
      <div className="glass" style={{ padding: '1.25rem 1.5rem', borderRadius: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '0.75rem', background: 'rgba(14, 165, 233, 0.15)', color: '#0ea5e9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <LayoutDashboard size={22} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 900, color: 'white', textTransform: 'uppercase' }}>
              MONITOR VISUAL KANBAN & TRAZABILIDAD
            </h3>
            <p style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '0.15rem' }}>
              FLUJO INTEGRAL PULL DE PRODUCCIÓN Y REABASTECIMIENTO CON SEMÁFORO DE AUDITORÍA Y NOTAS DE RETRASO.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Search */}
          <div style={{ position: 'relative', width: '220px' }}>
            <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
            <input
              type="text"
              placeholder="BUSCAR EN TABLERO..."
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

          {/* Warehouse Filter */}
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
            <option value="ALL">TODOS LOS DESTINOS</option>
            {['MEXICO', 'MONTERREY', 'MATRIZ'].map(wh => <option key={wh} value={wh} style={{ background: '#0b0e14' }}>{wh}</option>)}
          </select>

          {/* Toggle Archived */}
          <button
            onClick={() => setShowArchived(prev => !prev)}
            style={{
              background: showArchived ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${showArchived ? 'rgba(34, 197, 94, 0.3)' : 'rgba(255,255,255,0.1)'}`,
              color: showArchived ? '#22c55e' : '#94a3b8',
              padding: '0.5rem 0.85rem',
              borderRadius: '0.75rem',
              fontSize: '0.68rem',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            {showArchived ? '✓ MOSTRANDO COMPLETADOS' : 'VER COMPLETADOS'}
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* ── KANBAN COLUMNS BOARD ── */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '1rem',
        alignItems: 'start'
      }}>
        {COLUMNS.map(col => {
          const colCards = filteredCards.filter(c => c.columnId === col.id)

          return (
            <div
              key={col.id}
              style={{
                background: 'rgba(15, 23, 42, 0.45)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '1.25rem',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.85rem',
                minHeight: '520px'
              }}
            >
              {/* Column Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.65rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <div style={{ color: col.color }}>{col.icon}</div>
                  <h4 style={{ fontSize: '0.78rem', fontWeight: 900, color: 'white', letterSpacing: '0.03em' }}>
                    {col.label}
                  </h4>
                </div>
                <span style={{
                  fontSize: '0.62rem', fontWeight: 900, color: col.color, background: `${col.color}15`,
                  padding: '0.15rem 0.5rem', borderRadius: '999px', border: `1px solid ${col.color}30`
                }}>
                  {colCards.length}
                </span>
              </div>

              {/* Column Cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', flex: 1 }}>
                {colCards.map(card => {
                  const sem = calculateSemaphore(card)
                  const hasDelays = sem.status === 'YELLOW' || sem.status === 'RED'
                  const lastDelay = card.last_delay_note || (card.delay_comments?.length > 0 ? card.delay_comments[card.delay_comments.length - 1].text : null)

                  return (
                    <div
                      key={card.folio || card.id}
                      className="glass"
                      style={{
                        borderRadius: '1rem',
                        padding: '1rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.65rem',
                        border: sem.status === 'RED' ? '1px solid rgba(239, 68, 68, 0.4)' :
                                sem.status === 'YELLOW' ? '1px solid rgba(245, 158, 11, 0.4)' :
                                '1px solid rgba(255, 255, 255, 0.08)',
                        background: sem.status === 'RED' ? 'rgba(239, 68, 68, 0.03)' :
                                    sem.status === 'YELLOW' ? 'rgba(245, 158, 11, 0.03)' :
                                    'rgba(15, 23, 42, 0.65)',
                        position: 'relative',
                        boxShadow: '0 8px 16px -4px rgba(0,0,0,0.3)'
                      }}
                    >
                      {/* Top Badges: Type & Semaphore */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <span style={{
                            fontSize: '0.55rem', fontWeight: 900, padding: '0.15rem 0.45rem', borderRadius: '0.35rem',
                            background: card.type === 'PRODUCCIÓN' ? 'rgba(236, 72, 153, 0.15)' : 'rgba(14, 165, 233, 0.15)',
                            color: card.type === 'PRODUCCIÓN' ? '#f472b6' : '#38bdf8'
                          }}>
                            {card.type}
                          </span>
                          <span style={{
                            fontSize: '0.52rem', fontWeight: 900, padding: '0.15rem 0.35rem', borderRadius: '0.35rem',
                            background: isFantasia ? 'rgba(245, 158, 11, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                            color: isFantasia ? '#f59e0b' : '#22c55e'
                          }}>
                            {isFantasia ? 'MTO (64d)' : 'GREIGE (29d)'}
                          </span>
                        </div>

                        {/* Semaphore Indicator with Interactive Lead Time Simulator Click */}
                        <div
                          onClick={(e) => {
                            e.stopPropagation()
                            setSimulatorModalItem({
                              ...card,
                              safety_stock_days: globalSafetyDays,
                              warehouse_dest: card.warehouse_dest || 'MEXICO',
                              comportamiento_tela: isFantasia ? 'FANTASIA' : 'LISO'
                            })
                          }}
                          title="Clic para auditar Cumulative Lead Time y ROP"
                          style={{
                            display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.58rem', fontWeight: 900,
                            color: sem.color, background: sem.bg, padding: '0.15rem 0.5rem', borderRadius: '999px',
                            cursor: 'pointer', border: '1px solid rgba(255,255,255,0.06)'
                          }}
                        >
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: sem.color }} />
                          <span>{sem.label}</span>
                          <Clock size={10} style={{ marginLeft: '0.2rem', opacity: 0.8 }} />
                        </div>
                      </div>

                      {/* Folio & Item */}
                      <div>
                        <h5 style={{ fontSize: '0.9rem', fontWeight: 900, color: 'white', letterSpacing: '0.02em' }}>
                          {card.folio}
                        </h5>
                        <p style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '0.1rem' }}>
                          {card.code} {card.talla !== 'MIX' ? `(${card.talla})` : ''} · <strong style={{ color: 'white' }}>{card.quantity} pzas</strong>
                        </p>
                      </div>

                      {/* Destination & Supplier Info */}
                      <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: '0.5rem', padding: '0.5rem 0.65rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem' }}>
                        <div>
                          <span style={{ color: '#64748b', fontSize: '0.52rem', fontWeight: 800, display: 'block' }}>DESTINO</span>
                          <span style={{ color: '#38bdf8', fontWeight: 800 }}>{card.warehouse_dest}</span>
                        </div>
                        {card.supplier_name && (
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ color: '#64748b', fontSize: '0.52rem', fontWeight: 800, display: 'block' }}>MAQUILERO</span>
                            <span style={{ color: '#f1f5f9', fontWeight: 700 }}>{card.supplier_name}</span>
                          </div>
                        )}
                      </div>

                      {/* ERP References & Fabric Milestone if captured */}
                      {(card.erp_op_number || card.erp_sm_number || card.fabric_milestone) && (
                        <div style={{ display: 'flex', gap: '0.4rem', fontSize: '0.58rem', flexWrap: 'wrap' }}>
                          {card.erp_op_number && (
                            <span style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa', padding: '0.1rem 0.35rem', borderRadius: '0.3rem', fontWeight: 800 }}>
                              OP: {card.erp_op_number}
                            </span>
                          )}
                          {card.erp_sm_number && (
                            <span style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#34d399', padding: '0.1rem 0.35rem', borderRadius: '0.3rem', fontWeight: 800 }}>
                              SM: {card.erp_sm_number}
                            </span>
                          )}
                          {card.fabric_milestone === 'SALIDA_DE_TEJIDO' && (
                            <span style={{ background: 'rgba(192, 132, 252, 0.15)', color: '#c084fc', border: '1px solid rgba(192, 132, 252, 0.35)', padding: '0.1rem 0.4rem', borderRadius: '0.3rem', fontWeight: 900 }}>
                              ⭐ HITO GUATEMALA: SALIDA TEJIDO
                            </span>
                          )}
                        </div>
                      )}

                      {/* ── Comentario de Retraso Visible en la Tarjeta ── */}
                      {lastDelay && (
                        <div style={{
                          background: 'rgba(239, 68, 68, 0.1)',
                          border: '1px solid rgba(239, 68, 68, 0.25)',
                          borderRadius: '0.5rem',
                          padding: '0.5rem 0.65rem',
                          fontSize: '0.62rem',
                          color: '#fca5a5',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.2rem'
                        }}>
                          <div style={{ fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#ef4444' }}>
                            <AlertCircle size={11} /> NOTA DE RETRASO:
                          </div>
                          <div style={{ fontStyle: 'italic', color: '#fecaca' }}>"{lastDelay}"</div>
                          {card.last_delay_author && (
                            <div style={{ fontSize: '0.52rem', color: '#94a3b8' }}>
                              Registrado por: {card.last_delay_author}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Action Bar inside Card */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '0.5rem', marginTop: '0.2rem' }}>
                        {/* Delay Note Button (Enabled on Yellow or Red) */}
                        {hasDelays ? (
                          <button
                            onClick={() => {
                              setDelayModal({ isOpen: true, item: card, type: card.isProdOrder ? 'PROD' : 'TRANSFER' })
                              setDelayCommentText('')
                            }}
                            disabled={!canEdit}
                            style={{
                              background: 'rgba(245, 158, 11, 0.15)',
                              border: '1px solid rgba(245, 158, 11, 0.3)',
                              color: '#fbbf24',
                              borderRadius: '0.4rem',
                              padding: '0.3rem 0.6rem',
                              fontSize: '0.58rem',
                              fontWeight: 900,
                              cursor: canEdit ? 'pointer' : 'not-allowed',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.3rem'
                            }}
                          >
                            <MessageSquarePlus size={12} /> {lastDelay ? 'EDITAR NOTA RETRASO' : '+ MOTIVO RETRASO'}
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.58rem', color: '#64748b' }}>Sin incidencias</span>
                        )}

                        {/* Quick Step Forward Button */}
                        {col.id !== 'COMPLETADO' && (
                          <div style={{ display: 'flex', gap: '0.3rem' }}>
                            {col.id === 'POR_SURTIR' && (
                              <button
                                onClick={() => handleMoveColumn(card, 'EN_TRANSITO')}
                                disabled={!canEdit}
                                title="Despachar a Tránsito"
                                style={{ background: '#0284c7', color: 'white', border: 'none', padding: '0.3rem 0.6rem', borderRadius: '0.4rem', fontSize: '0.58rem', fontWeight: 900, cursor: canEdit ? 'pointer' : 'not-allowed' }}
                              >
                                DESPACHAR →
                              </button>
                            )}

                            {col.id === 'EN_CONFECCION' && (
                              <button
                                onClick={() => handleMoveColumn(card, 'EN_TRANSITO')}
                                disabled={!canEdit}
                                title="Terminar Confección y Enviar a Tránsito"
                                style={{ background: '#0284c7', color: 'white', border: 'none', padding: '0.3rem 0.6rem', borderRadius: '0.4rem', fontSize: '0.58rem', fontWeight: 900, cursor: canEdit ? 'pointer' : 'not-allowed' }}
                              >
                                ENVIAR A CEDIS →
                              </button>
                            )}

                            {col.id === 'EN_TRANSITO' && (
                              <button
                                onClick={() => handleMoveColumn(card, 'COMPLETADO')}
                                disabled={!canEdit}
                                title="Confirmar Recepción"
                                style={{ background: '#16a34a', color: 'white', border: 'none', padding: '0.3rem 0.6rem', borderRadius: '0.4rem', fontSize: '0.58rem', fontWeight: 900, cursor: canEdit ? 'pointer' : 'not-allowed' }}
                              >
                                RECIBIR ✓
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}

                {colCards.length === 0 && (
                  <div style={{
                    padding: '2.5rem 1rem',
                    textAlign: 'center',
                    color: '#475569',
                    fontSize: '0.68rem',
                    border: '1px dashed rgba(255,255,255,0.04)',
                    borderRadius: '0.875rem'
                  }}>
                    Sin órdenes en esta fase
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* ── MODAL: Captura de Comentario de Retraso ── */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {delayModal.isOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '1.5rem'
        }}>
          <div style={{
            background: '#0f172a', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '1.5rem',
            maxWidth: '500px', width: '100%', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', padding: '0.6rem', borderRadius: '0.75rem' }}>
                <AlertTriangle size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 900, color: 'white', textTransform: 'uppercase' }}>
                  REGISTRO DE INCIDENCIA / MOTIVO DE RETRASO
                </h3>
                <p style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                  Esta nota se mostrará de forma permanente en la tarjeta para conocimiento de todo el equipo.
                </p>
              </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem 1rem', borderRadius: '0.75rem', fontSize: '0.72rem', color: '#cbd5e1' }}>
              <span style={{ color: '#f59e0b', fontWeight: 900 }}>ORDEN: </span>
              <strong>{delayModal.item?.folio}</strong> ({delayModal.item?.code} - {delayModal.item?.quantity} pzas)
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8' }}>
                DESCRIPCIÓN DEL MOTIVO DE RETRASO *
              </label>
              <textarea
                autoFocus
                rows={3}
                placeholder="Ej. Taller 2 reportó demora por descompostura de máquina ojaladora. Entrega reprogramada para el día jueves..."
                value={delayCommentText}
                onChange={(e) => setDelayCommentText(e.target.value)}
                style={{
                  width: '100%',
                  background: '#020617',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '0.75rem',
                  padding: '0.75rem',
                  color: 'white',
                  fontSize: '0.75rem',
                  outline: 'none',
                  resize: 'none'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '1rem' }}>
              <button
                onClick={() => setDelayModal({ isOpen: false, item: null, type: 'PROD' })}
                style={{ padding: '0.65rem 1.2rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', borderRadius: '0.65rem', fontWeight: 800, fontSize: '0.7rem', cursor: 'pointer' }}
              >
                CANCELAR
              </button>
              <button
                onClick={handleSaveDelayComment}
                disabled={!delayCommentText.trim()}
                style={{
                  padding: '0.65rem 1.4rem',
                  background: delayCommentText.trim() ? '#f59e0b' : 'rgba(255,255,255,0.05)',
                  color: delayCommentText.trim() ? '#0f172a' : '#64748b',
                  border: 'none',
                  borderRadius: '0.65rem',
                  fontWeight: 900,
                  fontSize: '0.7rem',
                  cursor: delayCommentText.trim() ? 'pointer' : 'not-allowed'
                }}
              >
                GUARDAR NOTA EN TARJETA
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Simulador de Cumulative Lead Time & ROP Dinámico */}
      {simulatorModalItem && (
        <KanbanLeadTimeSimulatorModal
          item={simulatorModalItem}
          globalSafetyDays={globalSafetyDays}
          onClose={() => setSimulatorModalItem(null)}
        />
      )}
    </div>
  )
}
