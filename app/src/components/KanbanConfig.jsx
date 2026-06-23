import React, { useState } from 'react'
import { supabase } from '../supabaseClient'
import * as XLSX from 'xlsx'


export default function KanbanConfig({ configs, fetchConfigs, loading, showMessage }) {
  const [search, setSearch] = useState('')

  const filtered = configs.filter(c =>
    (c.code || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.description || '').toLowerCase().includes(search.toLowerCase())
  )

  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(configs.map(c => ({
      'Codigo': c.code,
      'Descripcion': c.description,
      'Talla': c.talla,
      'Almacen Destino': c.warehouse_dest,
      'Minimo': c.stock_minimo,
      'Reposicion': c.stock_reposicion
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Config")
    XLSX.writeFile(wb, "Configuracion_Kanban.xlsx")
  }

  const handleImport = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result
        const wb = XLSX.read(bstr, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json(ws)

        const updates = data.map(row => ({
          code: String(row['Codigo']).trim().toUpperCase(),
          description: row['Descripcion'] || '',
          talla: String(row['Talla']).trim().toUpperCase(),
          warehouse_dest: row['Almacen Destino'] || 'MEXICO',
          stock_minimo: parseInt(row['Minimo'] || 1),
          stock_reposicion: parseInt(row['Reposicion'] || 2),
          active: true
        }))

        const { error } = await supabase.from('kanban_config').upsert(updates, { onConflict: 'code,talla,warehouse_dest' })
        if (error) throw error
        showMessage('success', 'CONFIGURACIÓN ACTUALIZADA')
        fetchConfigs()
      } catch (err) {
        showMessage('error', 'ERROR AL IMPORTAR CONFIGURACIÓN')
      }
    }
    reader.readAsBinaryString(file)
  }

  const deleteConfig = async (id) => {
    if (!window.confirm('¿ELIMINAR ESTA CONFIGURACIÓN?')) return
    const { error } = await supabase.from('kanban_config').delete().eq('id', id)
    if (!error) {
      showMessage('success', 'CONFIGURACIÓN ELIMINADA')
      fetchConfigs()
    }
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
       <div className="glass" style={{ padding: '1.5rem', borderRadius: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flex: 1 }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
            <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', fontSize: '1rem' }}>🔍</span>
            <input
              type="text"
              placeholder="FILTRAR CONFIGURACIÓN..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '1rem', padding: '0.75rem 1rem', color: 'white', fontSize: '0.75rem', textTransform: 'uppercase' }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <label style={{ background: '#3b82f6', color: 'white', padding: '0.75rem 1.25rem', borderRadius: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.7rem', fontWeight: 700 }}>
            IMPORTAR
            <input type="file" hidden accept=".xlsx" onChange={handleImport} />
          </label>
          <button onClick={handleExport} style={{ background: '#1e293b', color: 'white', padding: '0.75rem 1.25rem', borderRadius: '1rem', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.7rem', fontWeight: 700 }}>
            EXPORTAR
          </button>
        </div>
      </div>

      <div className="glass" style={{ borderRadius: '1.5rem', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
          <thead>
            <tr style={{ background: '#0f172a', color: '#64748b', textAlign: 'left' }}>
              <th style={{ padding: '1rem' }}>CÓDIGO</th>
              <th style={{ padding: '1rem' }}>TALLA</th>
              <th style={{ padding: '1rem' }}>ALMACÉN DESTINO</th>
              <th style={{ padding: '1rem', textAlign: 'center' }}>STK MÍNIMO</th>
              <th style={{ padding: '1rem', textAlign: 'center' }}>REPOSICIÓN</th>
              <th style={{ padding: '1rem', textAlign: 'right' }}>ACCIONES</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid #1e293b', color: 'white' }}>
                <td style={{ padding: '1rem', fontWeight: 700 }}>{c.code}</td>
                <td style={{ padding: '1rem' }}>{c.talla}</td>
                <td style={{ padding: '1rem' }}>{c.warehouse_dest}</td>
                <td style={{ padding: '1rem', textAlign: 'center' }}>{c.stock_minimo}</td>
                <td style={{ padding: '1rem', textAlign: 'center' }}>{c.stock_reposicion}</td>
                <td style={{ padding: '1rem', textAlign: 'right' }}>
                  <button onClick={() => deleteConfig(c.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 900 }}>
                    ELIMINAR
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
