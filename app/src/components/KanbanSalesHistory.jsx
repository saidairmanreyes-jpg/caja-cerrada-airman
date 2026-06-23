import React, { useState } from 'react'
import { supabase } from '../supabaseClient'
import * as XLSX from 'xlsx'


export default function KanbanSalesHistory({ showMessage }) {
  const [loading, setLoading] = useState(false)
  const [previewData, setPreviewData] = useState([])
  const [search, setSearch] = useState('')

  const handleImportSales = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setLoading(true)
    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result
        const wb = XLSX.read(bstr, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json(ws)

        // Transform data from "VENTAS POR SEMANA.xlsx" structure
        // Assuming columns: Codigo, Talla, Almacen, Semana, Piezas
        const updates = data.map(row => ({
          model: String(row['Codigo'] || row['ALMACEN'] || '').trim().toUpperCase(),
          size: String(row['Talla'] || row['TALLA'] || '').trim().toUpperCase(),
          warehouse: row['Almacen'] || row['SUCURSAL'] || 'MEXICO',
          week_start: row['Semana'] || new Date().toISOString().split('T')[0],
          quantity: parseInt(row['Piezas'] || row['CANTIDAD'] || 0)
        })).filter(r => r.model && r.quantity > 0)

        const { error } = await supabase.from('kanban_sales_history').upsert(updates, { onConflict: 'model,size,warehouse,week_start' })
        if (error) throw error
        
        showMessage('success', `${updates.length} REGISTROS DE VENTA CARGADOS CORRECTAMENTE`)
        setPreviewData(updates.slice(0, 10))
      } catch (err) {
        console.error(err)
        showMessage('error', 'ERROR AL PROCESAR ARCHIVO DE VENTAS. VERIFIQUE EL FORMATO.')
      } finally {
        setLoading(false)
      }
    }
    reader.readAsBinaryString(file)
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div className="glass" style={{ padding: '2rem', borderRadius: '1.5rem', display: 'flex', gap: '2rem', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 900, marginBottom: '0.5rem' }}>HISTÓRICO DE VENTAS</h3>
          <p style={{ color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>
            CARGUE EL ARCHIVO "VENTAS POR SEMANA.XLSX" PARA ACTUALIZAR EL MOTOR DE CÁLCULO DE KANBAN. 
            ESTE PROCESO SOBREESCRIBE SEMANAS EXISTENTES SI COINCIDEN EN CÓDIGO, TALLA Y ALMACÉN.
          </p>
        </div>
        <div>
          <label style={{ background: '#3b82f6', color: 'white', padding: '1rem 2rem', borderRadius: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.8rem', fontWeight: 900 }}>
            {loading ? 'PROCESANDO...' : 'CARGAR EXCEL'}
            <input type="file" hidden accept=".xlsx" onChange={handleImportSales} disabled={loading} />
          </label>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
        <div className="glass" style={{ padding: '1.5rem', borderRadius: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ padding: '1rem', background: 'rgba(59,130,246,0.1)', borderRadius: '1rem', color: '#3b82f6', fontSize: '1.2rem', fontWeight: 900 }}>
            📈
          </div>
          <div>
            <div style={{ color: '#64748b', fontSize: '0.6rem', fontWeight: 900 }}>ANÁLISIS SEMANAL</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'white' }}>ACTIVO</div>
          </div>
        </div>
        <div className="glass" style={{ padding: '1.5rem', borderRadius: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ padding: '1rem', background: 'rgba(16,185,129,0.1)', borderRadius: '1rem', color: '#10b981', fontSize: '1.2rem', fontWeight: 900 }}>
            📅
          </div>
          <div>
            <div style={{ color: '#64748b', fontSize: '0.6rem', fontWeight: 900 }}>ÚLTIMA CARGA</div>
            <div style={{ fontSize: '1rem', fontWeight: 900, color: 'white' }}>{new Date().toLocaleDateString()}</div>
          </div>
        </div>
      </div>

      {previewData.length > 0 && (
        <div className="animate-slide-up">
          <h4 style={{ fontSize: '0.75rem', fontWeight: 900, color: '#64748b', marginBottom: '1rem' }}>VISTA PREVIA DE CARGA (TOP 10)</h4>
          <div className="glass" style={{ borderRadius: '1.5rem', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.02)', color: '#64748b', textAlign: 'left' }}>
                  <th style={{ padding: '1rem' }}>MODELO</th>
                  <th style={{ padding: '1rem' }}>TALLA</th>
                  <th style={{ padding: '1rem' }}>ALMACÉN</th>
                  <th style={{ padding: '1rem' }}>SEMANA</th>
                  <th style={{ padding: '1rem', textAlign: 'center' }}>PIEZAS</th>
                </tr>
              </thead>
              <tbody>
                {previewData.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', color: 'white' }}>
                    <td style={{ padding: '1rem', fontWeight: 800 }}>{row.model}</td>
                    <td style={{ padding: '1rem' }}>{row.size}</td>
                    <td style={{ padding: '1rem' }}>{row.warehouse}</td>
                    <td style={{ padding: '1rem' }}>{row.week_start}</td>
                    <td style={{ padding: '1rem', textAlign: 'center', color: '#3b82f6', fontWeight: 900 }}>{row.quantity}</td>
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
