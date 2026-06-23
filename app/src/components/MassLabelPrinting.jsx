import { useState, useCallback, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { QRCodeSVG } from 'qrcode.react'
import { printLabel, printLabelsBatch, connectPrinter } from '../utils/printer'
import { useAuth } from '../context/AuthContext'
import * as XLSX from 'xlsx'

// ─── Componente de Etiqueta Imprimible por Lote ───────────────────────────────────────
function PrintableLabelBatch({ items }) {
  if (!items || items.length === 0) return null;
  return (
    <div id="printable-area-batch" style={{ position: 'fixed', top: '-9999px', left: '-9999px' }}>
      {items.map((data, index) => (
        <div key={data.inventory_id || index} className="label-page" style={{
          width: '150mm',
          height: '100mm',
          padding: '5mm 10mm',
          boxSizing: 'border-box',
          background: 'white',
          color: 'black',
          fontFamily: 'Arial, sans-serif',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '3.5pt solid black', paddingBottom: '2mm' }}>
            <span style={{ fontWeight: 900, fontSize: '24pt', letterSpacing: '1pt' }}>AIRMAN WMS</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4mm' }}>
              <span style={{ fontSize: '14pt', fontWeight: 600 }}>{data.receipt_date || new Date().toLocaleDateString('es-MX')}</span>
              <div style={{ background: 'white', padding: '1mm', border: '1px solid #eee', borderRadius: '1mm' }}>
                <QRCodeSVG 
                  value={(function() {
                    const cleanCode = (data.code || '').trim();
                    const cleanTalla = (data.talla || '').trim();
                    const cleanQty = parseInt(data.qty || data.quantity || 0);
                    const cleanOP = (data.op || '0').trim();
                    
                    let qrDate = '000000';
                    const d = new Date(data.date || new Date());
                    if (!isNaN(d.getTime())) {
                      const day = String(d.getDate()).padStart(2, '0');
                      const month = String(d.getMonth() + 1).padStart(2, '0');
                      const year = String(d.getFullYear()).substring(2);
                      qrDate = `${day}${month}${year}`;
                    }
                    
                    const pkgId = data.package_id || '000000';
                    // USAMOS { COMO SEPARADOR GLOBAL
                    return `${cleanCode}{${cleanTalla}{${cleanQty}{${cleanOP}{${qrDate}{${pkgId}`;
                  })()}
                  size={75} 
                  level="M"
                  includeMargin={false}
                />
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ fontSize: '48pt', fontWeight: 950, textAlign: 'center', letterSpacing: '0.1mm', lineHeight: '1.1', margin: '2mm 0', whiteSpace: 'nowrap', width: '100%', fontFamily: 'Arial, sans-serif' }}>
              {data.code}
            </div>
            <div style={{ fontSize: '14pt', fontWeight: 700, textAlign: 'center', lineHeight: '1.2', maxHeight: '18mm', overflow: 'hidden', textTransform: 'uppercase', width: '100%', opacity: 0.95 }}>
              {data.description || 'SIN DESCRIPCIÓN'}
            </div>
          </div>

          {/* Footer Info */}
          <div style={{ display: 'flex', borderTop: '3.5pt solid black', paddingTop: '3mm' }}>
            <div style={{ flex: '0 0 50mm', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontSize: '9pt', textTransform: 'uppercase', display: 'block', fontWeight: 700 }}>TALLA</span>
                <span style={{ fontSize: '26pt', fontWeight: 900, lineHeight: 1 }}>{data.talla}</span>
              </div>
              <div style={{ marginTop: '2mm' }}>
                <span style={{ fontSize: '11pt', fontWeight: 900 }}>OP: {data.op || 'S/OP'}</span>
              </div>
            </div>
            <div style={{ flex: '1', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontSize: '9pt', textTransform: 'uppercase', display: 'block', fontWeight: 700 }}>CANT.</span>
                <span style={{ fontSize: '26pt', fontWeight: 900, lineHeight: 1 }}>{data.qty || data.quantity} <small style={{fontSize:'14pt'}}>PZ</small></span>
              </div>
              <div style={{ marginTop: '2mm' }}>
                <span style={{ fontSize: '11pt', fontWeight: 900 }}>PKG: {data.package_id || '000000'}</span>
              </div>
            </div>
            <div style={{ flex: '0 0 45mm', textAlign: 'right', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
              <span style={{ fontSize: '9pt', textTransform: 'uppercase', display: 'block', fontWeight: 700 }}>LOC.</span>
              <span style={{ fontSize: '34pt', fontWeight: 900, lineHeight: 1 }}>{data.location}</span>
            </div>
          </div>
        </div>
      ))}

      <style>{`
        @page { size: 150mm 100mm; margin: 0; }
        @media print {
          html, body {
            height: 100mm !important;
            width: 150mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          body * { visibility: hidden !important; }
          #printable-area-batch, #printable-area-batch * { visibility: visible !important; }
          #printable-area-batch {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 150mm !important;
            display: block !important;
            box-sizing: border-box !important;
          }
          .label-page {
            page-break-after: always;
            break-after: page;
          }
        }
      `}</style>
    </div>
  )
}

export default function MassLabelPrinting() {
  const { profile, activeWarehouse, isAdmin } = useAuth()
  const [activeTab, setActiveTab] = useState('print') // 'print' o 'history'
  const [warehouse, setWarehouse] = useState(activeWarehouse || 'MEXICO')
  const [rack, setRack] = useState('A')
  const [rangeStart, setRangeStart] = useState('100')
  const [rangeEnd, setRangeEnd] = useState('200')
  
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState([])
  const [printing, setPrinting] = useState(false)
  const [printProgress, setPrintProgress] = useState(0)
  const [message, setMessage] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [printBatchData, setPrintBatchData] = useState(null)

  const showMsg = (type, text) => {
    setMessage({ type, text: text.toUpperCase() })
    setTimeout(() => setMessage(null), 4000)
  }

  const handleConnect = async () => {
    const port = await connectPrinter()
    if (port) {
      setIsConnected(true)
      showMsg('success', 'IMPRESORA CONECTADA CORRECTAMENTE.')
    } else {
      showMsg('error', 'NO SE PUDO CONECTAR A LA IMPRESORA.')
    }
  }

  const fetchInventory = async () => {
    setLoading(true)
    setItems([])
    try {
      const { data, error } = await supabase
        .from('inventory')
        .select(`
          id,
          talla,
          quantity,
          op,
          entry_date,
          warehouse,
          location_id,
          package_id,
          locations (name),
          product_id,
          products (code, description)
        `)
      .eq('warehouse', warehouse)

      if (error) throw error

      const filtered = (data || []).filter(item => {
        const locName = item.locations?.name || ''
        if (!locName.startsWith(rack)) return false
        const numPart = parseInt(locName.substring(rack.length))
        if (isNaN(numPart)) return false
        const start = parseInt(rangeStart)
        const end = parseInt(rangeEnd)
        return numPart >= start && numPart <= end
      })
      
      filtered.sort((a, b) => (a.locations?.name || '').localeCompare(b.locations?.name || ''))
      setItems(filtered)
      if (filtered.length === 0) {
        showMsg('error', 'NO SE ENCONTRARON CAJAS EN ESE RANGO.')
      }
    } catch (err) {
      console.error(err)
      showMsg('error', 'ERROR AL BUSCAR INVENTARIO: ' + err.message)
    }
    setLoading(false)
  }

  const handlePrintAll = async () => {
    if (items.length === 0) return
    if (!window.confirm(`¿SEGURO QUE DESEAS IMPRIMIR ${items.length} ETIQUETAS?`)) return

    setPrinting(true)
    setPrintProgress(0)
    
    const batchData = []
    for (let i = 0; i < items.length; i++) {
        let item = items[i]
        let pkgId = item.package_id
        if (!pkgId) {
          pkgId = Math.floor(100000 + Math.random() * 900000).toString()
          await supabase.from('inventory').update({ package_id: pkgId }).eq('id', item.id)
          item.package_id = pkgId
        }

        batchData.push({
          code: item.products.code,
          description: item.products.description,
          talla: item.talla,
          quantity: item.quantity,
          op: item.op,
          location: item.locations?.name || 'S/L',
          date: item.entry_date,
          inventory_id: item.id,
          warehouse: item.warehouse,
          package_id: pkgId
        })
    }

    if (profile?.printMode === 'direct') {
      const result = await printLabelsBatch(batchData, (progress) => {
        setPrintProgress(progress)
      })
      setPrinting(false)
      if (result.success) {
        showMsg('success', `¡${items.length} ETIQUETAS ENVIADAS CON ÉXITO!`)
      } else {
        showMsg('error', 'ERROR EN LA IMPRESIÓN MASIVA: ' + result.error)
      }
    } else {
      setPrintBatchData(batchData)
      setTimeout(() => {
        window.print();
        setPrinting(false);
        showMsg('success', `¡${items.length} ETIQUETAS ENVIADAS AL NAVEGADOR!`);
      }, 500);
    }
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* PESTAÑAS DE NAVEGACIÓN */}
      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem' }}>
        <button 
          onClick={() => setActiveTab('print')}
          style={{ 
            background: activeTab === 'print' ? 'rgba(220,38,38,0.1)' : 'transparent',
            color: activeTab === 'print' ? '#ef4444' : '#64748b',
            border: activeTab === 'print' ? '1px solid #ef4444' : '1px solid transparent',
            padding: '0.75rem 1.5rem', borderRadius: '1rem', fontWeight: 900, cursor: 'pointer', fontSize: '0.8rem'
          }}
        >
          [IMPRESIÓN MASIVA]
        </button>
        <button 
          onClick={() => setActiveTab('history')}
          style={{ 
            background: activeTab === 'history' ? 'rgba(220,38,38,0.1)' : 'transparent',
            color: activeTab === 'history' ? '#ef4444' : '#64748b',
            border: activeTab === 'history' ? '1px solid #ef4444' : '1px solid transparent',
            padding: '0.75rem 1.5rem', borderRadius: '1rem', fontWeight: 900, cursor: 'pointer', fontSize: '0.8rem'
          }}
        >
          [HISTORIAL DE ETIQUETADO]
        </button>
      </div>

      {activeTab === 'print' ? (
        <>
          <PrintableLabelBatch items={printBatchData} />
          
          <div className="glass" style={{ padding: '2.5rem', borderRadius: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ 
                width: 48, height: 48, borderRadius: '1rem', 
                background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center' 
              }}>
                <span style={{ color: '#dc2626', fontWeight: 900 }}>[IMPR]</span>
              </div>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: 'white', textTransform: 'uppercase' }}>IMPRESIÓN MASIVA DE ETIQUETAS</h3>
                <p style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>GENERA CÓDIGOS QR CON PACKAGE ID PARA CONTROL KANBAN</p>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                {profile?.printMode === 'direct' && (
                  <button 
                    onClick={handleConnect}
                    style={{ 
                      background: isConnected ? 'rgba(34,197,94,0.1)' : 'white', 
                      color: isConnected ? '#4ade80' : '#0f172a',
                      border: isConnected ? '1px solid rgba(34,197,94,0.2)' : 'none',
                      padding: '0.75rem 1.5rem', borderRadius: '1rem', fontWeight: 900, fontSize: '0.75rem',
                      display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer'
                    }}
                  >
                    {isConnected ? '[IMPRESORA CONECTADA]' : '[CONECTAR IMPRESORA RS232]'}
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.65rem', fontWeight: 900, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.1em' }}>ALMACÉN</label>
                <select 
                  value={warehouse} 
                  onChange={e => setWarehouse(e.target.value)}
                  style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '1rem', padding: '1rem', color: 'white', fontWeight: 700, outline: 'none' }}
                >
                  <option value="MEXICO">MEXICO</option>
                  <option value="MONTERREY">MONTERREY</option>
                  <option value="MATRIZ">MATRIZ</option>
                  <option value="PLANTA">PLANTA</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.65rem', fontWeight: 900, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.1em' }}>RACK (LETRA)</label>
                <input 
                  type="text" 
                  value={rack} 
                  onChange={e => setRack(e.target.value.toUpperCase())}
                  placeholder="EJ: A"
                  style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '1rem', padding: '1rem', color: 'white', fontWeight: 900, outline: 'none', textAlign: 'center' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.65rem', fontWeight: 900, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.1em' }}>DESDE (#)</label>
                <input 
                  type="number" 
                  value={rangeStart} 
                  onChange={e => setRangeStart(e.target.value)}
                  style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '1rem', padding: '1rem', color: 'white', fontWeight: 700, outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.65rem', fontWeight: 900, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.1em' }}>HASTA (#)</label>
                <input 
                  type="number" 
                  value={rangeEnd} 
                  onChange={e => setRangeEnd(e.target.value)}
                  style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '1rem', padding: '1rem', color: 'white', fontWeight: 700, outline: 'none' }}
                />
              </div>
            </div>

            <button 
              onClick={fetchInventory}
              disabled={loading || printing}
              style={{ 
                background: 'white', color: '#0f172a', padding: '1.25rem', borderRadius: '1.25rem', fontWeight: 900, fontSize: '0.85rem', 
                border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem',
                transition: 'all 0.2s'
              }}
            >
              {loading ? '[CARGANDO...]' : '[BUSCAR CAJAS EN EL RACK]'}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
            <div className="glass" style={{ padding: '2rem', borderRadius: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', maxHeight: '600px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 900, color: 'white', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  RESULTADOS: {items.length}
                </h4>
              </div>

              <div className="custom-scrollbar" style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingRight: '0.5rem' }}>
                {items.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem', color: '#475569' }}>
                    <p style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>NO HAY DATOS PARA MOSTRAR.<br/>REALIZA UNA BÚSQUEDA.</p>
                  </div>
                ) : (
                  items.map((item, idx) => (
                    <div key={item.id} style={{ 
                      background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '1rem', 
                      border: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: '1rem'
                    }}>
                      <div style={{ 
                        width: 32, height: 32, borderRadius: '0.5rem', background: 'rgba(255,255,255,0.05)', 
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 900, color: '#64748b' 
                      }}>
                        {idx + 1}
                      </div>
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <p style={{ color: 'white', fontWeight: 900, fontSize: '0.8rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{item.products?.code}</p>
                        <p style={{ color: '#64748b', fontSize: '0.6rem', fontWeight: 600, textTransform: 'uppercase' }}>{item.talla} · {item.quantity} PZAS</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#dc2626' }}>{item.locations?.name}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="glass" style={{ padding: '2.5rem', borderRadius: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem', justifyContent: 'center', textAlign: 'center' }}>
              {printing ? (
                <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', alignItems: 'center' }}>
                  <div style={{ position: 'relative', width: 120, height: 120 }}>
                    <svg width="120" height="120" viewBox="0 0 120 120">
                      <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                      <circle 
                        cx="60" cy="60" r="54" fill="none" stroke="#dc2626" strokeWidth="8" 
                        strokeDasharray={2 * Math.PI * 54} 
                        strokeDashoffset={2 * Math.PI * 54 * (1 - printProgress / 100)} 
                        style={{ transition: 'stroke-dashoffset 0.5s ease', transform: 'rotate(-90deg)', transformOrigin: 'center' }}
                      />
                    </svg>
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                      <span style={{ fontSize: '1.5rem', fontWeight: 900, color: 'white' }}>{printProgress}%</span>
                      <span style={{ fontSize: '0.5rem', color: '#64748b', fontWeight: 900 }}>IMPRIMIENDO</span>
                    </div>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 500, textTransform: 'uppercase' }}>ENVIANDO ETIQUETAS A LA IMPRESORA TSC...</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', alignItems: 'center' }}>
                  <div style={{ 
                    width: 80, height: 80, borderRadius: '2rem', 
                    background: items.length > 0 ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.05)', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center' 
                  }}>
                    <span style={{ color: items.length > 0 ? '#4ade80' : '#475569', fontWeight: 900, fontSize: '1.5rem' }}>[!]</span>
                  </div>
                  <div>
                    <h4 style={{ fontSize: '1rem', fontWeight: 900, color: 'white', textTransform: 'uppercase' }}>LISTOS PARA IMPRIMIR</h4>
                    <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem', textTransform: 'uppercase' }}>SE GENERARÁN {items.length} ETIQUETAS FÍSICAS.</p>
                  </div>
                  
                  <button 
                    onClick={handlePrintAll}
                    disabled={items.length === 0 || printing}
                    style={{ 
                      width: '100%', padding: '1.25rem', borderRadius: '1.25rem', border: 'none',
                      background: items.length > 0 ? '#dc2626' : 'rgba(255,255,255,0.05)',
                      color: 'white', fontWeight: 900, fontSize: '0.85rem', cursor: items.length > 0 ? 'pointer' : 'default',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem',
                      boxShadow: items.length > 0 ? '0 10px 20px rgba(220,38,38,0.3)' : 'none'
                    }}
                  >
                    [LANZAR IMPRESIÓN MASIVA]
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <MassLabelHistory />
      )}

      {/* Notifications */}
      {message && (
        <div className="animate-slide-up" style={{ 
          position: 'fixed', bottom: '2rem', right: '2rem', padding: '1.5rem', borderRadius: '1.5rem', 
          background: message.type === 'success' ? '#10b981' : '#ef4444',
          border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '1rem', zIndex: 100, boxShadow: '0 20px 40px rgba(0,0,0,0.4)'
        }}>
          <span style={{ color: 'white', fontWeight: 900, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{message.text}</span>
        </div>
      )}

    </div>
  )
}

function MassLabelHistory() {
  const { profile, isAdmin } = useAuth()
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState([])
  const [dateRange, setDateRange] = useState({
    start: new Date().toISOString().slice(0, 10),
    end: new Date().toISOString().slice(0, 10)
  })

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('maquila_production_labels')
        .select('*')
        .order('printed_at', { ascending: false })

      if (isAdmin) {
        query = query.gte('printed_at', `${dateRange.start}T00:00:00Z`)
                     .lte('printed_at', `${dateRange.end}T23:59:59Z`)
      } else {
        // Maquila solo ve hoy
        const today = new Date().toISOString().slice(0, 10)
        query = query.gte('printed_at', `${today}T00:00:00Z`)
                     .lte('printed_at', `${today}T23:59:59Z`)
      }

      const { data, error } = await query
      if (error) throw error
      setItems(data || [])
    } catch (err) {
      console.error(err)
      alert('ERROR AL CARGAR HISTORIAL: ' + err.message)
    }
    setLoading(false)
  }, [isAdmin, dateRange])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  const exportToExcel = () => {
    const data = items.map(i => ({
      'FECHA IMPRESIÓN': new Date(i.printed_at).toLocaleString(),
      'TALLA': i.talla,
      'CANTIDAD': i.qty_per_label,
      'OP': i.op,
      'PAQUETE ID': i.package_id,
      'AUDITOR': i.auditor,
      'MAQUILA': i.maquila_name
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Historial_Etiquetas')
    XLSX.writeFile(wb, `HISTORIAL_ETIQUETAS_${dateRange.start}_AL_${dateRange.end}.xlsx`)
  }

  return (
    <div className="glass animate-fade-in" style={{ padding: '2.5rem', borderRadius: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: 'white', textTransform: 'uppercase' }}>HISTORIAL DE ETIQUETADO</h3>
          <p style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
            {isAdmin ? 'CONSULTA Y EXPORTA EL HISTORIAL DE IMPRESIÓN.' : 'VISUALIZA LAS ETIQUETAS GENERADAS EL DÍA DE HOY.'}
          </p>
        </div>
        {isAdmin && (
          <button 
            onClick={exportToExcel}
            disabled={items.length === 0}
            style={{ 
              background: '#4ade80', color: '#064e3b', padding: '0.75rem 1.5rem', borderRadius: '1rem', fontWeight: 900, fontSize: '0.75rem', 
              border: 'none', cursor: 'pointer', textTransform: 'uppercase'
            }}
          >
            [EXPORTAR EXCEL]
          </button>
        )}
      </div>

      {isAdmin && (
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.6rem', fontWeight: 900, color: '#475569', textTransform: 'uppercase' }}>FECHA INICIO</label>
            <input 
              type="date" 
              value={dateRange.start}
              onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
              style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem', padding: '0.6rem', color: 'white', outline: 'none' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.6rem', fontWeight: 900, color: '#475569', textTransform: 'uppercase' }}>FECHA FIN</label>
            <input 
              type="date" 
              value={dateRange.end}
              onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem', padding: '0.6rem', color: 'white', outline: 'none' }}
            />
          </div>
        </div>
      )}

      <div style={{ maxHeight: '500px', overflowY: 'auto' }} className="custom-scrollbar">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#64748b' }}>
              <th style={{ padding: '1rem', textAlign: 'left', textTransform: 'uppercase' }}>FECHA</th>
              <th style={{ padding: '1rem', textAlign: 'left', textTransform: 'uppercase' }}>TALLA</th>
              <th style={{ padding: '1rem', textAlign: 'left', textTransform: 'uppercase' }}>CANT.</th>
              <th style={{ padding: '1rem', textAlign: 'left', textTransform: 'uppercase' }}>OP</th>
              <th style={{ padding: '1rem', textAlign: 'left', textTransform: 'uppercase' }}>PKG ID</th>
              <th style={{ padding: '1rem', textAlign: 'left', textTransform: 'uppercase' }}>MAQUILA</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>CARGANDO...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan="6" style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>NO SE ENCONTRARON REGISTROS.</td></tr>
            ) : items.map(item => (
              <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', color: 'white' }}>
                <td style={{ padding: '1rem' }}>{new Date(item.printed_at).toLocaleDateString()}</td>
                <td style={{ padding: '1rem', fontWeight: 900 }}>{item.talla}</td>
                <td style={{ padding: '1rem' }}>{item.qty_per_label}</td>
                <td style={{ padding: '1rem' }}>{item.op}</td>
                <td style={{ padding: '1rem' }}>{item.package_id}</td>
                <td style={{ padding: '1rem' }}>{item.maquila_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
