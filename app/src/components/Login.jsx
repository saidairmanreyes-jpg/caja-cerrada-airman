import { useState } from 'react'
import { auth } from '../firebase'
import { signInWithEmailAndPassword } from 'firebase/auth'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (err) {
      console.error(err)
      setError('CREDENCIALES INVÁLIDAS. POR FAVOR INTENTE DE NUEVO.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0b0e14',
      position: 'relative',
      overflow: 'hidden',
      fontFamily: "'Inter', sans-serif"
    }}>
      {/* Background Glows */}
      <div style={{
        position: 'absolute',
        top: '-10%',
        left: '-10%',
        width: '40%',
        height: '40%',
        background: 'radial-gradient(circle, rgba(239, 68, 68, 0.15) 0%, transparent 70%)',
        zIndex: 0
      }} />
      <div style={{
        position: 'absolute',
        bottom: '-10%',
        right: '-10%',
        width: '40%',
        height: '40%',
        background: 'radial-gradient(circle, rgba(30, 41, 59, 0.4) 0%, transparent 70%)',
        zIndex: 0
      }} />

      {/* Login Card */}
      <div style={{
        width: '100%',
        maxWidth: '420px',
        background: 'rgba(255, 255, 255, 0.03)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '2.5rem',
        padding: '3.5rem',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        zIndex: 10,
        position: 'relative'
      }}>
        {/* Logo Section */}
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div style={{
            fontSize: '3rem',
            marginBottom: '1rem',
            filter: 'drop-shadow(0 0 20px rgba(239,68,68,0.4))'
          }}>📦</div>
          <h1 style={{ fontSize: '2rem', fontWeight: 1000, color: 'white', letterSpacing: '-0.04em', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
            AIRMAN <span style={{ color: '#ef4444' }}>WMS</span>
          </h1>
          <div style={{ height: '2px', width: '40px', background: '#ef4444', margin: '1rem auto' }}></div>
          <p style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 1000, letterSpacing: '0.25em', textTransform: 'uppercase' }}>CENTRO DE CONTROL LOGÍSTICO</p>
        </div>

        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: '1rem',
            padding: '1rem 1.25rem',
            marginBottom: '2rem',
            color: '#fca5a5',
            fontSize: '0.75rem',
            fontWeight: 900,
            textAlign: 'center',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <label style={{ fontSize: '0.65rem', fontWeight: 1000, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.2em', marginLeft: '0.5rem' }}>CORREO ELECTRÓNICO</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="usuario@airman.com"
              style={{
                width: '100%',
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '1.25rem',
                padding: '1.25rem',
                color: 'white',
                fontSize: '0.9rem',
                fontWeight: 800,
                outline: 'none',
                transition: 'all 0.2s ease',
                boxSizing: 'border-box',
                textTransform: 'lowercase'
              }}
              onFocus={e => e.target.style.borderColor = 'rgba(239,68,68,0.5)'}
              onBlur={e => e.target.style.borderColor = 'rgba(255, 255, 255, 0.08)'}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <label style={{ fontSize: '0.65rem', fontWeight: 1000, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.2em', marginLeft: '0.5rem' }}>CONTRASEÑA</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              style={{
                width: '100%',
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '1.25rem',
                padding: '1.25rem',
                color: 'white',
                fontSize: '0.9rem',
                fontWeight: 800,
                outline: 'none',
                transition: 'all 0.2s ease',
                boxSizing: 'border-box'
              }}
              onFocus={e => e.target.style.borderColor = 'rgba(239,68,68,0.5)'}
              onBlur={e => e.target.style.borderColor = 'rgba(255, 255, 255, 0.08)'}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: '1rem',
              background: 'white',
              color: '#0b0e14',
              border: 'none',
              borderRadius: '1.25rem',
              padding: '1.25rem',
              fontSize: '0.85rem',
              fontWeight: 1000,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '1rem',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              textTransform: 'uppercase',
              letterSpacing: '0.15em'
            }}
          >
            {loading ? (
              <>
                <div className="spinner" style={{ width: '18px', height: '18px', border: '3px solid rgba(0,0,0,0.1)', borderTopColor: '#0b0e14', borderRadius: '50%' }}></div>
                <span>AUTENTICANDO...</span>
              </>
            ) : 'INICIAR SESIÓN'}
          </button>
        </form>

        <p style={{ marginTop: '3rem', textAlign: 'center', fontSize: '0.6rem', color: '#475569', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          © 2026 AIRMAN GLOBAL • TODOS LOS DERECHOS RESERVADOS
        </p>
      </div>

      <style>{`
        .spinner { animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        input::placeholder { color: #334155; }
      `}</style>
    </div>
  )
}
