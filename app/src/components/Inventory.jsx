import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import * as XLSX from 'xlsx'

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

const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
  backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center',
  justifyContent: 'center', zIndex: 1000, padding: '1rem'
}

// ─── Traceability Modal ────────────────────────────────────────────────────────
function TraceabilityModal({ onClose, warehouse }) {
  const [code, setCode]           = useState('')
  const [talla, setTalla]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [results, setResults]     = useState(null)
  const [detail, setDetail]       = useState(null)

  const search = async () => {
    if (!code.trim()) return
    setLoading(true)
    setDetail(null)

    const twoMonthsAgo = new Date()
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2)
    const since = twoMonthsAgo.toISOString()

    const cleanCode = code.toUpperCase().trim()
    const cleanTalla = talla.toUpperCase().trim()

    // 1. Fetch Entries (Inventory)
    let qInv = supabase
      .from('inventory')
      .select('id, talla, quantity, op, entry_date, warehouse, locations(name), products!inner(code, description)')
      .eq('products.code', cleanCode)
      .eq('warehouse', warehouse)
      .gte('entry_date', since)

    if (cleanTalla) qInv = qInv.eq('talla', cleanTalla)

    // 2. Fetch Exits (Requirements)
    let qReq = supabase
      .from('requirements')
      .select('id, talla, quantity, requested_at, worker_name, pedido_num, assigned_location, status, product_code, warehouse')
      .eq('product_code', cleanCode)
      .eq('warehouse', warehouse)
      .eq('status', 'completed')
      .gte('requested_at', since)

    if (cleanTalla) qReq = qReq.eq('talla', cleanTalla)

    const [rInv, rReq] = await Promise.all([qInv, qReq])

    // Unify
    const entries = (rInv.data || []).map(r => ({
      ...r,
      type: 'ENTRY',
      date: r.entry_date,
      loc: r.locations?.name,
      description: r.products?.description
    }))
    const exits = (rReq.data || []).map(r => ({
      ...r,
      type: 'EXIT',
      date: r.requested_at,
      loc: r.assigned_location
    }))

    const unified = [...entries, ...exits].sort((a,b) => new Date(b.date) - new Date(a.date))
    setResults(unified)
    setLoading(false)
  }

  const fmt = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleDateString('es-MX') + ' ' + d.toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit', hour12:false })
  }

  return (
    <div style={overlayStyle}>
      <div style={{background:'#0f172a',border:'1px solid rgba(255,255,255,0.1)',borderRadius:'1.5rem',padding:'2rem',maxWidth:720,width:'94%',maxHeight:'90vh',display:'flex',flexDirection:'column',position:'relative', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'}}>
        
        {/* Header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1.5rem'}}>
          <div>
            <h3 style={{fontWeight:1000,color:'white',fontSize:'1.25rem', textTransform: 'uppercase', letterSpacing: '0.05em'}}>TRAZABILIDAD — {warehouse}</h3>
            <p style={{fontSize:'0.7rem',color:'#64748b',textTransform:'uppercase',letterSpacing:'0.1em', fontWeight: 800}}>CICLO DE VIDA DE PRENDA (ÚLTIMOS 2 MESES)</p>
          </div>
          <button onClick={onClose} style={{background:'rgba(255,255,255,0.05)',border:'none',cursor:'pointer',color:'#94a3b8',padding:'0.5rem 1rem',borderRadius:'0.75rem', fontWeight: 1000, fontSize: '0.8rem', textTransform: 'uppercase'}}>
            CERRAR
          </button>
        </div>

        {/* Form */}
        <div style={{display:'grid',gridTemplateColumns:'1fr auto auto',gap:'1rem',marginBottom:'2rem'}}>
          <input value={code} onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="CÓDIGO DE PRODUCTO / SKU..." 
            style={{...inputStyle, height: '3.5rem', fontSize: '1rem', fontWeight: 800, padding: '0 1.5rem'}}
            onKeyDown={e => e.key==='Enter' && search()} />
          <input value={talla} onChange={e => setTalla(e.target.value.toUpperCase())}
            placeholder="TALLA" 
            style={{...inputStyle, width:110, height: '3.5rem', textAlign: 'center', fontSize: '1rem', fontWeight: 800}}
            onKeyDown={e => e.key==='Enter' && search()} />
          <button onClick={search} disabled={loading||!code.trim()} style={{
            padding:'0 2rem',borderRadius:'1rem',background: loading ? 'rgba(239,68,68,0.5)' : '#EF4444',
            border:'none',color:'white',fontWeight:1000,cursor:code.trim()?'pointer':'not-allowed',
            fontSize:'0.85rem', textTransform: 'uppercase', letterSpacing: '0.1em', transition: 'all 0.2s'
          }}>
            {loading ? 'BUSCANDO...' : 'BUSCAR'}
          </button>
        </div>

        {/* Timeline */}
        <div style={{overflowY:'auto',flex:1,paddingRight:'0.5rem'}}>
          {results === null && !loading && (
            <div style={{textAlign:'center',padding:'5rem',opacity:0.3}}>
              <p style={{fontSize:'0.9rem', fontWeight:900, color:'#64748b', textTransform: 'uppercase', letterSpacing: '0.1em'}}>INGRESA UN CÓDIGO PARA CONSULTAR HISTORIAL</p>
            </div>
          )}

          {loading && (
             <div style={{textAlign: 'center', padding: '4rem'}}>
               <div className="spinner" style={{ width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#EF4444', borderRadius: '50%', margin: '0 auto 1rem' }}></div>
               <p style={{ color: '#64748b', fontWeight: 900, fontSize: '0.8rem', textTransform: 'uppercase' }}>CARGANDO TRAZABILIDAD...</p>
             </div>
          )}
          
          {!loading && results?.length === 0 && (
            <p style={{color:'#EF4444',textAlign:'center',padding:'3rem',fontSize:'0.9rem', fontWeight:1000, textTransform: 'uppercase'}}>NO SE ENCONTRARON MOVIMIENTOS RECIENTES</p>
          )}

          {results?.length > 0 && (
            <div style={{display:'flex',flexDirection:'column',gap:'1rem'}}>
              {results.map((r, i) => (
                <div key={`${r.type}-${r.id}-${i}`} 
                  onClick={() => r.type==='EXIT' ? setDetail(r) : null}
                  style={{
                    display:'flex',alignItems:'center',justifyContent:'space-between',
                    background: r.type==='ENTRY' ? 'rgba(34,197,94,0.05)' : 'rgba(239,68,68,0.05)',
                    border: `1px solid ${r.type==='ENTRY' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'}`,
                    borderRadius:'1.25rem',padding:'1.25rem',cursor:r.type==='EXIT'?'pointer':'default',
                    transition:'all 0.2s', position: 'relative'
                  }}
                  onMouseEnter={e => r.type==='EXIT' ? e.currentTarget.style.background='rgba(239,68,68,0.08)' : null}
                  onMouseLeave={e => r.type==='EXIT' ? e.currentTarget.style.background='rgba(239,68,68,0.05)' : null}
                >
                  <div style={{display:'flex',alignItems:'center',gap:'1.5rem'}}>
                    <div>
                      <div style={{display:'flex',alignItems:'center',gap:'0.75rem', marginBottom: '0.5rem'}}>
                        <span style={{
                          fontSize:'0.65rem',fontWeight:1000,textTransform:'uppercase',letterSpacing:'0.1em',
                          color: r.type==='ENTRY' ? '#22C55E' : '#EAB308',
                          background: r.type==='ENTRY' ? 'rgba(34,197,94,0.1)' : 'rgba(234,179,8,0.1)',
                          padding: '0.2rem 0.6rem', borderRadius: '4px'
                        }}>
                          {r.type === 'ENTRY' ? 'ENTRADA DE MERCANCÍA' : 'SALIDA DE SURTIDO'}
                        </span>
                        <span style={{fontSize:'0.65rem',color:'#64748b', fontWeight:900}}>{fmt(r.date)}</span>
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:'1rem'}}>
                        <h4 style={{fontWeight:1000,color:'white',fontSize:'1.5rem', letterSpacing: '-0.02em'}}>{r.loc}</h4>
                        <div style={{height: 20, width: 1, background: 'rgba(255,255,255,0.1)'}}></div>
                        <p style={{fontSize:'0.9rem',color:'#94a3b8', fontWeight:900, textTransform: 'uppercase'}}>
                          TALLA <strong style={{color:'white'}}>{r.talla}</strong> · CANT <strong style={{color:'white'}}>{r.quantity} PZ</strong>
                        </p>
                      </div>
                    </div>
                  </div>

                  <div style={{textAlign:'right'}}>
                    {r.type === 'EXIT' ? (
                      <span style={{fontSize:'0.7rem',fontWeight:1000,color:'#EAB308', textTransform: 'uppercase', letterSpacing: '0.1em', border: '1px solid rgba(234,179,8,0.3)', padding: '0.4rem 0.8rem', borderRadius: '0.75rem'}}>VER DETALLES</span>
                    ) : (
                      <span style={{
                        fontSize:'0.65rem',fontWeight:1000,textTransform:'uppercase',padding:'0.4rem 0.8rem',borderRadius:'0.75rem',
                        background: r.quantity===0 ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                        border: `1px solid ${r.quantity===0?'rgba(239,68,68,0.2)':'rgba(34,197,94,0.2)'}`,
                        color: r.quantity===0 ? '#f87171' : '#4ade80'
                      }}>
                        {r.quantity===0 ? 'UBICACIÓN VACÍA' : 'ACTUALMENTE EN STOCK'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detailed Exit Info Overlay */}
        {detail && (
          <div style={{
            position:'absolute',inset:0,background:'rgba(15,23,42,0.98)',borderRadius:'1.5rem',
            display:'flex',alignItems:'center',justifyContent:'center',padding:'2rem',zIndex:100,
            backdropFilter:'blur(10px)'
          }}>
            <div style={{textAlign:'center',maxWidth:450,width:'100%'}}>
              <div style={{width:80,height:80,borderRadius:'50%',background:'rgba(239,68,68,0.1)',color:'#EF4444',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 1.5rem',border:'1px solid rgba(239,68,68,0.2)', fontWeight:1000, fontSize:'1.5rem'}}>
                OUT
              </div>
              <h3 style={{fontWeight:1000,color:'white',fontSize:'2rem',marginBottom:'0.5rem', textTransform:'uppercase', letterSpacing: '0.05em'}}>DETALLES DE OPERACIÓN</h3>
              <p style={{color:'#64748b',fontSize:'0.85rem',marginBottom:'3rem', textTransform:'uppercase', fontWeight:900, letterSpacing: '0.1em'}}>REQUERIMIENTO COMPLETADO</p>
              
              <div style={{display:'grid',gap:'1.5rem',textAlign:'left',background:'rgba(255,255,255,0.03)',padding:'2.5rem',borderRadius:'1.5rem',border:'1px solid rgba(255,255,255,0.08)'}}>
                <div>
                  <label style={{fontSize:'0.7rem',fontWeight:1000,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.15em', display: 'block', marginBottom: '0.4rem'}}>SOLICITANTE</label>
                  <p style={{fontWeight:1000,color:'white',fontSize:'1.25rem', textTransform:'uppercase'}}>{detail.worker_name}</p>
                </div>
                <div>
                  <label style={{fontSize:'0.7rem',fontWeight:1000,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.15em', display: 'block', marginBottom: '0.4rem'}}>REFERENCIA DE PEDIDO</label>
                  <p style={{fontWeight:1000,color:'#EAB308',fontSize:'1.35rem'}}>{detail.pedido_num || 'SIN REFERENCIA'}</p>
                </div>
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem'}}>
                   <div>
                    <label style={{fontSize:'0.7rem',fontWeight:1000,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.15em', display: 'block', marginBottom: '0.4rem'}}>FECHA</label>
                    <p style={{fontWeight:900,color:'white',fontSize:'1rem'}}>{fmt(detail.date).split(' ')[0]}</p>
                  </div>
                  <div>
                    <label style={{fontSize:'0.7rem',fontWeight:1000,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.15em', display: 'block', marginBottom: '0.4rem'}}>HORA</label>
                    <p style={{fontWeight:900,color:'white',fontSize:'1rem'}}>{fmt(detail.date).split(' ')[1]}</p>
                  </div>
                </div>
              </div>

              <button onClick={() => setDetail(null)} style={{
                marginTop:'3rem',width:'100%',padding:'1.25rem',borderRadius:'1.25rem',
                background:'#EF4444',border:'none',color:'white',fontWeight:1000,fontSize:'1rem',
                cursor:'pointer',boxShadow:'0 10px 25px -5px rgba(239, 68, 68, 0.4)', textTransform: 'uppercase', letterSpacing: '0.1em'
              }}>REGRESAR AL HISTORIAL</button>
            </div>
          </div>
        )}
      </div>
      <style>{`
        .spinner { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function Inventory() {
  const { activeWarehouse } = useAuth()
  const [inventory, setInventory]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [filter, setFilter]         = useState('')
  const [view, setView]             = useState('grid')
  const [traceOpen, setTraceOpen]   = useState(false)

  const fetchInventory = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('inventory')
      .select('id, talla, quantity, entry_date, op, warehouse, package_id, is_partial, locations(name), products(code, description)')
      .eq('warehouse', activeWarehouse)
      .gt('quantity', 0)
      .not('location_id', 'is', null)
      .order('entry_date', { ascending: false })
    if (error) console.error('Error fetching inventory:', error)
    else setInventory(data || [])
    setLoading(false)
  }, [activeWarehouse])

  useEffect(() => {
    fetchInventory()
    const sub = supabase.channel(`inventory_rt_${activeWarehouse}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'inventory',
        filter: `warehouse=eq.${activeWarehouse}`
      }, fetchInventory)
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [fetchInventory, activeWarehouse])

  const exportToExcel = () => {
    const rows = inventory.map(item => ({
      UBICACION:    item.locations?.name,
      CODIGO:       item.products?.code,
      DESCRIPCION:  item.products?.description,
      TALLA:        item.talla,
      CANTIDAD:     item.quantity,
      OP:           item.op,
      'PACKAGE ID':  item.package_id,
      'FECHA FIFO':  new Date(item.entry_date).toLocaleDateString('es-MX'),
      ESTADO:       item.is_partial ? 'PARCIAL' : 'COMPLETO',
      ALMACEN:      item.warehouse,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario')
    
    const safeDate = new Date().toISOString().slice(0,10).replace(/[^a-zA-Z0-9]/g, '_')
    const filename = `INVENTARIO_${activeWarehouse}_${safeDate.toUpperCase()}.xlsx`
    
    try {
      XLSX.writeFile(wb, filename)
    } catch (err) {
      console.error('Error exportando:', err)
      alert('ERROR AL GENERAR EXCEL: ' + err.message)
    }
  }

  const filteredInv = inventory.filter(item =>
    item.products?.code?.toLowerCase().includes(filter.toLowerCase()) ||
    item.locations?.name?.toLowerCase().includes(filter.toLowerCase()) ||
    item.op?.toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <div style={{display:'flex',flexDirection:'column',gap:'2rem'}}>

      {/* Header */}
      <div style={{display:'flex',flexWrap:'wrap',alignItems:'flex-end',justifyContent:'space-between',gap:'1rem'}}>
        <div>
          <div style={{display:'flex',alignItems:'center',gap:'0.5rem',color:'#EF4444',marginBottom:'0.5rem'}}>
            <span style={{fontSize:'0.75rem',fontWeight:1000,textTransform:'uppercase',letterSpacing:'0.25em'}}>VISIBILIDAD GLOBAL AIRMAN</span>
          </div>
          <h1 style={{fontSize:'2.5rem',fontWeight:1000,color:'white',textTransform:'uppercase', letterSpacing: '-0.02em'}}>EXISTENCIAS DE <span style={{color:'#EF4444'}}>{activeWarehouse}</span></h1>
          <p style={{color:'#94a3b8',fontSize:'0.9rem',marginTop:'0.25rem',fontWeight:900,textTransform:'uppercase', letterSpacing: '0.1em'}}>STOCK EN TIEMPO REAL · {filteredInv.length} LOCALIDADES ACTIVAS</p>
        </div>
        <div style={{display:'flex',gap:'1rem',flexWrap:'wrap'}}>
          <button onClick={() => setTraceOpen(true)} style={{
            display:'flex',alignItems:'center',gap:'0.75rem',padding:'1rem 2rem',
            borderRadius:'1rem',background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.2)',
            color:'#F87171',fontWeight:1000,fontSize:'0.8rem',textTransform:'uppercase',cursor:'pointer', letterSpacing: '0.05em'
          }}>
            CONSULTAR TRAZABILIDAD
          </button>
          <button onClick={exportToExcel} style={{
            display:'flex',alignItems:'center',gap:'0.75rem',padding:'1rem 2rem',
            borderRadius:'1rem',background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',
            color:'white',fontWeight:1000,fontSize:'0.8rem',textTransform:'uppercase',cursor:'pointer', letterSpacing: '0.05em'
          }}>
            REPORTAR A EXCEL
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'1rem',background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:'1.5rem',padding:'1.25rem'}}>
        <div style={{position:'relative',flex:1,maxWidth:600}}>
          <input type="text" placeholder="FILTRAR POR CÓDIGO, UBICACIÓN, OP O PKG..."
            value={filter} onChange={e => setFilter(e.target.value)}
            style={{...inputStyle, paddingLeft: '1.5rem', textTransform: 'uppercase', height: '3.5rem', fontSize: '1rem', fontWeight: 800, letterSpacing: '0.02em'}} />
        </div>
        <div style={{display:'flex',background:'rgba(255,255,255,0.04)',borderRadius:'1rem',overflow:'hidden', padding: '0.25rem'}}>
          {[{id:'grid',label:'VISTA CUADRÍCULA'},{id:'list',label:'VISTA LISTA'}].map(({id,label})=>(
            <button key={id} onClick={() => setView(id)} style={{
              padding:'0.8rem 1.5rem',
              background: view===id ? '#EF4444' : 'transparent',
              border:'none',color: view===id ? 'white' : '#64748b',
              borderRadius: '0.75rem',
              fontWeight:1000,fontSize:'0.75rem',cursor:'pointer',transition:'all 0.2s', textTransform: 'uppercase'
            }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid or List */}
      {loading ? (
        <div style={{textAlign:'center',padding:'6rem',color:'#64748b'}}>
          <div className="spinner" style={{ width: '50px', height: '50px', border: '5px solid rgba(255,255,255,0.1)', borderTopColor: '#EF4444', borderRadius: '50%', margin: '0 auto 1.5rem' }}></div>
          <p style={{fontSize:'0.9rem',fontWeight:1000,textTransform:'uppercase',letterSpacing:'0.2em'}}>CARGANDO INVENTARIO...</p>
        </div>
      ) : (
        <>
          {view === 'grid' ? (
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:'1.5rem'}}>
              {filteredInv.map(item => (
                <div key={item.id} style={{
                  background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.07)',
                  borderRadius:'1.75rem',padding:'1.75rem',position:'relative',overflow:'hidden',
                  transition:'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', cursor: 'default',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
                }}
                  onMouseEnter={e=>{
                    e.currentTarget.style.borderColor='rgba(239,68,68,0.3)'
                    e.currentTarget.style.background='rgba(255,255,255,0.04)'
                    e.currentTarget.style.transform='translateY(-4px)'
                  }}
                  onMouseLeave={e=>{
                    e.currentTarget.style.borderColor='rgba(255,255,255,0.07)'
                    e.currentTarget.style.background='rgba(255,255,255,0.02)'
                    e.currentTarget.style.transform='none'
                  }}
                >
                  <span style={{
                    position:'absolute',top:20,right:20,fontSize:'0.6rem',fontWeight:1000,
                    textTransform:'uppercase',letterSpacing:'0.1em',padding:'0.3rem 0.7rem',
                    borderRadius:'0.5rem',
                    background: item.is_partial?'rgba(234,179,8,0.15)':'rgba(34,197,94,0.15)',
                    border: item.is_partial?'1px solid rgba(234,179,8,0.3)':'1px solid rgba(34,197,94,0.3)',
                    color: item.is_partial?'#FBBF24':'#4ADE80',
                  }}>{item.is_partial?'ESTADO: PARCIAL':'ESTADO: COMPLETO'}</span>

                  <h4 style={{fontSize:'2.25rem',fontWeight:1000,color:'white',lineHeight:1,marginBottom:'0.5rem', marginTop: '1rem', letterSpacing: '-0.03em'}}>{item.locations?.name}</h4>
                  <p style={{fontSize:'0.85rem',fontWeight:900,color:'#EF4444',textTransform:'uppercase',marginBottom:'0.4rem', letterSpacing: '0.05em'}}>{item.products?.code}</p>
                  <p style={{fontSize:'0.8rem',color:'#94a3b8',marginBottom:'1.5rem',lineHeight:1.4,minHeight:40,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical', textTransform: 'uppercase', fontWeight: 700}}>
                    {item.products?.description || 'SIN DESCRIPCIÓN DISPONIBLE'}
                  </p>

                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',borderTop:'1px solid rgba(255,255,255,0.06)',paddingTop:'1.25rem'}}>
                    <div>
                      <p style={{fontSize:'0.65rem',color:'#64748b',fontWeight:950,textTransform:'uppercase',letterSpacing:'0.15em', marginBottom:'0.3rem'}}>DETALLE OP</p>
                      <p style={{fontWeight:1000,color:'white',fontSize:'0.9rem'}}>{item.op || 'S/OP'}</p>
                    </div>
                    <div>
                      <p style={{fontSize:'0.6rem',color:'#64748b',fontWeight:950,textTransform:'uppercase',letterSpacing:'0.15em', marginBottom:'0.3rem', textAlign: 'center'}}>STOCK</p>
                      <p style={{fontSize:'2.75rem',fontWeight:1000,color:'white',lineHeight:1}}>{item.quantity}<span style={{fontSize:'0.8rem',color:'#64748b',marginLeft:4}}>PZ</span></p>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <p style={{fontSize:'0.65rem',color:'#64748b',fontWeight:950,textTransform:'uppercase',letterSpacing:'0.15em', marginBottom:'0.3rem'}}>TALLA</p>
                      <span style={{fontWeight:1000,color:'white',background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:'0.75rem',padding:'0.4rem 0.8rem', fontSize: '1.25rem'}}>{item.talla}</span>
                    </div>
                  </div>

                  <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.7rem',color:'#475569',fontWeight:1000,marginTop:'1.25rem',paddingTop:'1rem',borderTop:'1px solid rgba(255,255,255,0.05)', textTransform:'uppercase', letterSpacing: '0.05em'}}>
                    <span>F. INGRESO: {new Date(item.entry_date).toLocaleDateString('es-MX')}</span>
                    <span style={{color: '#94a3b8'}}>PKG: {item.package_id || 'N/A'}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{borderRadius:'1.5rem',border:'1px solid rgba(255,255,255,0.07)',overflow:'hidden', background: 'rgba(255,255,255,0.01)'}}>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead>
                  <tr style={{background:'rgba(255,255,255,0.04)'}}>
                    {['UBICACIÓN','CÓDIGO / SKU','TALLA','STOCK','ORDEN DE PROCESO','FECHA INGRESO','ESTADO'].map(h=>(
                      <th key={h} style={{padding:'1.25rem 1.5rem',textAlign:'left',color:'#64748b',fontWeight:1000,fontSize:'0.75rem',textTransform:'uppercase',letterSpacing:'0.15em'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredInv.map((item,i)=>(
                    <tr key={item.id} style={{borderTop:'1px solid rgba(255,255,255,0.05)',background:i%2===0?'transparent':'rgba(255,255,255,0.01)', transition: 'background 0.2s'}}
                      onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.03)'}
                      onMouseLeave={e=>e.currentTarget.style.background=i%2===0?'transparent':'rgba(255,255,255,0.01)'}
                    >
                      <td style={{padding:'1.25rem 1.5rem'}}>
                        <span style={{fontWeight:1000,color:'white',fontSize:'1.35rem', letterSpacing: '-0.02em'}}>{item.locations?.name}</span>
                      </td>
                      <td style={{padding:'1.25rem 1.5rem'}}>
                        <p style={{fontWeight:1000,color:'#EF4444',fontSize:'1rem', letterSpacing: '0.02em'}}>{item.products?.code}</p>
                        <p style={{fontSize:'0.75rem',color:'#64748b',maxWidth:300,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap', fontWeight: 800, textTransform: 'uppercase'}}>{item.products?.description}</p>
                      </td>
                      <td style={{padding:'1.25rem 1.5rem'}}>
                        <span style={{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:'0.5rem',padding:'0.4rem 1rem',color:'white',fontWeight:1000, fontSize: '1rem'}}>{item.talla}</span>
                      </td>
                      <td style={{padding:'1.25rem 1.5rem'}}>
                        <span style={{fontWeight:1000,color:'white',fontSize:'2rem', lineHeight: 1}}>{item.quantity}</span>
                        <span style={{fontSize:'0.8rem',color:'#475569',marginLeft:4, fontWeight: 900}}>PZ</span>
                      </td>
                      <td style={{padding:'1.25rem 1.5rem',color:'#94a3b8',fontSize:'1rem', fontWeight: 1000}}>{item.op||'—'}</td>
                      <td style={{padding:'1.25rem 1.5rem',color:'#64748b',fontSize:'0.85rem',whiteSpace:'nowrap', fontWeight: 900}}>
                        {new Date(item.entry_date).toLocaleDateString('es-MX')}
                      </td>
                      <td style={{padding:'1.25rem 1.5rem'}}>
                        <span style={{
                          fontSize:'0.65rem',fontWeight:1000,textTransform:'uppercase',padding:'0.4rem 0.8rem',borderRadius:'0.75rem',
                          background:item.is_partial?'rgba(234,179,8,0.15)':'rgba(34,197,94,0.15)',
                          border:item.is_partial?'1px solid rgba(234,179,8,0.3)':'1px solid rgba(34,197,94,0.3)',
                          color:item.is_partial?'#FBBF24':'#4ADE80',
                        }}>{item.is_partial?'PARCIAL':'COMPLETA'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!loading && filteredInv.length===0 && (
            <div style={{textAlign:'center',padding:'6rem',border:'1px dashed rgba(255,255,255,0.1)',borderRadius:'2rem', background: 'rgba(255,255,255,0.01)'}}>
              <h4 style={{fontWeight:1000,color:'white', textTransform: 'uppercase', fontSize: '1.5rem', marginBottom: '1rem', letterSpacing: '0.1em'}}>SIN COINCIDENCIAS DISPONIBLES</h4>
              <p style={{color:'#64748b',marginTop:'0.5rem',fontSize:'1rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em'}}>AJUSTA TUS CRITERIOS DE BÚSQUEDA PARA ENCONTRAR RESULTADOS.</p>
            </div>
          )}
        </>
      )}

      {/* Traceability Modal */}
      {traceOpen && <TraceabilityModal onClose={() => setTraceOpen(false)} warehouse={activeWarehouse} />}
    </div>
  )
}
