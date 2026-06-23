import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'


export default function KanbanStockERP({ showMessage }) {
  const [stock, setStock] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchERPStock()
  }, [])

  const fetchERPStock = async () => {
    setLoading(true)
    try {
      // Logic for active warehouses: MEXICO, MONTERREY, MATRIZ (omit PLANTA if needed)
      // For now fetching everything from inventory and aggregating
      const { data, error } = await supabase
        .from('inventory')
        .select('warehouse, talla, quantity, products(code, description)')
        .is('kanban_replenishment_id', null)
      
      if (error) throw error

      // Aggregating for view
      const aggregated = data.reduce((acc, item) => {
        const key = `${item.products.code}-${item.talla}`
        if (!acc[key]) {
          acc[key] = {
            code: item.products.code,
            description: item.products.description,
            talla: item.talla,
            MEXICO: 0,
            MONTERREY: 0,
            MATRIZ: 0,
            OTHERS: 0
          }
        }
        
        const wName = item.warehouse === 'MEXICO' ? 'MEXICO' : 
                      item.warehouse === 'MONTERREY' || item.warehouse === 'MTY' ? 'MONTERREY' :
                      item.warehouse === 'MATRIZ' ? 'MATRIZ' : 'OTHERS'
        
        if (wName !== 'PLANTA') {
           acc[key][wName] = (acc[key][wName] || 0) + item.quantity
        }
        return acc
      }, {})

      setStock(Object.values(aggregated))
    } catch (err) {
      showMessage('error', 'ERROR AL CONSULTAR STOCK DEL ERP')
    } finally {
      setLoading(false)
    }
  }

  const filtered = stock.filter(s => 
    (s.code || '').toLowerCase().includes(search.toLowerCase()) ||
    (s.description || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="glass" style={{ padding: '1.5rem', borderRadius: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flex: 1 }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>

            <input
              type="text"
              placeholder="BUSCAR EN INVENTARIO CONSOLIDADO..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '1rem', padding: '0.75rem 1rem', color: 'white', fontSize: '0.75rem', textTransform: 'uppercase' }}
            />
          </div>
          <button 
            onClick={fetchERPStock} 
            disabled={loading}
            style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: 'none', padding: '0.75rem 1.25rem', borderRadius: '1rem', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 900 }}
          >
            {loading ? 'CARGANDO...' : 'ACTUALIZAR'}
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase' }}>
          MUESTRA STOCK DISPONIBLE EN WMS (NO RESERVADO)
        </div>
      </div>

      <div className="glass" style={{ borderRadius: '1.5rem', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
          <thead>
            <tr style={{ background: '#0f172a', color: '#64748b', textAlign: 'left' }}>
              <th style={{ padding: '1rem' }}>PRODUCTO</th>
              <th style={{ padding: '1rem' }}>TALLA</th>
              <th style={{ padding: '1rem', textAlign: 'center' }}>MEXICO</th>
              <th style={{ padding: '1rem', textAlign: 'center' }}>MONTERREY</th>
              <th style={{ padding: '1rem', textAlign: 'center' }}>MATRIZ</th>
              <th style={{ padding: '1rem', textAlign: 'center' }}>TOTAL ACTIVOS</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #1e293b', color: 'white' }}>
                <td style={{ padding: '1rem' }}>
                  <div style={{ fontWeight: 800 }}>{s.code}</div>
                  <div style={{ fontSize: '0.6rem', color: '#64748b' }}>{s.description}</div>
                </td>
                <td style={{ padding: '1rem' }}>{s.talla}</td>
                <td style={{ padding: '1rem', textAlign: 'center', fontWeight: s.MEXICO > 0 ? 800 : 400, color: s.MEXICO > 0 ? 'white' : '#334155' }}>{s.MEXICO}</td>
                <td style={{ padding: '1rem', textAlign: 'center', fontWeight: s.MONTERREY > 0 ? 800 : 400, color: s.MONTERREY > 0 ? 'white' : '#334155' }}>{s.MONTERREY}</td>
                <td style={{ padding: '1rem', textAlign: 'center', fontWeight: s.MATRIZ > 0 ? 800 : 400, color: s.MATRIZ > 0 ? 'white' : '#334155' }}>{s.MATRIZ}</td>
                <td style={{ padding: '1rem', textAlign: 'center', color: '#10b981', fontWeight: 900 }}>
                  {s.MEXICO + s.MONTERREY + s.MATRIZ}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
