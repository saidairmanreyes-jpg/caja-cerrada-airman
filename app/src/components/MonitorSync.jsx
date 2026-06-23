import { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

export default function MonitorSync() {
  const { activeWarehouse } = useAuth()
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [detectedType, setDetectedType] = useState(null) // 'monitor' | 'surtimiento' | null
  const [progress, setProgress] = useState({ current: 0, total: 0 })

  const parseDate = (val) => {
    if (!val || val === '-') return null
    if (typeof val === 'number' || (!isNaN(Number(val)) && String(val).length < 6)) {
      const excelEpoch = new Date(1899, 11, 30)
      return new Date(excelEpoch.getTime() + Number(val) * 86400000).toISOString()
    }
    const str = String(val).trim()
    const dmyMatch = str.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4}) (\d{1,2}):(\d{1,2})$/)
    if (dmyMatch) {
      return new Date(`${dmyMatch[3]}-${dmyMatch[2].padStart(2,'0')}-${dmyMatch[1].padStart(2,'0')}T${dmyMatch[4]}:${dmyMatch[5]}:00`).toISOString()
    }
    const d = new Date(str)
    return isNaN(d) ? null : d.toISOString()
  }

  const handleFileChange = (e) => {
    const f = e.target.files[0]
    if (f) { 
      setFile(f)
      setError(null)
      setSuccess(null)
      detectFileType(f)
    }
  }

  const detectFileType = (f) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })
        
        if (rows.length > 0) {
          const headerRow = rows[0].join(' ').toUpperCase()
          if (headerRow.includes('MONITOR DE OPERACIONES') || (rows[1] && rows[1].join(' ').toUpperCase().includes('FOLIO'))) {
            setDetectedType('monitor')
          } 
          else if (headerRow.includes('CANTIDAD SURTIDA') || headerRow.includes('VENTA')) {
            setDetectedType('surtimiento')
          } else {
            setDetectedType(null)
            setError('FORMATO DE ARCHIVO NO RECONOCIDO. NO SE ENCONTRARON COLUMNAS DE MONITOR NI DE SURTIMIENTO.')
          }
        }
      } catch (err) {
        setError('ERROR LEYENDO ESTRUCTURA DE ARCHIVO: ' + err.message.toUpperCase())
      }
    }
    reader.readAsArrayBuffer(f)
  }

  const processMonitor = async (rows) => {
    const validRows = rows.filter(r => r.Folio || r.Venta)
    setProgress({ current: 0, total: validRows.length })
    let processed = 0

    for (const row of validRows) {
      const pedidoNum = parseInt(row.Venta || row.Cotización || 0)
      if (!pedidoNum) continue

      const folio = String(row.Folio || '').toUpperCase()
      const cliente = String(row.Cliente || '').toUpperCase()
      const ejecutivo = String(row['Ejecutivo de Venta'] || '').toUpperCase()
      const conProceso = String(row['Con Proceso.'] || '').toUpperCase() === 'SI'
      
      const surtido = String(row.Surtido || '').toUpperCase() === 'SI'
      const bordado = String(row.Bordado || '').toUpperCase() === 'SI'
      const serigrafia = String(row.Serigrafia || '').toUpperCase() === 'SI'
      const empaque = String(row.Empaque || '').toUpperCase() === 'SI'
      const logistica = String(row.Logistica || '').toUpperCase() === 'SI'
      const observations = String(row.Observaciones || row.Incidencias || '').toUpperCase()

      const cancelado = String(row.Cancelado || '').toUpperCase() === 'SI'
      const fechaCancelado = parseDate(row['Fecha de Cancelado'])
      const usuarioCancelado = String(row['Usuario Cancelado'] || '').toUpperCase()

      const processMatrix = [
        { name: 'SURTIDO', date: parseDate(row['Fecha de Surtido']), si: String(row.Surtido || '').toUpperCase() === 'SI' },
        { name: 'BORDADO', date: parseDate(row['Fecha de Bordado']), si: String(row.Bordado || '').toUpperCase() === 'SI' },
        { name: 'SERIGRAFIA', date: parseDate(row['Fecha de Serigrafia']), si: String(row.Serigrafia || '').toUpperCase() === 'SI' },
        { name: 'DESHEBRE', date: parseDate(row['Fecha de Deshebre']), si: String(row.Deshebre || '').toUpperCase() === 'SI' },
        { name: 'EMPAQUE', date: parseDate(row['Fecha de Empaque']), si: String(row.Empaque || '').toUpperCase() === 'SI' },
        { name: 'LOGISTICA', date: parseDate(row['Fecha de Logistica']), si: String(row.Logistica || '').toUpperCase() === 'SI' },
        { name: 'FACTURACIÓN', date: parseDate(row['Fecha de Facturacion']), si: String(row.Facturación || '').toUpperCase() === 'SI' },
        { name: 'TRÁNSITO', date: parseDate(row['Fecha de Transito']), si: String(row.Transito || '').toUpperCase() === 'SI' }
      ]

      let procesoActual = 'PENDIENTE'
      let procesoEspecial = null

      const erpProcesoLista = String(row['Proceso Lista'] || '').trim().toUpperCase()
      const specialTypes = ['COMPRAS', 'ESPECIALES', 'VENTAS']

      if (specialTypes.includes(erpProcesoLista)) {
        procesoEspecial = erpProcesoLista
      } 
      else if (erpProcesoLista && erpProcesoLista !== '-' && erpProcesoLista !== 'SURTIMIENTO') {
        procesoActual = erpProcesoLista
      }

      const latestWithDate = processMatrix.reduce((prev, curr) => {
        if (!curr.date) return prev
        if (!prev || !prev.date) return curr
        return new Date(curr.date) >= new Date(prev.date) ? curr : prev
      }, null)

      if (latestWithDate) {
        procesoActual = latestWithDate.name
      } 
      else if (procesoActual === 'PENDIENTE') {
        const lastSi = [...processMatrix].reverse().find(p => p.si)
        if (lastSi) procesoActual = lastSi.name
      }

      if (empaque) procesoActual = 'EMPAQUE'
      
      const fechaCreacion = parseDate(row['Fecha de Creacion'] || row['Fecha de Creación'])
      const totalPrendas = parseInt(row['No. de Prendas'] || 0)
      
      let surtidor = String(row['Usuario Surtido'] || '').toUpperCase()
      if (surtidor === '-') surtidor = null

      const { error: err } = await supabase
        .from('pedido_status')
        .upsert({
          pedido_num: pedidoNum,
          folio: folio,
          cliente: cliente,
          ejecutivo: ejecutivo,
          con_proceso: conProceso,
          proceso_actual: procesoActual,
          proceso_especial: procesoEspecial,
          surtido,
          bordado,
          serigrafia,
          empaque,
          logistica,
          observaciones: observations,
          cancelado,
          fecha_cancelado: fechaCancelado,
          usuario_cancelado: usuarioCancelado,
          fecha_creacion: fechaCreacion,
          total_prendas: totalPrendas,
          surtidor: surtidor,
          warehouse: activeWarehouse,
          updated_at: new Date().toISOString()
        }, { onConflict: 'pedido_num' })

      if (err) console.error('Error insertando pedido:', err)

      processed++
      setProgress({ current: processed, total: validRows.length })
    }
    return processed
  }

  const processSurtimiento = async (rows) => {
    const validRows = rows.filter(r => r.Venta && r['Código'])
    setProgress({ current: 0, total: validRows.length })
    let processed = 0

    for (const row of validRows) {
      const pedidoNum = String(row.Venta || '')
      const codigo = String(row['Código'] || '').toUpperCase()
      const talla = String(row.Talla || '').toUpperCase()
      const qty = parseInt(row['Cantidad Restante'] || row['Cantidad Surtida'] || row['Cantidad Actual'] || 0)
      const cliente = String(row.Cliente || '').toUpperCase()

      if (qty > 0) {
        const { data: existing } = await supabase
          .from('requirements')
          .select('id')
          .eq('pedido_num', pedidoNum)
          .eq('product_code', codigo)
          .eq('talla', talla)
          .eq('warehouse', activeWarehouse)
          .single()

        if (!existing) {
          await supabase.from('requirements').insert({
            pedido_num: pedidoNum,
            product_code: codigo,
            talla: talla,
            quantity: qty,
            client_name: cliente,
            worker_name: 'ERP SYNC',
            warehouse: activeWarehouse,
            requested_at: new Date().toISOString()
          })
        } else {
          await supabase.from('requirements').update({ quantity: qty }).eq('id', existing.id)
        }
      }
      processed++
      setProgress({ current: processed, total: validRows.length })
    }
    return processed
  }

  const handleUpload = async () => {
    if (!file || !detectedType) return
    setLoading(true); setError(null); setSuccess(null); setProgress({ current: 0, total: 0 })

    try {
      const reader = new FileReader()
      reader.onload = async (e) => {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        
        let startRow = 0
        if (detectedType === 'monitor') startRow = 1
        
        const rows = XLSX.utils.sheet_to_json(ws, { range: startRow, raw: false })
        let processed = 0

        if (detectedType === 'monitor') {
          processed = await processMonitor(rows)
        } else if (detectedType === 'surtimiento') {
          processed = await processSurtimiento(rows)
        }

        setSuccess(`SINCRONIZACIÓN COMPLETADA: ${processed} REGISTROS ACTUALIZADOS.`)
        setLoading(false)
        setFile(null)
      }
      reader.readAsArrayBuffer(file)
    } catch (err) {
      setError(`ERROR DURANTE LA SINCRONIZACIÓN: ${err.message.toUpperCase()}`)
      setLoading(false)
    }
  }

  return (
    <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:'1.5rem',padding:'2rem'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1.5rem'}}>
        <h3 style={{fontSize:'1.1rem',fontWeight:900,color:'white',display:'flex',alignItems:'center',gap:'0.5rem',textTransform:'uppercase',letterSpacing:'0.05em'}}>
          SINCRONIZACIÓN ERP (MONITOR / SURTIMIENTO)
        </h3>
        {file && (
          <button onClick={() => { setFile(null); setDetectedType(null); setSuccess(null); setError(null) }}
            style={{background:'rgba(255,255,255,0.1)',border:'none',borderRadius:'0.5rem',padding:'0.5rem 0.75rem',cursor:'pointer',color:'#64748b',fontWeight:900,fontSize:'0.7rem'}}>
            [CANCELAR]
          </button>
        )}
      </div>

      <div style={{background:'rgba(56,189,248,0.07)',border:'1px solid rgba(56,189,248,0.15)',borderRadius:'0.75rem',padding:'0.75rem 1rem',marginBottom:'1.25rem',display:'flex',gap:'0.5rem',alignItems:'flex-start'}}>
        <div style={{fontSize:'0.7rem',color:'#bae6fd',lineHeight:1.6, textTransform:'uppercase'}}>
          SELECCIONA EL ARCHIVO <strong>MONITOR_DE_OPERACIONES.XLSX</strong> O <strong>SURTIMIENTO.XLS</strong>. 
          EL SISTEMA DETECTARÁ AUTOMÁTICAMENTE EL TIPO DE ARCHIVO Y ACTUALIZARÁ EL MONITOR DE ESTATUS DE PEDIDOS Y/O LA COLA DE SURTIMIENTO DE {activeWarehouse}.
        </div>
      </div>

      {!file ? (
        <label style={{
          border:'2px dashed rgba(255,255,255,0.1)',borderRadius:'1rem',padding:'3rem 2rem',
          display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
          cursor:'pointer',gap:'0.75rem',transition:'all 0.2s'
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor='rgba(56,189,248,0.4)'; e.currentTarget.style.background='rgba(56,189,248,0.04)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor='rgba(255,255,255,0.1)'; e.currentTarget.style.background='transparent' }}
        >
          <div style={{textAlign:'center'}}>
            <p style={{color:'#94a3b8',fontWeight:900,fontSize:'0.875rem',textTransform:'uppercase'}}>[ARRASTRA EL ARCHIVO DE ERP (.XLS / .XLSX)]</p>
          </div>
          <input type="file" style={{display:'none'}} accept=".xlsx,.xls" onChange={handleFileChange} />
        </label>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:'1.25rem'}}>
          <div style={{background:'rgba(56,189,248,0.08)',border:'1px solid rgba(56,189,248,0.2)',borderRadius:'0.75rem',padding:'0.875rem 1rem',display:'flex',alignItems:'center',gap:'0.75rem'}}>
            <div style={{background:'rgba(56,189,248,0.1)',padding:'0.5rem',borderRadius:'0.5rem',color:'#0ea5e9',fontWeight:900,fontSize:'0.7rem'}}>
              [XLS]
            </div>
            <div style={{ flex: 1 }}>
              <p style={{fontWeight:900,color:'white',fontSize:'0.875rem',textTransform:'uppercase'}}>{file.name}</p>
              {detectedType && (
                <p style={{fontSize:'0.65rem',color:'#7dd3fc',textTransform:'uppercase',letterSpacing:'0.1em', fontWeight: 900}}>
                  DETECTADO COMO: {detectedType === 'monitor' ? 'MONITOR DE OPERACIONES' : 'REPORTE DE SURTIMIENTO'}
                </p>
              )}
            </div>
            {detectedType && (
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#38bdf8', boxShadow: '0 0 10px #38bdf8' }} />
            )}
          </div>

          {loading && progress.total > 0 && (
            <div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.7rem',color:'#94a3b8',marginBottom:'0.375rem',fontWeight:900,textTransform:'uppercase'}}>
                <span>SINCRONIZANDO CON BASE DE DATOS...</span>
                <span>{progress.current} / {progress.total}</span>
              </div>
              <div style={{background:'rgba(255,255,255,0.08)',borderRadius:'999px',height:6}}>
                <div style={{
                  background:'linear-gradient(90deg,#0ea5e9,#38bdf8)',
                  borderRadius:'999px',height:6,
                  width:`${(progress.current/progress.total)*100}%`,
                  transition:'width 0.3s ease'
                }} />
              </div>
            </div>
          )}

          <button onClick={handleUpload} disabled={loading || !detectedType} style={{
            width:'100%',padding:'1rem',borderRadius:'0.875rem',
            background: (loading || !detectedType) ? 'rgba(56,189,248,0.4)' : '#0ea5e9',
            color:'white',fontWeight:900,fontSize:'0.9rem',letterSpacing:'0.05em',
            border:'none',cursor: (loading || !detectedType) ? 'not-allowed' : 'pointer',
            display:'flex',alignItems:'center',justifyContent:'center',gap:'0.5rem',
            textTransform:'uppercase'
          }}>
            {loading ? 'SINCRONIZANDO...' : 'SINCRONIZAR DATOS ERP'}
          </button>
        </div>
      )}

      {error && (
        <div style={{marginTop:'1rem',padding:'0.875rem',background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.25)',borderRadius:'0.75rem',display:'flex',gap:'0.5rem',alignItems:'center'}}>
          <div style={{color:'#f87171',fontWeight:900,fontSize:'0.7rem'}}>[ERROR]</div>
          <p style={{fontSize:'0.75rem',fontWeight:900,color:'#f87171',textTransform:'uppercase'}}>{error}</p>
        </div>
      )}

      {success && (
        <div style={{marginTop:'1rem',padding:'0.875rem',background:'rgba(34,197,94,0.1)',border:'1px solid rgba(34,197,94,0.25)',borderRadius:'0.75rem',display:'flex',gap:'0.5rem',alignItems:'center'}}>
          <div style={{color:'#4ade80',fontWeight:900,fontSize:'0.7rem'}}>[ÉXITO]</div>
          <p style={{fontSize:'0.75rem',fontWeight:900,color:'#4ade80',textTransform:'uppercase'}}>{success}</p>
        </div>
      )}
    </div>
  )
}
