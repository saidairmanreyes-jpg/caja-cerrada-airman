import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

// ─── Helpers ───────────────────────────────────────────────────────────────
const inputStyle = {
  width: '100%', background: 'rgba(15,23,42,0.6)',
  border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.625rem',
  padding: '0.75rem 1rem', color: 'white', fontSize: '0.875rem',
  outline: 'none', boxSizing: 'border-box',
}
const labelStyle = {
  display: 'block', fontSize: '0.6rem', fontWeight: 700,
  color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '0.375rem',
}

// ─── Main ─────────────────────────────────────────────────────────────────
export default function Picking() {
  const { activeWarehouse } = useAuth()
  const [workers, setWorkers]         = useState([])
  const [form, setForm]               = useState({ worker:'', code:'', talla:'', qty:'1', pedido:'', obs:'' })
  const [submitting, setSubmitting]   = useState(false)
  const [formError, setFormError]     = useState(null)
  const [success, setSuccess]         = useState(null)

  const fetchWorkers = useCallback(async () => {
    const { data } = await supabase
      .from('workers')
      .select('name')
      .eq('warehouse', activeWarehouse)
      .order('name')
    setWorkers(data || [])
  }, [activeWarehouse])

  useEffect(() => {
    fetchWorkers()
  }, [fetchWorkers])

  // ── Submit new requirement ─────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.worker || !form.code || !form.talla || !form.qty) {
      setFormError('COMPLETA TODOS LOS CAMPOS OBLIGATORIOS.'); return
    }
    setSubmitting(true); setFormError(null); setSuccess(null)

    const code  = form.code.toUpperCase().trim()
    const talla = form.talla.toUpperCase().trim()
    const qty   = parseInt(form.qty)

    // FIFO: find oldest inventory records for this code+talla with stock > 0
    const { data: stock, error: se } = await supabase
      .from('inventory')
      .select('id, quantity, location_id, entry_date, locations(name), products!inner(code)')
      .eq('products.code', code)
      .eq('talla', talla)
      .eq('warehouse', activeWarehouse)
      .gt('quantity', 0)
      .order('entry_date', { ascending: true })

    if (se || !stock || stock.length === 0) {
      setFormError(`SIN EXISTENCIAS PARA ${code} / ${talla}.`)
      setSubmitting(false); return
    }

    // Distribute across locations if needed (partial picks)
    let remaining = qty
    const picks = []
    for (const s of stock) {
      if (remaining <= 0) break
      picks.push({ ...s, take: Math.min(remaining, s.quantity) })
      remaining -= Math.min(remaining, s.quantity)
    }

    if (remaining > 0) {
      setFormError(`STOCK INSUFICIENTE. FALTAN ${remaining} PIEZAS.`)
      setSubmitting(false); return
    }

    // Insert one requirement row per pick location
    try {
      for (const pick of picks) {
        await supabase.from('requirements').insert({
          worker_name:       form.worker,
          product_code:      code,
          talla,
          quantity:          pick.take,
          pedido_num:        form.pedido.trim() || null,
          observaciones:     form.obs.trim() || null,
          status:            'pending',
          assigned_location: pick.locations.name,
          inventory_id:      pick.id,
          requested_at:      new Date().toISOString(),
          warehouse:         activeWarehouse,
        })
      }

      setSuccess(`SOLICITUD ENVIADA PARA ${qty} PZA(S) DE ${code}.`)
      setForm(prev => ({ ...prev, code:'', talla:'', qty:'1', pedido:'', obs:'' }))
    } catch (err) {
      setFormError('ERROR AL ENVIAR LA SOLICITUD.')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <div style={{maxWidth:'800px', margin:'0 auto', display:'flex', flexDirection:'column', gap:'2rem'}}>

      {/* ── New Requirement Form ─────────────────────────────────────────── */}
      <div className="glass" style={{border:'1px solid rgba(255,255,255,0.08)', borderRadius:'1.5rem', padding:'2.5rem'}}>
        <h3 style={{fontWeight:900, color:'white', fontSize:'1.25rem', marginBottom:'2rem', display:'flex', alignItems:'center', gap:'0.75rem', textTransform: 'uppercase'}}>
          NUEVA SOLICITUD DE SURTIDO — {activeWarehouse}
        </h3>
        
        <form onSubmit={handleSubmit}>
          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(250px,1fr))', gap:'1.5rem', marginBottom:'2rem'}}>
            {/* Worker */}
            <div style={{gridColumn:'1/-1'}}>
              <label style={labelStyle}>PERSONA AUTORIZADA (SOLICITANTE) *</label>
              <select value={form.worker} onChange={e => setForm({...form, worker:e.target.value})}
                style={{...inputStyle, cursor:'pointer', height:'3.25rem', textTransform:'uppercase', fontWeight: 700}}>
                <option value="">SELECCIONA UNA PERSONA</option>
                {workers.map(w => <option key={w.name} value={w.name} style={{ background: '#0f172a' }}>{w.name.toUpperCase()}</option>)}
              </select>
            </div>
            
            <div>
              <label style={labelStyle}>CÓDIGO DE PRODUCTO / SKU *</label>
              <input value={form.code} onChange={e => setForm({...form, code:e.target.value.toUpperCase()})}
                placeholder="EJ. PODRYCCGR1" style={{...inputStyle, height:'3.25rem', fontWeight: 700, fontFamily: 'monospace'}} />
            </div>
            
            <div>
              <label style={labelStyle}>TALLA / ESPECIFICACIÓN *</label>
              <input value={form.talla} onChange={e => setForm({...form, talla:e.target.value.toUpperCase()})}
                placeholder="EJ. MD, L, 32" style={{...inputStyle, height:'3.25rem', fontWeight: 700}} />
            </div>
            
            <div>
              <label style={labelStyle}>CANTIDAD SOLICITADA *</label>
              <input type="number" min="1" value={form.qty} onChange={e => setForm({...form, qty:e.target.value})}
                style={{...inputStyle, height:'3.25rem', fontWeight: 900, fontSize: '1.1rem'}} />
            </div>
            
            <div>
              <label style={labelStyle}>REFERENCIA / NÚM. DE PEDIDO</label>
              <input value={form.pedido} onChange={e => setForm({...form, pedido:e.target.value.toUpperCase()})}
                placeholder="EJ. #123456" style={{...inputStyle, height:'3.25rem', fontWeight: 700}} />
            </div>
            
            <div style={{gridColumn:'1/-1'}}>
              <label style={labelStyle}>OBSERVACIONES ADICIONALES</label>
              <textarea value={form.obs} onChange={e => setForm({...form, obs:e.target.value.toUpperCase()})}
                placeholder="PROCESOS ESPECIALES O DETALLES DEL SURTIDO..." rows={3}
                style={{...inputStyle, resize:'vertical', fontWeight: 700}} />
            </div>
          </div>

          {formError && (
            <div style={{display:'flex', alignItems:'center', gap:'0.75rem', color:'#f87171', fontSize:'0.85rem', fontWeight: 900, marginBottom:'1.5rem', background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:'0.75rem', padding:'1rem', textTransform: 'uppercase'}}>
              ⚠️ ERROR: {formError}
            </div>
          )}

          {success && (
            <div style={{display:'flex', alignItems:'center', gap:'0.75rem', color:'#4ade80', fontSize:'0.85rem', fontWeight: 900, marginBottom:'1.5rem', background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.2)', borderRadius:'0.75rem', padding:'1rem', textTransform: 'uppercase'}}>
              ✓ ÉXITO: {success}
            </div>
          )}

          <button type="submit" disabled={submitting} style={{
            width:'100%', padding:'1.25rem', borderRadius:'1.25rem',
            background: submitting ? 'rgba(239,68,68,0.5)' : '#EF4444',
            border:'none', color:'white', fontWeight: 950, fontSize:'1rem', letterSpacing:'0.1em',
            cursor:submitting?'not-allowed':'pointer', display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow: '0 10px 15px -3px rgba(239, 68, 68, 0.3)', transition: 'all 0.2s', textTransform: 'uppercase'
          }}>
            {submitting ? "BUSCANDO DISPONIBILIDAD..." : "ENVIAR SOLICITUD A COLA DE SURTIDO"}
          </button>
        </form>
      </div>
      
      <p style={{textAlign:'center', color:'#64748b', fontSize:'0.75rem', textTransform:'uppercase', letterSpacing:'0.1em', fontWeight: 800}}>
        EL SEGUIMIENTO DE ESTA SOLICITUD SE REALIZA EN EL PANEL DE <strong style={{ color: '#EF4444' }}>MONITOR</strong>.
      </p>
    </div>
  )
}

