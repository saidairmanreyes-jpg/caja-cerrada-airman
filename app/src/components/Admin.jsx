import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { db, secondaryAuth } from '../firebase'
import { collection, getDocs, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore'
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth'
import BulkUpload from './BulkUpload'
import LocationManager from './LocationManager'
import AuthorizedPersonnelManager from './AuthorizedPersonnelManager'
import MonitorSync from './MonitorSync'
import KanbanAdmin from './KanbanAdmin'
import MassLabelPrinting from './MassLabelPrinting'
import { useAuth } from '../context/AuthContext'

// ─── Permission config ───────────────────────────────────────────────────────
const PERMISSION_GROUPS = [
  {
    id: 'reception',
    label: 'RECEPCIÓN',
    description: 'MÓDULO DE RECEPCIÓN DE MERCANCÍA',
    color: '#3b82f6',
    items: []
  },
  {
    id: 'picking',
    label: 'SURTIDO',
    description: 'MÓDULO DE SURTIDO DE PEDIDOS',
    color: '#f59e0b',
    items: []
  },
  {
    id: 'monitor',
    label: 'MONITOR',
    description: 'COLA DE TRABAJO (MONITOR DE SURTIDO)',
    color: '#06b6d4',
    items: []
  },
  {
    id: 'order_status',
    label: 'ESTATUS DE PEDIDOS',
    description: 'MONITOR DE ESTADO GENERAL DE ÓRDENES',
    color: '#8b5cf6',
    items: []
  },
  {
    id: 'inventory',
    label: 'INVENTARIO',
    description: 'GESTIÓN Y CONSULTA DE INVENTARIO',
    color: '#10b981',
    items: []
  },
  {
    id: 'maquila',
    label: 'MAQUILA',
    description: 'PRODUCCIÓN, CONSUMOS Y MAQUILEROS',
    color: '#ec4899',
    items: [
      { key: 'maquila_hacienda', label: 'HACIENDA-ETIQUETADO' },
      { key: 'maquila_consumptions', label: 'CONSUMOS' },
      { key: 'maquila_discounted', label: 'DESCONTADOS' },
      { key: 'maquila_capture', label: 'CAPTURA' },
    ]
  },
  {
    id: 'admin',
    label: 'ADMINISTRACIÓN',
    description: 'AJUSTES Y CONFIGURACIÓN DEL SISTEMA',
    color: '#ef4444',
    items: [
      { key: 'admin_catalog', label: 'CATÁLOGO' },
      { key: 'admin_workers', label: 'ALMACENISTAS' },
      { key: 'admin_auth', label: 'AUTORIZADOS' },
      { key: 'admin_bulk', label: 'CARGA MASIVA' },
      { key: 'admin_monitor', label: 'MONITOR (SYNC)' },
      { key: 'admin_locations', label: 'UBICACIONES' },
      { key: 'admin_kanban', label: 'KANBAN' },
      { key: 'admin_labels', label: 'ETIQUETAS' },
    ]
  }
]

// ─── Toggle Switch Component ─────────────────────────────────────────────────
function PermissionToggle({ enabled, onChange, color = '#3b82f6' }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      title={enabled ? 'DESACTIVAR' : 'ACTIVAR'}
      style={{
        background: enabled ? color : 'rgba(255,255,255,0.08)',
        border: 'none',
        borderRadius: '999px',
        padding: '0.25rem 0.75rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        cursor: 'pointer',
        transition: 'all 0.25s',
        minWidth: '130px',
        justifyContent: 'center',
        boxShadow: enabled ? `0 4px 12px ${color}55` : 'none',
      }}
    >
      <div style={{
        width: 12,
        height: 12,
        borderRadius: '50%',
        background: enabled ? 'white' : '#475569',
        transition: 'all 0.25s'
      }} />
      <span style={{
        fontSize: '0.65rem',
        fontWeight: 900,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: enabled ? 'white' : '#475569',
      }}>
        {enabled ? 'HABILITADO' : 'DESHABILITADO'}
      </span>
    </button>
  )
}

// ─── Worker Permission Card ──────────────────────────────────────────────────
// Blank slate — all off
const DEFAULT_WORKER_PERMISSIONS = {
  reception: false,
  picking: false,
  monitor: false,
  inventory: false,
  order_status: false,
  maquila: false,
  maquila_hacienda: false,
  maquila_consumptions: false,
  maquila_discounted: false,
  maquila_capture: false,
  admin: false,
  admin_catalog: false,
  admin_workers: false,
  admin_auth: false,
  admin_bulk: false,
  admin_monitor: false,
  admin_locations: false,
  admin_kanban: false,
  admin_labels: false,
}

// Permisos predeterminados por ROL
const ROLE_DEFAULT_PERMISSIONS = {
  operator: {
    ...DEFAULT_WORKER_PERMISSIONS,
    reception: true,
    picking: true,
    monitor: true,
    inventory: true,
    order_status: true,
  },
  sales: {
    ...DEFAULT_WORKER_PERMISSIONS,
    order_status: true,
  },
  maquila: {
    ...DEFAULT_WORKER_PERMISSIONS,
    maquila: true,
    maquila_hacienda: true,
  },
}

function WorkerPermissionCard({ worker, onSaved }) {
  const [permissions, setPermissions] = useState({
    ...DEFAULT_WORKER_PERMISSIONS,
    ...worker.permissions,   // explicit saved values override defaults
  })
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [resetting, setResetting] = useState(false)

  const togglePermission = (key) => {
    setPermissions(prev => ({ ...prev, [key]: !prev[key] }))
    setSaved(false)
  }

  const toggleGroup = (groupId, groupItems) => {
    setPermissions(prev => {
      const newState = !prev[groupId];
      const nextPerms = { ...prev, [groupId]: newState };
      if (groupItems && groupItems.length > 0) {
        groupItems.forEach(item => {
          nextPerms[item.key] = newState;
        })
      }
      return nextPerms;
    })
    setSaved(false)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateDoc(doc(db, 'profiles', worker.id), { permissions })
      setSaved(true)
      onSaved()
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      console.error('ERROR AL GUARDAR PERMISOS:', e)
    }
    setSaving(false)
  }

  // Restablecer permisos según el rol original del usuario
  const handleResetToRoleDefaults = async () => {
    const roleDefaults = ROLE_DEFAULT_PERMISSIONS[worker.role] || DEFAULT_WORKER_PERMISSIONS
    if (!confirm(`¿RESTABLECER PERMISOS DE ${worker.name?.toUpperCase()} A LOS PREDETERMINADOS DEL ROL ${worker.role?.toUpperCase()}?`)) return
    setResetting(true)
    try {
      await updateDoc(doc(db, 'profiles', worker.id), { permissions: roleDefaults })
      setPermissions(roleDefaults)
      setSaved(false)
      onSaved()
    } catch (e) {
      console.error('ERROR AL RESTABLECER PERMISOS:', e)
    }
    setResetting(false)
  }

  const enabledCount = Object.values(permissions).filter(v => v === true).length
  const totalPermissions = Object.keys(DEFAULT_WORKER_PERMISSIONS).length

  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: '1.5rem',
      overflow: 'hidden',
      transition: 'border-color 0.2s',
    }}>
      {/* Card Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          padding: '1.25rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          cursor: 'pointer',
          color: 'white',
        }}
      >
        {/* Avatar */}
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: 'linear-gradient(135deg,#ef4444,#b91c1c)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 900, color: 'white', fontSize: '1.1rem', flexShrink: 0
        }}>
          {worker.name?.charAt(0) || 'U'}
        </div>

        {/* Info */}
        <div style={{ flex: 1, textAlign: 'left', overflow: 'hidden' }}>
          <p style={{ fontWeight: 700, color: 'white', fontSize: '0.9rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', textTransform: 'uppercase' }}>
            {worker.name}
          </p>
          <p style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600, marginTop: '0.1rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', textTransform: 'uppercase' }}>
            {worker.email} · {worker.warehouse || 'MATRIZ'}
          </p>
        </div>

        {/* Badge */}
        <span style={{
          fontSize: '0.6rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em',
          background: enabledCount > 0 ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.05)',
          color: enabledCount > 0 ? '#60a5fa' : '#475569',
          padding: '0.3rem 0.75rem', borderRadius: '999px',
          border: `1px solid ${enabledCount > 0 ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.08)'}`,
          whiteSpace: 'nowrap',
        }}>
          {enabledCount}/{totalPermissions} PERMISOS
        </span>

        <div style={{ fontSize: '0.6rem', fontWeight: 900, color: '#475569', flexShrink: 0 }}>
          {expanded ? '[ OCULTAR DETALLES ]' : '[ VER DETALLES ]'}
        </div>
      </button>

      {/* Expandable permissions */}
      {expanded && (
        <div style={{ padding: '0 1.5rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', marginBottom: '0.5rem' }} />

          {PERMISSION_GROUPS.map(group => (
            <div key={group.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: permissions[group.id] ? `${group.color}0a` : 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '1rem', border: `1px solid ${permissions[group.id] ? `${group.color}33` : 'rgba(255,255,255,0.04)'}`, transition: 'all 0.2s' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                <div>
                  <p style={{ fontSize: '0.85rem', fontWeight: 900, color: permissions[group.id] ? 'white' : '#94a3b8', textTransform: 'uppercase' }}>
                    {group.label}
                  </p>
                  <p style={{ fontSize: '0.6rem', color: '#475569', fontWeight: 600, marginTop: '0.15rem', textTransform: 'uppercase' }}>
                    {group.description}
                  </p>
                </div>
                <PermissionToggle
                  enabled={!!permissions[group.id]}
                  onChange={() => toggleGroup(group.id, group.items)}
                  color={group.color}
                />
              </div>

              {/* Sub-items */}
              {group.items && group.items.length > 0 && permissions[group.id] && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem', paddingLeft: '1rem', borderLeft: `2px solid ${group.color}44` }}>
                  {group.items.map(sub => (
                     <div key={sub.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', background: 'rgba(0,0,0,0.1)', borderRadius: '0.5rem' }}>
                       <span style={{ fontSize: '0.7rem', fontWeight: 700, color: permissions[sub.key] ? 'white' : '#64748b' }}>
                         {sub.label}
                       </span>
                       <PermissionToggle
                         enabled={!!permissions[sub.key]}
                         onChange={() => togglePermission(sub.key)}
                         color={group.color}
                       />
                     </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            {/* Reset to role defaults */}
            <button
              onClick={handleResetToRoleDefaults}
              disabled={resetting}
              style={{
                flex: '0 0 auto',
                padding: '0.875rem 1.25rem',
                borderRadius: '1rem',
                border: '1px solid rgba(251,191,36,0.3)',
                cursor: resetting ? 'wait' : 'pointer',
                fontWeight: 900,
                fontSize: '0.7rem',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                transition: 'all 0.2s',
                background: 'rgba(251,191,36,0.08)',
                color: '#fbbf24',
              }}
            >
              {resetting ? (
                <><div style={{ width: 12, height: 12, border: '2px solid rgba(251,191,36,0.3)', borderTopColor: '#fbbf24', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />RESTABLECIENDO...</>
              ) : (
                <>↩ RESTABLECER A ROL: {worker.role?.toUpperCase()}</>
              )}
            </button>

            {/* Save */}
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                flex: 1,
                padding: '0.875rem 1.5rem',
                borderRadius: '1rem',
                border: 'none',
                cursor: saving ? 'wait' : 'pointer',
                fontWeight: 900,
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                transition: 'all 0.2s',
                background: saved ? '#16a34a' : saving ? 'rgba(255,255,255,0.08)' : '#dc2626',
                color: 'white',
                boxShadow: saved ? '0 4px 12px rgba(22,163,74,0.4)' : saving ? 'none' : '0 4px 12px rgba(220,38,38,0.3)',
              }}
            >
              {saving ? (
                <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />GUARDANDO...</>
              ) : saved ? (
                <>✓ ¡PERMISOS GUARDADOS!</>
              ) : (
                <>GUARDAR CAMBIOS</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Admin Component ────────────────────────────────────────────────────
export default function Admin() {
  const { activeWarehouse, isAdmin, hasPermission } = useAuth()
  const [products, setProducts] = useState([])
  const [workers, setWorkers] = useState([])
  const [loading, setLoading] = useState(true)
  const [newProduct, setNewProduct] = useState({ code: '', description: '' })
  const [newWorker, setNewWorker] = useState({ name: '', email: '', password: '', warehouse: 'MATRIZ', role: 'operator' })
  const [message, setMessage] = useState(null)
  const [activeTab, setActiveTab] = useState(() => {
    // Default to first permitted tab
    if (isAdmin) return 'catalog'
    if (hasPermission('admin_catalog')) return 'catalog'
    if (hasPermission('admin_workers')) return 'workers'
    if (hasPermission('admin_auth')) return 'auth_personnel'
    if (hasPermission('admin_bulk')) return 'bulk'
    if (hasPermission('admin_monitor')) return 'monitor_sync'
    if (hasPermission('admin_locations')) return 'locations'
    if (hasPermission('admin_kanban')) return 'kanban'
    if (hasPermission('admin_labels')) return 'labels'
    return 'permissions'
  })

  useEffect(() => { fetchData() }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: p } = await supabase.from('products').select('*').order('code')

    const workersList = []
    try {
      const querySnapshot = await getDocs(collection(db, 'profiles'))
      querySnapshot.forEach((docSnap) => {
        const role = docSnap.data().role
        if (role === 'operator' || role === 'sales' || role === 'maquila') {
          workersList.push({ id: docSnap.id, ...docSnap.data() })
        }
      })
    } catch (err) {
      console.error(err)
    }
    setProducts(p || [])
    setWorkers(workersList)
    setLoading(false)
  }, [])

  const showMessage = (type, text) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  const handleAddProduct = async (e) => {
    e.preventDefault()
    const { error } = await supabase.from('products').insert({
      ...newProduct,
      code: newProduct.code.toUpperCase().trim(),
      description: newProduct.description.toUpperCase().trim()
    })
    if (error) showMessage('ERROR', error.message.toUpperCase())
    else {
      showMessage('SUCCESS', 'PRODUCTO AGREGADO AL CATÁLOGO')
      setNewProduct({ code: '', description: '' })
      fetchData()
    }
  }

  const handleAddWorker = async (e) => {
    e.preventDefault()
    try {
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newWorker.email, newWorker.password)
      const newUid = userCredential.user.uid
      await signOut(secondaryAuth)

      let defaultPerms = { ...DEFAULT_WORKER_PERMISSIONS }
      if (newWorker.role === 'operator') {
        defaultPerms = { ...defaultPerms, reception: true, picking: true, monitor: true, inventory: true, order_status: true }
      } else if (newWorker.role === 'sales') {
        defaultPerms = { ...defaultPerms, order_status: true }
      } else if (newWorker.role === 'maquila') {
        defaultPerms = { ...defaultPerms, maquila: true, maquila_hacienda: true }
      }

      await setDoc(doc(db, 'profiles', newUid), {
        email: newWorker.email,
        name: newWorker.name.toUpperCase(),
        role: newWorker.role,
        warehouse: newWorker.warehouse,
        permissions: defaultPerms,
        createdAt: new Date().toISOString()
      })

      let roleName = 'OPERADOR'
      if (newWorker.role === 'sales') roleName = 'VENDEDOR'
      if (newWorker.role === 'maquila') roleName = 'PROVEEDOR MAQUILA'

      showMessage('SUCCESS', roleName + ' REGISTRADO EN ' + newWorker.warehouse)
      setNewWorker({ name: '', email: '', password: '', warehouse: 'MATRIZ', role: 'operator' })
      fetchData()
    } catch (error) {
      console.error(error)
      showMessage('ERROR', 'ERROR: ' + error.message.toUpperCase())
    }
  }

  const handleDeleteWorker = async (id, name) => {
    if (!confirm(`¿SEGURO QUE DESEAS REVOCAR EL ACCESO DE ${name.toUpperCase()}?\n(ESTO ELIMINA EL PERFIL, NO EL AUTH).`)) return
    try {
      await deleteDoc(doc(db, 'profiles', id))
      fetchData()
      showMessage('SUCCESS', 'ACCESO REVOCADO')
    } catch (error) {
      showMessage('ERROR', 'ERROR AL ELIMINAR: ' + error.message.toUpperCase())
    }
  }

  const handleDeleteProduct = async (id) => {
    if (error) showMessage('ERROR', 'NO SE PUEDE ELIMINAR: TIENE INVENTARIO ASOCIADO')
    else fetchData()
  }

  // Build tab list based on permissions
  const allTabs = [
    { id: 'catalog',       label: 'CATÁLOGO',         permKey: 'admin_catalog' },
    { id: 'workers',       label: 'ALMACENISTAS',      permKey: 'admin_workers' },
    { id: 'auth_personnel',label: 'AUTORIZADOS',       permKey: 'admin_auth' },
    { id: 'bulk',          label: 'CARGA MASIVA',   permKey: 'admin_bulk' },
    { id: 'monitor_sync',  label: 'MONITOR',           permKey: 'admin_monitor' },
    { id: 'locations',     label: 'UBICACIONES',       permKey: 'admin_locations' },
    { id: 'kanban',        label: 'KANBAN',            permKey: 'admin_kanban' },
    { id: 'labels',        label: 'ETIQUETAS',         permKey: 'admin_labels' },
    { id: 'permissions',   label: 'PERMISOS',          permKey: null }, // master-only
  ]

  const visibleTabs = allTabs.filter(tab => {
    if (isAdmin) return true                          // master sees all
    if (tab.id === 'permissions') return false        // only master sees this tab
    return hasPermission(tab.permKey)
  })

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem', fontFamily: 'Inter, sans-serif' }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* Tabs Navigation */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        flexWrap: 'wrap',
        background: 'rgba(255,255,255,0.03)',
        padding: '0.375rem',
        borderRadius: '1.25rem',
        border: '1px solid rgba(255,255,255,0.05)',
        width: 'fit-content'
      }}>
        {visibleTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '0.75rem 1.75rem',
              borderRadius: '0.875rem',
              fontSize: '0.75rem',
              fontWeight: 900,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              transition: 'all 0.2s',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: activeTab === tab.id
                ? (tab.id === 'permissions' ? '#7c3aed' : '#dc2626')
                : 'transparent',
              color: activeTab === tab.id ? 'white' : '#64748b',
              boxShadow: activeTab === tab.id
                ? (tab.id === 'permissions' ? '0 4px 12px rgba(124,58,237,0.3)' : '0 4px 12px rgba(220, 38, 38, 0.3)')
                : 'none'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ minHeight: '400px' }}>

        {/* ── CATÁLOGO ── */}
        {activeTab === 'catalog' && (
          <div className="animate-slide-up" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '2rem' }}>
            <div className="glass" style={{ padding: '2.5rem', borderRadius: '2rem', height: 'fit-content' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: 'white', textTransform: 'uppercase', letterSpacing: '-0.02em' }}>NUEVO PRODUCTO</h3>
                  <p style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>AGREGA ITEMS AL CATÁLOGO MAESTRO</p>
                </div>
              </div>
              <form onSubmit={handleAddProduct} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.65rem', fontWeight: 900, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.15em', marginLeft: '0.5rem' }}>CÓDIGO ÚNICO</label>
                  <input type="text" placeholder="EJEM: PMZ001" value={newProduct.code} onChange={e => setNewProduct({...newProduct, code: e.target.value.toUpperCase()})}
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '1rem', padding: '1rem 1.25rem', color: 'white', fontWeight: 700, outline: 'none' }} required />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.65rem', fontWeight: 900, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.15em', marginLeft: '0.5rem' }}>DESCRIPCIÓN</label>
                  <textarea placeholder="DETALLES DE LA PRENDA..." value={newProduct.description} onChange={e => setNewProduct({...newProduct, description: e.target.value.toUpperCase()})}
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '1rem', padding: '1rem 1.25rem', color: 'white', fontWeight: 700, outline: 'none', minHeight: '120px', resize: 'none' }} required />
                </div>
                <button style={{ background: 'white', color: '#0f172a', padding: '1.25rem', borderRadius: '1.25rem', fontWeight: 900, fontSize: '0.85rem', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginTop: '0.5rem', transition: 'all 0.2s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#ef4444'; e.currentTarget.style.color = 'white' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.color = '#0f172a' }}>
                  GUARDAR EN CATÁLOGO
                </button>
              </form>
            </div>
            <div className="glass" style={{ padding: '2.5rem', borderRadius: '2rem', display: 'flex', flexDirection: 'column', maxHeight: '650px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: 'white', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  LISTADO
                </h3>
                <span style={{ fontSize: '0.6rem', fontWeight: 900, color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: '0.375rem 0.75rem', borderRadius: '999px', border: '1px solid rgba(239,68,68,0.2)' }}>
                  {products.length} ITEMS
                </span>
              </div>
              <div className="custom-scrollbar" style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingRight: '0.5rem' }}>
                {products.map(p => (
                  <div key={p.id} style={{ background: 'rgba(255,255,255,0.02)', padding: '1.25rem', borderRadius: '1.25rem', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'all 0.2s' }}>
                    <div>
                      <p style={{ fontWeight: 900, color: 'white', letterSpacing: '0.05em', fontSize: '0.9rem' }}>{p.code}</p>
                      <p style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginTop: '0.25rem' }}>{p.description}</p>
                    </div>
                    <button onClick={() => handleDeleteProduct(p.id)} style={{ background: 'rgba(239,68,68,0.05)', border: 'none', padding: '0.75rem 1rem', borderRadius: '0.75rem', color: '#ef4444', cursor: 'pointer', fontWeight: 900, fontSize: '0.7rem' }}>
                      ELIMINAR
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── ALMACENISTAS ── */}
        {activeTab === 'workers' && (
          <div className="animate-slide-up" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '2rem' }}>
            <div className="glass" style={{ padding: '2.5rem', borderRadius: '2rem', height: 'fit-content' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: 'white', textTransform: 'uppercase' }}>ALTA DE PERSONAL</h3>
              </div>
              <form onSubmit={handleAddWorker} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.65rem', fontWeight: 900, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.15em', marginLeft: '0.5rem' }}>NOMBRE COMPLETO</label>
                  <input type="text" placeholder="ESCRIBE EL NOMBRE..." value={newWorker.name} onChange={e => setNewWorker({...newWorker, name: e.target.value.toUpperCase()})}
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '1rem', padding: '1rem 1.25rem', color: 'white', fontWeight: 700, outline: 'none' }} required />
                </div>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: '1 1 200px' }}>
                    <label style={{ fontSize: '0.65rem', fontWeight: 900, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.15em', marginLeft: '0.5rem' }}>CORREO ELECTRÓNICO</label>
                    <input type="email" placeholder="USUARIO@AIRMAN.COM" value={newWorker.email} onChange={e => setNewWorker({...newWorker, email: e.target.value})}
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '1rem', padding: '1rem 1.25rem', color: 'white', fontWeight: 700, outline: 'none' }} required />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: '1 1 200px' }}>
                    <label style={{ fontSize: '0.65rem', fontWeight: 900, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.15em', marginLeft: '0.5rem' }}>CONTRASEÑA</label>
                    <input type="text" placeholder="MÍNIMO 6 CARACTERES" value={newWorker.password} onChange={e => setNewWorker({...newWorker, password: e.target.value})}
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '1rem', padding: '1rem 1.25rem', color: 'white', fontWeight: 700, outline: 'none' }} required minLength={6} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: '1 1 200px' }}>
                    <label style={{ fontSize: '0.65rem', fontWeight: 900, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.15em', marginLeft: '0.5rem' }}>ALMACÉN ASIGNADO</label>
                    <select value={newWorker.warehouse} onChange={e => setNewWorker({...newWorker, warehouse: e.target.value})}
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '1rem', padding: '1rem 1.25rem', color: 'white', fontWeight: 700, outline: 'none', appearance: 'none', cursor: 'pointer' }} required>
                      <option value="MATRIZ">MATRIZ</option>
                      <option value="PLANTA">PLANTA</option>
                      <option value="MEXICO">MEXICO</option>
                      <option value="MONTERREY">MONTERREY</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: '1 1 200px' }}>
                    <label style={{ fontSize: '0.65rem', fontWeight: 900, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.15em', marginLeft: '0.5rem' }}>TIPO DE PERFIL</label>
                    <select value={newWorker.role} onChange={e => setNewWorker({...newWorker, role: e.target.value})}
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '1rem', padding: '1rem 1.25rem', color: 'white', fontWeight: 700, outline: 'none', appearance: 'none', cursor: 'pointer', textTransform:'uppercase' }} required>
                      <option value="operator">OPERADOR</option>
                      <option value="sales">VENTAS (SOLO MONITOR)</option>
                      <option value="maquila">MAQUILA (SOLO CAPTURA)</option>
                    </select>
                  </div>
                </div>
                <button style={{ background: '#dc2626', color: 'white', padding: '1.25rem', borderRadius: '1.25rem', fontWeight: 900, fontSize: '0.85rem', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginTop: '0.5rem', textTransform:'uppercase' }}>
                  REGISTRAR USUARIO
                </button>
              </form>
            </div>

            <div className="glass" style={{ padding: '2.5rem', borderRadius: '2rem' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: 'white', textTransform: 'uppercase', marginBottom: '2rem' }}>PERSONAL ACTIVO</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
                {workers.map(w => (
                  <div key={w.id} style={{ background: 'rgba(255,255,255,0.02)', padding: '1.25rem', borderRadius: '1.25rem', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(135deg,#ef4444,#b91c1c)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: 'white', fontSize: '1rem', flexShrink: 0 }}>
                        {w.name?.charAt(0) || 'U'}
                      </div>
                      <div style={{ overflow: 'hidden' }}>
                        <p style={{ fontWeight: 900, color: 'white', fontSize: '0.85rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', textTransform:'uppercase' }}>{w.name}</p>
                        <p style={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 800, marginTop: '0.1rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', textTransform:'uppercase' }}>{w.email}</p>
                        <p style={{ fontSize: '0.6rem', color: '#ef4444', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '0.25rem' }}>
                          [{w.role === 'sales' ? 'VENTAS' : w.role === 'maquila' ? 'MAQUILA' : 'OPERADOR'}] ALMACÉN: <span style={{ color: 'white' }}>{w.warehouse || 'MATRIZ'}</span>
                        </p>
                      </div>
                    </div>
                    <button onClick={() => handleDeleteWorker(w.id, w.name)} style={{ background: 'rgba(239,68,68,0.05)', border: 'none', padding: '0.75rem 1rem', borderRadius: '0.75rem', color: '#ef4444', cursor: 'pointer', flexShrink: 0, fontWeight: 900, fontSize: '0.7rem' }} title="REVOCAR ACCESO">
                      ELIMINAR
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── CATÁLOGO MASIVO ── */}
        {activeTab === 'bulk' && (
          <div className="animate-slide-up" style={{ maxWidth: '900px', margin: '0 auto' }}>
            <BulkUpload onComplete={fetchData} />
          </div>
        )}

        {/* ── MONITOR ERP ── */}
        {activeTab === 'monitor_sync' && (
          <div className="animate-slide-up" style={{ maxWidth: '900px', margin: '0 auto' }}>
            <MonitorSync />
          </div>
        )}

        {/* ── UBICACIONES ── */}
        {activeTab === 'locations' && (
          <div className="animate-slide-up">
            <LocationManager />
          </div>
        )}

        {/* ── AUTORIZADOS ── */}
        {activeTab === 'auth_personnel' && (
          <div className="animate-slide-up">
            <AuthorizedPersonnelManager />
          </div>
        )}

        {/* ── KANBAN ── */}
        {activeTab === 'kanban' && (
          <div className="animate-slide-up">
            <KanbanAdmin />
          </div>
        )}

        {/* ── ETIQUETAS MASIVAS ── */}
        {activeTab === 'labels' && (
          <div className="animate-slide-up">
            <MassLabelPrinting />
          </div>
        )}

        {/* ── PERMISOS (master only) ── */}
        {activeTab === 'permissions' && isAdmin && (
          <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.5rem 2rem', background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: '1.5rem' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 900, color: 'white', textTransform: 'uppercase', letterSpacing: '-0.01em' }}>
                  ADMINISTRACIÓN DE PERMISOS
                </h3>
                <p style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 500, marginTop: '0.2rem', textTransform: 'uppercase' }}>
                  HABILITA O DESHABILITA MÓDULOS PARA CADA USUARIO DEL SISTEMA.
                </p>
              </div>
              <span style={{ marginLeft: 'auto', fontSize: '0.65rem', fontWeight: 900, color: '#a78bfa', background: 'rgba(124,58,237,0.15)', padding: '0.375rem 0.875rem', borderRadius: '999px', border: '1px solid rgba(124,58,237,0.3)', whiteSpace: 'nowrap' }}>
                {workers.filter(w => w.role !== 'master').length} USUARIOS
              </span>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b', fontWeight: 900, textTransform: 'uppercase' }}>CARGANDO USUARIOS...</div>
            ) : workers.filter(w => w.role !== 'master').length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b', background: 'rgba(255,255,255,0.02)', borderRadius: '1.5rem', border: '1px dashed rgba(255,255,255,0.08)' }}>
                <p style={{ fontWeight: 900, textTransform: 'uppercase' }}>NO HAY USUARIOS REGISTRADOS</p>
                <p style={{ fontSize: '0.75rem', marginTop: '0.5rem', textTransform: 'uppercase' }}>VE A LA PESTAÑA "ALMACENISTAS" PARA AGREGAR PERSONAL.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {workers
                  .filter(w => w.role !== 'master')
                  .map(worker => (
                    <WorkerPermissionCard
                      key={worker.id}
                      worker={worker}
                      onSaved={fetchData}
                    />
                  ))
                }
              </div>
            )}
          </div>
        )}
      </div>

      {/* Toast notification */}
      {message && (
        <div className="animate-slide-up" style={{
          position: 'fixed', bottom: '2rem', right: '2rem', padding: '1.5rem', borderRadius: '1.5rem',
          background: message.type === 'SUCCESS' ? '#dc2626' : '#991b1b',
          border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '1rem', zIndex: 100, boxShadow: '0 20px 40px rgba(0,0,0,0.4)'
        }}>
          <div style={{ background: 'rgba(255,255,255,0.1)', padding: '0.75rem 1rem', borderRadius: '0.75rem', color: 'white', fontWeight: 900, fontSize: '0.7rem' }}>
            {message.type === 'SUCCESS' ? 'ÉXITO' : 'ERROR'}
          </div>
          <span style={{ color: 'white', fontWeight: 900, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{message.text}</span>
        </div>
      )}
    </div>
  )
}
