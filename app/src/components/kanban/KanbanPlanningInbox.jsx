import React, { useState, useEffect } from 'react'
import { db } from '../../firebase'
import { collection, doc, updateDoc, onSnapshot } from 'firebase/firestore'
import { generateWorkOrderPDF } from '../../utils/kanbanPDFGenerator'
import KanbanJustificationModal from './KanbanJustificationModal'
import {
  Inbox, CheckCircle2, XCircle, Download, Clock, ShieldCheck,
  AlertTriangle, FileText, UserCheck, Calendar, ArrowRight
} from 'lucide-react'

export default function KanbanPlanningInbox({ canAuthorize = false, userEmail = '', showMessage }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('PENDIENTE') // 'PENDIENTE' | 'ALL'

  // Rejection modal state
  const [rejectModal, setRejectModal] = useState({
    isOpen: false,
    orderId: null,
    targetInfo: ''
  })

  // Real-time listener
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'kanban_production_orders'), snap => {
      const list = []
      snap.forEach(d => list.push({ id: d.id, ...d.data() }))
      list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      setOrders(list)
    })
    return () => unsub()
  }, [])

  const pendingOrders = orders.filter(o => o.status === 'PENDIENTE_AUTORIZACION')

  // Authorize Order Handler
  const handleAuthorize = async (order) => {
    if (!canAuthorize) return showMessage('error', 'No cuentas con autorización de Planeación para aprobar OPs.')
    setLoading(true)
    try {
      await updateDoc(doc(db, 'kanban_production_orders', order.folio || order.id), {
        status: 'EN_CONFECCION',
        authorized_by: userEmail || 'Planeación Central',
        authorized_at: new Date().toISOString(),
        kanban_column: 'CONFECCION'
      })
      showMessage('success', `ORDEN DE PRODUCCIÓN ${order.folio} AUTORIZADA Y ACTIVADA EN TABLERO`)
    } catch (e) {
      console.error(e)
      showMessage('error', 'Error al autorizar orden')
    } finally {
      setLoading(false)
    }
  }

  // Open Rejection Modal
  const handleOpenReject = (order) => {
    setRejectModal({
      isOpen: true,
      orderId: order.folio || order.id,
      targetInfo: `Orden de Producción ${order.folio} (${order.code} - ${order.quantity} pzas)`
    })
  }

  // Confirm Rejection with mandatory justification
  const handleConfirmReject = async (justification) => {
    if (!canAuthorize) return showMessage('error', 'No cuentas con autorización de Planeación.')
    setLoading(true)
    try {
      await updateDoc(doc(db, 'kanban_production_orders', rejectModal.orderId), {
        status: 'CANCELADO_PLANIFICACION',
        rejection_reason: justification,
        rejected_by: userEmail || 'Planeación Central',
        rejected_at: new Date().toISOString(),
        kanban_column: 'CANCELADO'
      })
      showMessage('success', `ORDEN ${rejectModal.orderId} RECHAZADA CON JUSTIFICACIÓN AUDITADA`)
      setRejectModal({ isOpen: false, orderId: null, targetInfo: '' })
    } catch (e) {
      console.error(e)
      showMessage('error', 'Error al rechazar orden: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  const displayOrders = filter === 'PENDIENTE' ? pendingOrders : orders

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} className="animate-fade-in">
      {/* Header Banner */}
      <div className="glass" style={{ padding: '1.5rem', borderRadius: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '1rem', background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Inbox size={26} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 900, color: 'white', textTransform: 'uppercase' }}>
              BUZÓN DE AUTORIZACIÓN DE PLANEACIÓN
            </h3>
            <p style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.2rem' }}>
              Revisa, autoriza para confección o rechaza con justificación las Órdenes de Producción detonadas por el sistema Kanban.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', padding: '0.25rem', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.06)' }}>
            <button
              onClick={() => setFilter('PENDIENTE')}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '0.6rem',
                border: 'none',
                fontWeight: 900,
                fontSize: '0.68rem',
                cursor: 'pointer',
                background: filter === 'PENDIENTE' ? '#f59e0b' : 'transparent',
                color: filter === 'PENDIENTE' ? 'white' : '#94a3b8'
              }}
            >
              PENDIENTES ({pendingOrders.length})
            </button>
            <button
              onClick={() => setFilter('ALL')}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '0.6rem',
                border: 'none',
                fontWeight: 900,
                fontSize: '0.68rem',
                cursor: 'pointer',
                background: filter === 'ALL' ? '#0284c7' : 'transparent',
                color: filter === 'ALL' ? 'white' : '#94a3b8'
              }}
            >
              TODAS LAS OPs ({orders.length})
            </button>
          </div>
        </div>
      </div>

      {/* Permission banner if not authorized */}
      {!canAuthorize && (
        <div style={{
          background: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid rgba(245, 158, 11, 0.25)',
          padding: '0.85rem 1.25rem',
          borderRadius: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          color: '#fbbf24',
          fontSize: '0.72rem',
          fontWeight: 700
        }}>
          <ShieldCheck size={18} style={{ flexShrink: 0 }} />
          <span>
            <strong>MODO CONSULTA:</strong> Tu usuario no tiene asignado el permiso de <em>Autorización de Planeación</em>. Puedes ver las órdenes pero no aprobarlas ni rechazarlas.
          </span>
        </div>
      )}

      {/* Orders Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '1.25rem' }}>
        {displayOrders.map(op => {
          const isPending = op.status === 'PENDIENTE_AUTORIZACION'
          const isApproved = op.status === 'EN_CONFECCION' || op.status === 'EN_TRANSITO' || op.status === 'COMPLETADO'
          const isRejected = op.status === 'CANCELADO_PLANIFICACION'

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
                border: isPending ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid rgba(255,255,255,0.06)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span style={{
                    fontSize: '0.6rem', fontWeight: 900, padding: '0.2rem 0.55rem', borderRadius: '0.4rem',
                    background: isPending ? 'rgba(245, 158, 11, 0.15)' : isApproved ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: isPending ? '#f59e0b' : isApproved ? '#22c55e' : '#ef4444'
                  }}>
                    {op.status}
                  </span>
                  <h4 style={{ fontSize: '1.15rem', fontWeight: 900, color: 'white', marginTop: '0.4rem' }}>
                    {op.folio}
                  </h4>
                  <p style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                    {op.code} ({op.talla}) · <strong>{op.quantity} prendas</strong>
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

              {/* Breakdown Details */}
              <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '0.75rem', padding: '0.85rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.68rem' }}>
                <div>
                  <span style={{ color: '#64748b', fontSize: '0.55rem', fontWeight: 800, display: 'block' }}>TALLER SUGERIDO</span>
                  <span style={{ color: 'white', fontWeight: 800 }}>{op.supplier_name}</span>
                </div>
                <div>
                  <span style={{ color: '#64748b', fontSize: '0.55rem', fontWeight: 800, display: 'block' }}>DESTINO FINAL</span>
                  <span style={{ color: '#38bdf8', fontWeight: 800 }}>{op.warehouse_dest}</span>
                </div>
                <div>
                  <span style={{ color: '#64748b', fontSize: '0.55rem', fontWeight: 800, display: 'block' }}>FECHA COMPROMISO</span>
                  <span style={{ color: '#f59e0b', fontWeight: 900 }}>{op.committed_delivery_date || 'N/A'}</span>
                </div>
                <div>
                  <span style={{ color: '#64748b', fontSize: '0.55rem', fontWeight: 800, display: 'block' }}>SOLICITANTE</span>
                  <span style={{ color: '#cbd5e1' }}>{op.created_by}</span>
                </div>
              </div>

              {/* BOM Materials Mini List */}
              <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '0.6rem', padding: '0.6rem 0.75rem', fontSize: '0.65rem' }}>
                <div style={{ fontWeight: 800, color: '#94a3b8', marginBottom: '0.25rem' }}>
                  EXPLOSIÓN DE MATERIALES:
                </div>
                {op.bom_breakdown?.slice(0, 3).map((m, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1' }}>
                    <span>• {m.material_name} ({m.material_type})</span>
                    <span style={{ fontWeight: 800, color: 'white' }}>{m.total_required} {m.unit}</span>
                  </div>
                ))}
              </div>

              {/* Audit badge if authorized or rejected */}
              {isApproved && op.authorized_by && (
                <div style={{ fontSize: '0.62rem', color: '#22c55e', background: 'rgba(34, 197, 94, 0.1)', padding: '0.4rem 0.6rem', borderRadius: '0.4rem', fontWeight: 700 }}>
                  ✓ Autorizado por: {op.authorized_by} ({new Date(op.authorized_at || 0).toLocaleDateString('es-MX')})
                </div>
              )}

              {isRejected && (
                <div style={{ fontSize: '0.62rem', color: '#fca5a5', background: 'rgba(239, 68, 68, 0.1)', padding: '0.5rem 0.6rem', borderRadius: '0.4rem' }}>
                  <div style={{ fontWeight: 800 }}>⛔ RECHAZADO POR: {op.rejected_by}</div>
                  <div style={{ fontStyle: 'italic', marginTop: '0.15rem' }}>"{op.rejection_reason}"</div>
                </div>
              )}

              {/* Action Buttons for Pending */}
              {isPending && (
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto', paddingTop: '0.5rem' }}>
                  <button
                    onClick={() => handleAuthorize(op)}
                    disabled={!canAuthorize || loading}
                    style={{
                      flex: 1.5,
                      background: canAuthorize ? '#16a34a' : 'rgba(255,255,255,0.05)',
                      color: 'white',
                      border: 'none',
                      padding: '0.65rem 1rem',
                      borderRadius: '0.65rem',
                      fontWeight: 900,
                      fontSize: '0.7rem',
                      cursor: canAuthorize ? 'pointer' : 'not-allowed',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.4rem',
                      boxShadow: canAuthorize ? '0 4px 12px rgba(22, 163, 74, 0.4)' : 'none'
                    }}
                  >
                    <CheckCircle2 size={14} /> AUTORIZAR OP
                  </button>

                  <button
                    onClick={() => handleOpenReject(op)}
                    disabled={!canAuthorize || loading}
                    style={{
                      flex: 1,
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      color: '#ef4444',
                      padding: '0.65rem 0.85rem',
                      borderRadius: '0.65rem',
                      fontWeight: 900,
                      fontSize: '0.7rem',
                      cursor: canAuthorize ? 'pointer' : 'not-allowed',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.3rem'
                    }}
                  >
                    <XCircle size={14} /> RECHAZAR
                  </button>
                </div>
              )}
            </div>
          )
        })}
        {displayOrders.length === 0 && (
          <div style={{ padding: '4rem', textAlign: 'center', color: '#64748b', gridColumn: '1 / -1' }}>
            <Inbox size={36} style={{ color: '#64748b', margin: '0 auto 0.5rem', opacity: 0.6 }} />
            <p style={{ fontWeight: 800, textTransform: 'uppercase' }}>NO HAY ÓRDENES PENDIENTES EN EL BUZÓN</p>
          </div>
        )}
      </div>

      {/* Rejection Modal */}
      <KanbanJustificationModal
        isOpen={rejectModal.isOpen}
        onClose={() => setRejectModal({ isOpen: false, orderId: null, targetInfo: '' })}
        onConfirm={handleConfirmReject}
        title="RECHAZO DE ORDEN DE PRODUCCIÓN"
        subtitle="Especifique el motivo o inconsistencia detectada para notificar y cancelar la OP."
        actionType="CONFIRMAR RECHAZO"
        targetInfo={rejectModal.targetInfo}
        minLength={10}
        loading={loading}
      />
    </div>
  )
}
