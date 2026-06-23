import { useState, useEffect, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

// --- Helpers ---
const fmt = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.85)',
  backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center',
  justifyContent: 'center', zIndex: 1000, padding: '1.5rem'
}

const modalStyle = {
  background: '#0F172A', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '2rem', padding: '2.5rem', maxWidth: 500, width: '100%',
  boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
  position: 'relative', overflow: 'hidden'
}

// --- Status Badge ---
const Badge = ({ status }) => {
  const map = {
    pending:   { bg:'rgba(245,158,11,0.1)',  border:'rgba(245,158,11,0.2)',  color:'#F59E0B', label:'PENDIENTE' },
    completed: { bg:'rgba(34,197,94,0.1)', border:'rgba(34,197,94,0.2)', color:'#22C55E', label:'ENTREGADO'  },
    cancelled: { bg:'rgba(239,68,68,0.1)', border:'rgba(239,68,68,0.2)', color:'#EF4444', label:'CANCELADO'  },
  }
  const s = map[status] || map.pending
  return (
    <span style={{ fontSize:'0.65rem', fontWeight:1000, textTransform:'uppercase', letterSpacing:'0.15em',
      background:s.bg, border:`1px solid ${s.border}`, color:s.color, padding:'0.3rem 0.8rem', borderRadius:'0.75rem' }}>
      {s.label}
    </span>
  )
}

export default function PickingQueue() {
  const { activeWarehouse, user } = useAuth()
  const [requirements, setRequirements] = useState([])
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(new Date())
  
  // Modals state
  const [deliverTarget, setDeliverTarget] = useState(null)
  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancelReason, setCancelReason] = useState('')
  const [exportModal, setExportModal] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [exportRange, setExportRange] = useState({ 
    start: new Date().toISOString().split('T')[0], 
    end: new Date().toISOString().split('T')[0] 
  })

  // 1. Fetching Logic
  const fetchRequirements = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('requirements')
      .select('*')
      .eq('warehouse', activeWarehouse)
      .order('requested_at', { ascending: false })
    
    if (error) console.error(error)
    else setRequirements(data || [])
    setLoading(false)
  }, [activeWarehouse])

  useEffect(() => {
    fetchRequirements()
    const channel = supabase.channel(`queue_rt_${activeWarehouse}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requirements', filter: `warehouse=eq.${activeWarehouse}` }, fetchRequirements)
      .subscribe()
    const timer = setInterval(() => setNow(new Date()), 60000)
    return () => { supabase.removeChannel(channel); clearInterval(timer) }
  }, [activeWarehouse, fetchRequirements])

  // 2. Delivery Logic
  const initiateDeliver = async (req) => {
    setActionLoading(true)
    const { data: inv } = await supabase.from('inventory').select('quantity, location_id').eq('id', req.inventory_id).single()
    setActionLoading(false)

    if (!inv) { alert('REGISTRO DE INVENTARIO NO ENCONTRADO.'); return }

    if (inv.quantity > req.quantity) {
      setDeliverTarget({ req, invQty: inv.quantity })
    } else {
      await finalizeDeliver(req, true)
    }
  }

  const finalizeDeliver = async (req, isFull) => {
    setActionLoading(true)
    try {
      const { data: inv } = await supabase.from('inventory').select('quantity, location_id').eq('id', req.inventory_id).single()
      if (inv) {
        const amountToDeduct = isFull ? inv.quantity : req.quantity
        const newQty = Math.max(0, inv.quantity - amountToDeduct)
        
        await supabase.from('inventory').update({ quantity: newQty }).eq('id', req.inventory_id)
        if (newQty === 0) {
          await supabase.from('locations').update({ is_occupied: false }).eq('id', inv.location_id)
        }
      }
      
      await supabase.from('requirements').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        delivered_by: user?.email || 'SISTEMA'
      }).eq('id', req.id)

      setDeliverTarget(null)
      await fetchRequirements()
    } catch (e) {
      console.error(e)
    } finally {
      setActionLoading(false)
    }
  }

  // 3. Cancel Logic
  const handleCancelConfirm = async (shouldDeleteStock) => {
    if (!cancelReason.trim()) { alert('EL MOTIVO DE CANCELACIÓN ES OBLIGATORIO.'); return }
    setActionLoading(true)
    try {
      if (shouldDeleteStock && cancelTarget.inventory_id) {
        const { data: inv } = await supabase.from('inventory').select('location_id').eq('id', cancelTarget.inventory_id).single()
        if (inv) {
          await supabase.from('inventory').delete().eq('id', cancelTarget.inventory_id)
          await supabase.from('locations').update({ is_occupied: false }).eq('id', inv.location_id)
        }
      }
      await supabase.from('requirements').update({
        status: 'cancelled',
        cancel_reason: cancelReason,
        completed_at: new Date().toISOString(),
        delivered_by: user?.email || 'SISTEMA'
      }).eq('id', cancelTarget.id)

      setCancelTarget(null)
      setCancelReason('')
      await fetchRequirements()
    } catch (e) {
      console.error(e)
    } finally {
      setActionLoading(false)
    }
  }

  // 4. Export Logic
  const handleExport = async () => {
    const { data } = await supabase
      .from('requirements')
      .select('*')
      .eq('warehouse', activeWarehouse)
      .neq('status', 'pending')
      .gte('completed_at', exportRange.start + 'T00:00:00Z')
      .lte('completed_at', exportRange.end + 'T23:59:59Z')

    if (!data || data.length === 0) { alert('NO HAY DATOS PARA EXPORTAR EN ESTE RANGO.'); return }

    const rows = data.map(r => ({
      'CLIENTE': r.client_name || 'SIN NOMBRE',
      'AUTORIZÓ': r.worker_name,
      'ENTREGÓ': r.delivered_by || '—',
      'CÓDIGO': r.product_code,
      'TALLA': r.talla,
      'CANT': r.quantity,
      'CAJA': r.assigned_location,
      'ESTADO': r.status === 'completed' ? 'ENTREGADO' : 'CANCELADO',
      'OBS': r.observaciones || '',
      'MOTIVO': r.cancel_reason || '',
      'SOLICITUD': new Date(r.requested_at).toLocaleString(),
      'FINALIZADO': new Date(r.completed_at).toLocaleString()
    }))

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'REPORTE')
    XLSX.writeFile(wb, `REPORTE_SURTIDO_${activeWarehouse}_${exportRange.start}_${exportRange.end}.xlsx`)
    setExportModal(false)
  }

  const getTimeStatus = (requestedAt) => {
    const diff = Math.floor((now - new Date(requestedAt)) / (1000 * 60))
    if (diff < 30) return { color: '#22C55E', bg: 'rgba(34,197,94,0.1)', text: 'A TIEMPO' }
    if (diff < 60) return { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', text: 'ATENCIÓN' }
    return { color: '#EF4444', bg: 'rgba(239,68,68,0.1)', text: 'RETRASADO' }
  }

  const isToday = (iso) => {
    const d = new Date(iso)
    const t = new Date()
    return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear()
  }

  const pending = requirements.filter(r => r.status === 'pending').sort((a, b) => {
    const diffA = Math.floor((now - new Date(a.requested_at)) / (1000 * 60))
    const diffB = Math.floor((now - new Date(b.requested_at)) / (1000 * 60))
    const prioA = diffA >= 60 ? 3 : diffA >= 30 ? 2 : 1
    const prioB = diffB >= 60 ? 3 : diffB >= 30 ? 2 : 1
    if (prioA !== prioB) return prioB - prioA
    return new Date(a.requested_at) - new Date(b.requested_at)
  })
  const completed = requirements.filter(r => r.status !== 'pending' && isToday(r.completed_at))

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
      
      {/* Header and Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
        <div className="glass" style={{ padding: '2rem', borderRadius: '2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', borderLeft: '6px solid #EF4444', background: 'rgba(239,68,68,0.03)' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 1000, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.2em' }}>PENDIENTES CRÍTICOS</span>
          <span style={{ fontSize: '3rem', fontWeight: 1000, color: 'white', lineHeight: 1 }}>{pending.length}</span>
        </div>
        
        <div className="glass" style={{ padding: '2rem', borderRadius: '2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', borderLeft: '6px solid #22C55E', background: 'rgba(34,197,94,0.03)' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 1000, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.2em' }}>COMPLETADOS HOY</span>
          <span style={{ fontSize: '3rem', fontWeight: 1000, color: 'white', lineHeight: 1 }}>{completed.length}</span>
        </div>

        <button onClick={() => setExportModal(true)} className="glass-hover" style={{ 
          padding: '2rem', borderRadius: '2rem', border: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: '1rem',
          color: 'white', fontWeight: 1000, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.15em',
          background: 'rgba(2,6,23,0.4)', fontSize: '0.9rem'
        }}>
          EXPORTAR HISTORIAL XLS
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr', gap: '3rem' }}>
        
        {/* Active Queue */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#EF4444', boxShadow: '0 0 15px #EF4444' }}></div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 1000, color: 'white', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
              COLA DE SURTIMIENTO ACTIVA
            </h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem', alignContent: 'start' }}>
            {pending.length === 0 && (
              <div className="glass" style={{ gridColumn: '1 / -1', padding: '6rem 2rem', textAlign: 'center', borderRadius: '2.5rem', border: '1px dashed rgba(255,255,255,0.08)' }}>
                <p style={{ color: '#64748B', fontWeight: 1000, textTransform: 'uppercase', letterSpacing: '0.15em', fontSize: '1rem' }}>SIN OPERACIONES PENDIENTES</p>
                <p style={{ color: '#475569', fontSize: '0.8rem', marginTop: '0.5rem', fontWeight: 700 }}>ESPERANDO NUEVAS SOLICITUDES DE SURTIDORES...</p>
              </div>
            )}
            {pending.map(req => {
              const status = getTimeStatus(req.requested_at)
              return (
                <div key={req.id} className="glass animate-fade-in" style={{ 
                  borderRadius: '1.5rem', border: `1px solid rgba(255,255,255,0.06)`,
                  overflow: 'hidden', display: 'flex', flexDirection: 'column',
                  background: 'rgba(2,6,23,0.3)', boxShadow: '0 20px 40px -15px rgba(0,0,0,0.4)',
                  padding: '1.5rem'
                }}>
                  {/* Top Header: Product Code and Status */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <h2 style={{ color: 'white', fontSize: '1.8rem', fontWeight: 1000, lineHeight: 1, margin: 0, wordBreak: 'break-all' }}>
                      {req.product_code}
                    </h2>
                    <div style={{ background: status.bg, color: status.color, padding: '0.4rem 0.8rem', borderRadius: '0.5rem', fontSize: '0.65rem', fontWeight: 1000, border: `1px solid ${status.color}33`, letterSpacing: '0.1em', whiteSpace: 'nowrap', marginLeft: '1rem' }}>
                      {status.text}
                    </div>
                  </div>

                  {/* Details: Size, Worker, Time */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
                    <div style={{ color: '#EF4444', fontWeight: 1000, fontSize: '0.85rem', letterSpacing: '0.05em' }}>
                      TALLA: <span style={{ color: 'white' }}>{req.talla}</span>
                    </div>
                    <div style={{ color: '#94A3B8', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{req.worker_name || 'SIN NOMBRE'}</span>
                      <span>{fmt(req.requested_at)}</span>
                    </div>
                  </div>

                  {/* Quantity and Location */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '1rem', marginBottom: req.observaciones ? '1.5rem' : 'auto' }}>
                    <div style={{ textAlign: 'center', flex: 1 }}>
                      <span style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 1000, letterSpacing: '0.1em', display: 'block', marginBottom: '0.2rem' }}>CANTIDAD</span>
                      <span style={{ color: 'white', fontSize: '1.5rem', fontWeight: 1000, lineHeight: 1 }}>{req.quantity}</span>
                    </div>
                    <div style={{ width: '1px', height: '30px', background: 'rgba(255,255,255,0.1)' }}></div>
                    <div style={{ textAlign: 'center', flex: 1 }}>
                      <span style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 1000, letterSpacing: '0.1em', display: 'block', marginBottom: '0.2rem' }}>UBICACIÓN</span>
                      <span style={{ color: '#38BDF8', fontSize: '1.5rem', fontWeight: 1000, lineHeight: 1 }}>{req.assigned_location}</span>
                    </div>
                  </div>

                  {/* Observaciones */}
                  {req.observaciones && (
                    <div style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: '0.75rem', padding: '0.75rem', marginBottom: 'auto' }}>
                      <span style={{ fontSize: '0.6rem', color: '#F59E0B', fontWeight: 1000, textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: '0.25rem' }}>OBSERVACIONES</span>
                      <p style={{ color: '#F1F5F9', fontWeight: 800, fontSize: '0.75rem', textTransform: 'uppercase', margin: 0 }}>{req.observaciones}</p>
                    </div>
                  )}

                  {/* Buttons */}
                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: req.observaciones ? '1.5rem' : '1.5rem' }}>
                    <button 
                      onClick={() => initiateDeliver(req)}
                      disabled={actionLoading}
                      style={{ 
                        flex: 1.5, padding: '0.75rem', borderRadius: '0.75rem', background: '#22C55E', color: 'white', border: 'none',
                        fontWeight: 1000, cursor: 'pointer', fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase',
                        boxShadow: '0 4px 15px rgba(34, 197, 94, 0.2)', transition: 'all 0.2s', filter: actionLoading ? 'grayscale(0.5)' : 'none'
                      }}
                    >
                      CONFIRMAR
                    </button>
                    <button 
                      onClick={() => setCancelTarget(req)}
                      disabled={actionLoading}
                      style={{ 
                        flex: 1, padding: '0.75rem', borderRadius: '0.75rem', background: 'rgba(239,68,68,0.1)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.3)',
                        fontWeight: 1000, cursor: 'pointer', fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase',
                        transition: 'all 0.2s', filter: actionLoading ? 'grayscale(0.5)' : 'none'
                      }}
                    >
                      CANCELAR
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* History Column */}
        <div style={{ padding: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '2px', border: '2px solid #22C55E' }}></div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 1000, color: 'white', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
              ACTIVIDAD RECIENTE
            </h3>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxHeight: '1000px', overflowY: 'auto', paddingRight: '1rem' }} className="custom-scrollbar">
            {completed.map(req => (
              <div key={req.id} className="glass" style={{ padding: '1.5rem', borderRadius: '1.5rem', border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.015)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <div>
                    <p style={{ color: 'white', fontWeight: 1000, fontSize: '1rem', textTransform: 'uppercase' }}>{req.product_code?.toUpperCase()}</p>
                    <p style={{ color: '#EF4444', fontWeight: 1000, fontSize: '0.8rem', textTransform: 'uppercase' }}>TALLA: {req.talla?.toUpperCase()}</p>
                  </div>
                  <Badge status={req.status} />
                </div>
                <div style={{ height: '1px', background: 'rgba(255,255,255,0.04)', marginBottom: '1rem' }}></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 1000, letterSpacing: '0.05em' }}>
                  <div>CANT: <span style={{color:'#94A3B8'}}>{req.quantity}</span> • {fmt(req.completed_at)}</div>
                  <div style={{ color: '#22C55E' }}>BOX: {req.assigned_location}</div>
                </div>
              </div>
            ))}
            {completed.length === 0 && (
              <div style={{ padding: '3rem 1.5rem', textAlign: 'center', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '1.5rem' }}>
                <p style={{ color: '#475569', fontSize: '0.75rem', fontWeight: 1000, textTransform: 'uppercase', letterSpacing: '0.1em' }}>SIN MOVIMIENTOS RECIENTES</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- MODALS --- */}

      {/* 1. Deliver Choice Modal */}
      {deliverTarget && (
        <div style={overlayStyle}>
          <div style={modalStyle} className="animate-fade-in">
            <div style={{ marginBottom: '2.5rem' }}>
               <span style={{ fontSize: '0.7rem', fontWeight: 1000, color: '#EF4444', textTransform: 'uppercase', letterSpacing: '0.25em', display: 'block', marginBottom: '0.5rem' }}>VERIFICACIÓN DE EGRESO</span>
               <h2 style={{ fontSize: '1.75rem', fontWeight: 1000, color: 'white', textTransform: 'uppercase', letterSpacing: '-0.01em', lineHeight: 1.1 }}>OPCIONES DE <span style={{color: '#EF4444'}}>SURTIMIENTO</span></h2>
            </div>
            
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '1.25rem', padding: '1.5rem', marginBottom: '2.5rem', border: '1px solid rgba(255,255,255,0.05)' }}>
               <p style={{ color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.85rem', lineHeight: 1.6 }}>
                UBICACIÓN <strong style={{ color: '#EF4444' }}>{deliverTarget.req.assigned_location?.toUpperCase()}</strong><br/>
                DISPONIBLE TOTAL: <strong style={{ color: 'white' }}>{deliverTarget.invQty} PIEZAS</strong><br/>
                SOLICITADO: <strong style={{ color: 'white' }}>{deliverTarget.req.quantity} PIEZAS</strong>
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <button 
                onClick={() => finalizeDeliver(deliverTarget.req, false)}
                style={{ padding: '1.5rem', borderRadius: '1.5rem', background: '#22C55E', color: 'white', border: 'none', fontWeight: 1000, cursor: 'pointer', textAlign: 'center', textTransform: 'uppercase', fontSize: '0.9rem', letterSpacing: '0.1em', boxShadow: '0 8px 20px rgba(34,197,94,0.2)' }}
              >
                SURTIR PARCIAL: {deliverTarget.req.quantity} PZS
              </button>
              <button 
                onClick={() => finalizeDeliver(deliverTarget.req, true)}
                style={{ padding: '1.5rem', borderRadius: '1.5rem', background: 'rgba(56,189,248,0.1)', color: '#38BDF8', border: '1px solid #38BDF8', fontWeight: 1000, cursor: 'pointer', textAlign: 'center', textTransform: 'uppercase', fontSize: '0.9rem', letterSpacing: '0.1em' }}
              >
                VACIAR TODO: {deliverTarget.invQty} PZS
              </button>
              <button onClick={() => setDeliverTarget(null)} style={{ padding: '1rem', color: '#64748B', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 1000, textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: '0.75rem', marginTop: '1rem' }}>CANCELAR OPERACIÓN</button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Cancel Modal */}
      {cancelTarget && (
        <div style={overlayStyle}>
          <div style={modalStyle} className="animate-fade-in">
            <div style={{ marginBottom: '2rem' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 1000, color: '#EF4444', textTransform: 'uppercase', letterSpacing: '0.25em', display: 'block', marginBottom: '0.5rem' }}>SISTEMA DE SEGURIDAD</span>
              <h2 style={{ fontSize: '1.75rem', fontWeight: 1000, color: 'white', textTransform: 'uppercase', letterSpacing: '-0.01em' }}>CANCELAR <span style={{color: '#EF4444'}}>SOLICITUD</span></h2>
            </div>

            <p style={{ color: '#64748B', marginBottom: '1rem', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 1000, letterSpacing: '0.1em' }}>REGISTRAR MOTIVO PARA {cancelTarget.product_code}:</p>
            <textarea 
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value.toUpperCase())}
              placeholder="ESPECIFICA EL MOTIVO DE LA CANCELACIÓN..."
              style={{ width: '100%', padding: '1.5rem', borderRadius: '1.5rem', background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.08)', color: 'white', minHeight: 140, marginBottom: '2rem', textTransform: 'uppercase', fontWeight: 800, fontSize: '0.95rem', outline: 'none', resize: 'none' }}
            />
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <button 
                onClick={() => handleCancelConfirm(true)}
                disabled={!cancelReason.trim() || actionLoading}
                style={{ width: '100%', padding: '1.25rem', background: '#EF4444', color: 'white', border: 'none', borderRadius: '1.5rem', fontWeight: 1000, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.9rem', boxShadow: '0 8px 20px rgba(239,68,68,0.2)' }}
              >
                DAR DE BAJA STOCK Y CANCELAR
              </button>
              <button 
                onClick={() => handleCancelConfirm(false)}
                disabled={!cancelReason.trim() || actionLoading}
                style={{ width: '100%', padding: '1.25rem', background: 'rgba(245,158,11,0.1)', color: '#F59E0B', border: '1px solid #F59E0B', borderRadius: '1.5rem', fontWeight: 1000, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.9rem' }}
              >
                SOLO CANCELAR SOLICITUD
              </button>
              <button onClick={() => setCancelTarget(null)} style={{ padding: '1rem', color: '#64748B', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 1000, textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: '0.75rem' }}>VOLVER</button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Export Modal */}
      {exportModal && (
        <div style={overlayStyle}>
          <div style={{ ...modalStyle, maxWidth: 450 }} className="animate-fade-in">
             <div style={{ marginBottom: '2.5rem' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 1000, color: '#EF4444', textTransform: 'uppercase', letterSpacing: '0.25em', display: 'block', marginBottom: '0.5rem' }}>GENERACIÓN DE REPORTES</span>
              <h2 style={{ fontSize: '1.75rem', fontWeight: 1000, color: 'white', textTransform: 'uppercase', letterSpacing: '-0.01em' }}>EXPORTAR <span style={{color: '#EF4444'}}>DATOS</span></h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', marginBottom: '3rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <label style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 1000, textTransform: 'uppercase', letterSpacing: '0.15em' }}>FECHA INICIAL</label>
                <input type="date" value={exportRange.start} onChange={e => setExportRange({...exportRange, start: e.target.value})}
                  style={{ width: '100%', padding: '1.25rem', borderRadius: '1rem', background: 'white', border: 'none', fontWeight: 1000, fontSize: '1.1rem', color: '#0F172A', outline: 'none' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <label style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 1000, textTransform: 'uppercase', letterSpacing: '0.15em' }}>FECHA FINAL</label>
                <input type="date" value={exportRange.end} onChange={e => setExportRange({...exportRange, end: e.target.value})}
                  style={{ width: '100%', padding: '1.25rem', borderRadius: '1rem', background: 'white', border: 'none', fontWeight: 1000, fontSize: '1.1rem', color: '#0F172A', outline: 'none' }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button onClick={() => setExportModal(false)} style={{ flex: 1, padding: '1.25rem', color: '#64748B', fontWeight: 1000, border: 'none', background: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.85rem' }}>CANCELAR</button>
              <button onClick={handleExport} style={{ flex: 2, padding: '1.25rem', background: '#EF4444', color: 'white', border: 'none', borderRadius: '1.5rem', fontWeight: 1000, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.15em', fontSize: '0.85rem', boxShadow: '0 8px 20px rgba(239,68,68,0.3)' }}>DESCARGAR XLSX</button>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div style={overlayStyle}>
           <div style={{ textAlign: 'center' }}>
            <div className="spinner" style={{ width: '60px', height: '60px', border: '5px solid rgba(255,255,255,0.05)', borderTopColor: '#EF4444', borderRadius: '50%', margin: '0 auto 2rem' }}></div>
            <p style={{ color: 'white', fontWeight: 1000, letterSpacing: '0.3em', textTransform: 'uppercase', fontSize: '0.9rem' }}>SINCRONIZANDO COLA...</p>
          </div>
        </div>
      )}

      <style>{`
        .glass-hover:hover { background: rgba(255,255,255,0.06) !important; transform: translateY(-3px); border-color: rgba(255,255,255,0.15); }
        .glass-hover { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
        .spinner { animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255,255,255,0.02); }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); borderRadius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #EF4444; }
      `}</style>
    </div>
  )
}
