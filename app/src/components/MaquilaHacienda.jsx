import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { QRCodeSVG } from 'qrcode.react'
import * as XLSX from 'xlsx'

// ─── CONSTANTES ──────────────────────────────────────────────────────────────

const TALLAS = ['XC', 'CH', 'MD', 'GD', 'XG', 'XX', '3X', '4X', '5X']

const MAQUILAS_LIST = ['HACIENDA', 'OTRA MAQUILA']

const inputStyle = {
  background: 'rgba(15,23,42,0.7)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '0.75rem',
  padding: '0.7rem 1rem',
  color: 'white',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  fontSize: '0.875rem',
}

const btnBase = {
  padding: '0.7rem 1.4rem',
  borderRadius: '0.75rem',
  border: 'none',
  color: 'white',
  fontWeight: 900,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'all 0.15s',
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.05em'
}

const card = {
  background: 'rgba(255,255,255,0.025)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '1.5rem',
  padding: '1.75rem',
}

// Genera un package_id numérico de 6 dígitos único
const genPkgId = () => Math.floor(100000 + Math.random() * 900000).toString()

// Formatea fecha en DDMMYY para el QR
const toQRDate = (d = new Date()) => {
  const day   = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year  = String(d.getFullYear()).substring(2)
  return `${day}${month}${year}`
}

// ─── COMPONENTE PRINCIPAL ────────────────────────────────────────────────────

export default function MaquilaHacienda() {
  const { isAdmin, profile } = useAuth()
  const isMaquilaRole = profile?.role === 'maquila'
  const [activeTab, setActiveTab] = useState(isMaquilaRole ? 'capture' : 'standards')

  // Tabs disponibles según rol
  // Tabs disponibles según rol
  const tabs = [
    ...(isAdmin ? [{ id: 'standards', label: 'ESTÁNDARES', color: '#a78bfa' }] : []),
    { id: 'capture',  label: 'ETIQUETADO', color: '#f87171' },
    ...(!isMaquilaRole ? [{ id: 'tracking', label: 'SEGUIMIENTO', color: '#fbbf24' }] : []),
    { id: 'history',  label: 'HISTORIAL', color: '#4ade80' },
  ]

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '1rem', overflowX: 'auto' }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              ...btnBase,
              background: activeTab === t.id ? `${t.color}22` : 'transparent',
              color: activeTab === t.id ? t.color : '#64748b',
              border: activeTab === t.id ? `1px solid ${t.color}44` : '1px solid transparent',
              padding: '0.6rem 1.25rem',
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {activeTab === 'standards' && isAdmin && <MaquilaStandards />}
        {activeTab === 'capture'   && <MaquilaLabelCapture />}
        {activeTab === 'tracking'  && !isMaquilaRole && <MaquilaTracking />}
        {activeTab === 'history'   && <MaquilaHistory />}
      </div>
    </div>
  )
}

// ─── ESTÁNDARES (solo Master) ─────────────────────────────────────────────────

function MaquilaStandards() {
  const { profile } = useAuth()
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
    const [{ data: stds }, { data: prods }] = await Promise.all([
      supabase.from('maquila_box_standards').select('*').order('code').order('talla'),
      supabase.from('products').select('code, description').order('code')
    ])
    setStandards(stds || [])
    setProducts(prods || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handler = (e) => { if (dropRef.current && !dropRef.current.contains(e.target)) setShowCodeDrop(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filteredProducts = products.filter(p =>
    p.code.toLowerCase().includes(codeSearch.toLowerCase()) ||
    p.description.toLowerCase().includes(codeSearch.toLowerCase())
  ).slice(0, 12)

  const filteredStandards = standards.filter(s =>
    s.code.toLowerCase().includes(search.toLowerCase()) ||
    (s.description || '').toLowerCase().includes(search.toLowerCase()) ||
    s.talla.toLowerCase().includes(search.toLowerCase())
  )

  const handleSave = async () => {
    if (!form.code || !form.talla || !form.pzas_por_caja) {
      alert('COMPLETA TODOS LOS CAMPOS'); return
    }
    setSaving(true)
    const payload = {
      code: form.code.trim().toUpperCase(),
      description: form.description,
      talla: form.talla.trim().toUpperCase(),
      pzas_por_caja: parseInt(form.pzas_por_caja),
      created_by: profile?.name || profile?.email || 'Master',
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase
      .from('maquila_box_standards')
      .upsert(payload, { onConflict: 'code,talla' })

    setSaving(false)
    if (error) { alert('ERROR: ' + error.message); return }
    setShowForm(false)
    setForm({ code: '', description: '', talla: 'XC', pzas_por_caja: '' })
    setCodeSearch('')
    fetchAll()
  }

  const handleEditSave = async (id) => {
    const { error } = await supabase
      .from('maquila_box_standards')
      .update({ pzas_por_caja: parseInt(editPzas), updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) { alert('ERROR: ' + error.message); return }
    setEditId(null)
    fetchAll()
  }

  const handleDelete = async (id, code, talla) => {
    if (!confirm(`¿ELIMINAR ESTÁNDAR ${code} / ${talla}?`)) return
    await supabase.from('maquila_box_standards').delete().eq('id', id)
    fetchAll()
  }

  const handleImport = (e) => {
    const file = e.target.files[0]; if (!file) return
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

        // Detectar encabezados del archivo para dar feedback útil
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
          created_by: profile?.name || 'Master',
          updated_at: new Date().toISOString(),
        })).filter(r => r.code && r.talla && r.pzas_por_caja > 0)

        if (rows.length === 0) {
          alert(
            '❌ NO SE ENCONTRARON FILAS VÁLIDAS EN EL ARCHIVO.\n\n' +
            'ENCABEZADOS DETECTADOS EN TU ARCHIVO:\n' +
            foundHeaders.map(h => `  • ${h}`).join('\n') +
            '\n\nENCEBEZADOS REQUERIDOS:\n' +
            '  • Código  (o CODIGO)\n' +
            '  • Descripción  (o DESCRIPCION)\n' +
            '  • Talla  (o TALLA)\n' +
            '  • Cantidad  (o PZAS_CAJA / PZAS POR CAJA)\n\n' +
            'ASEGÚRATE QUE LA FILA 1 TENGA ESTOS ENCABEZADOS Y QUE LOS DATOS EMPIECEN EN LA FILA 2.'
          )
          e.target.value = null
          return
        }

        // Enviar en lotes de 50 filas para evitar errores de payload grande
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
      } catch (err) { alert('ERROR AL IMPORTAR: ' + err.message) }
      e.target.value = null
    }
    reader.readAsBinaryString(file)
  }

  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(standards.map(s => ({
      'CODIGO': s.code, 'DESCRIPCION': s.description || '', 'TALLA': s.talla, 'PZAS_CAJA': s.pzas_por_caja
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Estandares_Maquila')
    XLSX.writeFile(wb, `Estandares_Maquila_${new Date().toLocaleDateString('es-MX').replace(/\//g, '-')}.xlsx`)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Encabezado */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 900, color: 'white', textTransform: 'uppercase' }}>
            ESTÁNDARES DE <span style={{ color: '#a78bfa' }}>CAJA POR TALLA</span>
          </h2>
          <p style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '0.25rem', fontWeight: 700, textTransform: 'uppercase' }}>
            DEFINE LAS PIEZAS POR CAJA CERRADA PARA CADA CÓDIGO Y TALLA.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <label
              style={{ ...btnBase, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', padding: '0.6rem 1rem', textTransform: 'uppercase', gap: '0.4rem' }}
              title={'ENCABEZADOS REQUERIDOS EN TU EXCEL:\n• Código (o CODIGO)\n• Descripción (o DESCRIPCION)\n• Talla (o TALLA)\n• Cantidad (o PZAS_CAJA)'}
            >
              📥 IMPORTAR EXCEL
              <input type="file" hidden accept=".xlsx,.xls" onChange={handleImport} />
            </label>
          </div>
          {/* Panel de ayuda encabezados */}
          <div style={{
            background: 'rgba(167,139,250,0.07)', border: '1px solid rgba(167,139,250,0.2)',
            borderRadius: '0.75rem', padding: '0.5rem 0.875rem',
            fontSize: '0.65rem', color: '#a78bfa', fontWeight: 700,
            lineHeight: 1.6, textTransform: 'uppercase'
          }}>
            <span style={{ display: 'block', color: '#64748b', marginBottom: '0.15rem' }}>📋 COLUMNAS REQUERIDAS EN EL EXCEL:</span>
            <span style={{ color: '#c4b5fd' }}>Código · Descripción · Talla · Cantidad</span>
          </div>
          <button onClick={handleExport} style={{ ...btnBase, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.6rem 1rem', textTransform: 'uppercase' }}>
            EXPORTAR
          </button>
          <button onClick={() => setShowForm(true)} style={{ ...btnBase, background: 'rgba(167,139,250,0.2)', border: '1px solid rgba(167,139,250,0.3)', color: '#a78bfa', textTransform: 'uppercase' }}>
            AGREGAR ESTÁNDAR
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
        <div style={{ ...card, border: '1px solid rgba(167,139,250,0.25)', background: 'rgba(167,139,250,0.04)' }}>
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
          <p style={{ marginTop: '1rem', fontWeight: 900, fontSize: '0.7rem', textTransform: 'uppercase' }}>CARGANDO...</p>
        </div>
      ) : (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
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

// ─── CAPTURA Y GENERACIÓN DE ETIQUETAS ───────────────────────────────────────

function MaquilaLabelCapture() {
  const { profile } = useAuth()
  const isMaquilaRole = profile?.role === 'maquila'

  const [products, setProducts] = useState([])
  const [maquilaMaquila, setMaquilaMaquila] = useState('HACIENDA')
  const [op, setOp] = useState('')
  const [auditor, setAuditor] = useState(isMaquilaRole ? (profile?.name || '') : '')
  const [lines, setLines] = useState([newLine()])
  const [standards, setStandards] = useState([])
  const [preview, setPreview] = useState(null)       // calculated boxes to print
  const [showConfirm, setShowConfirm] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [success, setSuccess] = useState('')
  const [labelsForPrint, setLabelsForPrint] = useState([]) // final label data

  function newLine() {
    return { id: Date.now() + Math.random(), code: '', description: '', descMaquila: '', talla: TALLAS[0], qty: '' }
  }

  useEffect(() => {
    Promise.all([
      supabase.from('products').select('code, description').order('code'),
      supabase.from('maquila_box_standards').select('*')
    ]).then(([{ data: prods }, { data: stds }]) => {
      setProducts(prods || [])
      setStandards(stds || [])
    })
  }, [])

  const updateLine = (id, field, value) =>
    setLines(ls => ls.map(l => l.id === id ? { ...l, [field]: value } : l))

  // Calcula cuántas etiquetas se generan por línea
  const calcBoxes = (qty, code, talla) => {
    const std = standards.find(s => s.code === code && s.talla === talla)
    if (!std || !qty) return null
    const ppb = std.pzas_por_caja
    const full = Math.floor(qty / ppb)
    const rem  = qty % ppb
    const boxes = []
    for (let i = 0; i < full; i++) boxes.push({ qty: ppb, is_partial: false })
    if (rem > 0) boxes.push({ qty: rem, is_partial: true })
    return { ppb, full, rem, boxes }
  }

  const buildPreview = () => {
    if (!op.trim() || !auditor.trim()) {
      alert('DEBES COMPLETAR MAQUILA, OP Y AUDITOR'); return
    }
    const valid = lines.filter(l => l.code && l.talla && parseInt(l.qty) > 0)
    if (valid.length === 0) { alert('AGREGA AL MENOS UNA LÍNEA CON CÓDIGO, TALLA Y CANTIDAD.'); return }
    const missing = valid.filter(l => !calcBoxes(parseInt(l.qty), l.code, l.talla))
    if (missing.length > 0) {
      alert(`⚠️ NO HAY ESTÁNDAR DE CAJA PARA: ${missing.map(l => `${l.code} / ${l.talla}`).join(', ')}. CONFIGÚRALO EN LA PESTAÑA ESTÁNDARES.`)
      return
    }
    const prev = valid.map(l => {
      const calc = calcBoxes(parseInt(l.qty), l.code, l.talla)
      return { ...l, qty: parseInt(l.qty), calc }
    })
    setPreview(prev)
    setShowConfirm(true)
  }

  const totalLabels = preview ? preview.reduce((acc, p) => acc + p.calc.boxes.length, 0) : 0

  const confirmAndPrint = async () => {
    setPrinting(true)
    const sessionId = crypto.randomUUID()
    const labelDate = toQRDate()
    const now = new Date().toISOString()
    const printedBy = profile?.name || profile?.email || 'OPERADOR'

    const labelsToInsert = []
    const inventoryToInsert = []
    const finalLabels = []

    for (const line of preview) {
      for (const box of line.calc.boxes) {
        const pkgId = genPkgId()
        const labelRow = {
          session_id: sessionId,
          maquila_name: maquilaMaquila,
          op: op.trim().toUpperCase(),
          maquila_description: line.descMaquila || line.description,
          code: line.code,
          talla: line.talla,
          qty_per_label: box.qty,
          total_qty: line.qty,
          is_partial: box.is_partial,
          auditor: auditor.trim(),
          package_id: pkgId,
          label_date: labelDate,
          printed_at: now,
          printed_by: printedBy,
          inventory_inserted: true,
        }
        labelsToInsert.push(labelRow)

        // Also insert into inventory as transit warehouse
        const product = products.find(p => p.code === line.code)
        inventoryToInsert.push({
          product_id: null, // Se resuelve abajo
          _code: line.code, // Temporal para lookup
          talla: line.talla,
          quantity: box.qty,
          op: op.trim().toUpperCase(),
          entry_date: now,
          received_by: auditor.trim(),
          warehouse: maquilaMaquila,
          package_id: pkgId,
        })

        finalLabels.push({
          ...labelRow,
          description: line.description,
        })
      }
    }

    // Resolve product_ids
    const codes = [...new Set(preview.map(l => l.code))]
    const { data: prodData } = await supabase.from('products').select('id, code').in('code', codes)
    const codeToId = {}
    if (prodData) prodData.forEach(p => { codeToId[p.code] = p.id })

    const inventoryPayloads = inventoryToInsert.map(({ _code, ...rest }) => ({
      ...rest,
      product_id: codeToId[_code] || null,
    }))

    // Persist labels
    const [{ error: lblErr }, { error: invErr }] = await Promise.all([
      supabase.from('maquila_production_labels').insert(labelsToInsert),
      supabase.from('inventory').insert(inventoryPayloads),
    ])

    setPrinting(false)

    if (lblErr || invErr) {
      alert('ERROR AL GUARDAR: ' + (lblErr?.message || invErr?.message))
      return
    }

    // Set labels for printing, then trigger browser print
    setLabelsForPrint(finalLabels)
    setShowConfirm(false)
    setSuccess(`✓ ${totalLabels} ETIQUETAS GENERADAS E INSERTADAS EN ALMACÉN ${maquilaMaquila}. IMPRIMIENDO...`)
    setTimeout(() => {
      window.print()
      // Reset form
      setLines([newLine()])
      setOp('')
      if (!isMaquilaRole) setAuditor('')
      setPreview(null)
      setTimeout(() => setSuccess(''), 5000)
    }, 300)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '960px', margin: '0 auto' }}>
      {/* Hidden print labels */}
      {labelsForPrint.length > 0 && (
        <MaquilaPrintArea labels={labelsForPrint} />
      )}

      <div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 900, color: 'white', textTransform: 'uppercase' }}>
          ETIQUETADO DE <span style={{ color: '#f87171' }}>PRODUCCIÓN</span>
        </h2>
        <p style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '0.25rem', fontWeight: 700, textTransform: 'uppercase' }}>
          CAPTURA LA PRODUCCIÓN DE LA OP Y EL SISTEMA CALCULA LAS CAJAS AUTOMÁTICAMENTE.
        </p>
      </div>

        <div style={{ padding: '1rem', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '1rem', color: '#4ade80', fontWeight: 900, textTransform: 'uppercase' }}>
          {success}
        </div>

      <div style={card}>
        {/* Cabecera OP */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1.75rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.4rem', textTransform: 'uppercase' }}>Maquila</label>
            {isMaquilaRole ? (
              <input readOnly value={maquilaMaquila} style={{ ...inputStyle, color: '#94a3b8' }} />
            ) : (
              <select value={maquilaMaquila} onChange={e => setMaquilaMaquila(e.target.value)} style={{ ...inputStyle, background: '#0f172a' }}>
                {MAQUILAS_LIST.map(m => <option key={m} value={m} style={{ background: '#0f172a' }}>{m}</option>)}
              </select>
            )}
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
              OP (ORDEN DE PRODUCCIÓN) <span style={{ color: '#f87171' }}>*</span>
            </label>
            <input type="text" placeholder="EJ. 1458" value={op} onChange={e => setOp(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
              AUDITOR (QUIEN EMPACA) <span style={{ color: '#f87171' }}>*</span>
            </label>
            <input type="text" placeholder="NOMBRE DEL AUDITOR" value={auditor} onChange={e => setAuditor(e.target.value)} style={inputStyle} />
          </div>
        </div>

        {/* Líneas de captura */}
        <div style={{ borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '1.5rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontWeight: 900, color: 'white', fontSize: '0.9rem', textTransform: 'uppercase' }}>CÓDIGOS PRODUCIDOS</h3>
            <button onClick={() => setLines(ls => [...ls, newLine()])}
              style={{ ...btnBase, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', color: '#f87171', padding: '0.5rem 1rem', fontSize: '0.8rem', fontWeight: 900, textTransform: 'uppercase' }}>
              AGREGAR CÓDIGO
            </button>
          </div>

          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 120px 32px', gap: '0.5rem', marginBottom: '0.5rem', padding: '0 0.25rem' }}>
            {['CÓDIGO INTERNO', 'DESCRIPCIÓN MAQUILA', 'TALLA', 'CANT. PRODUCIDA', ''].map((h, i) => (
              <span key={i} style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{h}</span>
            ))}
          </div>

          {lines.map((line, idx) => {
            const calc = line.code && line.qty ? calcBoxes(parseInt(line.qty), line.code, line.talla) : null
            return (
              <div key={line.id} style={{ marginBottom: '0.75rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 120px 32px', gap: '0.5rem', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '0.875rem', border: '1px solid rgba(255,255,255,0.06)' }}>
                  {/* Código con autocomplete */}
                  <CodeAutocomplete
                    products={products}
                    value={line.code}
                    displayValue={line.code ? (line.code + (line.description ? ` — ${line.description}` : '')) : ''}
                    onChange={(code, description) => {
                      setLines(ls => ls.map(l => l.id === line.id ? { ...l, code, description } : l))
                    }}
                  />
                  {/* Descripción maquila */}
                  <input
                    type="text" placeholder="CÓMO LA CONOCE LA MAQUILA..."
                    value={line.descMaquila}
                    onChange={e => updateLine(line.id, 'descMaquila', e.target.value)}
                    style={{ ...inputStyle, padding: '0.6rem 0.875rem' }}
                  />
                  {/* Talla */}
                  <select value={line.talla} onChange={e => updateLine(line.id, 'talla', e.target.value)}
                    style={{ ...inputStyle, background: '#0f172a', padding: '0.6rem 0.875rem' }}>
                    {TALLAS.map(t => <option key={t} value={t} style={{ background: '#0f172a' }}>{t}</option>)}
                  </select>
                  {/* Cantidad */}
                  <input
                    type="number" min="1" placeholder="0 PZAS"
                    value={line.qty} onChange={e => updateLine(line.id, 'qty', e.target.value)}
                    style={{ ...inputStyle, padding: '0.6rem 0.875rem', textAlign: 'center' }}
                  />
                  {/* Eliminar */}
                  {lines.length > 1 && (
                    <button onClick={() => setLines(ls => ls.filter(l => l.id !== line.id))}
                      style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: '0.25rem', fontWeight: 900 }}>
                      ✕
                    </button>
                  )}
                </div>

                {/* Preview inline del cálculo */}
                {calc && (
                  <div style={{ marginTop: '0.4rem', marginLeft: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{parseInt(line.qty)} PZAS / {calc.ppb} PZAS × CAJA =</span>
                    {calc.full > 0 && (
                      <span style={{ fontSize: '0.7rem', background: 'rgba(34,197,94,0.12)', color: '#4ade80', padding: '0.15rem 0.5rem', borderRadius: '0.4rem', fontWeight: 700 }}>
                        {calc.full} × {calc.ppb} PZAS (CERRADA{calc.full > 1 ? 'S' : ''})
                      </span>
                    )}
                    {calc.rem > 0 && (
                      <span style={{ fontSize: '0.7rem', background: 'rgba(251,191,36,0.12)', color: '#fbbf24', padding: '0.15rem 0.5rem', borderRadius: '0.4rem', fontWeight: 700 }}>
                        + 1 × {calc.rem} PZAS (PARCIAL)
                      </span>
                    )}
                    <span style={{ fontSize: '0.7rem', color: '#f87171', fontWeight: 700 }}>
                      = {calc.boxes.length} ETIQUETA{calc.boxes.length > 1 ? 'S' : ''}
                    </span>
                  </div>
                )}
                {line.code && line.talla && !calc && parseInt(line.qty) > 0 && (
                  <div style={{ marginTop: '0.4rem', marginLeft: '0.5rem', fontSize: '0.7rem', color: '#f87171' }}>
                    ⚠️ SIN ESTÁNDAR CONFIGURADO PARA {line.code} / {line.talla}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Botón preview / confirmar */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '0.5rem', borderTop: '1px dashed rgba(255,255,255,0.07)' }}>
          <button onClick={buildPreview}
            style={{ ...btnBase, background: 'linear-gradient(135deg, #ef4444, #b91c1c)', boxShadow: '0 4px 16px rgba(239,68,68,0.25)', textTransform: 'uppercase', fontWeight: 900, padding: '0.75rem 1.5rem' }}>
            REVISAR Y CONFIRMAR ETIQUETAS
          </button>
        </div>
      </div>

      {/* Modal de confirmación */}
      {showConfirm && preview && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
        }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '1.5rem', padding: '2rem', maxWidth: '600px', width: '100%', maxHeight: '80vh', overflowY: 'auto' }}>
            <h2 style={{ fontWeight: 900, color: 'white', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
              CONFIRMAR IMPRESIÓN
            </h2>
            <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '1.5rem', fontWeight: 700, textTransform: 'uppercase' }}>
              REVISA CUIDADOSAMENTE ANTES DE IMPRIMIR. {totalLabels} ETIQUETAS SE GENERARÁN PARA LA OP <strong style={{ color: 'white' }}>{op}</strong>.
            </p>

            {/* Summary cards */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              {[
                { label: 'MAQUILA', value: maquilaMaquila },
                { label: 'OP', value: op },
                { label: 'AUDITOR', value: auditor },
                { label: 'TOTAL ETIQUETAS', value: totalLabels },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '0.75rem', padding: '0.75rem 1rem', flex: '1', minWidth: '100px' }}>
                  <p style={{ fontSize: '0.65rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>{label}</p>
                  <p style={{ fontWeight: 900, color: 'white', fontSize: '1.1rem' }}>{value}</p>
                </div>
              ))}
            </div>

            {/* Detail per line */}
            {preview.map((line, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.025)', borderRadius: '0.875rem', padding: '1rem', marginBottom: '0.75rem', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <div>
                    <p style={{ fontWeight: 900, color: '#a78bfa', fontFamily: 'monospace' }}>{line.code}</p>
                    <p style={{ color: '#64748b', fontSize: '0.8rem' }}>{line.descMaquila || line.description}</p>
                  </div>
                  <span style={{ fontWeight: 700, color: '#fbbf24', background: 'rgba(251,191,36,0.1)', padding: '0.2rem 0.6rem', borderRadius: '0.5rem', fontSize: '0.8rem' }}>
                    TALLA {line.talla} · {line.qty} PZAS
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {line.calc.boxes.map((b, j) => (
                    <span key={j} style={{
                      fontSize: '0.75rem', fontWeight: 700,
                      background: b.is_partial ? 'rgba(251,191,36,0.12)' : 'rgba(34,197,94,0.12)',
                      color: b.is_partial ? '#fbbf24' : '#4ade80',
                      padding: '0.3rem 0.7rem', borderRadius: '0.5rem',
                      border: `1px solid ${b.is_partial ? 'rgba(251,191,36,0.2)' : 'rgba(34,197,94,0.2)'}`
                    }}>
                      CAJA {j + 1}: {b.qty} PZAS {b.is_partial ? '(PARCIAL)' : '(CERRADA)'}
                    </span>
                  ))}
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <button onClick={() => setShowConfirm(false)}
                style={{ ...btnBase, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 900 }}>
                CORREGIR
              </button>
              <button onClick={confirmAndPrint} disabled={printing}
                style={{ ...btnBase, background: 'linear-gradient(135deg, #ef4444, #b91c1c)', boxShadow: '0 4px 16px rgba(239,68,68,0.2)', opacity: printing ? 0.7 : 1, textTransform: 'uppercase', fontWeight: 900 }}>
                {printing ? "GENERANDO..." : `CONFIRMAR E IMPRIMIR ${totalLabels} ETIQUETAS`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── AUTOCOMPLETE DE CÓDIGO ───────────────────────────────────────────────────

function CodeAutocomplete({ products, value, onChange }) {
  const [search, setSearch] = useState(value ? (value + (products.find(p => p.code === value)?.description ? ` — ${products.find(p => p.code === value)?.description}` : '')) : '')
  const [show, setShow] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setShow(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  // When value changes externally, sync display
  useEffect(() => {
    if (!value) setSearch('')
  }, [value])

  const filtered = products.filter(p =>
    p.code.toLowerCase().includes(search.toLowerCase()) ||
    p.description.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 10)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        type="text" placeholder="CÓDIGO O DESCRIPCIÓN..."
        value={search}
        onChange={e => { setSearch(e.target.value); setShow(true) }}
        onFocus={() => setShow(true)}
        style={{ ...inputStyle, padding: '0.6rem 0.875rem', fontFamily: value ? 'monospace' : 'inherit', fontSize: value ? '0.8rem' : '0.875rem' }}
      />
      {show && search.length > 0 && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: '#0f172a', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '0.75rem', marginTop: '0.25rem', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.6)'
        }}>
          {filtered.map(p => (
            <button key={p.code} type="button" onClick={() => {
              onChange(p.code, p.description)
              setSearch(`${p.code} — ${p.description}`)
              setShow(false)
            }} style={{
              display: 'block', width: '100%', padding: '0.65rem 1rem', textAlign: 'left',
              background: 'transparent', border: 'none', cursor: 'pointer',
              borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '0.78rem', color: 'white'
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ fontWeight: 700, color: '#a78bfa', fontFamily: 'monospace' }}>{p.code}</span>
              <span style={{ color: '#94a3b8', marginLeft: '0.5rem' }}>{p.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── SEGUIMIENTO HACIENDA → MATRIZ ───────────────────────────────────────────

function MaquilaTracking() {
  const [ops, setOps] = useState([])
  const [loading, setLoading] = useState(true)
  const [cancelTarget, setCancelTarget] = useState(null)  // { maquila, op, pkgIds }
  const [cancelling, setCancelling] = useState(false)

  const fetchTracking = useCallback(async () => {
    setLoading(true)

    const { data: labels } = await supabase
      .from('maquila_production_labels')
      .select('op, maquila_name, package_id, code, talla, qty_per_label, is_partial, printed_at')
      .order('printed_at', { ascending: false })

    if (!labels) { setLoading(false); return }

    const pkgIds = labels.map(l => l.package_id)
    const { data: invRecords } = await supabase
      .from('inventory')
      .select('package_id, warehouse')
      .in('package_id', pkgIds)

    const invMap = {}
    if (invRecords) invRecords.forEach(r => { invMap[r.package_id] = r.warehouse })

    const grouped = {}
    for (const label of labels) {
      const key = `${label.maquila_name}::${label.op}`
      if (!grouped[key]) {
        grouped[key] = {
          maquila: label.maquila_name,
          op: label.op,
          printed_at: label.printed_at,
          labels: []
        }
      }
      grouped[key].labels.push({
        ...label,
        current_warehouse: invMap[label.package_id] || label.maquila_name,
      })
    }

    const result = Object.values(grouped).map(g => {
      const sent     = g.labels.length
      const received = g.labels.filter(l => l.current_warehouse !== g.maquila).length
      const pending  = sent - received
      return { ...g, sent, received, pending, status: pending === 0 ? 'complete' : 'pending' }
    }).sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1
      if (b.status === 'pending' && a.status !== 'pending') return 1
      return new Date(b.printed_at) - new Date(a.printed_at)
    })

    setOps(result)
    setLoading(false)
  }, [])

  useEffect(() => { fetchTracking() }, [fetchTracking])

  const [expandedOp, setExpandedOp] = useState(null)

  // ── Cancela el seguimiento de una OP o de una sola caja ────────────────────
  const handleCancelTracking = async () => {
    if (!cancelTarget) return
    setCancelling(true)
    const { maquila, op: opNum, pkgIds, isSingleBox } = cancelTarget
    try {
      if (isSingleBox && pkgIds && pkgIds.length === 1) {
        const { error: lblErr } = await supabase
          .from('maquila_production_labels')
          .delete()
          .eq('package_id', pkgIds[0])
        if (lblErr) throw new Error('Error al eliminar etiqueta: ' + lblErr.message)
      } else {
        const { error: lblErr } = await supabase
          .from('maquila_production_labels')
          .delete()
          .eq('maquila_name', maquila)
          .eq('op', opNum)
        if (lblErr) throw new Error('Error al eliminar etiquetas: ' + lblErr.message)
      }

      if (pkgIds && pkgIds.length > 0) {
        const { error: invErr } = await supabase
          .from('inventory')
          .delete()
          .in('package_id', pkgIds)
        if (invErr) throw new Error('Error al eliminar inventario: ' + invErr.message)
      }

      setCancelTarget(null)
      if (!isSingleBox) {
        setExpandedOp(null)
      }
      await fetchTracking()
    } catch (err) {
      alert('⚠️ ' + err.message)
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 900, color: 'white', textTransform: 'uppercase' }}>
            SEGUIMIENTO <span style={{ color: '#fbbf24' }}>MAQUILAS → MATRIZ</span>
          </h2>
          <p style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '0.25rem', fontWeight: 700, textTransform: 'uppercase' }}>
            MONITOREA QUÉ CAJAS SE IMPRIMIERON Y CUÁLES YA SE RECIBIERON EN DESTINO.
          </p>
        </div>
        <button onClick={fetchTracking} style={{ ...btnBase, background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24', padding: '0.6rem 1rem', textTransform: 'uppercase', fontWeight: 900 }}>
          ACTUALIZAR
        </button>
      </div>

      {/* Resumen de Tránsito */}
      {!loading && ops.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div style={{ ...card, padding: '1.25rem', border: '1px solid rgba(251,191,36,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <p style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>TOTAL EN TRÁNSITO</p>
                <p style={{ fontSize: '2rem', fontWeight: 900, color: '#fbbf24' }}>{ops.reduce((acc, op) => acc + op.pending, 0)}</p>
              </div>
            </div>
            <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem', textTransform: 'uppercase' }}>CAJAS PENDIENTES DE RECIBIR EN MATRIZ</p>
          </div>
          <div style={{ ...card, padding: '1.25rem', border: '1px solid rgba(239,68,68,0.2)' }}>
            <p style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>OPS INCOMPLETAS</p>
            <p style={{ fontSize: '2rem', fontWeight: 900, color: '#f87171' }}>{ops.filter(op => op.status === 'pending').length}</p>
          </div>
          <div style={{ ...card, padding: '1.25rem', border: '1px solid rgba(34,197,94,0.2)' }}>
            <p style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>PZAS TOTALES</p>
            <p style={{ fontSize: '2rem', fontWeight: 900, color: '#4ade80' }}>
              {ops.reduce((acc, op) => acc + op.labels.filter(lg => lg.current_warehouse === op.maquila).reduce((a, b) => a + b.qty_per_label, 0), 0)}
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#475569' }}>
          <div style={{ width: 32, height: 32, border: '4px solid rgba(255,255,255,0.1)', borderTopColor: '#EF4444', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
          <p style={{ marginTop: '1rem', fontWeight: 900, fontSize: '0.7rem', textTransform: 'uppercase' }}>CARGANDO...</p>
        </div>
      ) : ops.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '3rem', opacity: 0.5, textTransform: 'uppercase', fontWeight: 900 }}>
          SIN OPS REGISTRADAS AÚN.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {ops.map(op => {
            const isComplete = op.status === 'complete'
            const isExpanded = expandedOp === `${op.maquila}::${op.op}`
            const borderColor  = isComplete ? 'rgba(34,197,94,0.25)'  : 'rgba(239,68,68,0.35)'
            const bgColor      = isComplete ? 'rgba(34,197,94,0.04)'  : 'rgba(239,68,68,0.06)'
            const accentColor  = isComplete ? '#4ade80' : '#f87171'

            return (
              <div key={`${op.maquila}::${op.op}`} style={{ background: bgColor, border: `1px solid ${borderColor}`, borderRadius: '1.25rem', overflow: 'hidden' }}>
                <div onClick={() => setExpandedOp(isExpanded ? null : `${op.maquila}::${op.op}`)}
                  style={{ padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: `${accentColor}22`, color: accentColor, border: `1px solid ${accentColor}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 }}>
                      {isComplete ? "✓" : "!"}
                    </div>
                    <div>
                      <p style={{ fontWeight: 900, color: 'white', fontSize: '1.05rem' }}>
                        {op.maquila} — OP: <span style={{ color: accentColor }}>{op.op}</span>
                      </p>
                      <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.1rem' }}>
                        IMPRESO: {new Date(op.printed_at).toLocaleString('es-MX')}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: '0.6rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>ENVIADAS</p>
                      <p style={{ fontWeight: 900, color: 'white', fontSize: '1.25rem' }}>{op.sent}</p>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: '0.6rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>RECIBIDAS</p>
                      <p style={{ fontWeight: 900, color: '#4ade80', fontSize: '1.25rem' }}>{op.received}</p>
                    </div>
                    {op.pending > 0 && (
                      <div style={{ textAlign: 'center', background: 'rgba(239,68,68,0.12)', padding: '0.5rem 0.75rem', borderRadius: '0.75rem', border: '1px solid rgba(239,68,68,0.2)' }}>
                        <p style={{ fontSize: '0.6rem', color: '#f87171', textTransform: 'uppercase', fontWeight: 700 }}>PENDIENTES</p>
                        <p style={{ fontWeight: 900, color: '#f87171', fontSize: '1.25rem' }}>{op.pending}</p>
                      </div>
                    )}
                    <span style={{ fontSize: '0.8rem', color: '#64748b', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'none', fontWeight: 900 }}>▼</span>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ padding: '0 1.5rem 1.5rem', borderTop: `1px solid ${borderColor}` }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', marginTop: '1rem' }}>
                      <thead>
                        <tr style={{ color: '#64748b', fontSize: '0.65rem', textTransform: 'uppercase' }}>
                          <th style={{ padding: '0.5rem', textAlign: 'left' }}>PACKAGE ID</th>
                          <th style={{ padding: '0.5rem', textAlign: 'left' }}>CÓDIGO</th>
                          <th style={{ padding: '0.5rem', textAlign: 'center' }}>Talla</th>
                          <th style={{ padding: '0.5rem', textAlign: 'center' }}>PZAS</th>
                          <th style={{ padding: '0.5rem', textAlign: 'center' }}>Tipo</th>
                          <th style={{ padding: '0.5rem', textAlign: 'center' }}>ESTADO</th>
                          <th style={{ padding: '0.5rem', textAlign: 'center' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {op.labels.map(l => {
                          const receivedBox = l.current_warehouse !== op.maquila
                          return (
                            <tr key={l.package_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', color: 'white' }}>
                              <td style={{ padding: '0.6rem 0.5rem', fontFamily: 'monospace', color: '#64748b', fontSize: '0.75rem' }}>{l.package_id}</td>
                              <td style={{ padding: '0.6rem 0.5rem', fontWeight: 700, color: '#a78bfa', fontFamily: 'monospace' }}>{l.code}</td>
                              <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>{l.talla}</td>
                              <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center', fontWeight: 700 }}>{l.qty_per_label}</td>
                              <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>
                                <span style={{ fontSize: '0.65rem', background: l.is_partial ? 'rgba(251,191,36,0.12)' : 'rgba(34,197,94,0.12)', color: l.is_partial ? '#fbbf24' : '#4ade80', padding: '0.15rem 0.5rem', borderRadius: '0.4rem', fontWeight: 700 }}>
                                  {l.is_partial ? 'PARCIAL' : 'CERRADA'}
                                </span>
                              </td>
                              <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>
                                <span style={{ fontSize: '0.65rem', background: receivedBox ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', color: receivedBox ? '#4ade80' : '#f87171', padding: '0.15rem 0.6rem', borderRadius: '0.4rem', fontWeight: 700 }}>
                                  {receivedBox ? `✓ ${l.current_warehouse}` : `⏳ ${l.current_warehouse}`}
                                </span>
                              </td>
                              <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>
                                {!receivedBox && (
                                  <button onClick={(e) => {
                                    e.stopPropagation()
                                    setCancelTarget({
                                      isSingleBox: true,
                                      maquila: op.maquila,
                                      op: op.op,
                                      pkgIds: [l.package_id],
                                      code: l.code
                                    })
                                  }} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.7rem' }}>
                                    CANCELAR CAJA
                                  </button>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>

                    {/* ── Botón cancelar seguimiento ── */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px dashed rgba(255,255,255,0.07)' }}>
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          setCancelTarget({ maquila: op.maquila, op: op.op, pkgIds: op.labels.map(l => l.package_id) })
                        }}
                        style={{
                          ...btnBase,
                          background: 'rgba(239,68,68,0.08)',
                          border: '1px solid rgba(239,68,68,0.25)',
                          color: '#f87171',
                          padding: '0.6rem 1.25rem',
                          textTransform: 'uppercase',
                          fontWeight: 900,
                        }}
                      >
                        🗑 CANCELAR SEGUIMIENTO DE OP
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Modal de confirmación de cancelación ── */}
      {cancelTarget && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 2000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
        }}>
          <div style={{
            background: '#0f172a', border: '1px solid rgba(239,68,68,0.4)',
            borderRadius: '1.5rem', padding: '2rem', maxWidth: '480px', width: '100%',
            boxShadow: '0 24px 64px rgba(0,0,0,0.7)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.5rem', flexShrink: 0
              }}>⚠️</div>
              <div>
                <h3 style={{ fontWeight: 900, color: 'white', fontSize: '1.1rem', textTransform: 'uppercase' }}>
                  CANCELAR SEGUIMIENTO
                </h3>
                <p style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '0.15rem', fontWeight: 700, textTransform: 'uppercase' }}>
                  ESTA ACCIÓN NO SE PUEDE DESHACER
                </p>
              </div>
            </div>

            <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: '0.875rem', padding: '1rem', marginBottom: '1.25rem' }}>
              <p style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                {cancelTarget.isSingleBox ? 'CAJA A CANCELAR:' : 'OP A CANCELAR:'}
              </p>
              <p style={{ fontWeight: 900, color: 'white', fontSize: '1.05rem' }}>
                {cancelTarget.isSingleBox 
                  ? <>{cancelTarget.code} — PKG: <span style={{ color: '#f87171' }}>{cancelTarget.pkgIds[0]}</span></>
                  : <>{cancelTarget.maquila} — OP: <span style={{ color: '#f87171' }}>{cancelTarget.op}</span></>}
              </p>
              <p style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '0.5rem', fontWeight: 700, textTransform: 'uppercase' }}>
                {cancelTarget.isSingleBox 
                  ? <>Se eliminará <span style={{ color: '#f87171' }}>1 etiqueta</span> y su registro de inventario en ALMACÉN.</>
                  : <>Se eliminarán <span style={{ color: '#f87171' }}>{cancelTarget.pkgIds.length} etiqueta{cancelTarget.pkgIds.length !== 1 ? 's' : ''}</span> y sus registros de inventario en ALMACÉN.</>}
              </p>
            </div>

            <p style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '1.5rem', lineHeight: 1.6 }}>
              {cancelTarget.isSingleBox 
                ? '¿CONFIRMAS QUE DESEAS ELIMINAR ESTA CAJA DEL SEGUIMIENTO?' 
                : '¿CONFIRMAS QUE DESEAS ELIMINAR COMPLETAMENTE EL SEGUIMIENTO DE ESTA OP?'}
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setCancelTarget(null)}
                disabled={cancelling}
                style={{ ...btnBase, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 900, opacity: cancelling ? 0.5 : 1 }}
              >
                NO, MANTENER
              </button>
              <button
                onClick={handleCancelTracking}
                disabled={cancelling}
                style={{ ...btnBase, background: 'linear-gradient(135deg, #ef4444, #b91c1c)', boxShadow: '0 4px 16px rgba(239,68,68,0.3)', textTransform: 'uppercase', fontWeight: 900, opacity: cancelling ? 0.7 : 1, minWidth: '160px' }}
              >
                {cancelling ? 'CANCELANDO...' : (cancelTarget.isSingleBox ? 'SÍ, CANCELAR CAJA' : 'SÍ, CANCELAR OP')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── HISTORIAL + RE-IMPRESIÓN ─────────────────────────────────────────────────

function MaquilaHistory() {
  const { isAdmin } = useAuth()
  const [labels, setLabels] = useState([])
  const [loading, setLoading] = useState(true)
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [endDate, setEndDate]   = useState(new Date().toISOString().split('T')[0])
  const [filterMaquila, setFilterMaquila] = useState('')
  const [filterOp, setFilterOp] = useState('')
  const [reprintLabel, setReprintLabel] = useState(null)

  const fetchLabels = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('maquila_production_labels')
      .select('*')
      .order('printed_at', { ascending: false })

    if (startDate) query = query.gte('printed_at', `${startDate}T00:00:00.000Z`)
    if (endDate)   query = query.lte('printed_at', `${endDate}T23:59:59.999Z`)
    if (filterMaquila) query = query.ilike('maquila_name', `%${filterMaquila}%`)
    if (filterOp)      query = query.ilike('op', `%${filterOp}%`)

    const { data } = await query
    setLabels(data || [])
    setLoading(false)
  }, [startDate, endDate, filterMaquila, filterOp])

  useEffect(() => { fetchLabels() }, [fetchLabels])

  const handleReprint = (label) => {
    setReprintLabel(label)
    setTimeout(() => { window.print(); setReprintLabel(null) }, 300)
  }

  const exportXlsx = () => {
    if (!isAdmin) return
    const rows = labels.map(l => ({
      'Maquila': l.maquila_name,
      'OP': l.op,
      'Descripción Maquila': l.maquila_description || '',
      'Código': l.code,
      'Talla': l.talla,
      'Pzas Etiqueta': l.qty_per_label,
      'Total Producido': l.total_qty,
      'Tipo': l.is_partial ? 'PARCIAL' : 'CERRADA',
      'Auditor': l.auditor,
      'Package ID': l.package_id,
      'Fecha QR': l.label_date,
      'Impreso Por': l.printed_by || '',
      'Fecha Impresión': new Date(l.printed_at).toLocaleString('es-MX'),
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Etiquetas')
    XLSX.writeFile(wb, `Etiquetas_${filterMaquila || 'TODAS'}_${startDate}_${endDate}.xlsx`)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Reprint hidden area */}
      {reprintLabel && <MaquilaPrintArea labels={[reprintLabel]} />}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 900, color: 'white', textTransform: 'uppercase' }}>
            HISTORIAL DE <span style={{ color: '#4ade80' }}>ETIQUETAS</span>
          </h2>
          <p style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '0.25rem', fontWeight: 700, textTransform: 'uppercase' }}>
            TODAS LAS ETIQUETAS GENERADAS. {isAdmin ? 'PUEDES EXPORTAR Y RE-IMPRIMIR.' : 'RE-IMPRESIÓN DISPONIBLE.'}
          </p>
        </div>
        {isAdmin && (
          <button onClick={exportXlsx} style={{ ...btnBase, background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.25)', color: '#4ade80', textTransform: 'uppercase', fontWeight: 900 }}>
            EXPORTAR EXCEL
          </button>
        )}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>DESDE:</span>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ ...inputStyle, width: 'auto', padding: '0.4rem 0.75rem' }} />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>HASTA:</span>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ ...inputStyle, width: 'auto', padding: '0.4rem 0.75rem' }} />
        </div>
        <input type="text" placeholder="MAQUILA..." value={filterMaquila} onChange={e => setFilterMaquila(e.target.value)} style={{ ...inputStyle, width: '140px', padding: '0.4rem 0.75rem', textTransform: 'uppercase' }} />
        <input type="text" placeholder="BUSCAR OP..." value={filterOp} onChange={e => setFilterOp(e.target.value)} style={{ ...inputStyle, width: '140px', padding: '0.4rem 0.75rem', textTransform: 'uppercase' }} />
        <button onClick={fetchLabels} style={{ ...btnBase, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', padding: '0.4rem 1rem', textTransform: 'uppercase', fontWeight: 900 }}>
          BUSCAR
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#475569' }}>
          <div style={{ width: 32, height: 32, border: '4px solid rgba(255,255,255,0.1)', borderTopColor: '#EF4444', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
          <p style={{ marginTop: '1rem', fontWeight: 900, fontSize: '0.7rem', textTransform: 'uppercase' }}>CARGANDO...</p>
        </div>
      ) : (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '0.75rem 1rem', background: 'rgba(0,0,0,0.2)', fontSize: '0.75rem', color: '#64748b', fontWeight: 900, textTransform: 'uppercase' }}>
            {labels.length} ETIQUETA{labels.length !== 1 ? 'S' : ''} ENCONTRADA{labels.length !== 1 ? 'S' : ''}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', minWidth: '800px' }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.25)', color: '#64748b', textTransform: 'uppercase', fontSize: '0.65rem' }}>
                  {['Maquila', 'OP', 'Descripción', 'Código', 'Talla', 'Pzas', 'Tipo', 'Auditor', 'PKG ID', 'Fecha', ''].map((h, i) => (
                    <th key={i} style={{ padding: '0.85rem 0.75rem', textAlign: i >= 4 ? 'center' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {labels.length === 0 ? (
                  <tr><td colSpan={11} style={{ padding: '3rem', textAlign: 'center', color: '#475569' }}>
                    SIN ETIQUETAS EN ESTE RANGO DE FECHAS.
                  </td></tr>
                ) : labels.map(l => (
                  <tr key={l.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', color: 'white' }}>
                    <td style={{ padding: '0.75rem', fontWeight: 700, color: '#f87171' }}>{l.maquila_name}</td>
                    <td style={{ padding: '0.75rem', fontWeight: 700 }}>{l.op}</td>
                    <td style={{ padding: '0.75rem', color: '#94a3b8', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.maquila_description || '—'}</td>
                    <td style={{ padding: '0.75rem', fontFamily: 'monospace', color: '#a78bfa', fontWeight: 700 }}>{l.code}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                      <span style={{ background: 'rgba(255,255,255,0.08)', padding: '0.15rem 0.5rem', borderRadius: '0.4rem', fontWeight: 700 }}>{l.talla}</span>
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'center', fontWeight: 900, color: '#fbbf24' }}>{l.qty_per_label}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                      <span style={{ fontSize: '0.65rem', background: l.is_partial ? 'rgba(251,191,36,0.12)' : 'rgba(34,197,94,0.12)', color: l.is_partial ? '#fbbf24' : '#4ade80', padding: '0.15rem 0.5rem', borderRadius: '0.4rem', fontWeight: 700 }}>
                        {l.is_partial ? 'PARCIAL' : 'CERRADA'}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem', color: '#94a3b8' }}>{l.auditor}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'center', fontFamily: 'monospace', color: '#64748b', fontSize: '0.72rem' }}>{l.package_id}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'center', color: '#64748b', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                      {new Date(l.printed_at).toLocaleDateString('es-MX')}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                      <button onClick={() => handleReprint(l)}
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', borderRadius: '0.5rem', padding: '0.35rem 0.6rem', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 900, whiteSpace: 'nowrap', textTransform: 'uppercase' }}
                        title="RE-IMPRIMIR ESTA ETIQUETA"
                      >
                        RE-IMPRIMIR
                      </button>
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

// ─── ÁREA DE IMPRESIÓN DE ETIQUETAS ──────────────────────────────────────────

function MaquilaPrintArea({ labels }) {
  if (!labels || labels.length === 0) return null

  return (
    <div id="maquila-print-area" style={{ position: 'fixed', top: '-9999px', left: '-9999px' }}>
      {labels.map((label, idx) => (
        <MaquilaLabel key={`${label.package_id}-${idx}`} label={label} />
      ))}
      <style>{`
        @page { size: 150mm 100mm; margin: 0; }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
          body * { visibility: hidden !important; }
          #maquila-print-area, #maquila-print-area * { visibility: visible !important; }
          #maquila-print-area {
            position: absolute !important;
            left: 0 !important; top: 0 !important;
            margin: 0 !important; padding: 0 !important;
          }
          .maquila-label {
            page-break-after: always;
            width: 150mm !important;
            height: 100mm !important;
          }
          .maquila-label:last-child { page-break-after: avoid; }
        }
      `}</style>
    </div>
  )
}

function MaquilaLabel({ label }) {
  const qrValue = `${label.code}]${label.talla}]${label.qty_per_label}]${label.op}]${label.label_date}]${label.package_id}`

  return (
    <div className="maquila-label" style={{
      width: '150mm', height: '100mm',
      padding: '4mm 8mm',
      boxSizing: 'border-box',
      background: 'white', color: 'black',
      fontFamily: 'Arial, sans-serif',
      display: 'flex', flexDirection: 'column',
      justifyContent: 'space-between',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '3pt solid black', paddingBottom: '2mm' }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: '18pt', letterSpacing: '0.5pt', lineHeight: 1.1 }}>
            AIRMAN <span style={{ color: '#cc0000' }}>WMS</span>
          </div>
          <div style={{ fontSize: '8pt', fontWeight: 700, letterSpacing: '1pt', textTransform: 'uppercase', color: '#666' }}>
            Maquila: {label.maquila_name}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4mm' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '8pt', color: '#666', fontWeight: 700 }}>OP</div>
            <div style={{ fontSize: '14pt', fontWeight: 900, lineHeight: 1 }}>{label.op}</div>
            <div style={{ fontSize: '7pt', color: '#888', marginTop: '1mm' }}>
              {new Date(label.printed_at || new Date()).toLocaleDateString('es-MX')}
            </div>
          </div>
          <div style={{ background: 'white', padding: '1mm', border: '1px solid #eee', borderRadius: '1mm' }}>
            <QRCodeSVG value={qrValue} size={72} level="M" includeMargin={false} />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '2mm 0' }}>
        <div style={{ fontSize: '40pt', fontWeight: 950, textAlign: 'center', letterSpacing: '0.5mm', lineHeight: 1.05, fontFamily: 'Arial, sans-serif', whiteSpace: 'nowrap' }}>
          {label.code}
        </div>
        <div style={{ fontSize: '9pt', fontWeight: 700, textAlign: 'center', textTransform: 'uppercase', color: '#333', maxWidth: '130mm', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '1mm' }}>
          {label.maquila_description || label.description || ''}
        </div>
      </div>

      {/* Footer */}
      <div style={{ borderTop: '3pt solid black', paddingTop: '2mm', display: 'flex', gap: '2mm' }}>
        {/* Talla */}
        <div style={{ flex: '0 0 30mm' }}>
          <div style={{ fontSize: '7pt', textTransform: 'uppercase', fontWeight: 700, color: '#666' }}>TALLA</div>
          <div style={{ fontSize: '30pt', fontWeight: 900, lineHeight: 1 }}>{label.talla}</div>
        </div>
        {/* Cantidad */}
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '7pt', textTransform: 'uppercase', fontWeight: 700, color: '#666' }}>CANTIDAD</div>
          <div style={{ fontSize: '26pt', fontWeight: 900, lineHeight: 1 }}>
            {label.qty_per_label} <span style={{ fontSize: '13pt' }}>Pz</span>
          </div>
          {label.is_partial && (
            <div style={{ fontSize: '6pt', fontWeight: 900, color: '#cc7700', background: '#fff3cd', padding: '1mm 2mm', borderRadius: '1pt', display: 'inline-block', marginTop: '1mm', textTransform: 'uppercase', border: '1pt solid #cc7700' }}>
              ★ CAJA PARCIAL
            </div>
          )}
        </div>
        {/* Auditor + PKG */}
        <div style={{ flex: '0 0 45mm', textAlign: 'right' }}>
          <div style={{ fontSize: '7pt', textTransform: 'uppercase', fontWeight: 700, color: '#666' }}>AUDITOR</div>
          <div style={{ fontSize: '9pt', fontWeight: 900, lineHeight: 1.2 }}>{label.auditor}</div>
          <div style={{ fontSize: '6pt', color: '#888', marginTop: '1mm' }}>PKG: {label.package_id}</div>
        </div>
      </div>
    </div>
  )
}
