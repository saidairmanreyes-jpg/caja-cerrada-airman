import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

export default function OrderStatusMonitor() {
  const { profile, isAdmin } = useAuth()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedWarehouse, setSelectedWarehouse] = useState('ALL')
  const [activeTab, setActiveTab] = useState('pending')
  const [processFilter, setProcessFilter] = useState('ALL')
  const WAREHOUSES = ['MATRIZ', 'PLANTA', 'MEXICO', 'MONTERREY']
  
  const canEdit = isAdmin || profile?.role === 'operator'
  const isSales = profile?.role === 'sales'
  const gridColumns = isSales 
    ? '100px 2fr 180px 1.5fr' 
    : '100px 2fr 120px 160px 1.6fr 1.8fr'

  const updateStatus = async (pedidoNum, newStatus) => {
    setOrders(prev => prev.map(o => o.pedido_num === pedidoNum ? { ...o, proceso_actual: newStatus.toUpperCase() } : o))
    await supabase.from('pedido_status').update({ proceso_actual: newStatus.toUpperCase() }).eq('pedido_num', pedidoNum)
  }

  useEffect(() => {
    fetchOrders()
    const subscription = supabase
      .channel('pedido_status_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedido_status' }, payload => {
        if (payload.eventType === 'INSERT') {
          setOrders(prev => [payload.new, ...prev])
        } else if (payload.eventType === 'UPDATE') {
          setOrders(prev => prev.map(o => o.pedido_num === payload.new.pedido_num ? payload.new : o))
        } else if (payload.eventType === 'DELETE') {
          setOrders(prev => prev.filter(o => o.pedido_num !== payload.old.pedido_num))
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(subscription) }
  }, [])

  async function fetchOrders() {
    setLoading(true)
    const { data } = await supabase
      .from('pedido_status')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(200)
    if (data) setOrders(data)
    setLoading(false)
  }

  const filteredOrders = orders.filter(o => 
    (selectedWarehouse === 'ALL' || o.warehouse === selectedWarehouse) &&
    (activeTab === 'cancelled' ? o.cancelado === true : (
      !o.cancelado && (activeTab === 'empaque' ? o.empaque === true : !o.empaque)
    )) &&
    (processFilter === 'ALL' || (processFilter === 'CON' ? o.con_proceso : !o.con_proceso)) &&
    (String(o.pedido_num).toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(o.folio || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(o.cliente || '').toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const getStatusColor = (proceso) => {
    const p = String(proceso).toUpperCase()
    if (p.includes('ENTREGADO') || p.includes('TERMINADO')) return '#22C55E'
    if (p.includes('BORDADO') || p.includes('SERIGRAFIA') || p.includes('ARREGLO') || p.includes('CORTE')) return '#F59E0B'
    if (p.includes('LOGISTICA')) return '#8B5CF6'
    if (p.includes('PENDIENTE') || p.includes('-')) return '#64748B'
    if (p.includes('SURTIMIENTO')) return '#0EA5E9'
    return '#EF4444'
  }

  const inputContainerStyle = {
    background: 'rgba(15,23,42,0.6)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '1rem',
    padding: '0.25rem 0.5rem',
    display: 'flex',
    alignItems: 'center',
    transition: 'all 0.2s',
    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
  }

  return (
    <div style={{display:'flex',flexDirection:'column',gap:'2rem', minHeight:'100%'}}>
      
      {/* Header */}
      <div style={{display:'flex', justifyContent: 'space-between', alignItems: 'flex-end'}}>
        <div>
           <div style={{display:'flex',alignItems:'center',gap:'0.5rem',color:'#EF4444',marginBottom:'0.5rem'}}>
            <span style={{fontSize:'0.75rem',fontWeight:1000,textTransform:'uppercase',letterSpacing:'0.25em'}}>MONITOREO LOGÍSTICO</span>
          </div>
          <h1 style={{fontSize:'2.5rem',fontWeight:1000,color:'white',textTransform:'uppercase', letterSpacing: '-0.02em'}}>ESTADO DE <span style={{color:'#EF4444'}}>PEDIDOS</span></h1>
        </div>
        
        <div style={{display:'flex',gap:'0.75rem',background:'rgba(255,255,255,0.03)',padding:'0.4rem',borderRadius:'1.25rem',border:'1px solid rgba(255,255,255,0.05)'}}>
          {[
            {id:'pending', label:'PENDIENTES', color:'#38BDF8'},
            {id:'empaque', label:'EMPAQUE / LISTOS', color:'#22C55E'},
            {id:'cancelled', label:'CANCELADOS', color:'#EF4444'}
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              padding:'0.75rem 1.75rem', borderRadius:'1rem',
              background: activeTab === tab.id ? tab.color : 'transparent',
              color: activeTab === tab.id ? 'white' : '#64748B',
              border:'none', fontWeight:1000, fontSize:'0.75rem', textTransform:'uppercase', cursor:'pointer', transition:'all 0.2s'
            }}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filters Bar */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'1rem',flexWrap:'wrap', background: 'rgba(255,255,255,0.02)', padding: '1.25rem', borderRadius: '1.5rem', border: '1px solid rgba(255,255,255,0.06)'}}>
        <div style={{display:'flex',gap:'1rem',flexWrap:'wrap',flex: 1}}>
          <div style={{...inputContainerStyle, flex: 2}}>
            <input 
              type="text" 
              placeholder="BUSCAR POR PEDIDO, FOLIO O CLIENTE..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{background:'transparent',border:'none',color:'white',padding:'0.75rem 1rem',width:'100%',outline:'none',fontWeight:1000,textTransform:'uppercase', fontSize: '0.85rem', letterSpacing: '0.02em'}}
            />
          </div>
          
          <div style={{...inputContainerStyle, flex: 1}}>
            <select 
              value={selectedWarehouse}
              onChange={(e) => setSelectedWarehouse(e.target.value)}
              style={{background:'transparent',border:'none',color:'white',padding:'0.75rem 1rem',width: '100%', outline:'none',fontWeight:1000,cursor:'pointer',textTransform:'uppercase', fontSize: '0.85rem'}}
            >
              <option value="ALL" style={{background:'#0b0e14'}}>TODAS LAS SUCURSALES</option>
              {WAREHOUSES.map(w => <option key={w} value={w} style={{background:'#0b0e14'}}>{w}</option>)}
            </select>
          </div>

          <div style={{...inputContainerStyle, flex: 1}}>
            <select 
              value={processFilter}
              onChange={(e) => setProcessFilter(e.target.value)}
              style={{background:'transparent',border:'none',color:'white',padding:'0.75rem 1rem',width: '100%', outline:'none',fontWeight:1000,cursor:'pointer',textTransform:'uppercase', fontSize: '0.85rem'}}
            >
              <option value="ALL" style={{background:'#0b0e14'}}>FILTRAR PROCESO</option>
              <option value="CON" style={{background:'#0b0e14'}}>CON PROCESO ESPECIAL</option>
              <option value="SIN" style={{background:'#0b0e14'}}>SIN PROCESO ESPECIAL</option>
            </select>
          </div>
        </div>

        <div style={{display:'flex',gap:'1.5rem', paddingLeft: '1rem', borderLeft: '1px solid rgba(255,255,255,0.05)'}}>
           <div style={{display:'flex',alignItems:'center',gap:'0.6rem'}}>
            <div style={{width:10,height:10,borderRadius:'50%',background:'#F59E0B',boxShadow:'0 0 15px rgba(245,158,11,0.4)'}} />
            <span style={{fontSize:'0.7rem',color:'#94A3B8',fontWeight:1000,textTransform:'uppercase',letterSpacing:'0.15em'}}>EN PROCESO</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:'0.6rem'}}>
            <div style={{width:10,height:10,borderRadius:'50%',background:'#22C55E',boxShadow:'0 0 15px rgba(34,197,94,0.4)'}} />
            <span style={{fontSize:'0.7rem',color:'#94A3B8',fontWeight:1000,textTransform:'uppercase',letterSpacing:'0.15em'}}>LISTO / TERMINADO</span>
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div style={{background:'rgba(2,6,23,0.4)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:'1.75rem',overflow:'hidden',boxShadow:'0 25px 50px -12px rgba(0,0,0,0.5)'}}>
        
        {/* Table Header */}
        <div style={{display:'grid',gridTemplateColumns:gridColumns,gap:'1rem',padding:'1.5rem 2.5rem',background:'rgba(255,255,255,0.03)',borderBottom:'1px solid rgba(255,255,255,0.08)'}}>
          {['PEDIDO','CLIENTE', !isSales && 'DETALLES PRENDA','FECHA / RESPONSABLE','ESTATUS ACTUAL', !isSales && 'OBSERVACIONES'].filter(Boolean).map(h => (
            <div key={h} style={{fontSize:'0.7rem',color:'#64748B',fontWeight:1000,textTransform:'uppercase',letterSpacing:'0.2em'}}>{h}</div>
          ))}
        </div>

        {/* Table Body */}
        <div style={{maxHeight:'650px',overflowY:'auto'}} className="custom-scrollbar">
          {loading ? (
            <div style={{padding:'6rem 0',display:'flex',flexDirection: 'column', alignItems:'center', gap: '1.5rem'}}>
               <div className="spinner" style={{ width: '40px', height: '40px', border: '4px solid rgba(255,255,255,0.1)', borderTopColor: '#EF4444', borderRadius: '50%' }}></div>
               <span style={{color:'#64748B',fontSize:'0.9rem',fontWeight:1000,letterSpacing:'0.2em', textTransform: 'uppercase'}}>ACTUALIZANDO DATOS...</span>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div style={{padding:'6rem 0',display:'flex',justifyContent:'center',flexDirection: 'column', alignItems: 'center', gap: '1rem'}}>
              <p style={{color:'#EF4444',fontSize:'1.25rem',fontWeight:1000,textTransform:'uppercase', letterSpacing: '0.05em'}}>SIN REGISTROS DISPONIBLES</p>
              <p style={{color:'#64748B', fontSize: '0.85rem', fontWeight: 900, textTransform: 'uppercase'}}>AJUSTA LOS FILTROS PARA VISUALIZAR OTROS PEDIDOS</p>
            </div>
          ) : (
            filteredOrders.map((o, idx) => {
              const statusColor = getStatusColor(o.proceso_actual)
              
              return (
                <div key={o.id || idx} style={{
                  display:'grid',gridTemplateColumns:gridColumns,gap:'1rem',padding:'1.75rem 2.5rem',
                  borderBottom:'1px solid rgba(255,255,255,0.04)',
                  background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                  alignItems:'center', transition:'all 0.2s', position: 'relative'
                }}
                onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.03)'}
                onMouseLeave={e => e.currentTarget.style.background=idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)'}
                >
                  <div style={{fontSize:'1.25rem',color:'white',fontWeight:1000,letterSpacing:'-0.01em', background: 'rgba(255,255,255,0.05)', display: 'inline-block', padding: '0.4rem 0.8rem', borderRadius: '0.75rem', textAlign: 'center'}}>
                    #{o.pedido_num}
                  </div>
                  
                  <div>
                    <div style={{fontSize:'1.1rem',color:'#F1F5F9',fontWeight:1000,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',textTransform:'uppercase', letterSpacing: '0.01em'}}>{o.cliente?.toUpperCase()}</div>
                    <div style={{fontSize:'0.75rem',color:'#64748B',fontWeight:1000,marginTop:'0.4rem',textTransform:'uppercase',letterSpacing:'0.1em'}}>
                      EJECUTIVO: <span style={{color: '#94A3B8'}}>{(o.ejecutivo || 'SIN ASIGNAR').toUpperCase()}</span>
                    </div>
                  </div>

                  {!isSales && (
                    <div>
                      <div style={{fontSize:'1rem',color:'#EF4444',fontWeight:1000}}>{o.total_prendas || '0'} PIEZAS</div>
                      <div style={{fontSize:'0.65rem',color: o.con_proceso ? '#F59E0B' : '#64748B',fontWeight:1000,marginTop:'0.4rem',textTransform:'uppercase', letterSpacing: '0.05em'}}>
                        {o.con_proceso ? 'PROCESO EXTERNO' : 'SURTIDO DIRECTO'}
                      </div>
                    </div>
                  )}

                  <div>
                    {activeTab === 'cancelled' ? (
                      <div style={{fontSize:'0.85rem',color:'#F87171',fontWeight:1000, textTransform: 'uppercase'}}>
                        CANCELADO: {o.fecha_cancelado ? new Date(o.fecha_cancelado).toLocaleDateString() : 'N/A'}
                      </div>
                    ) : (
                      <>
                        <div style={{fontSize:'0.85rem',color:'#94A3B8', fontWeight:1000, textTransform: 'uppercase'}}>
                          {o.fecha_creacion ? new Date(o.fecha_creacion).toLocaleDateString() : '—'}
                        </div>
                        {!isSales && (
                          <div style={{fontSize:'0.7rem',color:'#64748B',fontWeight:900,marginTop:'0.4rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textTransform:'uppercase', letterSpacing: '0.05em' }}>
                            SURT: <span style={{color: '#94A3B8'}}>{(o.surtidor || 'PENDIENTE').toUpperCase()}</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <div style={{display:'flex',flexDirection:'column',gap:'0.6rem'}}>
                    {activeTab === 'cancelled' ? (
                       <div style={{
                        display:'inline-flex',alignItems:'center',
                        padding:'0.5rem 1rem',borderRadius:'0.75rem',
                        background:`rgba(239,68,68,0.1)`,
                        color:'#F87171',
                        border:`1px solid rgba(239,68,68,0.2)`,
                        fontSize:'0.75rem',fontWeight:1000,textTransform:'uppercase', letterSpacing: '0.05em'
                      }}>
                        POR: {(o.usuario_cancelado || 'N/A').toUpperCase()}
                      </div>
                    ) : (
                      <>
                        {o.proceso_especial && (
                          <div style={{
                            display:'inline-flex',alignItems:'center',justifyContent:'center',
                            padding:'0.3rem 0.6rem',borderRadius:'0.5rem',
                            background:'rgba(245,158,11,0.1)',
                            color:'#F59E0B', border:'1px solid rgba(245,158,11,0.2)',
                            fontSize:'0.6rem',fontWeight:1000,letterSpacing:'0.1em', width: 'fit-content',textTransform:'uppercase'
                          }}>
                            {o.proceso_especial?.toUpperCase()}
                          </div>
                        )}
                        {canEdit ? (
                          <select 
                            value={o.proceso_actual || ''}
                            onChange={(e) => updateStatus(o.pedido_num, e.target.value)}
                            style={{
                              padding:'0.6rem 1rem',borderRadius:'0.75rem',
                              background:`${statusColor}15`,
                              color:statusColor,
                              border:`1px solid ${statusColor}30`,
                              fontSize:'0.8rem',fontWeight:1000,textTransform:'uppercase',
                              outline:'none',cursor:'pointer', width: '100%', appearance: 'none', textAlign: 'center'
                            }}
                          >
                            <option value="PENDIENTE">PENDIENTE</option>
                            <option value="ARREGLOS">ARREGLOS</option>
                            <option value="SURTIMIENTO">SURTIMIENTO</option>
                            <option value="BORDADO">BORDADO</option>
                            <option value="SERIGRAFIA">SERIGRAFIA</option>
                            <option value="EMPAQUE">EMPAQUE</option>
                            <option value="LOGISTICA">LOGISTICA</option>
                            <option value="TERMINADO">TERMINADO</option>
                            <option value="ENTREGADO">ENTREGADO</option>
                          </select>
                        ) : (
                          <div style={{
                            display:'inline-flex',alignItems:'center', justifyContent: 'center',
                            padding:'0.6rem 1rem',borderRadius:'0.75rem',
                            background:`${statusColor}15`,
                            color:statusColor,
                            border:`1px solid ${statusColor}30`,
                            fontSize:'0.8rem',fontWeight:1000,textTransform:'uppercase', letterSpacing: '0.05em'
                          }}>
                            {(o.proceso_actual || 'PENDIENTE').toUpperCase()}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {!isSales && (
                    <div>
                      {o.observaciones ? (
                        <div style={{display:'flex',alignItems:'flex-start',gap:'0.5rem',color:'#F59E0B',fontSize:'0.75rem',fontWeight:1000,background:'rgba(245,158,11,0.06)',padding:'0.75rem',borderRadius:'0.75rem',border: '1px solid rgba(245,158,11,0.12)', textTransform:'uppercase'}}>
                          <span style={{lineHeight:1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'}} title={o.observaciones}>{o.observaciones}</span>
                        </div>
                      ) : (
                        <span style={{color:'#475569',fontSize:'0.9rem',fontWeight:1000, paddingLeft: '1rem'}}>—</span>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      <style>{`
        .spinner { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255,255,255,0.02); }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); borderRadius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(239,68,68,0.2); }
      `}</style>
    </div>
  )
}
