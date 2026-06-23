import React, { useState } from 'react'
import { supabase } from '../supabaseClient'


export default function KanbanCategories({ categories, fetchCategories, loading, showMessage }) {
  const [newCat, setNewCat] = useState({ name: '', description: '' })

  const addCategory = async (e) => {
    e.preventDefault()
    if (!newCat.name) return
    const { error } = await supabase.from('kanban_categories').insert([newCat])
    if (!error) {
      showMessage('success', 'CATEGORÍA AÑADIDA')
      setNewCat({ name: '', description: '' })
      fetchCategories()
    }
  }

  const deleteCategory = async (id) => {
    const { error } = await supabase.from('kanban_categories').delete().eq('id', id)
    if (!error) {
      showMessage('success', 'CATEGORÍA ELIMINADA')
      fetchCategories()
    }
  }

  return (
    <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: '2rem' }}>
      <div className="glass" style={{ padding: '2rem', borderRadius: '1.5rem', height: 'fit-content' }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 900, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', textTransform: 'uppercase' }}>
          NUEVA CATEGORÍA
        </h3>
        <form onSubmit={addCategory} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 900, color: '#64748b', marginBottom: '0.5rem' }}>NOMBRE</label>
            <input
              type="text"
              required
              value={newCat.name}
              onChange={(e) => setNewCat({...newCat, name: e.target.value.toUpperCase()})}
              style={{ width: '100%', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.75rem', padding: '0.75rem', color: 'white', fontSize: '0.75rem' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 900, color: '#64748b', marginBottom: '0.5rem' }}>DESCRIPCIÓN</label>
            <textarea
              value={newCat.description}
              onChange={(e) => setNewCat({...newCat, description: e.target.value})}
              style={{ width: '100%', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.75rem', padding: '0.75rem', color: 'white', fontSize: '0.75rem', resize: 'none' }}
              rows="3"
            />
          </div>
          <button type="submit" style={{ background: '#10b981', color: 'white', border: 'none', padding: '1rem', borderRadius: '1rem', fontWeight: 900, fontSize: '0.7rem', cursor: 'pointer', marginTop: '1rem' }}>
            REGISTRAR CATEGORÍA
          </button>
        </form>
      </div>

      <div className="glass" style={{ borderRadius: '1.5rem', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
          <thead>
            <tr style={{ background: '#0f172a', color: '#64748b', textAlign: 'left' }}>
              <th style={{ padding: '1.2rem 1.5rem' }}>CATEGORÍA</th>
              <th style={{ padding: '1.2rem 1.5rem' }}>DESCRIPCIÓN</th>
              <th style={{ padding: '1.2rem 1.5rem', textAlign: 'right' }}>ACCIONES</th>
            </tr>
          </thead>
          <tbody>
            {categories.map(cat => (
              <tr key={cat.id} style={{ borderBottom: '1px solid #1e293b', color: 'white' }}>
                <td style={{ padding: '1.2rem 1.5rem', fontWeight: 800 }}>{cat.name}</td>
                <td style={{ padding: '1.2rem 1.5rem', color: '#94a3b8' }}>{cat.description}</td>
                <td style={{ padding: '1.2rem 1.5rem', textAlign: 'right' }}>
                  <button onClick={() => deleteCategory(cat.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 900 }}>
                    ELIMINAR
                  </button>
                </td>
              </tr>
            ))}
            {categories.length === 0 && (
              <tr>
                <td colSpan="3" style={{ padding: '4rem', textAlign: 'center', color: '#475569' }}>
                  <p style={{ textTransform: 'uppercase', fontWeight: 900 }}>NO HAY CATEGORÍAS REGISTRADAS</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
