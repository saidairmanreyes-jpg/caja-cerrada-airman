import { createContext, useContext, useEffect, useState } from 'react'
import { auth, db } from '../firebase'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'

const AuthContext = createContext({})

export function useAuth() {
  return useContext(AuthContext)
}

// Default permissions for new accounts
const DEFAULT_PERMISSIONS = {
  reception: false,
  picking: false,
  monitor: false,
  inventory: false,
  order_status: false,
  maquila: false,
  maquila_hacienda: false,
  maquila_consumptions: false,
  maquila_discounted: false,
  maquila_capture: false,
  admin: false,
  admin_catalog: false,
  admin_workers: false,
  admin_auth: false,
  admin_bulk: false,
  admin_monitor: false,
  admin_locations: false,
  admin_kanban: false,
  admin_labels: false,
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeWarehouse, setActiveWarehouse] = useState(localStorage.getItem('activeWarehouse') || 'MATRIZ')

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        setUser(fbUser)
        try {
          const docRef = doc(db, 'profiles', fbUser.uid)
          const docSnap = await getDoc(docRef)

          if (docSnap.exists()) {
            const data = docSnap.data()
            if (data.permissions) {
              const merged = { ...DEFAULT_PERMISSIONS, ...data.permissions }
              if (JSON.stringify(merged) !== JSON.stringify(data.permissions)) {
                // Silently backfill missing keys
                await setDoc(docRef, { ...data, permissions: merged }, { merge: true })
                data.permissions = merged
              }
            } else {
              // If completely missing, give default
              await setDoc(docRef, { ...data, permissions: DEFAULT_PERMISSIONS }, { merge: true })
              data.permissions = DEFAULT_PERMISSIONS
            }
            setProfile(data)
            if (data.warehouse) {
              setActiveWarehouse(data.warehouse)
            }
          } else {
            // Auto-create Master profile if it doesn't exist
            const newProfile = {
              email: fbUser.email,
              name: fbUser.email.split('@')[0],
              role: 'master',
              warehouse: 'MATRIZ',
              permissions: { reception: true, picking: true, inventory: true, admin: true, order_status: true },
              createdAt: new Date().toISOString()
            }
            await setDoc(docRef, newProfile)
            setProfile(newProfile)
          }
        } catch (e) {
          console.error("Error al obtener/crear perfil en Firestore:", e)
        }
      } else {
        setUser(null)
        setProfile(null)
      }
      setLoading(false)
    })

    return unsubscribe
  }, [])

  const changeWarehouse = (wh) => {
    if (profile?.role === 'master') {
      setActiveWarehouse(wh)
      localStorage.setItem('activeWarehouse', wh)
    }
  }

  const logout = () => signOut(auth)

  /**
   * Check if the current user has a specific permission.
   * Master always returns true for everything.
   * @param {string} key - e.g. 'order_status', 'admin_catalog', etc.
   */
  const hasPermission = (key) => {
    if (!profile) return false
    if (profile.role === 'master') return true
    return profile.permissions?.[key] === true
  }

  const hasAnyAdminPermission = profile?.role === 'master' || profile?.permissions?.admin === true

  const value = {
    user,
    profile,
    loading,
    logout,
    activeWarehouse,
    changeWarehouse,
    hasPermission,
    hasAnyAdminPermission,
    isAdmin: profile?.role === 'master',
    isOperator: profile?.role === 'operator',
    isMaquila: profile?.role === 'maquila',
  }

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  )
}
