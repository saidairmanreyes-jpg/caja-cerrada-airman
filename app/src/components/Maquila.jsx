import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import * as XLSX from 'xlsx'
import MaquilaHacienda from './MaquilaHacienda'


// ─── Estilos Generales ───────────────────────────────────────────
const inputStyle = {
  background: 'rgba(15,23,42,0.6)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '0.75rem',
  padding: '0.75rem 1rem',
  color: 'white',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

const btnBase = {
  padding: '0.75rem 1.5rem',
  borderRadius: '0.75rem',
  border: 'none',
  color: 'white',
  fontWeight: 900,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  justifyContent: 'center',
  transition: 'all 0.15s'
}

export default function Maquila() {
  const { isMaquila, profile, hasPermission, isAdmin } = useAuth()
  
  // La lógica ahora se delega completamente a MaquilaAdminTabs y los sub-permisos

  // Si es master u operador con permiso otorgado
  if (isAdmin || hasPermission('maquila')) {
    return <MaquilaAdminTabs />
  }

  return (
    <div style={{ padding: '4rem', textAlign: 'center', color: '#64748b', background: 'rgba(0,0,0,0.2)', borderRadius: '2rem', margin: '2rem' }}>
       <h2 style={{ color: 'white' }}>Acceso Restringido</h2>
       <p>No tienes los permisos necesarios para visualizar este módulo administrativo.</p>
    </div>
  )
}

function MaquilaAdminTabs() {
  const { hasPermission, isAdmin } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)

  // Suscripción en tiempo real para el contador del buzón
  useEffect(() => {
    const fetchUnread = async () => {
      const { count } = await supabase
        .from('maquila_notifications')
        .select('id', { count: 'exact', head: true })
        .or('is_read.eq.false,and(type.eq.rejected,resolved.eq.false)')
      setUnreadCount(count || 0)
    }
    fetchUnread()
    const channel = supabase.channel('mailbox_badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'maquila_notifications' }, fetchUnread)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  const allTabs = [
    (isAdmin || hasPermission('maquila_hacienda')) && { id: 'hacienda',    label: 'HACIENDA',    color: '#f87171' },
    (isAdmin || hasPermission('maquila_consumptions')) && { id: 'dashboard',  label: 'CONSUMOS',    color: '#94a3b8' },
    (isAdmin || hasPermission('maquila_discounted')) && { id: 'discounted', label: 'DESCONTADOS', color: '#4ade80' },
    (isAdmin || hasPermission('maquila_capture')) && { id: 'capture',    label: 'CAPTURA',      color: '#94a3b8' },
    (isAdmin || hasPermission('maquila_capture') || hasPermission('maquila_consumptions')) && { id: 'mailbox', label: 'BUZÓN', color: '#a78bfa', isMailbox: true },
  ].filter(Boolean)

  const [activeTab, setActiveTab] = useState(allTabs.length > 0 ? allTabs[0].id : '')

  useEffect(() => {
    if (allTabs.length > 0 && !allTabs.find(t => t.id === activeTab)) {
      setActiveTab(allTabs[0].id)
    }
  }, [isAdmin, hasPermission, activeTab])

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1.5rem', overflowX: 'auto', alignItems: 'center' }}>
        {allTabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              ...btnBase,
              background: activeTab === t.id ? `${t.color}22` : 'transparent',
              color: activeTab === t.id ? t.color : '#94a3b8',
              border: activeTab === t.id ? `1px solid ${t.color}44` : '1px solid transparent',
              boxShadow: activeTab === t.id ? `0 4px 12px ${t.color}18` : 'none',
              whiteSpace: 'nowrap',
              position: 'relative',
            }}
          >
            {t.isMailbox ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2"/>
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                </svg>
                {t.label}
                {unreadCount > 0 && (
                  <span style={{
                    background: '#ef4444',
                    color: 'white',
                    borderRadius: '999px',
                    fontSize: '0.6rem',
                    fontWeight: 900,
                    minWidth: '18px',
                    height: '18px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 4px',
                    lineHeight: 1,
                    boxShadow: '0 0 0 2px rgba(239,68,68,0.3)',
                    animation: 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite'
                  }}>{unreadCount > 99 ? '99+' : unreadCount}</span>
                )}
              </span>
            ) : t.label}
          </button>
        ))}
      </div>

      <div style={{ marginTop: '-0.5rem' }}>
        {activeTab === 'hacienda'   && <MaquilaHacienda />}
        {activeTab === 'dashboard'  && <MaquilaDashboard />}
        {activeTab === 'discounted' && <MaquilaDiscounted />}
        {activeTab === 'capture'    && <MaquilaCapture />}
        {activeTab === 'mailbox'    && <MaquilaMailbox />}
      </div>
    </div>
  )
}


// ─── Componente: Buzón de Correo / Notificaciones de OP ────────
function MaquilaMailbox() {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // 'all' | 'rejected' | 'success'
  const [editingOp, setEditingOp] = useState(null)

  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('maquila_notifications')
      .select('*')
      .order('created_at', { ascending: false })
    setNotifications(data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchNotifications()
    const channel = supabase.channel('mailbox_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'maquila_notifications' }, fetchNotifications)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetchNotifications])

  const markAllRead = async () => {
    await supabase
      .from('maquila_notifications')
      .update({ is_read: true })
      .eq('is_read', false)
    fetchNotifications()
  }

  const markAsRead = async (id) => {
    await supabase
      .from('maquila_notifications')
      .update({ is_read: true })
      .eq('id', id)
    fetchNotifications()
  }

  const handleEditRejected = async (opNum, notifId) => {
    // Redirigir al tab de captura con la OP precargada usando evento personalizado
    window.dispatchEvent(new CustomEvent('maquila_edit_op', { detail: { opNum, notifId } }))
    // Marcar como leída
    if (notifId) {
      await supabase.from('maquila_notifications').update({ is_read: true }).eq('id', notifId)
      fetchNotifications()
    }
  }

  const filtered = notifications.filter(n => {
    if (filter === 'rejected') return n.type === 'rejected'
    if (filter === 'success') return n.type === 'success'
    return true
  })

  const unread = notifications.filter(n => !n.is_read || (n.type === 'rejected' && !n.resolved)).length
  const rejectedCount = notifications.filter(n => n.type === 'rejected').length
  const successCount = notifications.filter(n => n.type === 'success').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

      {/* Header del buzón */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            width: '52px', height: '52px', borderRadius: '1rem',
            background: 'rgba(167, 139, 250, 0.12)',
            border: '1px solid rgba(167, 139, 250, 0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2"/>
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
            </svg>
          </div>
          <div>
            <h1 style={{ fontSize: '2rem', fontWeight: 900, color: 'white', textTransform: 'uppercase', lineHeight: 1 }}>
              BUZÓN DE <span style={{ color: '#a78bfa' }}>NOTIFICACIONES</span>
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.85rem', fontWeight: 700, marginTop: '0.3rem', textTransform: 'uppercase' }}>
              ALERTAS DE DESCUENTO Y CORRECCIONES DE ÓRDENES DE PRODUCCIÓN
            </p>
          </div>
        </div>

        {unread > 0 && (
          <button
            onClick={markAllRead}
            style={{ ...btnBase, background: 'rgba(167,139,250,0.1)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.3)', fontSize: '0.8rem', fontWeight: 900 }}
          >
            ✓ MARCAR TODO COMO LEÍDO
          </button>
        )}
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
        {[
          { label: 'Total', value: notifications.length, color: '#a78bfa', bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.2)' },
          { label: 'Pendientes', value: unread, color: '#f87171', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)' },
          { label: 'Exitosos', value: successCount, color: '#4ade80', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.2)' },
        ].map(stat => (
          <div key={stat.label} style={{
            background: stat.bg,
            border: `1px solid ${stat.border}`,
            borderRadius: '1rem',
            padding: '1rem 1.25rem',
            display: 'flex', flexDirection: 'column', gap: '0.25rem'
          }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{stat.label}</span>
            <span style={{ fontSize: '2rem', fontWeight: 900, color: stat.color, lineHeight: 1 }}>{stat.value}</span>
          </div>
        ))}
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {[
          { key: 'all', label: `Todos (${notifications.length})` },
          { key: 'rejected', label: `Rechazados (${rejectedCount})`, color: '#f87171' },
          { key: 'success', label: `Descontados (${successCount})`, color: '#4ade80' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: '0.4rem 1rem',
              borderRadius: '999px',
              border: filter === f.key ? `1px solid ${f.color || '#a78bfa'}44` : '1px solid rgba(255,255,255,0.1)',
              background: filter === f.key ? `${f.color || '#a78bfa'}15` : 'transparent',
              color: filter === f.key ? (f.color || '#a78bfa') : '#94a3b8',
              fontWeight: 800,
              fontSize: '0.78rem',
              cursor: 'pointer',
              textTransform: 'uppercase',
              transition: 'all 0.15s'
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Lista de notificaciones */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#475569' }}>
          <div style={{ width: '32px', height: '32px', border: '2px solid rgba(167,139,250,0.2)', borderTopColor: '#a78bfa', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
          <p style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>Cargando buzón...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '5rem 2rem', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: '1.5rem', opacity: 0.6 }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1.5" style={{ margin: '0 auto 1rem', display: 'block' }}>
            <rect x="2" y="4" width="20" height="16" rx="2"/>
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
          </svg>
          <p style={{ fontWeight: 900, color: 'white', textTransform: 'uppercase', marginBottom: '0.5rem' }}>BUZÓN VACÍO</p>
          <p style={{ color: '#64748b', fontSize: '0.85rem' }}>No hay notificaciones en esta categoría.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filtered.map(n => {
            const isRejected = n.type === 'rejected'
            const isPending = !n.is_read || (isRejected && !n.resolved)
            const accentColor = isRejected ? '#f87171' : '#4ade80'
            const bgColor = isRejected ? 'rgba(239,68,68,0.06)' : 'rgba(34,197,94,0.06)'
            const borderColor = isRejected
              ? (isPending ? 'rgba(239,68,68,0.4)' : 'rgba(239,68,68,0.15)')
              : (isPending ? 'rgba(34,197,94,0.4)' : 'rgba(34,197,94,0.15)')

            return (
              <div key={n.id} style={{
                background: bgColor,
                border: `1px solid ${borderColor}`,
                borderRadius: '1rem',
                padding: '1.25rem 1.5rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1rem',
                transition: 'all 0.2s',
                opacity: (!isPending && !isRejected) ? 0.65 : 1
              }}>
                {/* Indicador no leído */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flex: 1, minWidth: 260 }}>
                  {isPending && (
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: accentColor, flexShrink: 0, marginTop: 6, boxShadow: `0 0 6px ${accentColor}` }} />
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                      {/* Badge tipo */}
                      <span style={{
                        fontSize: '0.6rem', padding: '0.2rem 0.6rem', borderRadius: '999px',
                        background: isRejected ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                        color: accentColor, fontWeight: 900, textTransform: 'uppercase', border: `1px solid ${accentColor}33`
                      }}>
                        {isRejected ? '⚠ RECHAZADA' : '✓ DESCONTADA'}
                      </span>
                      <span style={{ fontWeight: 900, color: 'white', fontSize: '1rem' }}>OP {n.op_number}</span>
                      <span style={{ fontSize: '0.7rem', color: '#475569', fontWeight: 600 }}>
                        {new Date(n.created_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    </div>
                    <p style={{ color: '#94a3b8', fontSize: '0.82rem', margin: 0, lineHeight: 1.5 }}>{n.message}</p>
                    {isRejected && n.reason && (
                      <p style={{
                        color: '#f87171', fontSize: '0.75rem', fontWeight: 800,
                        margin: '0.4rem 0 0', textTransform: 'uppercase',
                        display: 'flex', alignItems: 'center', gap: '0.4rem'
                      }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m9 18 6-6-6-6"/></svg>
                        MOTIVO: {n.reason}
                      </p>
                    )}
                    {isRejected && n.resolved && (
                      <p style={{ color: '#a78bfa', fontSize: '0.72rem', fontWeight: 800, margin: '0.3rem 0 0', textTransform: 'uppercase' }}>
                        ✔ CORRECCIÓN YA ENVIADA
                      </p>
                    )}
                  </div>
                </div>

                {/* Acciones */}
                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                  {isRejected && !n.resolved && (
                    <button
                      onClick={() => handleEditRejected(n.op_number, n.id)}
                      style={{
                        ...btnBase,
                        background: 'rgba(239,68,68,0.15)',
                        color: '#f87171',
                        border: '1px solid rgba(239,68,68,0.35)',
                        fontSize: '0.75rem',
                        padding: '0.45rem 0.9rem',
                        borderRadius: '0.6rem',
                        fontWeight: 900
                      }}
                    >
                      ✏️ CORREGIR
                    </button>
                  )}
                  {isPending && (
                    <button
                      onClick={() => markAsRead(n.id)}
                      style={{
                        ...btnBase,
                        background: 'rgba(255,255,255,0.04)',
                        color: '#64748b',
                        border: '1px solid rgba(255,255,255,0.08)',
                        fontSize: '0.72rem',
                        padding: '0.45rem 0.8rem',
                        borderRadius: '0.6rem',
                        fontWeight: 700
                      }}
                    >
                      ARCHIVAR
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Componente: Formulario de Captura para Maquileros ──────────
function MaquilaCapture() {
  const [catalog, setCatalog] = useState([])
  const [loading, setLoading] = useState(false)

  const [opNumber, setOpNumber] = useState('')
  const [processDate, setProcessDate] = useState(new Date().toISOString().slice(0, 10))
  
  // Líneas dinámicas
  const [telaLines, setTelaLines] = useState([{ id: Date.now() + 1, catalog_id: '', quantity: '' }])
  const [avioLines, setAvioLines] = useState([{ id: Date.now() + 2, catalog_id: '', quantity: '' }])

  const [saving, setSaving] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  // Modo edición (precarga desde el buzón)
  const [editingOp, setEditingOp] = useState(null)

  // Definida con useCallback antes del useEffect para evitar referencia antes de declaración
  const loadRejectedOp = useCallback(async (opNum) => {
    setLoading(true)
    try {
      const { data: rejectedConsumptions, error } = await supabase
        .from('maquila_consumptions')
        .select('*')
        .eq('op_number', opNum)
        .eq('is_rejected', true)
        .eq('is_discounted_erp', false)

      if (error) throw error

      if (!rejectedConsumptions || rejectedConsumptions.length === 0) {
        alert(`No se encontraron consumos rechazados editables para la OP ${opNum}.`)
        setLoading(false)
        return
      }

      setOpNumber(opNum)
      if (rejectedConsumptions[0]?.process_date) {
        setProcessDate(rejectedConsumptions[0].process_date)
      }

      const telasFromDb = rejectedConsumptions.filter(c => c.category?.toUpperCase().includes('TELA'))
      const aviosFromDb = rejectedConsumptions.filter(c =>
        c.category?.toUpperCase().includes('AVIO') || c.category?.toUpperCase().includes('AVÍO')
      )

      setTelaLines(telasFromDb.length > 0
        ? telasFromDb.map((t, idx) => ({ id: Date.now() + idx + Math.random(), catalog_id: t.catalog_id, quantity: t.quantity }))
        : [{ id: Date.now() + 1, catalog_id: '', quantity: '' }]
      )
      setAvioLines(aviosFromDb.length > 0
        ? aviosFromDb.map((a, idx) => ({ id: Date.now() + idx + Math.random(), catalog_id: a.catalog_id, quantity: a.quantity }))
        : [{ id: Date.now() + 2, catalog_id: '', quantity: '' }]
      )

      setEditingOp(opNum)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      alert('Error al cargar datos para corrección: ' + err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    supabase.from('maquila_catalog').select('*').order('short_description').then(({ data }) => {
      setCatalog(data || [])
    })

    // Escuchar evento de edición disparado desde el Buzón de Notificaciones
    const handleEditEvent = (e) => {
      const { opNum } = e.detail
      loadRejectedOp(opNum)
    }
    window.addEventListener('maquila_edit_op', handleEditEvent)
    return () => window.removeEventListener('maquila_edit_op', handleEditEvent)
  }, [loadRejectedOp])

  const telas = catalog.filter(c => c.category?.toUpperCase().includes('TELA'))
  const avios = catalog.filter(c => c.category?.toUpperCase().includes('AVIO') || c.category?.toUpperCase().includes('AVÍO'))

  const handleSave = async (e) => {
    e.preventDefault()
    if (!opNumber || !processDate) return
    
    // Validar al menos uno
    const validTelas = telaLines.filter(t => t.catalog_id && t.quantity)
    const validAvios = avioLines.filter(a => a.catalog_id && a.quantity)

    if (validTelas.length === 0 && validAvios.length === 0) {
      alert("Debes seleccionar al menos un producto (Tela o Avío) y especificar su cantidad.")
      return
    }

    const confirmMsg = editingOp 
      ? `¿Confirma que desea guardar la CORRECCIÓN para la OP ${opNumber}? Se reemplazarán los registros rechazados anteriores.`
      : `¿Confirma que la información y cantidades capturadas para la OP ${opNumber} son correctas?`

    if (!window.confirm(confirmMsg)) {
      return
    }
    
    setSaving(true)
    
    // Obtener modelo base del primer elemento de tela si existe
    const firstTela = validTelas[0] ? telas.find(t => t.id === validTelas[0].catalog_id) : null
    const baseModel = firstTela?.model || 'SN'

    // SUMA EN AUTOMÁTICO AL CAPTURAR (Consolidar en memoria por catalog_id para evitar duplicados en la BD)
    const consolidatedTelas = {}
    for (const lt of validTelas) {
      const selTela = telas.find(t => t.id === lt.catalog_id)
      if (selTela) {
        const key = selTela.id
        if (!consolidatedTelas[key]) {
          consolidatedTelas[key] = {
            op_number: opNumber.trim().toUpperCase(),
            process_date: processDate,
            model: selTela.model || 'SN',
            catalog_id: selTela.id,
            internal_code: selTela.internal_code,
            short_description: selTela.short_description,
            category: selTela.category,
            unit_of_measure: selTela.unit_of_measure,
            quantity: parseFloat(lt.quantity),
            is_discounted_erp: false,
            is_rejected: false,
            rejection_reason: null
          }
        } else {
          consolidatedTelas[key].quantity += parseFloat(lt.quantity)
        }
      }
    }

    const consolidatedAvios = {}
    for (const la of validAvios) {
      const selAvio = avios.find(a => a.id === la.catalog_id)
      if (selAvio) {
        const key = selAvio.id
        if (!consolidatedAvios[key]) {
          consolidatedAvios[key] = {
            op_number: opNumber.trim().toUpperCase(),
            process_date: processDate,
            model: baseModel,
            catalog_id: selAvio.id,
            internal_code: selAvio.internal_code,
            short_description: selAvio.short_description,
            category: selAvio.category,
            unit_of_measure: selAvio.unit_of_measure,
            quantity: parseFloat(la.quantity),
            is_discounted_erp: false,
            is_rejected: false,
            rejection_reason: null
          }
        } else {
          consolidatedAvios[key].quantity += parseFloat(la.quantity)
        }
      }
    }

    const payloads = [
      ...Object.values(consolidatedTelas),
      ...Object.values(consolidatedAvios)
    ]

    if (payloads.length === 0) {
      setSaving(false)
      return
    }

    try {
      if (editingOp) {
        // Flujo de Edición: Borrar consumos rechazados anteriores para esta OP antes de insertar los nuevos
        const { error: deleteError } = await supabase
          .from('maquila_consumptions')
          .delete()
          .eq('op_number', editingOp.trim().toUpperCase())
          .eq('is_rejected', true)
          .eq('is_discounted_erp', false)

        if (deleteError) throw deleteError

        // Marcar la notificación/alerta correspondiente como resuelta y leída
        await supabase
          .from('maquila_notifications')
          .update({ resolved: true, is_read: true })
          .eq('op_number', editingOp.trim().toUpperCase())
          .eq('type', 'rejected')
      }

      // Insertar nuevos consumos ya consolidados
      const { error: insertError } = await supabase.from('maquila_consumptions').insert(payloads)
      if (insertError) throw insertError

      setSuccessMsg(
        editingOp 
          ? `¡Corrección guardada y enviada exitosamente para la OP ${opNumber}!`
          : `Consumo múltiple guardado exitosamente para la OP ${opNumber}`
      )
      
      // Resetear formulario
      setOpNumber('')
      setProcessDate(new Date().toISOString().slice(0, 10))
      setTelaLines([{ id: Date.now() + 1, catalog_id: '', quantity: '' }])
      setAvioLines([{ id: Date.now() + 2, catalog_id: '', quantity: '' }])
      setEditingOp(null)
      fetchNotifications()
      setTimeout(() => setSuccessMsg(''), 4000)
    } catch (err) {
      alert("Error al procesar el guardado: " + err.message)
    } finally {
      setSaving(false)
    }
  }

  const cancelCorrection = () => {
    setOpNumber('')
    setProcessDate(new Date().toISOString().slice(0, 10))
    setTelaLines([{ id: Date.now() + 1, catalog_id: '', quantity: '' }])
    setAvioLines([{ id: Date.now() + 2, catalog_id: '', quantity: '' }])
    setEditingOp(null)
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
        <div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 900, color: 'white', lineHeight: 1, textTransform: 'uppercase' }}>
            {editingOp ? "CORREGIR CONSUMO RECHAZADO" : "CAPTURA DE CONSUMOS"}
          </h2>
          <p style={{ color: '#64748b', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase' }}>
            {editingOp 
              ? `MODO CORRECCIÓN ACTIVO PARA LA OP ${editingOp}`
              : "REGISTRA PRODUCTOS POR ORDEN DE PRODUCCIÓN."
            }
          </p>
        </div>
      </div>

      {editingOp && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.05)',
          border: '1px solid rgba(239, 68, 68, 0.25)',
          borderRadius: '1rem',
          padding: '1rem 1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span style={{ color: '#f87171', fontSize: '0.85rem', fontWeight: 900, textTransform: 'uppercase' }}>
            ⚠️ ESTÁS EDITANDO LA CAPTURA RECHAZADA DE LA OP: {editingOp}. AL GUARDAR, SE REEMPLAZARÁN LOS DATOS ANTERIORES.
          </span>
          <button onClick={cancelCorrection} style={{
            background: 'transparent',
            border: 'none',
            color: '#cbd5e1',
            textDecoration: 'underline',
            cursor: 'pointer',
            fontSize: '0.8rem',
            fontWeight: 700
          }}>
            CANCELAR EDICIÓN
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#475569' }}>
          <div style={{ width: '32px', height: '32px', border: '2px solid rgba(239,68,68,0.2)', borderTopColor: '#ef4444', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
          <p style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>Cargando datos...</p>
        </div>
      ) : (
        <form onSubmit={handleSave} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '1.5rem', padding: '2rem' }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                Orden de Producción (OP) {editingOp && <span style={{ color: '#f87171' }}>(Fija)</span>}
              </label>
              <input 
                required 
                type="text" 
                value={opNumber} 
                onChange={e => !editingOp && setOpNumber(e.target.value)} 
                readOnly={!!editingOp}
                placeholder="Ej. 2874B" 
                style={{ ...inputStyle, opacity: editingOp ? 0.6 : 1, cursor: editingOp ? 'not-allowed' : 'text' }} 
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Fecha de Corte / Proceso</label>
              <input required type="date" value={processDate} onChange={e => setProcessDate(e.target.value)} style={inputStyle} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '1.5rem', marginBottom: '1.5rem' }}>
            
            {/* COLUMNA TELAS */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                 <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#f87171', textTransform: 'uppercase' }}>TELAS UTILIZADAS</label>
                 <button type="button" onClick={() => setTelaLines([...telaLines, { id: Date.now() + Math.random(), catalog_id: '', quantity: '' }])} style={{ background: 'transparent', border: 'none', color: '#f87171', fontSize: '0.75rem', fontWeight: 900, cursor: 'pointer', textTransform: 'uppercase' }}>
                   AGREGAR TELAS
                 </button>
              </div>
              
              {telaLines.map((line, idx) => {
                const selObj = telas.find(t => t.id === line.catalog_id)
                const umed = selObj ? selObj.unit_of_measure : 'U'
                return (
                  <div key={line.id} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', background: 'rgba(239,68,68,0.02)', padding: '0.75rem', borderRadius: '0.75rem', border: '1px solid rgba(239,68,68,0.1)' }}>
                    <div style={{ flex: 1 }}>
                      <select value={line.catalog_id} onChange={e => {
                          const newArr = [...telaLines]; newArr[idx].catalog_id = e.target.value; setTelaLines(newArr)
                        }} style={{ ...inputStyle, padding: '0.5rem', fontSize: '0.8rem', background: '#0f172a' }}>
                        <option value="">-- Seleccionar Tela --</option>
                        {telas.map(c => <option key={c.id} value={c.id}>{c.short_description}</option>)}
                      </select>
                    </div>
                    <div style={{ width: '80px' }}>
                      <input type="number" step="0.01" min="0.01" value={line.quantity} placeholder={umed} onChange={e => {
                          const newArr = [...telaLines]; newArr[idx].quantity = e.target.value; setTelaLines(newArr)
                        }} style={{ ...inputStyle, padding: '0.5rem', fontSize: '0.8rem', textAlign: 'center' }} />
                    </div>
                    {telaLines.length > 1 && (
                      <button type="button" onClick={() => setTelaLines(telaLines.filter(x => x.id !== line.id))} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0 0.25rem' }}>✕</button>
                    )}
                  </div>
                )
              })}
            </div>

            {/* COLUMNA AVIOS */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                 <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4ade80', textTransform: 'uppercase' }}>AVÍOS UTILIZADOS</label>
                 <button type="button" onClick={() => setAvioLines([...avioLines, { id: Date.now() + Math.random(), catalog_id: '', quantity: '' }])} style={{ background: 'transparent', border: 'none', color: '#4ade80', fontSize: '0.75rem', fontWeight: 900, cursor: 'pointer', textTransform: 'uppercase' }}>
                   AGREGAR AVÍOS
                 </button>
              </div>
              
              {avioLines.map((line, idx) => {
                const selObj = avios.find(a => a.id === line.catalog_id)
                const umed = selObj ? selObj.unit_of_measure : 'U'
                return (
                  <div key={line.id} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', background: 'rgba(34,197,94,0.02)', padding: '0.75rem', borderRadius: '0.75rem', border: '1px solid rgba(34,197,94,0.1)' }}>
                    <div style={{ flex: 1 }}>
                      <select value={line.catalog_id} onChange={e => {
                          const newArr = [...avioLines]; newArr[idx].catalog_id = e.target.value; setAvioLines(newArr)
                        }} style={{ ...inputStyle, padding: '0.5rem', fontSize: '0.8rem', background: '#0f172a' }}>
                        <option value="">-- Seleccionar Avío --</option>
                        {avios.map(c => <option key={c.id} value={c.id}>{c.short_description}</option>)}
                      </select>
                    </div>
                    <div style={{ width: '80px' }}>
                      <input type="number" step="0.01" min="0.01" value={line.quantity} placeholder={umed} onChange={e => {
                          const newArr = [...avioLines]; newArr[idx].quantity = e.target.value; setAvioLines(newArr)
                        }} style={{ ...inputStyle, padding: '0.5rem', fontSize: '0.8rem', textAlign: 'center' }} />
                    </div>
                    {avioLines.length > 1 && (
                      <button type="button" onClick={() => setAvioLines(avioLines.filter(x => x.id !== line.id))} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0 0.25rem' }}>✕</button>
                    )}
                  </div>
                )
              })}
            </div>

          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button disabled={saving} type="submit" style={{ ...btnBase, background: '#ef4444', opacity: saving ? 0.7 : 1, fontWeight: 900 }}>
              {saving ? "GUARDANDO..." : editingOp ? "GUARDAR CORRECCIÓN" : "GUARDAR CONSUMO"}
            </button>
          </div>

          {successMsg && (
            <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(34,197,94,0.1)', color: '#4ade80', borderRadius: '1rem', border: '1px solid rgba(34,197,94,0.2)', textAlign: 'center', fontWeight: 700 }}>
              <span style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '0.5rem' }}>✔️</span>
              {successMsg}
            </div>
          )}
        </form>
      )}
    </div>
  )
}

// ─── Componente: Dashboard de Control para Admon (y subida Excel) 
function MaquilaDashboard() {
  const [consumptions, setConsumptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploadingCat, setUploadingCat] = useState(false)
  const { profile } = useAuth()

  // Estado del modal de rechazo
  const [rejectOp, setRejectOp] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejecting, setRejecting] = useState(false)

  // Estados para nuevos modales
  const [showUploadInfoModal, setShowUploadInfoModal] = useState(false)
  const [showManualCodeModal, setShowManualCodeModal] = useState(false)
  const [manualCode, setManualCode] = useState({
    internal_code: '',
    description: '',
    short_description: '',
    category: '',
    unit_of_measure: '',
    model: ''
  })
  const [savingManual, setSavingManual] = useState(false)

  const handleSaveManualCode = async (e) => {
    e.preventDefault()
    setSavingManual(true)
    try {
      const payload = {
        internal_code: manualCode.internal_code.trim(),
        short_description: manualCode.short_description.trim() || manualCode.description.trim(),
        category: manualCode.category,
        unit_of_measure: manualCode.unit_of_measure.trim() || 'Pzas',
        model: manualCode.model.trim() || 'SN'
      }
      const { error } = await supabase.from('maquila_catalog').upsert([payload], { onConflict: 'internal_code,short_description', ignoreDuplicates: true })
      if (error) throw error
      alert('¡Código agregado exitosamente al catálogo!')
      setShowManualCodeModal(false)
      setManualCode({ internal_code: '', description: '', short_description: '', category: '', unit_of_measure: '', model: '' })
    } catch (err) {
      alert('Error al guardar código: ' + err.message)
    } finally {
      setSavingManual(false)
    }
  }

  const REJECTION_REASONS = [
    'NO COINCIDE CONTRA OP',
    'EL CODIGO ES ERRONEO',
    'LA CANTIDAD NO COINCIDE',
    'MODELO DE TELA NO COINCIDE CONTRA OP'
  ]

  const fetchConsumptions = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('maquila_consumptions')
      .select('*')
      .order('process_date', { ascending: false })
      .order('op_number', { ascending: false })
    
    setConsumptions(data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchConsumptions()
    const sub = supabase.channel('maquila_consumptions_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'maquila_consumptions' }, fetchConsumptions)
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [fetchConsumptions])

  // Lógica de archivo para subir Catalogo de BD
  const handleFileUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploadingCat(true)

    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result
        const wb = XLSX.read(bstr, { type: 'binary' })
        const wsName = wb.SheetNames.find(n => n.toUpperCase().includes('BASE DATOS') || n.toUpperCase().includes('CATALOGO')) || wb.SheetNames[0]
        const ws = wb.Sheets[wsName]
        const data = XLSX.utils.sheet_to_json(ws)

        let rowsToInsert = []
        for (const row of data) {
          const normalizedRow = {}
          for (let key in row) {
            normalizedRow[key.trim().toUpperCase()] = row[key]
          }

          const sDesc = normalizedRow['DESCRIPCION CORTA'] || normalizedRow['DESCRIPCIÓN CORTA']
          const code = normalizedRow['CODIGO ERP'] || normalizedRow['CODIGO'] || normalizedRow['CÓDIGO ERP']
          const cat = normalizedRow['CATEGORIA'] || normalizedRow['CATEGORÍA'] || normalizedRow['CAT'] || normalizedRow['CAT.']
          const umed = normalizedRow['U MEDIDA'] || normalizedRow['U. MEDIDA'] || normalizedRow['U. MED'] || normalizedRow['UMED']
          const mod = normalizedRow['MODELO']

          if (sDesc && code) {
            rowsToInsert.push({
              internal_code: code.toString().trim(),
              short_description: sDesc.toString().trim(),
              category: (cat || '').toString().trim(),
              unit_of_measure: (umed || 'Pzas').toString().trim(),
              model: (mod || 'SN').toString().trim()
            })
          }
        }

        if (rowsToInsert.length > 0) {
           const { error } = await supabase.from('maquila_catalog').upsert(rowsToInsert, { onConflict: 'internal_code,short_description', ignoreDuplicates: true })
           if (error) throw error
           alert(`¡Catálogo actualizado con ${rowsToInsert.length} filas verificadas!`)
        } else {
           alert("No se detectaron filas válidas en el Excel")
        }

      } catch (err) {
        alert("Error procesando Excel: " + err.message)
      } finally {
        setUploadingCat(false)
        e.target.value = null // reset
      }
    }
    reader.readAsBinaryString(file)
  }

  const markAsDiscounted = async (opNumber) => {
    if (!window.confirm(`¿Confirmas que ya descargaste en el ERP todos los materiales pendientes de la OP ${opNumber}?`)) return
    
    setLoading(true)
    // Todos los que pertenezcan a la OP y esten pendientes -> pasarlos a true
    const { error } = await supabase
      .from('maquila_consumptions')
      .update({ 
        is_discounted_erp: true, 
        discounted_at: new Date().toISOString(), 
        discounted_by: profile?.name || 'Usuario',
        is_rejected: false // Al descontar con éxito se quita cualquier marca de rechazo
      })
      .eq('op_number', opNumber)
      .eq('is_discounted_erp', false)

    if (error) {
      alert("Error marcando OP: " + error.message)
      setLoading(false)
    } else {
      // Registrar notificación de éxito en maquila_notifications
      const { error: notifError } = await supabase
        .from('maquila_notifications')
        .insert({
          op_number: opNumber,
          type: 'success',
          message: `La OP ${opNumber} ha sido descontada con éxito en el ERP.`,
          is_read: false,
          resolved: true
        })
      if (notifError) {
        console.error("Error creando notificación de éxito:", notifError.message)
      }
      fetchConsumptions()
    }
  }

  const handleReject = async () => {
    if (!rejectReason) {
      alert("Por favor, selecciona un motivo de rechazo.")
      return
    }

    setRejecting(true)
    const opNumber = rejectOp

    // 1. Actualizar consumos no descontados de esta OP como rechazados con su motivo
    const { error: updateError } = await supabase
      .from('maquila_consumptions')
      .update({
        is_rejected: true,
        rejection_reason: rejectReason,
        rejected_at: new Date().toISOString(),
        rejected_by: profile?.name || 'Administrador'
      })
      .eq('op_number', opNumber)
      .eq('is_discounted_erp', false)

    if (updateError) {
      alert("Error al registrar rechazo: " + updateError.message)
      setRejecting(false)
      return
    }

    // 2. Registrar notificación de rechazo en maquila_notifications
    const { error: notifError } = await supabase
      .from('maquila_notifications')
      .insert({
        op_number: opNumber,
        type: 'rejected',
        message: `La captura de la OP ${opNumber} ha sido RECHAZADA. Por favor, corrige la captura de consumo.`,
        reason: rejectReason,
        is_read: false,
        resolved: false
      })

    if (notifError) {
      console.error("Error al registrar alerta de rechazo:", notifError.message)
    }

    setRejectOp(null)
    setRejectReason('')
    setRejecting(false)
    fetchConsumptions()
  }

  // Agrupar por OP -> Array de consumos
  const groupedByOp = consumptions.reduce((acc, curr) => {
    if (!acc[curr.op_number]) acc[curr.op_number] = []
    acc[curr.op_number].push(curr)
    return acc
  }, {})

  // Calculate status for each OP cluster
  const opClusters = Object.entries(groupedByOp).map(([op, items]) => {
     const hasPending = items.some(i => !i.is_discounted_erp)
     let statusColor = 'green'
     
     if (hasPending) {
       const hasRejected = items.some(i => i.is_rejected)
       if (hasRejected) {
         statusColor = 'red' // Si está rechazada la mostramos en alerta roja
       } else {
         const hasOld = items.some(i => {
           if (i.is_discounted_erp) return false
           const daysDiff = (new Date().getTime() - new Date(i.created_at).getTime()) / (1000 * 3600 * 24)
           return daysDiff > 2
         })
         statusColor = hasOld ? 'red' : 'yellow'
       }
     }

     // Calculate OP Model from its Tela definition
     const telaItem = items.find(i => i.category?.toUpperCase() === 'TELA')
     const opModel = telaItem ? telaItem.model : 'SIN TELA / MÚLTIPLE'

     return { op, items, statusColor, opModel }
  }).filter(c => c.statusColor !== 'green').sort((a,b) => {
    const ord = { red:1, yellow:2, green:3 }
    return ord[a.statusColor] - ord[b.statusColor]
  })

  // SUMA EN AUTOMÁTICO (Consolidar consumos duplicados en memoria al renderizar)
  const getConsolidatedItems = (items) => {
    const consolidated = {}
    items.forEach(item => {
      const key = item.internal_code.trim().toUpperCase()
      if (!consolidated[key]) {
        consolidated[key] = { ...item, quantity: parseFloat(item.quantity || 0) }
      } else {
        consolidated[key].quantity += parseFloat(item.quantity || 0)
        if (item.is_discounted_erp === false) {
          consolidated[key].is_discounted_erp = false
        }
        if (item.is_rejected === true) {
          consolidated[key].is_rejected = true
          consolidated[key].rejection_reason = item.rejection_reason || consolidated[key].rejection_reason
        }
      }
    })
    return Object.values(consolidated).map(c => ({
      ...c,
      quantity: Math.round(c.quantity * 100) / 100
    }))
  }

  const [expandedOp, setExpandedOp] = useState(null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 900, color: 'white', textTransform: 'uppercase' }}>REPORTE DE PRODUCCIÓN <span style={{ color: '#ef4444' }}>MAQUILA</span></h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '0.25rem', fontWeight: 700, textTransform: 'uppercase' }}>VISUALIZA Y CONTROLA EL DESCUENTO EN ERP DE AVÍOS Y TELAS.</p>
        </div>
        
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button onClick={() => setShowManualCodeModal(true)} style={{ ...btnBase, background: 'rgba(56,189,248,0.1)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.3)', fontWeight: 900 }}>
             + AGREGAR CÓDIGO MANUAL
          </button>
          <div style={{ position: 'relative' }}>
            <input type="file" id="upload-catalog" style={{ display: 'none' }} accept=".xls,.xlsx,.xlsm" onChange={(e) => { handleFileUpload(e); setShowUploadInfoModal(false); }} />
            <button onClick={() => setShowUploadInfoModal(true)} style={{ ...btnBase, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', cursor: uploadingCat ? 'wait' : 'pointer', fontWeight: 900 }}>
              {uploadingCat ? "SUBIENDO..." : "SUBIR CATÁLOGO EXCEL"}
            </button>
          </div>
        </div>
      </div>

      {loading ? (
         <div style={{ textAlign: 'center', padding: '4rem', color: '#475569' }}>
           <div style={{ width: '32px', height: '32px', border: '2px solid rgba(239,68,68,0.2)', borderTopColor: '#ef4444', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
           <p style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em' }}>Cargando Reporte...</p>
         </div>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {opClusters.length === 0 && (
            <div style={{ textAlign: 'center', padding: '4rem', opacity: 0.5, border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '1.5rem' }}>
               <p style={{ fontWeight: 900, color: 'white', textTransform: 'uppercase' }}>NO HAY REGISTROS DE MAQUILA TODAVÍA PENDIENTES DE DESCONTAR.</p>
            </div>
          )}

          {opClusters.map(cluster => {
             const { op, items, statusColor } = cluster
             const isExpanded = expandedOp === op
             
             // Consolidar duplicados para visualización
             const consolidatedItems = getConsolidatedItems(items)
             const hasRejectedItem = items.some(i => i.is_rejected)
             const uniqueRejectionReason = items.find(i => i.is_rejected)?.rejection_reason
             
             // Color map
             const styleMap = {
               green: { bg: 'rgba(34,197,94,0.05)', border: 'rgba(34,197,94,0.2)', text: '#4ade80' },
               yellow: { bg: 'rgba(234,179,8,0.05)', border: 'rgba(234,179,8,0.3)', text: '#fbbf24' },
               red: { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.4)', text: '#f87171' }
             }

             const cfg = styleMap[statusColor]

             return (
               <div key={op} style={{ 
                 background: cfg.bg, 
                 border: `1px solid ${cfg.border}`, 
                 borderRadius: '1.5rem', 
                 overflow: 'hidden',
                 transition: 'all 0.2s'
               }}>
                 {/* OP Header (Click to expand) */}
                 <div onClick={() => setExpandedOp(isExpanded ? null : op)} style={{
                   padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer'
                 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{ width: 68, height: 18, borderRadius: '4px', background: 'rgba(255,255,255,0.1)', color: cfg.text, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${cfg.border}`, fontSize:'0.55rem', fontWeight:900 }}>
                         {hasRejectedItem ? 'RECHAZADA' : statusColor === 'red' ? 'RETRASADO' : 'PENDIENTE'}
                      </div>
                      <div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: 'white', letterSpacing: '0.02em', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          OP: {op}
                          <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', background: 'rgba(255,255,255,0.1)', borderRadius: '1rem', color: '#cbd5e1', fontWeight: 700 }}>
                            MOD: {cluster.opModel}
                          </span>
                        </h3>
                        <p style={{ fontSize: '0.75rem', color: cfg.text, fontWeight: 700, marginTop: '0.2rem' }}>
                          {hasRejectedItem 
                            ? `RECHAZADA: ${uniqueRejectionReason || 'MOTIVO NO ESPECIFICADO'}` 
                            : statusColor === 'red' ? 'RETRASADO (>2 DÍAS) SIN DESCONTAR' : 'AL DÍA - PENDIENTE DESCONTAR'
                          }
                        </p>
                      </div>
                    </div>
                    {statusColor !== 'green' && (
                       <div style={{ display: 'flex', gap: '0.5rem' }} onClick={e => e.stopPropagation()}>
                         <button onClick={() => markAsDiscounted(op)} style={{
                           ...btnBase, background: '#10b981', color: 'white', padding: '0.5rem 1.25rem', fontWeight: 900, fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.2)', textTransform: 'uppercase'
                         }}>
                           MARCAR DESCONTADO
                         </button>
                         {!hasRejectedItem && (
                           <button onClick={() => setRejectOp(op)} style={{
                             ...btnBase, background: '#ef4444', color: 'white', padding: '0.5rem 1.25rem', fontWeight: 900, fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 4px 6px -1px rgba(239, 68, 68, 0.2)', textTransform: 'uppercase'
                           }}>
                             RECHAZAR
                           </button>
                         )}
                       </div>
                    )}
                 </div>

                 {/* Detail view */}
                 {isExpanded && (
                   <div style={{ padding: '0 1.5rem 1.5rem 1.5rem', borderTop: `1px solid ${cfg.border}`, marginTop: '0.5rem', paddingTop: '1.5rem' }}>
                     <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                       <thead>
                         <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                           <th style={{ padding: '0.5rem', color: '#94a3b8', fontSize: '0.65rem', textTransform: 'uppercase' }}>CÓDIGO ERP</th>
                           <th style={{ padding: '0.5rem', color: '#94a3b8', fontSize: '0.65rem', textTransform: 'uppercase' }}>MODELO</th>
                           <th style={{ padding: '0.5rem', color: '#94a3b8', fontSize: '0.65rem', textTransform: 'uppercase' }}>U. MED</th>
                           <th style={{ padding: '0.5rem', color: '#94a3b8', fontSize: '0.65rem', textTransform: 'uppercase' }}>CANTIDAD</th>
                           <th style={{ padding: '0.5rem', color: '#94a3b8', fontSize: '0.65rem', textTransform: 'uppercase' }}>FECHA REGISTRO</th>
                           <th style={{ padding: '0.5rem', color: '#94a3b8', fontSize: '0.65rem', textTransform: 'uppercase' }}>ESTADO</th>
                         </tr>
                       </thead>
                       <tbody>
                         {consolidatedItems.map(item => (
                           <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                             <td style={{ padding: '0.75rem 0.5rem' }}>
                                <p style={{ fontWeight: 900, color: 'white', fontSize: '0.85rem' }}>{item.internal_code}</p>
                                <p style={{ fontSize: '0.7rem', color: '#64748b' }}>{item.short_description}</p>
                             </td>
                             <td style={{ padding: '0.75rem 0.5rem', fontWeight: 700, color: 'white', fontSize: '0.8rem' }}>{item.model}</td>
                             <td style={{ padding: '0.75rem 0.5rem', color: '#94a3b8', fontSize: '0.75rem' }}>{item.unit_of_measure}</td>
                             <td style={{ padding: '0.75rem 0.5rem', fontWeight: 900, color: '#fbbf24', fontSize: '1rem' }}>{item.quantity}</td>
                             <td style={{ padding: '0.75rem 0.5rem', color: '#64748b', fontSize: '0.75rem' }}>{new Date(item.created_at).toLocaleDateString('es-MX')}</td>
                             <td style={{ padding: '0.75rem 0.5rem' }}>
                               <span style={{
                                  fontSize: '0.6rem', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 900,
                                  background: item.is_discounted_erp 
                                    ? 'rgba(34,197,94,0.1)' 
                                    : item.is_rejected 
                                      ? 'rgba(239,68,68,0.1)' 
                                      : 'rgba(234,179,8,0.1)',
                                  color: item.is_discounted_erp 
                                    ? '#4ade80' 
                                    : item.is_rejected 
                                      ? '#f87171' 
                                      : '#fbbf24'
                               }}>
                                 {item.is_discounted_erp ? 'BAJA OK' : item.is_rejected ? 'RECHAZADO' : 'PDTE'}
                               </span>
                             </td>
                           </tr>
                         ))}
                       </tbody>
                     </table>
                   </div>
                 )}
               </div>
             )
          })}
        </div>
      )}

      {showUploadInfoModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '1.5rem', padding: '2rem', maxWidth: '500px', width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,0.6)' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: 'white', marginBottom: '1rem', textTransform: 'uppercase' }}>Encabezados del Catálogo Excel</h3>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              Para asegurar que el sistema procese correctamente el archivo, el Excel debe contener una hoja llamada <strong style={{ color: 'white' }}>BASE DATOS</strong> o <strong style={{ color: 'white' }}>CATALOGO</strong> con los siguientes encabezados exactos en la primera fila:
            </p>
            <ul style={{ color: '#cbd5e1', fontSize: '0.85rem', marginBottom: '2rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', fontWeight: 700, padding: 0, listStyle: 'none' }}>
              <li style={{ background: 'rgba(255,255,255,0.02)', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid rgba(255,255,255,0.05)' }}>• CODIGO ERP</li>
              <li style={{ background: 'rgba(255,255,255,0.02)', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid rgba(255,255,255,0.05)' }}>• DESCRIPCION CORTA</li>
              <li style={{ background: 'rgba(255,255,255,0.02)', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid rgba(255,255,255,0.05)' }}>• CATEGORIA <span style={{ color: '#64748b', fontWeight: 500, marginLeft: '0.5rem' }}>(Ej. TELA, AVIO)</span></li>
              <li style={{ background: 'rgba(255,255,255,0.02)', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid rgba(255,255,255,0.05)' }}>• U MEDIDA <span style={{ color: '#64748b', fontWeight: 500, marginLeft: '0.5rem' }}>(Ej. Mts, Pzas)</span></li>
              <li style={{ background: 'rgba(255,255,255,0.02)', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid rgba(255,255,255,0.05)' }}>• MODELO</li>
            </ul>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowUploadInfoModal(false)} style={{ ...btnBase, background: 'rgba(255,255,255,0.05)', color: '#94a3b8' }}>CANCELAR</button>
              <label htmlFor="upload-catalog" style={{ ...btnBase, background: '#10b981', color: 'white', cursor: 'pointer', boxShadow: '0 4px 12px rgba(16,185,129,0.2)' }}>
                SELECCIONAR ARCHIVO
              </label>
            </div>
          </div>
        </div>
      )}

      {showManualCodeModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '1.5rem', padding: '2rem', maxWidth: '500px', width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,0.6)' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: 'white', marginBottom: '1.5rem', textTransform: 'uppercase' }}>Agregar Código Manual</h3>
            <form onSubmit={handleSaveManualCode} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.3rem' }}>CÓDIGO INTERNO</label>
                <input required type="text" value={manualCode.internal_code} onChange={e => setManualCode({...manualCode, internal_code: e.target.value})} style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.3rem' }}>DESCRIPCIÓN</label>
                <input type="text" value={manualCode.description} onChange={e => setManualCode({...manualCode, description: e.target.value})} style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.3rem' }}>DESCRIPCIÓN CORTA (MAQUILA)</label>
                <input required type="text" value={manualCode.short_description} onChange={e => setManualCode({...manualCode, short_description: e.target.value})} style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.3rem' }}>CATEGORÍA (SI ES AVIO O TELA)</label>
                <select required value={manualCode.category} onChange={e => setManualCode({...manualCode, category: e.target.value})} style={{ ...inputStyle, background: '#0f172a' }}>
                  <option value="">-- Seleccionar --</option>
                  <option value="TELA">TELA</option>
                  <option value="AVIO">AVIO</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.3rem' }}>U MED</label>
                  <input required type="text" value={manualCode.unit_of_measure} onChange={e => setManualCode({...manualCode, unit_of_measure: e.target.value})} placeholder="Ej. Mts, Pzas" style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.3rem' }}>MODELO</label>
                  <input required type="text" value={manualCode.model} onChange={e => setManualCode({...manualCode, model: e.target.value})} placeholder="Ej. CREW" style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button type="button" onClick={() => setShowManualCodeModal(false)} style={{ ...btnBase, background: 'rgba(255,255,255,0.05)', color: '#94a3b8' }}>CANCELAR</button>
                <button type="submit" disabled={savingManual} style={{ ...btnBase, background: '#38bdf8', color: '#0f172a', fontWeight: 900, opacity: savingManual ? 0.7 : 1 }}>
                  {savingManual ? "GUARDANDO..." : "GUARDAR CÓDIGO"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL PREMIUM DE RECHAZO CON MOTIVOS ESTANDARIZADOS ─── */}
      {rejectOp && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.8)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem'
        }}>
          <div style={{
            background: '#0f172a',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '1.5rem',
            padding: '2rem',
            maxWidth: '500px',
            width: '100%',
            boxShadow: '0 20px 50px rgba(0,0,0,0.6)'
          }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: 'white', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
              Rechazar Captura de Consumo
            </h3>
            <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '1.5rem', fontWeight: 600 }}>
              OP SELECCIONADA: <strong style={{ color: '#f87171' }}>{rejectOp}</strong>. Por favor, selecciona el motivo estandarizado de rechazo.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
              {REJECTION_REASONS.map(reason => {
                const isSelected = rejectReason === reason
                return (
                  <label 
                    key={reason}
                    style={{
                      background: isSelected ? 'rgba(239, 68, 68, 0.08)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${isSelected ? '#ef4444' : 'rgba(255,255,255,0.08)'}`,
                      borderRadius: '0.75rem',
                      padding: '1rem',
                      color: isSelected ? 'white' : '#cbd5e1',
                      fontWeight: isSelected ? 900 : 500,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      transition: 'all 0.15s'
                    }}
                  >
                    <input 
                      type="radio" 
                      name="rejection_reason" 
                      value={reason} 
                      checked={isSelected}
                      onChange={() => setRejectReason(reason)}
                      style={{ accentColor: '#ef4444' }}
                    />
                    <span style={{ fontSize: '0.85rem', textTransform: 'uppercase' }}>{reason}</span>
                  </label>
                )
              })}
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button 
                type="button" 
                onClick={() => { setRejectOp(null); setRejectReason(''); }}
                style={{
                  ...btnBase,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#94a3b8'
                }}
              >
                CANCELAR
              </button>
              <button 
                type="button" 
                onClick={handleReject}
                disabled={rejecting || !rejectReason}
                style={{
                  ...btnBase,
                  background: '#ef4444',
                  boxShadow: '0 4px 12px rgba(239,68,68,0.2)',
                  opacity: (rejecting || !rejectReason) ? 0.6 : 1
                }}
              >
                {rejecting ? "PROCESANDO..." : "CONFIRMAR RECHAZO"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

function MaquilaDiscounted() {
  const [consumptions, setConsumptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedOp, setExpandedOp] = useState(null)
  
  // Date filter state
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0])

  useEffect(() => {
    fetchDiscounted()
  }, [startDate, endDate])

  const fetchDiscounted = async () => {
    setLoading(true)
    let query = supabase
      .from('maquila_consumptions')
      .select('*')
      .eq('is_discounted_erp', true)
      .order('created_at', { ascending: false })

    if (startDate) {
      query = query.gte('created_at', `${startDate}T00:00:00.000Z`)
    }
    if (endDate) {
      query = query.lte('created_at', `${endDate}T23:59:59.999Z`)
    }

    const { data, error } = await query
    
    if (error) {
      alert("Error cargando descontados: " + error.message)
    } else {
      setConsumptions(data || [])
    }
    setLoading(false)
  }

  // SUMA EN AUTOMÁTICO (Consolidar consumos duplicados en memoria al renderizar)
  const getConsolidatedItems = (items) => {
    const consolidated = {}
    items.forEach(item => {
      const key = item.internal_code.trim().toUpperCase()
      if (!consolidated[key]) {
        consolidated[key] = { ...item, quantity: parseFloat(item.quantity || 0) }
      } else {
        consolidated[key].quantity += parseFloat(item.quantity || 0)
      }
    })
    return Object.values(consolidated).map(c => ({
      ...c,
      quantity: Math.round(c.quantity * 100) / 100
    }))
  }

  // Agrupar por OP -> Array de consumos
  const groupedByOp = consumptions.reduce((acc, curr) => {
    if (!acc[curr.op_number]) acc[curr.op_number] = []
    acc[curr.op_number].push(curr)
    return acc
  }, {})

  const opClusters = Object.entries(groupedByOp).map(([op, items]) => {
     // Calculate OP Model from its Tela definition
     const telaItem = items.find(i => i.category?.toUpperCase() === 'TELA')
     const opModel = telaItem ? telaItem.model : 'SIN TELA / MÚLTIPLE'
     return { op, items, opModel }
  })

  const exportExcel = () => {
    // Al exportar, también consolidamos por OP y código interno para que el Excel sea súper limpio
    const consolidatedRows = []
    
    Object.entries(groupedByOp).forEach(([op, items]) => {
      const consolidated = getConsolidatedItems(items)
      consolidated.forEach(c => {
        consolidatedRows.push({
          'OP': c.op_number,
          'Modelo': c.model || '',
          'Código Interno': c.internal_code,
          'Descripción Corta': c.short_description,
          'Categoría': c.category,
          'U. Medida': c.unit_of_measure,
          'Cantidad': c.quantity,
          'Fecha Captura': new Date(c.created_at).toLocaleString('es-MX'),
          'Fecha Descuento': c.discounted_at ? new Date(c.discounted_at).toLocaleString('es-MX') : '',
          'Descontado Por': c.discounted_by || ''
        })
      })
    })

    const ws = XLSX.utils.json_to_sheet(consolidatedRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Descontados")
    XLSX.writeFile(wb, `Consumos_Descontados_Consolidados_${new Date().getTime()}.xlsx`)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 900, color: 'white', textTransform: 'uppercase' }}>REPORTE <span style={{ color: '#4ade80' }}>DESCONTADOS</span></h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '0.25rem', fontWeight: 700, textTransform: 'uppercase' }}>VISUALIZA Y EXPORTA LOS AVÍOS Y TELAS QUE YA FUERON DESCONTADOS EN EL ERP.</p>
        </div>
        
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.05)', padding: '0.25rem 0.5rem', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.1)' }}>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ ...inputStyle, border: 'none', background: 'transparent', padding: '0.2rem', color: '#94a3b8' }} />
              <span style={{ color: '#64748b' }}>-</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ ...inputStyle, border: 'none', background: 'transparent', padding: '0.2rem', color: '#94a3b8' }} />
            </div>
            <button onClick={exportExcel} style={{ ...btnBase, background: '#4ade80', color: '#000', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 4px 12px rgba(34,197,94,0.2)', textTransform: 'uppercase' }}>
              EXPORTAR EXCEL
            </button>
        </div>
      </div>

      {loading ? (
         <div style={{ textAlign: 'center', padding: '4rem', color: '#475569' }}>
           <p style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em' }}>CARGANDO DESCONTADOS...</p>
         </div>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {opClusters.length === 0 && (
            <div style={{ textAlign: 'center', padding: '4rem', opacity: 0.5, border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '1.5rem' }}>
               <p style={{ fontWeight: 900, color: 'white', textTransform: 'uppercase' }}>NO HAY REGISTROS DESCONTADOS EN ESTE RANGO DE FECHAS.</p>
            </div>
          )}

          {opClusters.map(cluster => {
             const { op, items, opModel } = cluster
             const isExpanded = expandedOp === op
             
             // Consolidar duplicados para la visualización de descontados
             const consolidatedItems = getConsolidatedItems(items)
             
             return (
               <div key={op} style={{ 
                 background: 'rgba(34,197,94,0.05)', 
                 border: '1px solid rgba(34,197,94,0.2)', 
                 borderRadius: '1.5rem', 
                 overflow: 'hidden',
                 transition: 'all 0.2s'
               }}>
                 <div onClick={() => setExpandedOp(isExpanded ? null : op)} style={{
                   padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer'
                 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                     <div style={{ width: 44, height: 18, borderRadius: '4px', background: 'rgba(255,255,255,0.1)', color: '#4ade80', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid rgba(34,197,94,0.2)`, fontSize:'0.6rem', fontWeight:900 }}>
                        OK
                     </div>
                      <div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: 'white', letterSpacing: '0.02em', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          OP: {op}
                          <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', background: 'rgba(255,255,255,0.1)', borderRadius: '1rem', color: '#cbd5e1', fontWeight: 700 }}>
                            MOD: {opModel}
                          </span>
                        </h3>
                        <p style={{ fontSize: '0.75rem', color: '#4ade80', fontWeight: 700, marginTop: '0.2rem' }}>
                           Completado y Descontado
                        </p>
                      </div>
                    </div>
                 </div>

                 {isExpanded && (
                   <div style={{ padding: '0 1.5rem 1.5rem 1.5rem', borderTop: `1px solid rgba(34,197,94,0.2)`, marginTop: '0.5rem', paddingTop: '1.5rem' }}>
                     <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                       <thead>
                         <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                           <th style={{ padding: '0.5rem', color: '#94a3b8', fontSize: '0.65rem', textTransform: 'uppercase' }}>Código ERP</th>
                           <th style={{ padding: '0.5rem', color: '#94a3b8', fontSize: '0.65rem', textTransform: 'uppercase' }}>Modelo</th>
                           <th style={{ padding: '0.5rem', color: '#94a3b8', fontSize: '0.65rem', textTransform: 'uppercase' }}>U. Med</th>
                           <th style={{ padding: '0.5rem', color: '#94a3b8', fontSize: '0.65rem', textTransform: 'uppercase' }}>Cantidad</th>
                           <th style={{ padding: '0.5rem', color: '#94a3b8', fontSize: '0.65rem', textTransform: 'uppercase' }}>Fecha Descuento</th>
                         </tr>
                       </thead>
                       <tbody>
                         {consolidatedItems.map(item => (
                           <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                             <td style={{ padding: '0.75rem 0.5rem' }}>
                                <p style={{ fontWeight: 900, color: 'white', fontSize: '0.85rem' }}>{item.internal_code}</p>
                                <p style={{ fontSize: '0.7rem', color: '#64748b' }}>{item.short_description}</p>
                             </td>
                             <td style={{ padding: '0.75rem 0.5rem', fontWeight: 700, color: 'white', fontSize: '0.8rem' }}>{item.model}</td>
                             <td style={{ padding: '0.75rem 0.5rem', color: '#94a3b8', fontSize: '0.75rem' }}>{item.unit_of_measure}</td>
                             <td style={{ padding: '0.75rem 0.5rem', fontWeight: 900, color: '#fbbf24', fontSize: '1rem' }}>{item.quantity}</td>
                             <td style={{ padding: '0.75rem 0.5rem', color: '#64748b', fontSize: '0.75rem' }}>
                               {item.discounted_at ? new Date(item.discounted_at).toLocaleDateString('es-MX') : new Date(item.created_at).toLocaleDateString('es-MX')}
                             </td>
                           </tr>
                         ))}
                       </tbody>
                     </table>
                   </div>
                 )}
               </div>
             )
          })}
        </div>
      )}

    </div>
  )
}
