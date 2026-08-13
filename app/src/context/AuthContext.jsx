import { createContext, useContext, useEffect, useState } from 'react'
import { auth, db } from '../firebase'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore'

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
  external_processes: false,
  external_processes_capture: false,
  external_processes_monitor: false,
  external_processes_costs: false,
  external_processes_reports: false,
  external_processes_arreglos: true,
  external_processes_serigrafia: false,
  external_processes_bordado: false,
  external_processes_authorize: false,
  external_processes_manual_quote: false,
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
    let profileUnsubscribe = null

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (profileUnsubscribe) {
        profileUnsubscribe()
        profileUnsubscribe = null
      }

      if (fbUser) {
        setUser(fbUser)
        const docRef = doc(db, 'profiles', fbUser.uid)

        // Set up real-time listener for profile changes (permissions, role, warehouse)
        profileUnsubscribe = onSnapshot(docRef, async (docSnap) => {
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
              permissions: {
                reception: true, picking: true, inventory: true, admin: true,
                external_processes: true, external_processes_capture: true, external_processes_monitor: true,
                external_processes_costs: true, external_processes_reports: true,
                external_processes_arreglos: true, external_processes_serigrafia: true,
                external_processes_bordado: true, external_processes_authorize: true,
                external_processes_manual_quote: true
              },
              createdAt: new Date().toISOString()
            }
            await setDoc(docRef, newProfile)
            setProfile(newProfile)
          }
          setLoading(false)
        }, (err) => {
          console.error("Error al escuchar perfil en tiempo real:", err)
          setLoading(false)
        })
      } else {
        setUser(null)
        setProfile(null)
        setLoading(false)
      }
    })

    return () => {
      if (profileUnsubscribe) profileUnsubscribe()
      unsubscribe()
    }
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
