import {
  LogOut,
  User as UserIcon,
} from 'lucide-react'
import Reception from './components/Reception'
import Picking from './components/Picking'
import Inventory from './components/Inventory'
import Admin from './components/Admin'
import PickingQueue from './components/PickingQueue'
import OrderStatusMonitor from './components/OrderStatusMonitor'
import Login from './components/Login'
import Maquila from './components/Maquila'
import { useAuth } from './context/AuthContext'
import { useEffect, useState } from 'react'


export default function App() {
  const { user, profile, loading, logout, isAdmin, hasPermission, hasAnyAdminPermission, activeWarehouse, changeWarehouse } = useAuth()
  const [activeTab, setActiveTab] = useState('')

  const WAREHOUSES = ['MATRIZ', 'PLANTA', 'MEXICO', 'MONTERREY']

  const navItems = [
    ...(hasPermission('reception') ? [{ id: 'reception', label: 'RECEPCIÓN', icon: '🚚' }] : []),
    ...(hasPermission('picking') ? [{ id: 'picking', label: 'SURTIDO', icon: '📦' }] : []),
    ...(hasPermission('monitor') ? [{ id: 'monitor', label: 'MONITOR', icon: '📊' }] : []),
    ...(hasPermission('order_status') ? [{ id: 'order_status', label: 'ESTATUS', icon: '⏳' }] : []),
    ...(hasPermission('inventory') ? [{ id: 'inventory', label: 'INVENTARIO', icon: '🏢' }] : []),
    ...(hasPermission('maquila') ? [{ id: 'maquila', label: 'MAQUILA', icon: '✂️' }] : []),
    ...(hasAnyAdminPermission ? [{ id: 'admin', label: 'ADMIN', icon: '⚙️' }] : []),
  ]

  useEffect(() => {
    if (navItems.length > 0 && !navItems.find(t => t.id === activeTab)) {
      setActiveTab(navItems[0].id)
    }
  }, [profile, activeTab]) // We can depend on profile (which changes when permissions change) and activeTab

  // ... (loading/login checks)
  if (loading) {
    return (
      <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#0b0e14',color:'white'}}>
        <div style={{width:'32px',height:'32px',border:'2px solid rgba(239,68,68,0.2)',borderTopColor:'#ef4444',borderRadius:'50%',animation:'spin 1s linear infinite'}} />
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (!user) {
    return <Login />
  }

  return (
    <div style={{minHeight:'100vh',display:'flex',flexDirection:'column',background:'#0b0e14',color:'#e2e8f0'}}>
      <div style={{display:'flex',flex:1}}>
        {/* Sidebar */}
        <aside style={{
          width:'260px',
          flexShrink:0,
          background:'rgba(2,6,23,0.9)',
          backdropFilter:'blur(20px)',
          borderRight:'1px solid rgba(255,255,255,0.06)',
          padding:'1.5rem',
          display:'flex',
          flexDirection:'column',
          zIndex:20,
        }}>
          {/* Logo */}
          <div style={{display:'flex',alignItems:'center',gap:'0.75rem',marginBottom:'2.5rem',padding:'0 0.5rem'}}>
            <div style={{
              background:'linear-gradient(135deg,#ef4444,#b91c1c)',
              padding:'0.4rem 0.8rem',
              borderRadius:'0.6rem',
              boxShadow:'0 0 20px rgba(239,68,68,0.3)',
            }}>
              <span style={{fontWeight:900,color:'white',fontSize:'0.8rem'}}>AIRMAN</span>
            </div>
            <div>
              <h1 style={{fontSize:'1.125rem',fontWeight:700,color:'white',letterSpacing:'-0.01em'}}>
                AIRMAN <span style={{color:'#ef4444'}}>WMS</span>
              </h1>
              <p style={{fontSize:'0.6rem',color:'#64748b',fontWeight:700,letterSpacing:'0.2em',textTransform:'uppercase'}}>CAJA CERRADA</p>
            </div>
          </div>

          {/* ... (rest of sidebar) ... */}
          <nav style={{flex:1,display:'flex',flexDirection:'column',gap:'0.375rem'}}>
            {navItems.map((item) => {
              const isActive = activeTab === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  style={{
                    width:'100%',
                    display:'flex',
                    alignItems:'center', gap:'0.75rem', padding:'0.875rem 1rem', borderRadius:'1rem',
                    border: isActive ? '1px solid rgba(239,68,68,0.2)' : '1px solid transparent',
                    background: isActive ? 'rgba(239,68,68,0.08)' : 'transparent',
                    color: isActive ? '#ef4444' : '#94a3b8',
                    cursor:'pointer', textAlign:'left', transition:'all 0.2s ease', position:'relative', overflow:'hidden',
                  }}
                  onMouseEnter={e => { if(!isActive) { e.currentTarget.style.background='rgba(255,255,255,0.04)'; e.currentTarget.style.color='#e2e8f0'} }}
                  onMouseLeave={e => { if(!isActive) { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='#94a3b8'} }}
                >
                  {isActive && <div style={{position:'absolute',left:0,top:0,bottom:0,width:3,background:'#ef4444',borderRadius:'0 999px 999px 0'}} />}
                  {item.icon && <span style={{ fontSize: '1.25rem', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{item.icon}</span>}
                  <span style={{fontWeight:800,fontSize:'0.75rem',letterSpacing:'0.05em'}}>{item.label}</span>
                </button>
              )
            })}
          </nav>

          <div style={{paddingTop:'1.5rem',borderTop:'1px solid rgba(255,255,255,0.05)'}}>
            <div style={{
              background:'rgba(255,255,255,0.03)',
              border:'1px solid rgba(255,255,255,0.06)',
              borderRadius:'0.875rem', padding:'0.875rem', display:'flex', alignItems:'center', gap:'0.75rem',
            }}>
              <div style={{ 
                width: 36, height: 36, borderRadius: '0.6rem', background: 'rgba(255,255,255,0.05)', 
                display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.08)',
                fontSize: '1.2rem'
              }}>
                👤
              </div>
              <div style={{flex:1, overflow:'hidden'}}>
                <p style={{fontSize:'0.8rem',fontWeight:800,color:'#f1f5f9',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',textTransform:'uppercase'}}>{profile?.name || user.email}</p>
                <div style={{display:'flex',alignItems:'center',gap:'0.375rem',marginTop:'0.1rem'}}>
                  <span style={{width:6,height:6,borderRadius:'50%',background:'#22c55e',boxShadow:'0 0 8px rgba(34,197,94,0.5)',display:'inline-block'}} />
                  <span style={{fontSize:'0.6rem',color:'#64748b',fontWeight:800,textTransform:'uppercase'}}>
                    {profile?.role === 'master' ? 'MASTER' : profile?.role === 'sales' ? 'VENTAS' : 'OPERADOR'}
                  </span>
                </div>
              </div>
              <button onClick={logout} title="SALIR" style={{
                background:'rgba(239,68,68,0.1)', border:'none', color:'#ef4444', cursor:'pointer', padding:'0.4rem 1rem', borderRadius:'0.5rem', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.75rem', fontWeight:900
              }} onMouseEnter={e => e.currentTarget.style.background='rgba(239,68,68,0.2)'} onMouseLeave={e => e.currentTarget.style.background='rgba(239,68,68,0.1)'}>
                SALIR
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main style={{flex:1,overflow:'auto',padding:'2.5rem'}}>
          {/* Header */}
          <header style={{marginBottom:'2.5rem',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div>
              <div style={{display:'flex',alignItems:'center',gap:'0.5rem',marginBottom:'0.5rem'}}>
                <span style={{display:'inline-block',width:24,height:1,background:'rgba(239,68,68,0.5)'}} />
                <span style={{fontSize:'0.6rem',fontWeight:900,letterSpacing:'0.2em',color:'#ef4444',textTransform:'uppercase'}}>
                  ALMACÉN <span style={{color:'white', marginLeft:'0.5rem', background:'rgba(239,68,68,0.2)', padding:'2px 8px', borderRadius:'4px'}}>{activeWarehouse}</span>
                </span>
              </div>
              <h2 style={{fontSize:'2.25rem',fontWeight:900,color:'white',letterSpacing:'-0.02em'}}>
                {navItems.find(i => i.id === activeTab)?.label}
              </h2>
            </div>
            
            <div style={{display:'flex',alignItems:'center',gap:'1rem'}}>
                <div style={{display:'flex', alignItems:'center', gap:'0.5rem', background:'rgba(255,255,255,0.03)', padding:'0.5rem 0.75rem', borderRadius:'0.75rem', border:'1px solid rgba(255,255,255,0.08)'}}>
                  <span style={{fontSize:'0.7rem', color:'#64748b', fontWeight:900, textTransform:'uppercase'}}>ALMACÉN ACTIVO:</span>
                  <select 
                    value={activeWarehouse} 
                    onChange={(e) => changeWarehouse(e.target.value)}
                    style={{
                      background:'transparent',
                      border:'none',
                      color:'white',
                      fontWeight:700,
                      fontSize:'0.9rem',
                      cursor:'pointer',
                      outline:'none'
                    }}
                  >
                    {WAREHOUSES.map(wh => <option key={wh} value={wh} style={{background:'#0b0e14'}}>{wh}</option>)}
                  </select>
                </div>
              
              <button style={{
                display:'flex',alignItems:'center',gap:'0.5rem',
                padding:'0.625rem 1.25rem',
                borderRadius:'0.75rem',
                background:'rgba(255,255,255,0.04)',
                border:'1px solid rgba(255,255,255,0.08)',
                color:'#94a3b8',
                cursor:'pointer',
                fontSize:'0.75rem',
                fontWeight:900,
                textTransform:'uppercase'
              }}>
                HISTORIAL
              </button>
              <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end'}}>
                <span style={{fontSize:'0.6rem',color:'#64748b',fontWeight:900,textTransform:'uppercase',letterSpacing:'0.1em'}}>ESTADO</span>
                <span style={{fontSize:'0.75rem',fontWeight:900,color:'#22c55e',display:'flex',alignItems:'center',gap:'0.25rem',textTransform:'uppercase'}}>
                  SINCRONIZADO
                </span>
              </div>
            </div>
          </header>

          {/* Content */}
          <div style={{maxWidth:'1280px',margin:'0 auto'}} className="animate-fade-in">
            {activeTab === 'reception' && <Reception />}
            {activeTab === 'picking' && <Picking />}
            {activeTab === 'monitor' && <PickingQueue />}
            {activeTab === 'order_status' && <OrderStatusMonitor />}
            {activeTab === 'inventory' && <Inventory />}
            {activeTab === 'maquila' && <Maquila />}
            {activeTab === 'admin' && <Admin />}
          </div>
        </main>
      </div>
    </div>
  )
}
