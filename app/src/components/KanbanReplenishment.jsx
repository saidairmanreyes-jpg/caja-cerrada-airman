import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { generateKanbanPDF } from '../utils/kanbanPDF'


export default function KanbanReplenishment({ showMessage }) {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('alerts')
  const [loading, setLoading] = useState(false)
  const [alerts, setAlerts] = useState([])
  const [replenishments, setReplenishments] = useState([])
  const [selectedReplenishment, setSelectedReplenishment] = useState(null)
  const [scannedCode, setScannedCode] = useState('')

  useEffect(() => {
    if (activeTab === 'alerts') findGaps()
    if (activeTab === 'orders') fetchReplenishments()
  }, [activeTab])

  const findGaps = async () => {
    setLoading(true)
    try {
      const [{ data: configs }, { data: inventory }, { data: activeLines }] = await Promise.all([
        supabase.from('kanban_config').select('*').eq('active', true),
        supabase.from('inventory').select('warehouse, talla, quantity, products(code)').is('kanban_replenishment_id', null),
        supabase.from('kanban_replenishment_lines').select('code, talla, cajas_solicitadas, cajas_escaneadas, kanban_replenishments(warehouse_dest)').neq('status', 'COMPLETADO')
      ])

      // Calculate pending in transit
      const transitMap = {}
      activeLines?.forEach(l => {
        const key = `${l.code}-${l.talla}-${l.kanban_replenishments?.warehouse_dest}`
        const pending = l.cajas_solicitadas - (l.cajas_escaneadas || 0)
        transitMap[key] = (transitMap[key] || 0) + pending
      })

      const stockMap = {}
      inventory?.forEach(item => {
        const key = `${item.products.code}-${item.talla}-${item.warehouse}`
        stockMap[key] = (stockMap[key] || 0) + item.quantity
      })

      const calculatedAlerts = configs.map(cfg => {
        const key = `${cfg.code}-${cfg.talla}-${cfg.warehouse_dest}`
        const current = stockMap[key] || 0
        const transit = transitMap[key] || 0
        const virtualStock = current + transit
        
        if (virtualStock < cfg.stock_minimo) {
          const plantaStock = stockMap[`${cfg.code}-${cfg.talla}-PLANTA`] || 0
          const matrizStock = stockMap[`${cfg.code}-${cfg.talla}-MATRIZ`] || 0
          
          let source = 'NONE'
          if (plantaStock > 0) source = 'PLANTA'
          else if (matrizStock > 0) source = 'MATRIZ'

          return {
            ...cfg,
            current_stock: current,
            transit,
            needed: cfg.stock_reposicion - virtualStock,
            suggested_source: source,
            source_stock: source === 'PLANTA' ? plantaStock : matrizStock
          }
        }
        return null
      }).filter(a => a !== null)

      setAlerts(calculatedAlerts)
    } catch (err) {
      console.error('Error finding gaps:', err)
      showMessage('error', 'ERROR AL PROCESAR ALERTAS DE RESURTIDO')
    } finally {
      setLoading(false)
    }
  }

  const fetchReplenishments = async () => {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('kanban_replenishments')
        .select('*, kanban_replenishment_lines(*)')
        .order('created_at', { ascending: false })
        .limit(50)
      if (data) setReplenishments(data)
    } catch (err) {
      console.error('Error fetching replenishments:', err)
    } finally {
      setLoading(false)
    }
  }

  const generateOrders = async () => {
    if (alerts.length === 0) return
    setLoading(true)

    const bySource = alerts.reduce((acc, a) => {
      if (a.suggested_source === 'NONE') return acc
      if (!acc[a.suggested_source]) acc[acc.suggested_source] = []
      acc[a.suggested_source].push(a)
      return acc
    }, {})

    for (const source in bySource) {
      const folio = `KAN-${source.slice(0,1)}-${Date.now().toString().slice(-6)}`
      const { data: header, error: hErr } = await supabase
        .from('kanban_replenishments')
        .insert({
          folio,
          warehouse_origin: source,
          warehouse_dest: 'MIXED',
          status: 'PENDIENTE',
          created_by: user?.email
        })
        .select().single()

      if (!hErr) {
        const lines = bySource[source].map(a => ({
          replenishment_id: header.id,
          code: a.code,
          talla: a.talla,
          cajas_solicitadas: Math.min(a.needed, a.source_stock),
          status: 'PENDIENTE'
        }))
        await supabase.from('kanban_replenishment_lines').insert(lines)
      }
    }

    showMessage('success', 'ÓRDENES DE RESURTIDO GENERADAS POR PRIORIDAD')
    setActiveTab('orders')
    setLoading(false)
  }

  const handleScanBox = async (e) => {
    if (e) e.preventDefault()
    if (!scannedCode || !selectedReplenishment) return
    
    // Format expected: MODEL|SIZE|INVENTORY_ID
    const parts = scannedCode.split('|')
    if (parts.length < 3) {
      showMessage('error', 'CÓDIGO QR INVÁLIDO (USE MODELO|TALLA|ID)')
      setScannedCode('')
      return
    }
    const [scCode, scTalla, scInvId] = parts

    const line = selectedReplenishment.kanban_replenishment_lines.find(l => 
      l.code === scCode && l.talla === scTalla && (l.cajas_escaneadas || 0) < l.cajas_solicitadas
    )

    if (!line) {
      showMessage('error', 'CAJA NO REQUERIDA EN ESTA ORDEN O YA COMPLETA')
      setScannedCode('')
      return
    }

    setLoading(true)
    const { error: invErr } = await supabase
      .from('inventory')
      .update({ 
        kanban_replenishment_id: selectedReplenishment.id,
        warehouse: 'TRANSITO'
      })
      .eq('id', scInvId)
      .eq('warehouse', selectedReplenishment.warehouse_origin)
      .is('kanban_replenishment_id', null)

    if (invErr) {
      showMessage('error', 'CAJA NO DISPONIBLE EN ORIGEN O YA RESERVADA')
      setScannedCode('')
      setLoading(false)
      return
    }

    const newScanCount = (line.cajas_escaneadas || 0) + 1
    await supabase.from('kanban_replenishment_lines').update({ 
      cajas_escaneadas: newScanCount,
      status: newScanCount >= line.cajas_solicitadas ? 'COMPLETADO' : 'EN PROCESO'
    }).eq('id', line.id)

    // Update main order status if all lines are done
    const updatedLines = selectedReplenishment.kanban_replenishment_lines.map(l => 
      l.id === line.id ? { ...l, cajas_escaneadas: newScanCount, status: newScanCount >= l.cajas_solicitadas ? 'COMPLETADO' : 'EN PROCESO' } : l
    )
    const allDone = updatedLines.every(l => l.status === 'COMPLETADO')
    if (allDone) {
      await supabase.from('kanban_replenishments').update({ status: 'TRANSITO' }).eq('id', selectedReplenishment.id)
    }

    showMessage('success', `CAJA ${scCode}-${scTalla} VINCULADA Y EN TRÁNSITO`)
    setScannedCode('')
    fetchReplenishments()
    setLoading(false)
  }

  const handleDownloadPDF = () => {
    if (!selectedReplenishment) return
    generateKanbanPDF(selectedReplenishment)
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <button 
          onClick={() => setActiveTab('alerts')} 
          style={{ 
            padding: '1rem', background: 'none', border: 'none', 
            borderBottom: activeTab === 'alerts' ? '2px solid #10b981' : 'none', 
            color: activeTab === 'alerts' ? '#10b981' : '#64748b', 
            fontWeight: 900, cursor: 'pointer', fontSize: '0.7rem' 
          }}
        >
          EXISTENCIAS CRÍTICAS
        </button>
        <button 
          onClick={() => setActiveTab('orders')} 
          style={{ 
            padding: '1rem', background: 'none', border: 'none', 
            borderBottom: activeTab === 'orders' ? '2px solid #3b82f6' : 'none', 
            color: activeTab === 'orders' ? '#3b82f6' : '#64748b', 
            fontWeight: 900, cursor: 'pointer', fontSize: '0.7rem' 
          }}
        >
          ÓRDENES / PICKING
        </button>
      </div>

      {activeTab === 'alerts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '0.8rem', fontWeight: 900 }}>REPOSICIÓN INTELIGENTE (PLANTA &gt; MATRIZ)</h3>
            <button 
              onClick={generateOrders} 
              disabled={loading || alerts.length === 0} 
              style={{ 
                background: '#10b981', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '1rem', 
                border: 'none', fontWeight: 900, fontSize: '0.65rem', cursor: 'pointer', display: 'flex', 
                alignItems: 'center', gap: '0.5rem' 
              }}
            >
              {loading ? 'GENERANDO...' : 'GENERAR ÓRDENES'}
            </button>
          </div>
          
          <div className="glass" style={{ borderRadius: '1.5rem', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.02)', color: '#64748b', textAlign: 'left' }}>
                  <th style={{ padding: '1rem' }}>CÓDIGO</th>
                  <th style={{ padding: '1rem' }}>TALLA</th>
                  <th style={{ padding: '1rem' }}>DESTINO</th>
                  <th style={{ padding: '1rem', textAlign: 'center' }}>STOCK ACTUAL</th>
                  <th style={{ padding: '1rem', textAlign: 'center' }}>FALTANTE</th>
                  <th style={{ padding: '1rem', textAlign: 'center' }}>FUENTE SUGERIDA</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', color: 'white' }}>
                    <td style={{ padding: '1rem', fontWeight: 800 }}>{a.code}</td>
                    <td style={{ padding: '1rem' }}>{a.talla}</td>
                    <td style={{ padding: '1rem' }}><span style={{ color: '#10b981', fontWeight: 900 }}>{a.warehouse_dest}</span></td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>{a.current_stock} <small style={{color:'#64748b'}}>({a.transit} en camino)</small></td>
                    <td style={{ padding: '1rem', textAlign: 'center', color: '#ef4444', fontWeight: 900 }}>{a.needed}</td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      <span style={{ 
                        padding: '0.2rem 0.5rem', borderRadius: '0.5rem', fontSize: '0.6rem', fontWeight: 900,
                        background: a.suggested_source === 'NONE' ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,246,0.1)',
                        color: a.suggested_source === 'NONE' ? '#ef4444' : '#3b82f6'
                      }}>
                        {a.suggested_source === 'NONE' ? 'SIN STOCK' : `${a.suggested_source} (${a.source_stock})`}
                      </span>
                    </td>
                  </tr>
                ))}
                {alerts.length === 0 && !loading && (
                  <tr>
                    <td colSpan="6" style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>NO HAY ALERTAS CRÍTICAS DE STOCK.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'orders' && !selectedReplenishment && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
          {replenishments.map(r => {
            const sc = r.kanban_replenishment_lines?.reduce((acc, l) => acc + (l.cajas_escaneadas || 0), 0) || 0
            const so = r.kanban_replenishment_lines?.reduce((acc, l) => acc + l.cajas_solicitadas, 0) || 0
            const pct = so > 0 ? (sc / so) * 100 : 0
            return (
              <div 
                key={r.id} 
                onClick={() => setSelectedReplenishment(r)} 
                style={{ 
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', 
                  borderRadius: '1.5rem', padding: '1.5rem', cursor: 'pointer', transition: 'transform 0.2s'
                }}
                className="hover-scale"
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: 900, color: '#10b981', fontSize: '0.9rem' }}>{r.folio}</span>
                  <span style={{ 
                    fontSize: '0.6rem', padding: '0.2rem 0.5rem', borderRadius: '0.5rem', fontWeight: 900, 
                    background: r.status === 'TRANSITO' ? '#f59e0b' : r.status === 'COMPLETADO' ? '#10b981' : '#3b82f6' 
                  }}>
                    {r.status}
                  </span>
                </div>
                <div style={{ fontSize: '0.65rem', color: '#64748b', display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <span>ORIGEN: <strong>{r.warehouse_origin}</strong></span>
                  <span>{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', marginBottom: '0.4rem', fontWeight: 800 }}>
                  <span>PROGRESO DE PICKING</span>
                  <span>{sc} / {so} CAJAS</span>
                </div>
                <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: '#10b981', width: `${pct}%`, transition: 'width 0.3s' }}></div>
                </div>
              </div>
            )
          })}
          {replenishments.length === 0 && !loading && (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b', width: '100%' }}>NO HAY ÓRDENES RECIENTES.</div>
          )}
        </div>
      )}

      {selectedReplenishment && (
        <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
             <button 
               onClick={() => setSelectedReplenishment(null)} 
               style={{ 
                 background: 'rgba(255,255,255,0.05)', border: 'none', padding: '0.6rem 1.2rem', 
                 borderRadius: '0.75rem', color: 'white', fontWeight: 800, cursor: 'pointer', fontSize: '0.7rem' 
               }}
             >
               ← VOLVER
             </button>
             <h2 style={{ fontSize: '1rem', fontWeight: 900 }}>PICKING: {selectedReplenishment.folio}</h2>
             <button 
               onClick={handleDownloadPDF}
               style={{ 
                 background: '#3b82f6', color: 'white', padding: '0.6rem 1.2rem', borderRadius: '0.75rem', 
                 border: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 900, 
                 fontSize: '0.7rem', cursor: 'pointer' 
               }}
             >
               <span style={{ fontSize: '14px' }}>📄</span> HOJA DE SURTIDO (PDF)
             </button>
          </div>

          <div style={{ 
            background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.1)', 
            padding: '2rem', borderRadius: '1.5rem', textAlign: 'center' 
          }}>
            <p style={{ fontSize: '0.65rem', fontWeight: 900, color: '#10b981', textTransform: 'uppercase', marginBottom: '1rem' }}>
              ESCANEAR CAJAS EN {selectedReplenishment.warehouse_origin} (ENVIAR A TRÁNSITO)
            </p>
            <form onSubmit={handleScanBox} style={{ maxWidth: '400px', margin: '0 auto' }}>
              <div style={{ position: 'relative' }}>
                <input 
                   type="text" autoFocus placeholder="ESCANEAR QR DE CAJA..." 
                  value={scannedCode} 
                  onChange={e => setScannedCode(e.target.value)}
                  style={{ 
                    width: '100%', background: 'rgba(0,0,0,0.2)', border: '2px solid rgba(16,185,129,0.3)', 
                    borderRadius: '1rem', padding: '1rem', color: 'white', fontWeight: 800, 
                    outline: 'none', fontSize: '1.1rem', textAlign: 'center'
                  }}
                />
              </div>
            </form>
          </div>

          <div className="glass" style={{ borderRadius: '1.5rem', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.02)', color: '#64748b', textAlign: 'left' }}>
                  <th style={{ padding: '1rem' }}>PRODUCTO</th>
                  <th style={{ padding: '1rem', textAlign: 'center' }}>REQUERIDO</th>
                  <th style={{ padding: '1rem', textAlign: 'center' }}>ESCANEADO</th>
                  <th style={{ padding: '1rem', textAlign: 'center' }}>ESTATUS</th>
                </tr>
              </thead>
              <tbody>
                {selectedReplenishment.kanban_replenishment_lines?.map(l => (
                  <tr key={l.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', color: 'white' }}>
                    <td style={{ padding: '1rem', fontWeight: 800 }}>{l.code} - {l.talla}</td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>{l.cajas_solicitadas}</td>
                    <td style={{ 
                      padding: '1rem', textAlign: 'center', fontWeight: 900, 
                      color: (l.cajas_escaneadas || 0) >= l.cajas_solicitadas ? '#10b981' : 'white' 
                    }}>
                      {l.cajas_escaneadas || 0}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      <span style={{ 
                        fontSize: '0.6rem', fontWeight: 900, 
                        color: l.status === 'COMPLETADO' ? '#10b981' : '#f59e0b' 
                      }}>
                        {l.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
