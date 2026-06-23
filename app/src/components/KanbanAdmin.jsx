import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'


// Sub-components
import KanbanCategories from './KanbanCategories'
import KanbanConfig from './KanbanConfig'
import KanbanReplenishment from './KanbanReplenishment'
import KanbanStockERP from './KanbanStockERP'
import KanbanSalesHistory from './KanbanSalesHistory'
import KanbanBoxStandards from './KanbanBoxStandards'

export default function KanbanAdmin() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('replenishment')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)

  // Global Data States
  const [categories, setCategories] = useState([])
  const [configs, setConfigs] = useState([])
  const [standards, setStandards] = useState([])

  useEffect(() => {
    fetchAll()
  }, [])

  const fetchAll = async () => {
    setLoading(true)
    await Promise.all([
      fetchCategories(),
      fetchConfigs(),
      fetchStandards()
    ])
    setLoading(false)
  }

  const fetchCategories = async () => {
    const { data } = await supabase.from('kanban_categories').select('*').order('name')
    if (data) setCategories(data)
  }

  const fetchConfigs = async () => {
    const { data } = await supabase.from('kanban_config').select('*').order('code')
    if (data) setConfigs(data)
  }

  const fetchStandards = async () => {
    const { data } = await supabase.from('maquila_box_standards').select('*').order('code')
    if (data) setStandards(data)
  }

  const showMessage = (type, text) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  const tabs = [
    { id: 'replenishment', label: 'RESURTIDO / PICKING', icon: null },
    { id: 'standards', label: 'ESTÁNDARES CAJA', icon: null },
    { id: 'config', label: 'CONFIGURACIÓN', icon: null },
    { id: 'erp_stock', label: 'STOCK ERP (CDMX/MTY)', icon: null },
    { id: 'sales_history', label: 'HISTÓRICO VENTAS', icon: null },
    { id: 'categories', label: 'CATEGORÍAS', icon: null },
  ]

  return (
    <div className="kanban-admin-container" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: '2rem' }}>
      {/* Toast Message */}
      {message && (
        <div 
          className="animate-slide-in"
          style={{ 
            position: 'fixed', top: '2rem', right: '2rem', zIndex: 1000,
            background: message.type === 'success' ? '#10b981' : '#ef4444',
            color: 'white', padding: '1rem 2rem', borderRadius: '1rem',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
            display: 'flex', alignItems: 'center', gap: '0.75rem', fontWeight: 900, fontSize: '0.7rem'
          }}
        >
          {message.type === 'success' ? 'ÉXITO: ' : 'ERROR: '}
          {message.text.toUpperCase()}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.05em', display: 'flex', alignItems: 'center', gap: '1rem', textTransform: 'uppercase' }}>
            ADMINISTRACIÓN KANBAN
          </h1>
          <p style={{ color: '#64748b', marginTop: '0.5rem', fontWeight: 500, textTransform: 'uppercase' }}>
            PANEL DE CONTROL INTELIGENTE PARA REPOSICIÓN DE INVENTARIO Y ESTÁNDARES DE EMPAQUE.
          </p>
        </div>
        <div className="glass" style={{ padding: '1rem', borderRadius: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 900, color: '#64748b' }}>OPERADOR ACTUAL</div>
            <div style={{ fontSize: '0.8rem', fontWeight: 800 }}>{user?.email}</div>
          </div>
          <div style={{ width: 40, height: 40, background: '#1e293b', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>
            👤
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{ 
              background: activeTab === tab.id ? 'linear-gradient(135deg, #1e293b, #0f172a)' : 'transparent',
              border: activeTab === tab.id ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
              color: activeTab === tab.id ? '#3b82f6' : '#64748b',
              padding: '1rem 1.5rem', borderRadius: '1.25rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '0.75rem', fontWeight: 900, fontSize: '0.7rem',
              transition: 'all 0.3s ease', whiteSpace: 'nowrap', textTransform: 'uppercase'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="tab-content" style={{ minHeight: '60vh' }}>
        {activeTab === 'replenishment' && (
          <KanbanReplenishment showMessage={showMessage} />
        )}
        
        {activeTab === 'standards' && (
          <KanbanBoxStandards 
            standards={standards} 
            fetchStandards={fetchStandards} 
            loading={loading} 
            showMessage={showMessage} 
          />
        )}

        {activeTab === 'config' && (
          <KanbanConfig 
            configs={configs} 
            fetchConfigs={fetchConfigs} 
            loading={loading} 
            showMessage={showMessage} 
          />
        )}

        {activeTab === 'erp_stock' && (
          <KanbanStockERP showMessage={showMessage} />
        )}

        {activeTab === 'sales_history' && (
          <KanbanSalesHistory showMessage={showMessage} />
        )}

        {activeTab === 'categories' && (
          <KanbanCategories 
            categories={categories} 
            fetchCategories={fetchCategories} 
            loading={loading} 
            showMessage={showMessage} 
          />
        )}
      </div>

      <style>{`
        .glass {
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .animate-fade-in {
          animation: fadeIn 0.4s ease-out;
        }
        .animate-slide-up {
          animation: slideUp 0.4s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .hover-scale:hover {
          transform: scale(1.02);
          border-color: rgba(59, 130, 246, 0.5) !important;
        }
      `}</style>
    </div>
  )
}
