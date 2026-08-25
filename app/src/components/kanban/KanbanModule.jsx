import React, { useState, useEffect } from 'react'
import { db } from '../../firebase'
import { collection, onSnapshot } from 'firebase/firestore'
import { useAuth } from '../../context/AuthContext'
import KanbanBoard from './KanbanBoard'
import KanbanResupply from './KanbanResupply'
import KanbanProduction from './KanbanProduction'
import KanbanDemandPlanning from './KanbanDemandPlanning'
import KanbanPlanningInbox from './KanbanPlanningInbox'
import KanbanMasterConfig from './KanbanMasterConfig'
import {
  LayoutDashboard, Package, Scissors, TrendingUp, Inbox, Settings,
  AlertCircle, ShieldCheck, Eye, Sparkles
} from 'lucide-react'

export default function KanbanModule() {
  const { user, profile, isAdmin, hasPermission, activeWarehouse } = useAuth()
  const [activeTab, setActiveTab] = useState('board') // 'board' | 'resupply' | 'production' | 'demand' | 'inbox' | 'config'
  const [message, setMessage] = useState(null)
  const [pendingInboxCount, setPendingInboxCount] = useState(0)

  // Granular permissions
  const isMaster = profile?.role === 'master' || isAdmin
  const canEdit = isMaster || profile?.permissions?.kanban_edit === true
  const canAuthorize = isMaster || profile?.permissions?.kanban_authorize_planning === true
  const isReadOnly = !isMaster && profile?.permissions?.kanban_view === true && !canEdit

  // Real-time listener for Planning Inbox unread/pending count
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'kanban_production_orders'), snap => {
      let pending = 0
      snap.forEach(d => {
        if (d.data().status === 'PENDIENTE_AUTORIZACION') pending++
      })
      setPendingInboxCount(pending)
    })
    return () => unsub()
  }, [])

  const showMessage = (type, text) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3500)
  }

  const tabs = [
    { id: 'board', label: '1. MONITOR KANBAN', icon: <LayoutDashboard size={17} /> },
    { id: 'resupply', label: '2. REABASTECIMIENTO', icon: <Package size={17} /> },
    { id: 'production', label: '3. PRODUCCIÓN & EXPLOSIÓN BOM', icon: <Scissors size={17} /> },
    { id: 'demand', label: '4. PLANEACIÓN DE DEMANDA (FORECAST)', icon: <TrendingUp size={17} /> },
    { id: 'inbox', label: '5. BUZÓN DE PLANEACIÓN', icon: <Inbox size={17} />, badge: pendingInboxCount },
    { id: 'config', label: '6. CONFIGURACIÓN MAESTRA', icon: <Settings size={17} /> },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', minHeight: '80vh' }} className="animate-fade-in">
      {/* Toast Notification */}
      {message && (
        <div
          className="animate-slide-up"
          style={{
            position: 'fixed',
            bottom: '2rem',
            right: '2rem',
            padding: '1.25rem 1.75rem',
            borderRadius: '1.25rem',
            background: message.type === 'success' ? '#065f46' : '#991b1b',
            border: `1px solid ${message.type === 'success' ? 'rgba(52, 211, 153, 0.4)' : 'rgba(248, 113, 113, 0.4)'}`,
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            zIndex: 2000
          }}
        >
          <div style={{
            background: 'rgba(255,255,255,0.15)',
            padding: '0.5rem 0.85rem',
            borderRadius: '0.6rem',
            color: 'white',
            fontWeight: 900,
            fontSize: '0.68rem',
            textTransform: 'uppercase'
          }}>
            {message.type === 'success' ? 'ÉXITO' : 'ALERTA'}
          </div>
          <span style={{ color: 'white', fontWeight: 800, fontSize: '0.8rem', textTransform: 'uppercase' }}>
            {message.text}
          </span>
        </div>
      )}

      {/* Module Top Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1.5rem',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        paddingBottom: '1.5rem'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
            <span style={{
              background: 'linear-gradient(135deg, #0284c7, #0369a1)',
              padding: '0.2rem 0.6rem',
              borderRadius: '0.4rem',
              fontSize: '0.65rem',
              fontWeight: 900,
              color: 'white',
              letterSpacing: '0.1em'
            }}>
              PULL SYSTEM 2026
            </span>
            <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 800 }}>•</span>
            <span style={{ fontSize: '0.7rem', color: '#38bdf8', fontWeight: 800 }}>
              ALMACÉN ACTIVO: {activeWarehouse}
            </span>
          </div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 900, color: 'white', letterSpacing: '-0.02em', textTransform: 'uppercase' }}>
            SISTEMA KANBAN AIRMAN
          </h2>
          <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.2rem' }}>
            ORQUESTACIÓN DE PRODUCCIÓN, EXPLOSIÓN DE INSUMOS Y REABASTECIMIENTO DINÁMICO POR DEMANDA.
          </p>
        </div>

        {/* User Role / Permission Indicator */}
        <div className="glass" style={{ padding: '0.75rem 1.25rem', borderRadius: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase' }}>
              NIVEL DE ACCESO KANBAN
            </div>
            <div style={{ fontSize: '0.8rem', fontWeight: 900, color: isMaster ? '#a78bfa' : canEdit ? '#38bdf8' : '#f59e0b' }}>
              {isMaster ? 'MÁSTER TOTAL' : canEdit ? 'EDICIÓN & GESTIÓN' : 'SOLO CONSULTA'}
            </div>
          </div>
          <div style={{
            width: '36px', height: '36px', borderRadius: '50%',
            background: isMaster ? 'rgba(167, 139, 250, 0.15)' : canEdit ? 'rgba(14, 165, 233, 0.15)' : 'rgba(245, 158, 11, 0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: isMaster ? '#a78bfa' : canEdit ? '#38bdf8' : '#f59e0b'
          }}>
            {isMaster ? <ShieldCheck size={18} /> : canEdit ? <Sparkles size={18} /> : <Eye size={18} />}
          </div>
        </div>
      </div>

      {/* Main Tab Navigation */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        background: 'rgba(255,255,255,0.02)',
        padding: '0.375rem',
        borderRadius: '1.25rem',
        border: '1px solid rgba(255,255,255,0.06)',
        overflowX: 'auto'
      }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              padding: '0.85rem 1.5rem',
              borderRadius: '0.875rem',
              fontSize: '0.72rem',
              fontWeight: 900,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              transition: 'all 0.2s',
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              background: activeTab === tab.id
                ? (tab.id === 'inbox' && pendingInboxCount > 0 ? '#d97706' : '#0284c7')
                : 'transparent',
              color: activeTab === tab.id ? 'white' : '#94a3b8',
              boxShadow: activeTab === tab.id
                ? (tab.id === 'inbox' && pendingInboxCount > 0 ? '0 4px 14px rgba(217, 119, 6, 0.4)' : '0 4px 14px rgba(2, 132, 199, 0.4)')
                : 'none'
            }}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.badge !== undefined && tab.badge > 0 && (
              <span style={{
                background: '#ef4444',
                color: 'white',
                fontSize: '0.6rem',
                fontWeight: 900,
                padding: '0.15rem 0.5rem',
                borderRadius: '999px',
                marginLeft: '0.2rem',
                boxShadow: '0 0 10px rgba(239, 68, 68, 0.6)'
              }}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content Display */}
      <div style={{ minHeight: '600px' }}>
        <KanbanErrorBoundary onReset={() => setActiveTab('board')}>
          {activeTab === 'board' && (
            <KanbanBoard
              canEdit={canEdit}
              userEmail={user?.email || profile?.name}
              showMessage={showMessage}
            />
          )}

          {activeTab === 'resupply' && (
            <KanbanResupply
              canEdit={canEdit}
              userEmail={user?.email || profile?.name}
              showMessage={showMessage}
            />
          )}

          {activeTab === 'production' && (
            <KanbanProduction
              canEdit={canEdit}
              userEmail={user?.email || profile?.name}
              showMessage={showMessage}
            />
          )}

          {activeTab === 'demand' && (
            <KanbanDemandPlanning
              canEdit={canEdit}
              showMessage={showMessage}
            />
          )}

          {activeTab === 'inbox' && (
            <KanbanPlanningInbox
              canAuthorize={canAuthorize}
              userEmail={user?.email || profile?.name}
              showMessage={showMessage}
            />
          )}

          {activeTab === 'config' && (
            <KanbanMasterConfig
              canEdit={canEdit}
              showMessage={showMessage}
            />
          )}
        </KanbanErrorBoundary>
      </div>
    </div>
  )
}

class KanbanErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Kanban ErrorBoundary caught:', error, errorInfo)
    this.setState({ errorInfo })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '3rem 2rem',
          background: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '1.5rem',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1rem'
        }}>
          <AlertCircle size={44} color="#ef4444" />
          <h3 style={{ color: 'white', fontSize: '1.2rem', fontWeight: 900, textTransform: 'uppercase' }}>
            SE PRODUJO UN ERROR EN ESTA VISTA DE KANBAN
          </h3>
          <p style={{ color: '#fca5a5', fontSize: '0.75rem', maxWidth: '600px', lineHeight: 1.5 }}>
            {this.state.error?.message || 'Error inesperado durante el renderizado del componente.'}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null, errorInfo: null })
              if (this.props.onReset) this.props.onReset()
            }}
            style={{
              background: '#0284c7',
              color: 'white',
              border: 'none',
              borderRadius: '0.75rem',
              padding: '0.75rem 1.5rem',
              fontWeight: 900,
              fontSize: '0.75rem',
              cursor: 'pointer',
              marginTop: '0.5rem'
            }}
          >
            REINICIAR VISTA KANBAN
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
