import React, { useState } from 'react'
import { supabase } from '../supabaseClient'
import * as XLSX from 'xlsx'


export default function KanbanBoxStandards({ standards, fetchStandards, loading, showMessage }) {
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})

  const filtered = standards.filter(s =>
    (s.code || '').toLowerCase().includes(search.toLowerCase()) ||
    (s.description || '').toLowerCase().includes(search.toLowerCase())
  )

  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(standards.map(s => ({
      'Codigo': s.code,
      'Descripcion': s.description,
      'Talla': s.talla,
      'Pzas Caja Cerrada': s.pzas_por_caja
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Estándares")
    XLSX.writeFile(wb, "Estandares_Caja_Kanban.xlsx")
  }

  const handleImport = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result
        const wb = XLSX.read(bstr, { type: 'binary' })
        const wsname = wb.SheetNames[0]
        const ws = wb.Sheets[wsname]
        const data = XLSX.utils.sheet_to_json(ws)

        const { data: { user } } = await supabase.auth.getUser()
        
        const updates = data.map(row => ({
          code: String(row['Codigo'] || '').trim().toUpperCase(),
          description: row['Descripcion'] || '',
          talla: String(row['Talla'] || '').trim().toUpperCase(),
          pzas_por_caja: parseInt(row['Pzas Caja Cerrada'] || 0),
          last_updated_by: user?.email || 'Sistema'
        }))

        const { error } = await supabase.from('maquila_box_standards').upsert(updates, { onConflict: 'code,talla' })
        if (error) throw error
        showMessage('success', 'ESTÁNDARES ACTUALIZADOS CORRECTAMENTE')
        fetchStandards()
      } catch (err) {
        console.error(err)
        showMessage('error', 'ERROR AL IMPORTAR ARCHIVO')
      }
    }
    reader.readAsBinaryString(file)
  }

  const handleSaveEdit = async (id) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('maquila_box_standards')
        .update({
          pzas_por_caja: parseInt(editForm.pzas_por_caja),
          last_updated_by: user?.email || 'Sistema'
        })
        .eq('id', id)
      
      if (error) throw error
      showMessage('success', 'GUARDADO CORRECTAMENTE')
      setEditingId(null)
      fetchStandards()
    } catch (err) {
      showMessage('error', 'ERROR AL GUARDAR')
    }
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="glass" style={{ padding: '1.5rem', borderRadius: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flex: 1 }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>

            <input
              type="text"
              placeholder="BUSCAR POR CÓDIGO O DESCRIPCIÓN..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '1rem', padding: '0.75rem 1rem', color: 'white', fontSize: '0.75rem', textTransform: 'uppercase' }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <label style={{ background: '#1e293b', color: 'white', padding: '0.75rem 1.25rem', borderRadius: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.7rem', fontWeight: 700 }}>
            IMPORTAR (.XLSX)
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
              <th style={{ padding: '1rem' }}>DESCRIPCIÓN</th>
              <th style={{ padding: '1rem' }}>TALLA</th>
              <th style={{ padding: '1rem' }}>PZAS/CAJA</th>
              <th style={{ padding: '1rem' }}>ÚLTIMO CAMBIO</th>
              <th style={{ padding: '1rem', textAlign: 'right' }}>ACCIONES</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id} style={{ borderBottom: '1px solid #1e293b', color: 'white' }}>
                <td style={{ padding: '1rem', fontWeight: 700 }}>{s.code}</td>
                <td style={{ padding: '1rem', color: '#94a3b8' }}>{s.description}</td>
                <td style={{ padding: '1rem' }}>{s.talla}</td>
                <td style={{ padding: '1rem' }}>
                  {editingId === s.id ? (
                    <input
                      type="number"
                      value={editForm.pzas_por_caja}
                      onChange={(e) => setEditForm({...editForm, pzas_por_caja: e.target.value})}
                      style={{ background: '#0f172a', border: '1px solid #3b82f6', color: 'white', padding: '0.25rem 0.5rem', borderRadius: '0.5rem', width: '60px' }}
                    />
                  ) : (
                    s.pzas_por_caja
                  )}
                </td>
                <td style={{ padding: '1rem', color: '#64748b', fontSize: '0.65rem' }}>
                  {s.last_updated_by || 'N/A'}<br/>
                  {s.updated_at ? new Date(s.updated_at).toLocaleString() : ''}
                </td>
                <td style={{ padding: '1rem', textAlign: 'right' }}>
                  {editingId === s.id ? (
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      <button onClick={() => handleSaveEdit(s.id)} style={{ background: '#10b981', color: 'white', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.6rem', fontWeight: 900 }}>GUARDAR</button>
                      <button onClick={() => setEditingId(null)} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.6rem', fontWeight: 900 }}>CANCELAR</button>
                    </div>
                  ) : (
                    <button onClick={() => { setEditingId(s.id); setEditForm(s); }} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '0.6rem', fontWeight: 900 }}>EDITAR</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ padding: '4rem', textAlign: 'center', color: '#475569' }}>
            <p style={{ fontWeight: 700, textTransform: 'uppercase' }}>NO SE ENCONTRARON ESTÁNDARES CONFIGURADOS</p>
          </div>
        )}
      </div>
    </div>
  )
}
