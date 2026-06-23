import { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

export default function BulkUpload({ onComplete }) {
  const { activeWarehouse } = useAuth()
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [preview, setPreview] = useState([])
  const [progress, setProgress] = useState({ current: 0, total: 0 })

  const handleFileChange = (e) => {
    const f = e.target.files[0]
    if (f) { setFile(f); parsePreview(f) }
  }

  const parsePreview = (f) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { raw: false })
      setPreview(rows.slice(0, 5))
    }
    reader.readAsArrayBuffer(f)
  }

  const parseDate = (val) => {
    if (!val) return new Date().toISOString()
    if (typeof val === 'number' || (!isNaN(Number(val)) && String(val).length < 6)) {
      const excelEpoch = new Date(1899, 11, 30)
      const date = new Date(excelEpoch.getTime() + Number(val) * 86400000)
      return date.toISOString()
    }
    const str = String(val).trim()
    const dmyMatch = str.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/)
    if (dmyMatch) {
      return new Date(`${dmyMatch[3]}-${dmyMatch[2].padStart(2,'0')}-${dmyMatch[1].padStart(2,'0')}`).toISOString()
    }
    const d = new Date(str)
    return isNaN(d) ? new Date().toISOString() : d.toISOString()
  }

  const handleUpload = async () => {
    if (!file) return
    setLoading(true); setError(null); setSuccess(null); setProgress({ current: 0, total: 0 })

    try {
      const reader = new FileReader()
      reader.onload = async (e) => {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { raw: false })

        const validRows = rows.filter(r => {
          const code = String(r.Codigo || r.codigo || '').trim()
          const qty  = parseInt(r.Cantidad || r.cantidad || 0)
          return code && qty > 0
        })

        setProgress({ current: 0, total: validRows.length })
        let processed = 0

        for (const row of validRows) {
          const code        = String(row.Codigo   || row.codigo   || '').toUpperCase().trim()
          const description = String(row.Descripcion || row.descripcion || '').toUpperCase().trim()
          const talla       = String(row.Talla    || row.talla    || '').toUpperCase().trim()
          const qty         = parseInt(row.Cantidad || row.cantidad || 0)
          const op          = String(row.OP       || row.op       || '').toUpperCase().trim()
          const localidad   = String(row.Localidad || row.localidad || '').toUpperCase().trim()
          const entryDate   = parseDate(row['Fecha de Entrada'] || row['fecha de entrada'] || row.FechaEntrada || row['Fecha OP'] || row['fecha op'] || '')
          
          let packageId = null

          let { data: product } = await supabase.from('products').select('id').eq('code', code).single()
          if (!product) {
            const { data: np, error: pe } = await supabase.from('products').insert({ code, description }).select('id').single()
            if (pe) { console.warn('Producto error:', pe.message); continue }
            product = np
          }

          let locationId = null
          if (localidad) {
            const { data: loc } = await supabase
              .from('locations')
              .select('id, is_occupied')
              .eq('name', localidad)
              .eq('warehouse', activeWarehouse)
              .single()

            if (loc) {
              locationId = loc.id
              if (!loc.is_occupied) {
                await supabase.from('locations').update({ is_occupied: true }).eq('id', loc.id)
              }
            } else {
              continue
            }
          }

          if (locationId) {
            packageId = Math.floor(100000 + Math.random() * 900000).toString()
          }

          const { error: ie } = await supabase.from('inventory').insert({
            product_id:  product.id,
            location_id: locationId,
            talla,
            quantity:    qty,
            op,
            entry_date:  entryDate,
            warehouse:   activeWarehouse,
            package_id:  packageId
          })
          if (ie) continue

          processed++
          setProgress({ current: processed, total: validRows.length })
        }

        setSuccess(`SE CARGARON ${processed} DE ${validRows.length} REGISTROS CORRECTAMENTE.`)
        if (onComplete) onComplete()
        setLoading(false)
      }
      reader.readAsArrayBuffer(file)
    } catch (err) {
      setError(`ERROR DURANTE LA CARGA: ${err.message.toUpperCase()}`)
      setLoading(false)
    }
  }

  const col = (row, ...keys) => {
    for (const k of keys) if (row[k] !== undefined) return row[k]
    return ''
  }

  return (
    <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:'1.5rem',padding:'2rem'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1.5rem'}}>
        <h3 style={{fontSize:'1.1rem',fontWeight:900,color:'white',display:'flex',alignItems:'center',gap:'0.5rem',textTransform:'uppercase',letterSpacing:'0.05em'}}>
          CARGA MASIVA EXCEL
        </h3>
        {file && (
          <button onClick={() => { setFile(null); setPreview([]); setSuccess(null); setError(null) }}
            style={{background:'rgba(255,255,255,0.1)',border:'none',borderRadius:'0.5rem',padding:'0.5rem 0.75rem',cursor:'pointer',color:'#64748b',fontWeight:900,fontSize:'0.7rem'}}>
            [CANCELAR]
          </button>
        )}
      </div>

      <div style={{background:'rgba(239,68,68,0.07)',border:'1px solid rgba(239,68,68,0.15)',borderRadius:'0.75rem',padding:'0.75rem 1rem',marginBottom:'1.25rem',display:'flex',gap:'0.5rem',alignItems:'flex-start'}}>
        <div style={{fontSize:'0.7rem',color:'#fca5a5',lineHeight:1.6}}>
          <strong style={{textTransform:'uppercase'}}>COLUMNAS SOPORTADAS:</strong> CÓDIGO · DESCRIPCIÓN · TALLA · CANTIDAD · OP · LOCALIDAD · FECHA DE ENTRADA (O FECHA OP)<br/>
          <span style={{opacity:0.7, textTransform:'uppercase'}}>LOCALIDAD Y FECHA SON OPCIONALES. EL PACKAGE ID DE 6 DÍGITOS SE GENERA AUTOMÁTICAMENTE.</span>
        </div>
      </div>

      {!file ? (
        <label style={{
          border:'2px dashed rgba(255,255,255,0.1)',borderRadius:'1rem',padding:'3rem 2rem',
          display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
          cursor:'pointer',gap:'0.75rem',transition:'all 0.2s'
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor='rgba(239,68,68,0.4)'; e.currentTarget.style.background='rgba(239,68,68,0.04)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor='rgba(255,255,255,0.1)'; e.currentTarget.style.background='transparent' }}
        >
          <div style={{textAlign:'center'}}>
            <p style={{color:'#94a3b8',fontWeight:900,fontSize:'0.875rem',textTransform:'uppercase'}}>[SELECCIONA O ARRASTRA EL ARCHIVO .XLSX]</p>
            <p style={{color:'#475569',fontSize:'0.65rem',marginTop:'0.5rem',textTransform:'uppercase',letterSpacing:'0.1em',fontWeight:900}}>
              CÓDIGO · DESCRIPCIÓN · TALLA · LOCALIDAD · CANTIDAD · OP · FECHA OP
            </p>
          </div>
          <input type="file" style={{display:'none'}} accept=".xlsx,.xls" onChange={handleFileChange} />
        </label>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:'1.25rem'}}>
          <div style={{background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:'0.75rem',padding:'0.875rem 1rem',display:'flex',alignItems:'center',gap:'0.75rem'}}>
            <div style={{background:'rgba(239,68,68,0.1)',padding:'0.5rem',borderRadius:'0.5rem',color:'#ef4444',fontWeight:900,fontSize:'0.7rem'}}>
              [EXCEL]
            </div>
            <div>
              <p style={{fontWeight:900,color:'white',fontSize:'0.875rem',textTransform:'uppercase'}}>{file.name}</p>
              <p style={{fontSize:'0.65rem',color:'#f87171',textTransform:'uppercase',letterSpacing:'0.1em',fontWeight:900}}>LISTO PARA PROCESAR</p>
            </div>
          </div>

          {preview.length > 0 && (
            <div>
              <p style={{fontSize:'0.65rem',fontWeight:900,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.15em',marginBottom:'0.5rem'}}>VISTA PREVIA (PRIMERAS 5 FILAS)</p>
              <div style={{overflowX:'auto',borderRadius:'0.75rem',border:'1px solid rgba(255,255,255,0.07)'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.7rem'}}>
                  <thead>
                    <tr style={{background:'rgba(255,255,255,0.04)'}}>
                      {['CÓDIGO','TALLA','LOCALIDAD','CANTIDAD','OP','FECHA ENTRADA'].map(h => (
                        <th key={h} style={{padding:'0.5rem 0.75rem',color:'#64748b',textAlign:'left',fontWeight:900,textTransform:'uppercase',fontSize:'0.6rem',whiteSpace:'nowrap'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} style={{borderTop:'1px solid rgba(255,255,255,0.05)'}}>
                        <td style={{padding:'0.5rem 0.75rem',color:'white',fontWeight:900,textTransform:'uppercase'}}>{col(row,'Codigo','codigo')}</td>
                        <td style={{padding:'0.5rem 0.75rem',color:'#94a3b8',textTransform:'uppercase'}}>{col(row,'Talla','talla')}</td>
                        <td style={{padding:'0.5rem 0.75rem',color:'#94a3b8',textTransform:'uppercase'}}>{col(row,'Localidad','localidad') || <span style={{color:'#475569',fontStyle:'italic',textTransform:'uppercase'}}>AUTO</span>}</td>
                        <td style={{padding:'0.5rem 0.75rem',color:'#94a3b8'}}>{col(row,'Cantidad','cantidad')}</td>
                        <td style={{padding:'0.5rem 0.75rem',color:'#94a3b8',textTransform:'uppercase'}}>{col(row,'OP','op')}</td>
                        <td style={{padding:'0.5rem 0.75rem',color:'#94a3b8',whiteSpace:'nowrap',textTransform:'uppercase'}}>{col(row,'Fecha de Entrada','fecha de entrada','FechaEntrada') || <span style={{color:'#475569',fontStyle:'italic',textTransform:'uppercase'}}>HOY</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {loading && progress.total > 0 && (
            <div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.7rem',color:'#94a3b8',marginBottom:'0.375rem',fontWeight:900,textTransform:'uppercase'}}>
                <span>PROCESANDO...</span>
                <span>{progress.current} / {progress.total}</span>
              </div>
              <div style={{background:'rgba(255,255,255,0.08)',borderRadius:'999px',height:6}}>
                <div style={{
                  background:'linear-gradient(90deg,#dc2626,#ef4444)',
                  borderRadius:'999px',height:6,
                  width:`${(progress.current/progress.total)*100}%`,
                  transition:'width 0.3s ease'
                }} />
              </div>
            </div>
          )}

          <button onClick={handleUpload} disabled={loading} style={{
            width:'100%',padding:'1rem',borderRadius:'0.875rem',
            background: loading ? 'rgba(239,68,68,0.4)' : '#dc2626',
            color:'white',fontWeight:900,fontSize:'0.9rem',letterSpacing:'0.05em',
            border:'none',cursor: loading ? 'not-allowed' : 'pointer',
            display:'flex',alignItems:'center',justifyContent:'center',gap:'0.5rem',
            textTransform:'uppercase'
          }}>
            {loading ? 'PROCESANDO...' : 'INICIAR CARGA MASIVA'}
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
