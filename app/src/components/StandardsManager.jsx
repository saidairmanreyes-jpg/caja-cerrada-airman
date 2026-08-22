import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import * as XLSX from 'xlsx'
import { Box, Plus, Search, Download, Upload, Edit3, Trash2, Check, X, HelpCircle } from 'lucide-react'

const TALLAS = [
  'XC', 'CH', 'M', 'G', 'XG', '2X', '3X', '4X', '5X',
  '28', '30', '32', '34', '36', '38', '40', '42', '44',
  '3', '5', '7', '9', '11', '13', '15', '17',
  '14.5', '15', '15.5', '16', '16.5', '17', '17.5', '18',
  '28-30', '32-34', '36-38', '40-42', '44-46', 'UN'
]

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

const btnBase = {
  padding: '0.75rem 1.5rem',
  borderRadius: '0.75rem',
  border: 'none',
  color: 'white',
  fontWeight: 900,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  justifyContent: 'center',
  transition: 'all 0.15s'
}

export default function StandardsManager() {
  const { profile, isAdmin } = useAuth()
  const [standards, setStandards] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ code: '', description: '', talla: 'XC', pzas_por_caja: '' })
  const [codeSearch, setCodeSearch] = useState('')
  const [showCodeDrop, setShowCodeDrop] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState(null)
  const [editPzas, setEditPzas] = useState('')
  const dropRef = useRef(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: stds }, { data: prods }] = await Promise.all([
        supabase.from('maquila_box_standards').select('*').order('code').order('talla'),
        supabase.from('products').select('code, description').order('code')
      ])
      setStandards(stds || [])
      setProducts(prods || [])
    } catch (err) {
      console.error('Error fetching standards:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handler = (e) => { if (dropRef.current && !dropRef.current.contains(e.target)) setShowCodeDrop(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filteredProducts = products.filter(p =>
    (p.code || '').toLowerCase().includes(codeSearch.toLowerCase()) ||
    (p.description || '').toLowerCase().includes(codeSearch.toLowerCase())
  ).slice(0, 12)

  const filteredStandards = standards.filter(s =>
    (s.code || '').toLowerCase().includes(search.toLowerCase()) ||
    (s.description || '').toLowerCase().includes(search.toLowerCase()) ||
    (s.talla || '').toLowerCase().includes(search.toLowerCase())
  )

  const handleSave = async () => {
    if (!form.code || !form.talla || !form.pzas_por_caja) {
      alert('COMPLETA TODOS LOS CAMPOS')
      return
    }
    setSaving(true)
    const payload = {
      code: form.code.trim().toUpperCase(),
      description: form.description,
      talla: form.talla.trim().toUpperCase(),
      pzas_por_caja: parseInt(form.pzas_por_caja),
      created_by: profile?.name || profile?.email || 'Admin',
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase
      .from('maquila_box_standards')
      .upsert(payload, { onConflict: 'code,talla' })

    setSaving(false)
    if (error) {
      alert('ERROR: ' + error.message)
      return
    }
    setShowForm(false)
    setForm({ code: '', description: '', talla: 'XC', pzas_por_caja: '' })
    setCodeSearch('')
    fetchAll()
  }

  const handleEditSave = async (id) => {
    if (!editPzas || parseInt(editPzas) <= 0) {
      alert('INGRESA UNA CANTIDAD VÁLIDA')
      return
    }
    const { error } = await supabase
      .from('maquila_box_standards')
      .update({ pzas_por_caja: parseInt(editPzas), updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      alert('ERROR: ' + error.message)
      return
    }
    setEditId(null)
    fetchAll()
  }

  const handleDelete = async (id, code, talla) => {
    if (!confirm(`¿ELIMINAR ESTÁNDAR ${code} / ${talla}?`)) return
    await supabase.from('maquila_box_standards').delete().eq('id', id)
    fetchAll()
  }

  const handleImport = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json(ws)

        if (data.length === 0) {
          alert('EL ARCHIVO ESTÁ VACÍO O NO TIENE DATOS EN LA PRIMERA HOJA.')
          e.target.value = null
          return
        }

        const firstRow = data[0]
        const foundHeaders = Object.keys(firstRow)

        const rows = data.map(r => ({
          code: String(
            r['CODIGO'] || r['Codigo'] || r['código'] || r['Código'] || r['codigo'] || ''
          ).trim().toUpperCase(),
          description: String(
            r['DESCRIPCION'] || r['Descripcion'] || r['DESCRIPCIÓN'] || r['Descripción'] || r['descripcion'] || ''
          ).trim(),
          talla: String(
            r['TALLA'] || r['Talla'] || r['talla'] || ''
          ).trim().toUpperCase(),
          pzas_por_caja: parseInt(
            r['PZAS_CAJA'] || r['Pzas Caja'] || r['PZAS POR CAJA'] ||
            r['CANTIDAD'] || r['Cantidad'] || r['cantidad'] || r['PIEZAS'] || r['Piezas'] || 0
          ),
          created_by: profile?.name || 'Admin',
          updated_at: new Date().toISOString(),
        })).filter(r => r.code && r.talla && r.pzas_por_caja > 0)

        if (rows.length === 0) {
          alert(
            '❌ NO SE ENCONTRARON FILAS VÁLIDAS EN EL ARCHIVO.\n\n' +
            'ENCABEZADOS DETECTADOS EN TU ARCHIVO:\n' +
            foundHeaders.map(h => `  • ${h}`).join('\n') +
            '\n\nENCABEZADOS REQUERIDOS:\n' +
            '  • Código  (o CODIGO)\n' +
            '  • Descripción  (o DESCRIPCION)\n' +
            '  • Talla  (o TALLA)\n' +
            '  • Cantidad  (o PZAS_CAJA / PZAS POR CAJA)\n\n' +
            'ASEGÚRATE QUE LA FILA 1 TENGA ESTOS ENCABEZADOS Y QUE LOS DATOS EMPIECEN EN LA FILA 2.'
          )
          e.target.value = null
          return
        }

        const BATCH_SIZE = 50
        let importedCount = 0
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
          const batch = rows.slice(i, i + BATCH_SIZE)
          const { error } = await supabase
            .from('maquila_box_standards')
            .upsert(batch, { onConflict: 'code,talla' })
          if (error) throw new Error(`LOTE ${Math.floor(i/BATCH_SIZE)+1}: ${error.message}`)
          importedCount += batch.length
        }
        alert(`✅ ${importedCount} ESTÁNDARES IMPORTADOS CORRECTAMENTE`)
        fetchAll()
      } catch (err) {
        alert('ERROR AL IMPORTAR: ' + err.message)
      }
      e.target.value = null
    }
    reader.readAsBinaryString(file)
  }

  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(standards.map(s => ({
      'CODIGO': s.code,
      'DESCRIPCION': s.description || '',
      'TALLA': s.talla,
      'PZAS_CAJA': s.pzas_por_caja
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Estandares')
    XLSX.writeFile(wb, `Estandares_Empaque_${new Date().toLocaleDateString('es-MX').replace(/\//g, '-')}.xlsx`)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} className="animate-fade-in">
      {/* Encabezado */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 900, color: 'white', textTransform: 'uppercase' }}>
            ESTÁNDARES DE <span style={{ color: '#a78bfa' }}>CAJA CERRADA POR TALLA</span>
          </h2>
          <p style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '0.25rem', fontWeight: 700, textTransform: 'uppercase' }}>
            DEFINE LAS PIEZAS POR CAJA CERRADA PARA CADA CÓDIGO Y TALLA (UTILIZADO EN KANBAN, MAQUILA Y SURTIDO).
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <label
              style={{ ...btnBase, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', padding: '0.6rem 1rem', textTransform: 'uppercase', gap: '0.4rem', fontSize: '0.75rem' }}
              title={'ENCABEZADOS REQUERIDOS EN TU EXCEL:\n• Código (o CODIGO)\n• Descripción (o DESCRIPCION)\n• Talla (o TALLA)\n• Cantidad (o PZAS_CAJA)'}
            >
              <Upload size={15} /> IMPORTAR EXCEL
              <input type="file" hidden accept=".xlsx,.xls" onChange={handleImport} />
            </label>
          </div>

          <div style={{
            background: 'rgba(167,139,250,0.07)', border: '1px solid rgba(167,139,250,0.2)',
            borderRadius: '0.75rem', padding: '0.5rem 0.875rem',
            fontSize: '0.65rem', color: '#a78bfa', fontWeight: 700,
            lineHeight: 1.6, textTransform: 'uppercase'
          }}>
            <span style={{ display: 'block', color: '#64748b', marginBottom: '0.15rem' }}>📋 COLUMNAS REQUERIDAS:</span>
            <span style={{ color: '#c4b5fd' }}>Código · Descripción · Talla · Cantidad</span>
          </div>

          <button onClick={handleExport} style={{ ...btnBase, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.6rem 1rem', textTransform: 'uppercase', fontSize: '0.75rem' }}>
            <Download size={15} /> EXPORTAR
          </button>

          <button onClick={() => setShowForm(true)} style={{ ...btnBase, background: 'rgba(167,139,250,0.2)', border: '1px solid rgba(167,139,250,0.3)', color: '#a78bfa', textTransform: 'uppercase', fontSize: '0.75rem' }}>
            <Plus size={15} /> AGREGAR ESTÁNDAR
          </button>
        </div>
      </div>

      {/* Buscador */}
      <div style={{ position: 'relative', maxWidth: '400px' }}>
        <input
          type="text" placeholder="BUSCAR CÓDIGO, DESCRIPCIÓN O TALLA..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ ...inputStyle, paddingLeft: '1rem', textTransform: 'uppercase' }}
        />
      </div>

      {/* Formulario de nuevo estándar */}
      {showForm && (
        <div className="glass" style={{ padding: '1.5rem', borderRadius: '1.5rem', border: '1px solid rgba(167,139,250,0.25)', background: 'rgba(167,139,250,0.04)' }}>
          <h3 style={{ color: '#a78bfa', fontWeight: 900, marginBottom: '1.25rem', fontSize: '1rem', textTransform: 'uppercase' }}>
            NUEVO ESTÁNDAR DE CAJA
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            {/* Código con autocomplete */}
            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.4rem', textTransform: 'uppercase' }}>Código Producto</label>
              <div ref={dropRef} style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="BUSCAR CÓDIGO O DESCRIPCIÓN..."
                  value={codeSearch}
                  onChange={e => { setCodeSearch(e.target.value); setShowCodeDrop(true) }}
                  onFocus={() => setShowCodeDrop(true)}
                  style={inputStyle}
                />
                {form.code && (
                  <div style={{ marginTop: '0.4rem', fontSize: '0.75rem', color: '#a78bfa', fontWeight: 700 }}>
                    ✓ {form.code} — {form.description}
                  </div>
                )}
                {showCodeDrop && codeSearch.length > 0 && filteredProducts.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                    background: '#0f172a', border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '0.75rem', marginTop: '0.25rem', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
                  }}>
                    {filteredProducts.map(p => (
                      <button key={p.code} type="button" onClick={() => {
                        setForm({ ...form, code: p.code, description: p.description })
                        setCodeSearch(p.code + ' — ' + p.description)
                        setShowCodeDrop(false)
                      }} style={{
                        display: 'block', width: '100%', padding: '0.75rem 1rem', textAlign: 'left',
                        background: 'transparent', border: 'none', color: 'white', cursor: 'pointer',
                        borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.8rem'
                      }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <span style={{ fontWeight: 700, color: '#a78bfa' }}>{p.code}</span>
                        <span style={{ color: '#94a3b8', marginLeft: '0.5rem' }}>{p.description}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Talla */}
            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.4rem', textTransform: 'uppercase' }}>Talla</label>
              <select value={form.talla} onChange={e => setForm({ ...form, talla: e.target.value })}
                style={{ ...inputStyle, background: '#0f172a' }}>
                {TALLAS.map(t => <option key={t} value={t} style={{ background: '#0f172a' }}>{t}</option>)}
              </select>
            </div>

            {/* Piezas por caja */}
            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.4rem', textTransform: 'uppercase' }}>Pzas / Caja Cerrada</label>
              <input
                type="number" min="1" placeholder="Ej. 52"
                value={form.pzas_por_caja} onChange={e => setForm({ ...form, pzas_por_caja: e.target.value })}
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button onClick={() => { setShowForm(false); setCodeSearch(''); setForm({ code: '', description: '', talla: 'XC', pzas_por_caja: '' }) }}
              style={{ ...btnBase, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 900 }}>
              CANCELAR
            </button>
            <button onClick={handleSave} disabled={saving}
              style={{ ...btnBase, background: 'rgba(167,139,250,0.2)', border: '1px solid rgba(167,139,250,0.3)', color: '#a78bfa', opacity: saving ? 0.7 : 1, textTransform: 'uppercase', fontWeight: 900 }}>
              {saving ? "GUARDANDO..." : "GUARDAR ESTÁNDAR"}
            </button>
          </div>
        </div>
      )}

      {/* Tabla */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#475569' }}>
          <div style={{ width: 32, height: 32, border: '4px solid rgba(255,255,255,0.1)', borderTopColor: '#EF4444', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
          <p style={{ marginTop: '1rem', fontWeight: 900, fontSize: '0.7rem', textTransform: 'uppercase' }}>CARGANDO ESTÁNDARES...</p>
        </div>
      ) : (
        <div className="glass" style={{ padding: 0, overflow: 'hidden', borderRadius: '1.5rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ background: 'rgba(0,0,0,0.3)', color: '#64748b', textTransform: 'uppercase', fontSize: '0.65rem' }}>
                <th style={{ padding: '1rem', textAlign: 'left' }}>Código</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>Descripción</th>
                <th style={{ padding: '1rem', textAlign: 'center' }}>Talla</th>
                <th style={{ padding: '1rem', textAlign: 'center' }}>Pzas / Caja</th>
                <th style={{ padding: '1rem', textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredStandards.length === 0 && (
                <tr><td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: '#475569' }}>
                  SIN ESTÁNDARES CONFIGURADOS. AGREGA EL PRIMERO.
                </td></tr>
              )}
              {filteredStandards.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'white' }}>
                  <td style={{ padding: '1rem', fontWeight: 900, fontFamily: 'monospace', color: '#a78bfa' }}>{s.code}</td>
                  <td style={{ padding: '1rem', color: '#94a3b8' }}>{s.description || '—'}</td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    <span style={{ background: 'rgba(255,255,255,0.08)', padding: '0.2rem 0.6rem', borderRadius: '0.5rem', fontWeight: 700 }}>{s.talla}</span>
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    {editId === s.id ? (
                      <input type="number" min="1" value={editPzas} onChange={e => setEditPzas(e.target.value)}
                        style={{ ...inputStyle, width: '70px', padding: '0.3rem 0.5rem', textAlign: 'center', display: 'inline-block' }}
                        autoFocus
                      />
                    ) : (
                      <span style={{ fontWeight: 900, color: '#fbbf24', fontSize: '1rem' }}>{s.pzas_por_caja}</span>
                    )}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                      {editId === s.id ? (
                        <>
                          <button onClick={() => handleEditSave(s.id)} style={{ background: '#10b981', border: 'none', color: 'white', borderRadius: '0.5rem', padding: '0.35rem 0.75rem', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 900, textTransform: 'uppercase' }}>
                            OK
                          </button>
                          <button onClick={() => setEditId(null)} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: '#94a3b8', borderRadius: '0.5rem', padding: '0.35rem 0.75rem', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 900, textTransform: 'uppercase' }}>
                            CANCELAR
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => { setEditId(s.id); setEditPzas(s.pzas_por_caja) }}
                            style={{ background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)', color: '#a78bfa', borderRadius: '0.5rem', padding: '0.35rem 0.75rem', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase' }}>
                            EDITAR
                          </button>
                          <button onClick={() => handleDelete(s.id, s.code, s.talla)}
                            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171', borderRadius: '0.5rem', padding: '0.35rem 0.75rem', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase' }}>
                            ELIMINAR
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
