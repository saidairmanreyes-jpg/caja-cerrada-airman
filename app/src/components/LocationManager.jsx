import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

export default function LocationManager() {
  const { activeWarehouse } = useAuth()
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [message, setMessage] = useState(null)
  
  // Rango Creator
  const [rangePrefix, setRangePrefix] = useState('A')
  const [rangeStart, setRangeStart] = useState('101')
  const [rangeEnd, setRangeEnd] = useState('269')

  // Limpieza puntual
  const [searchTarget, setSearchTarget] = useState('')

  useEffect(() => {
    fetchLocations()
  }, [])

  const fetchLocations = async () => {
    setLoading(true)
    let allData = []
    let offset = 0
    const limit = 1000

    while (true) {
      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .eq('warehouse', activeWarehouse)
        .order('name')
        .range(offset, offset + limit - 1)

      if (error) {
        console.error('Error fetching locations:', error)
        break
      }

      if (data && data.length > 0) {
        allData = [...allData, ...data]
      }

      if (!data || data.length < limit) {
        break
      }
      offset += limit
    }

    setLocations(allData)
    setLoading(false)
  }

  const showMsg = (type, text) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const handleClearGlobalInventory = async () => {
    const input = window.prompt("¡PELIGRO! VAS A BORRAR TODO EL INVENTARIO FÍSICO ALMACENADO. ESCRIBE 'BORRAR TODO' PARA CONFIRMAR:")
    
    if (!input || input.trim().toUpperCase() !== 'BORRAR TODO') {
      showMsg('ERROR', 'OPERACIÓN CANCELADA O CÓDIGO INCORRECTO.')
      return
    }
    const confirmation2 = window.confirm("¿ESTÁS ABSOLUTAMENTE SEGURO? ESTA ACCIÓN NO SE PUEDE DESHACER Y VACIARÁ TODAS LAS LOCALIDADES.")
    if (!confirmation2) return

    setActionLoading(true)
    try {
      // 1. Delete all inventory rows for this warehouse
      const { error: invErr } = await supabase
        .from('inventory')
        .delete()
        .eq('warehouse', activeWarehouse)
      if (invErr) throw invErr

      // 2. Set all locations for this warehouse to unoccupied
      const { error: locErr } = await supabase
        .from('locations')
        .update({ is_occupied: false })
        .eq('warehouse', activeWarehouse)
      if (locErr) throw locErr

      showMsg('SUCCESS', '¡INVENTARIO GLOBAL ELIMINADO Y LOCALIDADES LIBERADAS!')
      fetchLocations()
    } catch (error) {
      console.error(error)
      showMsg('ERROR', 'ERROR AL BORRAR INVENTARIO: ' + error.message.toUpperCase())
    }
    setActionLoading(false)
  }

  const handleClearLocation = async (loc) => {
    if (!window.confirm(`¿Seguro que deseas vaciar el inventario de la localidad ${loc.name}?`)) return
    
    setActionLoading(true)
    try {
      // Delete inventory for this location (using location_id)
      const { error: invErr } = await supabase.from('inventory').delete().eq('location_id', loc.id)
      if (invErr) throw invErr

      // Free the location
      const { error: locErr } = await supabase.from('locations').update({ is_occupied: false }).eq('id', loc.id)
      if (locErr) throw locErr

      showMsg('SUCCESS', `LOCALIDAD ${loc.name} LIBERADA CON ÉXITO.`)
      fetchLocations()
    } catch (error) {
      showMsg('ERROR', 'ERROR AL LIBERAR LOCALIDAD: ' + error.message.toUpperCase())
    }
    setActionLoading(false)
  }

  const handleToggleActive = async (loc) => {
    setActionLoading(true)
    try {
      const { error } = await supabase
        .from('locations')
        .update({ is_active: loc.is_active === false ? true : false })
        .eq('id', loc.id)
      
      if (error) throw error
      showMsg('SUCCESS', `LOCALIDAD ${loc.name} ${loc.is_active === false ? 'HABILITADA' : 'DESHABILITADA'}.`)
      fetchLocations()
    } catch (error) {
      showMsg('ERROR', 'ERROR AL CAMBIAR ESTADO: ' + error.message.toUpperCase())
    }
    setActionLoading(false)
  }

  const handleCreateRange = async (e) => {
    e.preventDefault()
    const start = parseInt(rangeStart)
    const end = parseInt(rangeEnd)
    
    if (isNaN(start) || isNaN(end) || start > end) {
      showMsg('ERROR', 'RANGOS INVÁLIDOS.')
      return
    }

    if (!window.confirm(`¿CREAR LOCALIDADES DESDE ${rangePrefix}${start} HASTA ${rangePrefix}${end}?`)) return

    setActionLoading(true)
    try {
      const newLocs = []
      for (let i = start; i <= end; i++) {
        newLocs.push({ 
          name: `${rangePrefix}${i}`, 
          is_occupied: false,
          warehouse: activeWarehouse
        })
      }
      
      const { error } = await supabase.from('locations').insert(newLocs)
      if (error) {
        // If it's a conflict (duplicate), supabase returns an error. We can use upsert or ignore, but insert error means some might exist.
        if (error.code === '23505') {
           throw new Error('Algunas localidades de este rango ya existen.')
        }
        throw error
      }

      showMsg('SUCCESS', `${newLocs.length} LOCALIDADES CREADAS.`)
      fetchLocations()
    } catch (error) {
      showMsg('ERROR', error.message.toUpperCase())
    }
    setActionLoading(false)
  }

  const filteredLocations = searchTarget.trim() 
    ? locations.filter(l => l.name.toUpperCase().includes(searchTarget.toUpperCase()))
    : []

  const occupiedCount = locations.filter(l => l.is_occupied).length

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Resumen */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
        <div className="glass" style={{ padding: '2rem', borderRadius: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem', borderLeft: '4px solid #3b82f6' }}>

          <div>
            <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>TOTAL LOCALIDADES ({activeWarehouse})</p>
            <p style={{ fontSize: '2.5rem', fontWeight: 900, color: 'white', lineHeight: 1 }}>{locations.length}</p>
          </div>
        </div>
        <div className="glass" style={{ padding: '2rem', borderRadius: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem', borderLeft: '4px solid #ef4444' }}>

          <div>
            <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>OCUPADAS (INVENTARIO)</p>
            <p style={{ fontSize: '2.5rem', fontWeight: 900, color: 'white', lineHeight: 1 }}>{occupiedCount}</p>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '2rem' }}>
        
        {/* PELIGRO: Borrado Global */}
        <div className="glass" style={{ padding: '2.5rem', borderRadius: '2rem', border: '1px solid rgba(239,68,68,0.3)', background: 'linear-gradient(180deg, rgba(239,68,68,0.05) 0%, rgba(15,23,42,0) 100%)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>

            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 900, color: '#ef4444', textTransform: 'uppercase' }}>ZONA DE PELIGRO</h3>
              <p style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase' }}>BORRADO MASIVO DE INVENTARIO</p>
            </div>
          </div>
          <p style={{ color: '#cbd5e1', fontSize: '0.85rem', marginBottom: '2rem', lineHeight: 1.6, textTransform: 'uppercase' }}>
            ESTA ACCIÓN ELIMINARÁ <strong>TODO EL INVENTARIO FÍSICO</strong> Y MARCARÁ TODAS LAS LOCALIDADES COMO LIBRES. USA ESTO SOLO CUANDO VAYAS A REALIZAR UN INVENTARIO GLOBAL DESDE CERO O REINICIAR EL ALMACÉN COMPLETO.
          </p>
          <button 
            onClick={handleClearGlobalInventory}
            disabled={actionLoading}
            style={{ 
              width: '100%', padding: '1.25rem', borderRadius: '1rem', background: '#ef4444', border: 'none',
              color: 'white', fontWeight: 900, fontSize: '0.85rem', textTransform: 'uppercase', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', opacity: actionLoading ? 0.7 : 1
            }}
          >
            {actionLoading ? 'PROCESANDO...' : 'VACIAR ALMACÉN COMPLETO'}
          </button>
        </div>

        {/* Liberar Casilla Específica */}
        <div className="glass" style={{ padding: '2.5rem', borderRadius: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>

            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 900, color: 'white', textTransform: 'uppercase' }}>LIBERAR LOCALIDAD</h3>
              <p style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase' }}>BUSCA Y VACÍA UNA LOCALIDAD OCUPADA</p>
            </div>
          </div>
          
          <input 
            type="text"
            placeholder="ESCRIBE EL NOMBRE DE LA LOCALIDAD (EJ. A105)..."
            value={searchTarget}
            onChange={e => setSearchTarget(e.target.value)}
            style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '1rem', padding: '1rem 1.25rem', color: 'white', fontWeight: 700, outline: 'none', marginBottom: '1.5rem', boxSizing: 'border-box' }}
          />

          <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingRight: '0.5rem' }} className="custom-scrollbar">
            {searchTarget.trim() !== '' && filteredLocations.length === 0 && (
              <p style={{ color: '#64748b', fontSize: '0.8rem', textAlign: 'center', padding: '1rem', textTransform: 'uppercase' }}>NO SE ENCONTRARON LOCALIDADES.</p>
            )}
            {filteredLocations.map(loc => (
               <div key={loc.id} style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>

                    <span style={{ fontWeight: 900, color: 'white' }}>{loc.name}</span>
                    <span style={{ fontSize: '0.65rem', padding:'0.2rem 0.5rem', borderRadius:'999px', background: loc.is_occupied ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', color: loc.is_occupied ? '#ef4444' : '#4ade80', fontWeight: 700 }}>
                      {loc.is_occupied ? 'OCUPADA' : 'LIBRE'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {loc.is_occupied && (
                      <button
                        onClick={() => handleClearLocation(loc)}
                        style={{ background: 'rgba(239, 68, 68, 0.1)', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.75rem', color: '#ef4444', fontSize: '0.7rem', fontWeight: 900, cursor: 'pointer', textTransform: 'uppercase' }}
                      >
                        LIBERAR LOCALIDAD
                      </button>
                    )}
                    <button 
                        onClick={() => handleToggleActive(loc)}
                        disabled={actionLoading}
                        style={{ 
                          background: loc.is_active === false ? 'rgba(34,197,94,0.1)' : 'rgba(148,163,184,0.1)', 
                          color: loc.is_active === false ? '#4ade80' : '#94a3b8', 
                          border: '1px solid currentColor', 
                          padding: '0.4rem 0.75rem', 
                          borderRadius: '0.5rem', 
                          fontWeight: 700, 
                          fontSize: '0.7rem', 
                          cursor: 'pointer', 
                          opacity: actionLoading ? 0.5 : 1 
                        }}
                      >
                        {loc.is_active === false ? 'HABILITAR' : 'DESHABILITAR'}
                      </button>
                  </div>
               </div>
            ))}
          </div>
        </div>

        {/* Creador de Localidades */}
        <div className="glass" style={{ padding: '2.5rem', borderRadius: '2rem' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: 'white', marginBottom: '1.5rem', textTransform: 'uppercase' }}>CREAR MÓDULO DE RACKS</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <p style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase' }}>AGREGA LOCALIDADES POR RANGOS</p>
          </div>

          <form onSubmit={handleCreateRange} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
             <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '80px' }}>
                  <label style={{ fontSize: '0.65rem', fontWeight: 900, color: '#475569', textTransform: 'uppercase' }}>LETRA</label>
                  <input type="text" value={rangePrefix} onChange={e => setRangePrefix(e.target.value.toUpperCase())} required maxLength={2} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '1rem', padding: '1rem', color: 'white', fontWeight: 900, outline: 'none', textAlign: 'center' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
                  <label style={{ fontSize: '0.65rem', fontWeight: 900, color: '#475569', textTransform: 'uppercase' }}>INICIO (EJ. 101)</label>
                  <input type="number" value={rangeStart} onChange={e => setRangeStart(e.target.value)} required min={1} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '1rem', padding: '1rem', color: 'white', fontWeight: 700, outline: 'none' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
                  <label style={{ fontSize: '0.65rem', fontWeight: 900, color: '#475569', textTransform: 'uppercase' }}>FIN (EJ. 269)</label>
                  <input type="number" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} required min={1} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '1rem', padding: '1rem', color: 'white', fontWeight: 700, outline: 'none' }} />
                </div>
             </div>
             
             <button disabled={actionLoading} style={{ background: 'white', color: '#0f172a', padding: '1.25rem', borderRadius: '1.25rem', fontWeight: 900, fontSize: '0.85rem', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', opacity: actionLoading ? 0.7 : 1 }}>
                {actionLoading ? 'GENERANDO...' : 'GENERAR RANGO DE RACKS'}
              </button>
          </form>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '2rem', marginTop: '1rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 900, color: '#ef4444', marginBottom: '1.5rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>ZONA DE PELIGRO</h3>
            <button
              onClick={handleClearGlobalInventory}
              style={{ width: '100%', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '1rem', borderRadius: '1rem', color: '#ef4444', fontWeight: 900, fontSize: '0.75rem', cursor: 'pointer', textTransform: 'uppercase' }}
            >
              BORRADO MASIVO DE INVENTARIO
            </button>
          </div>
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
