import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

export default function AuthorizedPersonnelManager() {
  const { activeWarehouse } = useAuth()
  const [workers, setWorkers] = useState([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [message, setMessage] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    fetchWorkers()
  }, [])

  async function fetchWorkers() {
    setLoading(true)
    const { data, error } = await supabase
      .from('workers')
      .select('*')
      .eq('warehouse', activeWarehouse)
      .order('name')
    if (error) console.error(error)
    setWorkers(data || [])
    setLoading(false)
  }

  const handleAddWorker = async (e) => {
    e.preventDefault()
    if (!newName.trim()) return
    
    setActionLoading(true)
    const { error } = await supabase
      .from('workers')
      .insert({ 
        name: newName.trim().toUpperCase(),
        warehouse: activeWarehouse
      })
    
    if (error) {
      if (error.code === '23505') {
        setMessage({ type: 'ERROR', text: 'ESTA PERSONA YA ESTÁ EN LA LISTA' })
      } else {
        setMessage({ type: 'ERROR', text: error.message.toUpperCase() })
      }
    } else {
      setMessage({ type: 'SUCCESS', text: 'PERSONA AUTORIZADA AGREGADA' })
      setNewName('')
      fetchWorkers()
    }
    setActionLoading(false)
    setTimeout(() => setMessage(null), 3000)
  }

  const handleDeleteWorker = async (id, name) => {
    if (!window.confirm(`¿ESTÁ SEGURO DE ELIMINAR A ${name.toUpperCase()} DE LA LISTA DE PERSONAS AUTORIZADAS?`)) return
    
    setActionLoading(true)
    const { error } = await supabase
      .from('workers')
      .delete()
      .eq('id', id)
    
    if (error) {
      setMessage({ type: 'ERROR', text: 'ERROR AL ELIMINAR: ' + error.message.toUpperCase() })
    } else {
      setMessage({ type: 'SUCCESS', text: 'PERSONA ELIMINADA DE LA LISTA' })
      fetchWorkers()
    }
    setActionLoading(false)
    setTimeout(() => setMessage(null), 3000)
  }

  return (
    <div className="animate-slide-up" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '2rem' }}>
      
      {/* Form Section */}
      <div className="glass" style={{ padding: '2.5rem', borderRadius: '2rem', height: 'fit-content' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>

          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: 'white', textTransform: 'uppercase' }}>Autorización: {activeWarehouse}</h3>
            <p style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>AGREGA PERSONAS QUE PUEDEN SOLICITAR SURTIDO</p>
          </div>
        </div>

        <form onSubmit={handleAddWorker} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.65rem', fontWeight: 900, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.15em', marginLeft: '0.5rem' }}>Nombre Completo</label>
            <input 
              type="text"
              placeholder="EJ. JUAN PÉREZ..."
              value={newName}
              onChange={e => setNewName(e.target.value.toUpperCase())}
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '1rem', padding: '1rem 1.25rem', color: 'white', fontWeight: 700, outline: 'none' }}
              disabled={actionLoading}
              required
            />
          </div>
          <button 
            type="submit"
            disabled={actionLoading || !newName.trim()}
            style={{ 
              background: 'white', color: '#0f172a', padding: '1.25rem', borderRadius: '1.25rem', fontWeight: 900, fontSize: '0.85rem', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', transition: 'all 0.2s', opacity: (actionLoading || !newName.trim()) ? 0.6 : 1
            }}
          >
            {actionLoading ? 'PROCESANDO...' : 'AUTORIZAR PERSONA'}
          </button>
        </form>
      </div>

      {/* List Section */}
      <div className="glass" style={{ padding: '2.5rem', borderRadius: '2rem', display: 'flex', flexDirection: 'column', maxHeight: '650px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: 'white', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            PERSONAL AUTORIZADO
          </h3>
          <span style={{ fontSize: '0.6rem', fontWeight: 900, color: '#4ade80', background: 'rgba(34,197,94,0.1)', padding: '0.375rem 0.75rem', borderRadius: '999px', border: '1px solid rgba(34,197,94,0.2)' }}>
            {workers.length} PERSONAS
          </span>
        </div>

        <div className="custom-scrollbar" style={{ overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem', paddingRight: '0.5rem' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem', color: '#64748b', fontWeight: 900, textTransform: 'uppercase' }}>
              CARGANDO...
            </div>
          ) : workers.length === 0 ? (
            <p style={{ color: '#64748b', fontSize: '0.8rem', textAlign: 'center', padding: '2rem' }}>NO HAY PERSONAS AUTORIZADAS REGISTRADAS.</p>
          ) : (
            workers.map(w => (
              <div key={w.id} style={{ background: 'rgba(255,255,255,0.02)', padding: '1.25rem', borderRadius: '1.25rem', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>

                  <span style={{ fontWeight: 800, color: 'white', fontSize: '0.9rem' }}>{w.name}</span>
                </div>
                <button 
                  onClick={() => handleDeleteWorker(w.id, w.name)}
                  disabled={actionLoading}
                  style={{ background: 'rgba(239,68,68,0.05)', border: 'none', padding: '0.75rem 1rem', borderRadius: '0.75rem', color: '#ef4444', cursor: 'pointer', transition: 'all 0.2s', fontWeight: 900, fontSize: '0.7rem' }}
                >
                  ELIMINAR
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {message && (
        <div className="animate-slide-up" style={{ 
          position: 'fixed', bottom: '2rem', right: '2rem', padding: '1.5rem', borderRadius: '1.5rem', 
          background: message.type === 'SUCCESS' ? '#16a34a' : '#991b1b',
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
