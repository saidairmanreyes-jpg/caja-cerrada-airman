import React, { useState } from 'react'
import { AlertTriangle, X, CheckCircle2, ShieldAlert } from 'lucide-react'

export default function KanbanJustificationModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'CANCELACIÓN RESTRINGIDA DE ACCIÓN',
  subtitle = 'Debe proporcionar una justificación obligatoria antes de proceder.',
  actionType = 'CANCELAR',
  targetInfo = '',
  minLength = 10,
  loading = false
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  if (!isOpen) return null

  const handleConfirm = () => {
    const trimmed = reason.trim()
    if (!trimmed || trimmed.length < minLength) {
      setError(`La justificación es obligatoria y debe tener al menos ${minLength} caracteres (actual: ${trimmed.length}).`)
      return
    }
    setError('')
    onConfirm(trimmed)
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(2, 6, 23, 0.85)',
      backdropFilter: 'blur(12px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1100,
      padding: '1.5rem',
      animation: 'fadeIn 0.2s ease-out'
    }}>
      <div style={{
        background: '#0f172a',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: '1.5rem',
        maxWidth: '560px',
        width: '100%',
        padding: '2rem',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 30px rgba(239, 68, 68, 0.15)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
        position: 'relative'
      }}>
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={loading}
          style={{
            position: 'absolute',
            top: '1.5rem',
            right: '1.5rem',
            background: 'rgba(255,255,255,0.05)',
            border: 'none',
            borderRadius: '50%',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#94a3b8',
            cursor: 'pointer'
          }}
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
          <div style={{
            background: 'rgba(239, 68, 68, 0.12)',
            padding: '0.85rem',
            borderRadius: '1rem',
            color: '#ef4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <ShieldAlert size={28} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 900, color: 'white', letterSpacing: '-0.01em', textTransform: 'uppercase' }}>
              {title}
            </h3>
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>
              {subtitle}
            </p>
          </div>
        </div>

        {/* Target Info Badge */}
        {targetInfo && (
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '0.85rem 1rem',
            borderRadius: '0.875rem',
            fontSize: '0.75rem',
            color: '#cbd5e1'
          }}>
            <span style={{ color: '#ef4444', fontWeight: 900 }}>ELEMENTO AFECTADO: </span>
            <span style={{ fontWeight: 700 }}>{targetInfo}</span>
          </div>
        )}

        {/* Input Area */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.7rem', fontWeight: 900, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Motivo / Justificación de la Cancelación <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <textarea
            autoFocus
            rows={4}
            placeholder="Describa a detalle el motivo (ej. Mercancía apartada para cliente especial, discrepancia de inventario físico, tela no disponible)..."
            value={reason}
            onChange={(e) => {
              setReason(e.target.value)
              if (error) setError('')
            }}
            disabled={loading}
            style={{
              width: '100%',
              background: '#020617',
              border: error ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.12)',
              borderRadius: '1rem',
              padding: '1rem',
              color: 'white',
              fontSize: '0.8rem',
              outline: 'none',
              resize: 'none',
              boxSizing: 'border-box',
              fontFamily: 'inherit'
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#64748b' }}>
            <span>Mínimo {minLength} caracteres requeridos</span>
            <span style={{ color: reason.trim().length >= minLength ? '#22c55e' : '#f59e0b', fontWeight: 800 }}>
              {reason.trim().length} caracteres
            </span>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            padding: '0.75rem 1rem',
            borderRadius: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: '#fca5a5',
            fontSize: '0.7rem',
            fontWeight: 700
          }}>
            <AlertTriangle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              flex: 1,
              padding: '0.85rem 1.25rem',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '0.875rem',
              color: '#94a3b8',
              fontWeight: 800,
              fontSize: '0.75rem',
              cursor: 'pointer',
              textTransform: 'uppercase'
            }}
          >
            VOLVER
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || reason.trim().length < minLength}
            style={{
              flex: 1.5,
              padding: '0.85rem 1.25rem',
              background: reason.trim().length >= minLength ? '#dc2626' : 'rgba(220, 38, 38, 0.25)',
              border: 'none',
              borderRadius: '0.875rem',
              color: 'white',
              fontWeight: 900,
              fontSize: '0.75rem',
              cursor: reason.trim().length >= minLength ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              boxShadow: reason.trim().length >= minLength ? '0 4px 14px rgba(220, 38, 38, 0.4)' : 'none',
              textTransform: 'uppercase'
            }}
          >
            {loading ? 'PROCESANDO...' : actionType}
          </button>
        </div>
      </div>
    </div>
  )
}
