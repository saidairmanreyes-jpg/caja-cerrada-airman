import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { db } from '../firebase'
import { collection, addDoc, doc, setDoc, deleteDoc, query, where, onSnapshot, updateDoc, orderBy, getDocs } from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import { printLabel, connectPrinter, printLabelMultiBox } from '../utils/printer'
import { QRCodeSVG } from 'qrcode.react'
import * as XLSX from 'xlsx'
import { Search, Printer, Download, Plus, Trash2, Lock, X, FileText, QrCode, LayoutDashboard, DollarSign, AlertTriangle, Bell, CheckCircle, Clock, Package } from 'lucide-react'

export default function ExternalProcesses() {
  const { user, profile, isAdmin, hasPermission, activeWarehouse } = useAuth()
  const [activeSection, setActiveSection] = useState('ARREGLOS') // 'ARREGLOS' | 'SERIGRAFIA' | 'BORDADO'
  const [moduleTab, setModuleTab] = useState('capture') // 'capture' | 'monitor' | 'inbox'
  
  // Granular Permission Checks
  const isMaster = profile?.role === 'master' || isAdmin
  const canCapture = isMaster || profile?.permissions?.external_processes_capture === true
  const canMonitor = isMaster || profile?.permissions?.external_processes_monitor === true || (!profile?.permissions?.external_processes_capture && profile?.permissions?.external_processes === true)
  const canSeeCosts = isMaster || hasPermission('external_processes_costs')
  const canSeeReports = isMaster || hasPermission('external_processes_reports')
  
  // Process Type Specific Permissions
  const canSeeArreglos = isMaster || profile?.permissions?.external_processes_arreglos !== false
  const canSeeSerigrafia = isMaster || profile?.permissions?.external_processes_serigrafia === true
  const canSeeBordado = isMaster || profile?.permissions?.external_processes_bordado === true
  const canQuoteManual = isMaster || profile?.permissions?.external_processes_manual_quote === true
  // Authorization permission (Designador / Pablo Rentería role)
  const canAuthorize = isMaster || hasPermission('external_processes_authorize')

  // Printer State
  const [printerConnected, setPrinterConnected] = useState(false)
  const [printerMsg, setPrinterMsg] = useState(null)

  // Data states
  const [records, setRecords] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [processTypes, setProcessTypes] = useState([])
  const [loading, setLoading] = useState(true)

  // Form state for order header
  const [formData, setFormData] = useState({
    pedido_num: '',
    cliente: '',
    proveedor_nombre: '',
  })

  // State for multiple processes attached to current order
  const [tempProcessName, setTempProcessName] = useState('')
  const [tempProcessPiezas, setTempProcessPiezas] = useState('')
  const [addedProcesses, setAddedProcesses] = useState([])

  // Modal for Manual Quote (Serigrafia / Manual Price)
  const [showQuoteModal, setShowQuoteModal] = useState(false)
  const [quotePrice, setQuotePrice] = useState('')
  const [pendingQuoteItem, setPendingQuoteItem] = useState(null)

  const [formSubmitting, setFormSubmitting] = useState(false)
  const [formMessage, setFormMessage] = useState(null)

  // Scanner state
  const [scanCode, setScanCode] = useState('')
  const [scanFeedback, setScanFeedback] = useState(null)

  // Modals
  const [showCatalogModal, setShowCatalogModal] = useState(false)
  const [selectedLabelRecord, setSelectedLabelRecord] = useState(null)

  // Catalog management form states
  const [catalogTab, setCatalogTab] = useState('procesos') // 'procesos' | 'proveedores'
  const [newProcessName, setNewProcessName] = useState('')
  const [newProcessCost, setNewProcessCost] = useState('')
  const [newSupplierName, setNewSupplierName] = useState('')
  const [newSupplierContact, setNewSupplierContact] = useState('')

  // Filter states
  const [searchTerm, setSearchTerm] = useState('')
  const [filterSupplier, setFilterSupplier] = useState('ALL')
  const [filterStatus, setFilterStatus] = useState('ALL')

  // Notification / Inbox state
  const [notifications, setNotifications] = useState([])
  const [inboxFilter, setInboxFilter] = useState('ALL') // 'ALL' | 'ASIGNACION_PENDIENTE' | 'LISTO_PARA_IMPRIMIR'
  const [selectedNotification, setSelectedNotification] = useState(null) // notification being resolved
  const [showAssignModal, setShowAssignModal] = useState(false) // Designador assignment modal
  const [assignProveedor, setAssignProveedor] = useState('')
  const [assignCostoPorPrenda, setAssignCostoPorPrenda] = useState('')
  const [assignSaving, setAssignSaving] = useState(false)

  // Multi-box print state
  const [showBoxModal, setShowBoxModal] = useState(false)
  const [boxCount, setBoxCount] = useState(1)
  const [pendingPrintRecord, setPendingPrintRecord] = useState(null)
  const [boxPrintProgress, setBoxPrintProgress] = useState(null) // 0-100

  // Cancel process modal state
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [pendingCancelRecord, setPendingCancelRecord] = useState(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelSubmitting, setCancelSubmitting] = useState(false)
  const [cancelError, setCancelError] = useState(null)

  // Catalog feedback state
  const [catalogMsg, setCatalogMsg] = useState(null)

  // Auto-switch tab if user lacks capture permission
  useEffect(() => {
    if (!canCapture && canMonitor && moduleTab === 'capture') {
      setModuleTab('monitor')
    }
  }, [canCapture, canMonitor, moduleTab])

  // Initial load & real-time subscriptions
  useEffect(() => {
    fetchInitialData()

    // Realtime channel for external_processes
    const channel1 = supabase
      .channel(`external_processes_${activeSection}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'external_processes' }, () => {
        fetchRecords()
      })
      .subscribe()

    // Realtime channel for external_suppliers
    const channel2 = supabase
      .channel(`external_suppliers_${activeSection}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'external_suppliers' }, () => {
        fetchSuppliers()
      })
      .subscribe()

    // Realtime channel for external_process_types
    const channel3 = supabase
      .channel(`external_process_types_${activeSection}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'external_process_types' }, () => {
        fetchProcessTypes()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel1)
      supabase.removeChannel(channel2)
      supabase.removeChannel(channel3)
    }
  }, [activeSection])

  // Firestore real-time notifications listener
  useEffect(() => {
    if (!user) return
    // Show authorizer notifications if user can authorize, else show operator notifications
    const targetRole = canAuthorize ? 'authorizer' : 'operator'
    const q = query(
      collection(db, 'external_process_notifications'),
      where('target_role', '==', targetRole),
      where('read', '==', false)
    )
    const unsub = onSnapshot(q, (snap) => {
      const notifs = snap.docs.map(d => ({ firestoreId: d.id, ...d.data() }))
      notifs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      setNotifications(notifs)
    })
    return () => unsub()
  }, [user, canAuthorize])



  async function fetchInitialData() {
    setLoading(true)
    await Promise.all([fetchRecords(), fetchSuppliers(), fetchProcessTypes()])
    setLoading(false)
  }

  async function fetchRecords() {
    try {
      const { data, error } = await supabase
        .from('external_processes')
        .select('*')
        .eq('section', activeSection)
        .order('created_at', { ascending: false })
      
      if (!error && data && data.length > 0) {
        setRecords(data)
        return
      }

      // Firestore Fallback / Primary load if Supabase table is not present
      const q = query(collection(db, 'external_processes'), where('section', '==', activeSection))
      const snap = await getDocs(q)
      const fsData = snap.docs.map(d => ({ firestoreId: d.id, ...d.data() }))
      fsData.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      setRecords(fsData)
    } catch (e) {
      console.error('Error fetching external processes:', e)
    }
  }

  async function fetchSuppliers() {
    try {
      const { data, error } = await supabase
        .from('external_suppliers')
        .select('*')
        .eq('section', activeSection)
        .order('name', { ascending: true })

      if (!error && data && data.length > 0) {
        setSuppliers(data)
        return
      }

      // Firestore Fallback
      const q = query(collection(db, 'external_suppliers'), where('section', '==', activeSection))
      const snap = await getDocs(q)
      const fsData = snap.docs.map(d => ({ firestoreId: d.id, ...d.data() }))
      fsData.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      setSuppliers(fsData)
    } catch (e) {
      console.error('Error fetching suppliers:', e)
    }
  }

  async function fetchProcessTypes() {
    try {
      const { data, error } = await supabase
        .from('external_process_types')
        .select('*')
        .eq('section', activeSection)
        .order('name', { ascending: true })

      if (!error && data && data.length > 0) {
        setProcessTypes(data)
        return
      }

      // Firestore Fallback
      const q = query(collection(db, 'external_process_types'), where('section', '==', activeSection))
      const snap = await getDocs(q)
      const fsData = snap.docs.map(d => ({ firestoreId: d.id, ...d.data() }))
      fsData.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      setProcessTypes(fsData)
    } catch (e) {
      console.error('Error fetching process types:', e)
    }
  }

  // Handle section change with strict permission validation
  const handleSwitchSection = (targetSection) => {
    if (targetSection === 'SERIGRAFIA' && !canSeeSerigrafia) {
      setFormMessage({ type: 'error', text: '⛔ ACCESO RESTRINGIDO: No tienes permiso para acceder a Serigrafía.' })
      return
    }
    if (targetSection === 'BORDADO' && !canSeeBordado) {
      setFormMessage({ type: 'error', text: '⛔ ACCESO RESTRINGIDO: No tienes permiso para acceder a Bordado.' })
      return
    }
    setActiveSection(targetSection)
    setAddedProcesses([])
    setTempProcessName('')
    setTempProcessPiezas('')
    setFormMessage(null)

  }

  // Add process item to temporary order process list
  const handleAddProcessToOrder = () => {
    setFormMessage(null)

    if (!tempProcessName || !tempProcessPiezas) {
      setFormMessage({ type: 'error', text: '⚠️ Seleccione el proceso a realizar e ingrese el número de piezas.' })
      return
    }

    const piezasNum = parseInt(tempProcessPiezas, 10)
    if (isNaN(piezasNum) || piezasNum <= 0) {
      setFormMessage({ type: 'error', text: '⚠️ El número de piezas debe ser mayor a cero.' })
      return
    }

    // For Serigrafía/Bordado: quote modal only shown when we have a proveedor already assigned (re-print flow or
    // direct assignment in ARREGLOS). In the authorization flow (SERIGRAFIA/BORDADO), the proveedor is
    // assigned later by the Designador, so we skip the quote modal and set cost=0 placeholder.
    const isAuthSection = activeSection === 'SERIGRAFIA' || activeSection === 'BORDADO'

    if (isAuthSection && formData.proveedor_nombre && canAuthorize) {
      // Designador is adding a process with a known supplier → show quote modal
      setPendingQuoteItem({ id: Date.now(), proceso_nombre: tempProcessName, total_piezas: piezasNum })
      setQuotePrice('')
      setShowQuoteModal(true)
      return
    }

    // Standard: lookup unit cost from catalog
    const matchedProcess = processTypes.find(p => p.name.toUpperCase() === tempProcessName.toUpperCase())
    const unitCost = matchedProcess ? parseFloat(matchedProcess.unit_cost || 0) : 0
    const totalCost = unitCost * piezasNum

    setAddedProcesses(prev => [
      ...prev,
      {
        id: Date.now(),
        proceso_nombre: tempProcessName,
        total_piezas: piezasNum,
        unit_cost: unitCost,
        total_cost: totalCost,
        manual_quote: false
      }
    ])

    setTempProcessName('')
    setTempProcessPiezas('')
  }


  // Confirm manual quote modal for Serigrafia
  const handleConfirmQuote = () => {
    if (!pendingQuoteItem) return
    const price = parseFloat(quotePrice)
    if (isNaN(price) || price < 0) {
      alert('⚠️ Ingrese un precio cotizado válido (mayor o igual a cero).')
      return
    }

    const totalCost = price * pendingQuoteItem.total_piezas

    setAddedProcesses(prev => [
      ...prev,
      {
        id: pendingQuoteItem.id,
        proceso_nombre: pendingQuoteItem.proceso_nombre,
        total_piezas: pendingQuoteItem.total_piezas,
        unit_cost: price,
        total_cost: totalCost,
        manual_quote: true
      }
    ])

    setShowQuoteModal(false)
    setPendingQuoteItem(null)
    setQuotePrice('')
    setTempProcessName('')
    setTempProcessPiezas('')
  }

  // Remove a process row from current draft order
  const handleRemoveProcessFromOrder = (id) => {
    setAddedProcesses(prev => prev.filter(p => p.id !== id))
  }

  // Connect / Test Web Serial Printer (TSC TTP-244CE 4x2 inches)
  const handleConnectPrinter = async () => {
    setPrinterMsg(null)
    try {
      const port = await connectPrinter(true)
      if (port) {
        setPrinterConnected(true)
        setPrinterMsg({ type: 'success', text: '✅ Impresora TSC conectada correctamente vía Web Serial.' })
      } else {
        setPrinterMsg({ type: 'error', text: '⚠️ No se seleccionó puerto o la impresora está ocupada por otra aplicación. Puede usar "VÍA NAVEGADOR" para imprimir.' })
      }
    } catch (err) {
      setPrinterMsg({ type: 'error', text: '❌ Error de conexión con la impresora: ' + err.message })
    }
  }

  // Trigger Printing via printer.js (TSC TSPL 4"x2")
  const triggerLabelPrint = async (record) => {
    setPrinterMsg(null)
    try {
      const res = await printLabel({
        code: record.id,
        isExternalProcess: true,
        section: record.section,
        op: record.pedido_num,
        quantity: record.total_piezas,
        cliente: record.cliente,
        proceso: record.proceso_nombre,
        proveedor: record.proveedor_nombre,
        description: `${record.section}: ${record.proceso_nombre}`,
        talla: `${record.total_piezas} PZ`,
        location: record.proveedor_nombre,
        date: new Date(record.created_at).toLocaleDateString('es-MX'),
        warehouse: record.warehouse
      })

      if (res.success) {
        setPrinterConnected(true)
        setPrinterMsg({ type: 'success', text: '🖨️ Etiqueta 4"x2" enviada con éxito a la impresora.' })
      } else {
        setPrinterMsg({ type: 'warning', text: '⚠️ Impresión directa no completada: ' + res.error })
      }
      return res
    } catch (e) {
      console.log('Direct TSPL printing popup standard fallback:', e)
      setPrinterMsg({ type: 'warning', text: '⚠️ Error al enviar comando a impresora: ' + e.message })
      return { success: false, error: e.message }
    }
  }

  // Handle New Order Submission (Operator Form)
  const handleCreateOrder = async (e) => {
    e.preventDefault()
    setFormMessage(null)

    if (!canCapture) {
      setFormMessage({ type: 'error', text: '⛔ No tienes permisos para registrar nuevos pedidos de maquila.' })
      return
    }

    if (activeSection === 'SERIGRAFIA' && !canSeeSerigrafia) {
      setFormMessage({ type: 'error', text: '⛔ ACCESO RESTRINGIDO: Los operadores únicamente pueden capturar procesos de Arreglos.' })
      return
    }
    if (activeSection === 'BORDADO' && !canSeeBordado) {
      setFormMessage({ type: 'error', text: '⛔ ACCESO RESTRINGIDO: No tienes permiso para acceder a Bordado.' })
      return
    }

    const isAuthSection = activeSection === 'SERIGRAFIA' || activeSection === 'BORDADO'

    // For auth sections, proveedor is NOT required at capture time
    if (activeSection === 'ARREGLOS' && (!formData.pedido_num || !formData.cliente || !formData.proveedor_nombre)) {
      setFormMessage({ type: 'error', text: '⚠️ Complete el número de pedido, cliente y proveedor asignado.' })
      return
    }
    if (isAuthSection && (!formData.pedido_num || !formData.cliente)) {
      setFormMessage({ type: 'error', text: '⚠️ Complete el número de pedido y el nombre del cliente.' })
      return
    }

    if (addedProcesses.length === 0) {
      setFormMessage({ type: 'error', text: '⚠️ Agregue al menos un proceso al pedido antes de guardar.' })
      return
    }

    setFormSubmitting(true)

    const totalPiezasOrder = addedProcesses.reduce((sum, item) => sum + item.total_piezas, 0)
    const totalCostOrder = addedProcesses.reduce((sum, item) => sum + item.total_cost, 0)
    const unitCostAvg = totalPiezasOrder > 0 ? (totalCostOrder / totalPiezasOrder) : 0

    // Format process string (e.g. "Estampado (100 PZ), Cuello (50 PZ)")
    const procesoNombreSummary = addedProcesses.map(p => `${p.proceso_nombre} (${p.total_piezas} PZ)`).join(', ')

    // Unique ID generation
    const prefixMap = { ARREGLOS: 'EXT-ARR', SERIGRAFIA: 'EXT-SER', BORDADO: 'EXT-BOR' }
    const prefix = prefixMap[activeSection] || 'EXT'
    const uniqueId = `${prefix}-${formData.pedido_num.trim()}-${Math.floor(100 + Math.random() * 900)}`

    // For auth sections: initial status = PENDIENTE_ASIGNACION (supplier assigned later by Designador)
    const initialStatus = isAuthSection ? 'PENDIENTE_ASIGNACION' : 'PENDIENTE'

    const newRecord = {
      id: uniqueId,
      section: activeSection,
      pedido_num: formData.pedido_num.trim(),
      cliente: formData.cliente.trim(),
      total_piezas: totalPiezasOrder,
      proceso_nombre: procesoNombreSummary,
      proveedor_nombre: formData.proveedor_nombre || '',
      unit_cost: unitCostAvg,
      total_cost: totalCostOrder,
      procesos_detalle: JSON.stringify(addedProcesses),
      status: initialStatus,
      warehouse: activeWarehouse || 'MATRIZ',
      created_by_uid: user?.uid || '',
      created_by_name: profile?.name || user?.email || 'OPERADOR',
      created_at: new Date().toISOString()
    }

    try {
      // 1. Save to Supabase (if table exists)
      try {
        await supabase.from('external_processes').insert([newRecord])
      } catch (sbErr) {
        console.warn('Supabase insert note:', sbErr.message)
      }

      // 2. Dual Backup / Primary to Firebase Firestore
      try {
        await setDoc(doc(db, 'external_processes', newRecord.id), newRecord)
        await addDoc(collection(db, 'external_processes_history'), {
          ...newRecord,
          action: 'CREACION_ORDEN'
        })
      } catch (fbErr) {
        console.warn('Firebase history sync note:', fbErr.message)
      }

      // 3. For auth sections: fire notification to Designador (authorizer)
      if (isAuthSection) {
        try {
          await addDoc(collection(db, 'external_process_notifications'), {
            type: 'ASIGNACION_PENDIENTE',
            record_id: uniqueId,
            pedido_num: formData.pedido_num.trim(),
            cliente: formData.cliente.trim(),
            proceso_nombre: procesoNombreSummary,
            total_piezas: totalPiezasOrder,
            section: activeSection,
            created_at: new Date().toISOString(),
            read: false,
            target_role: 'authorizer',
            created_by_uid: user?.uid || '',
            created_by_name: profile?.name || user?.email || 'OPERADOR',
            resolved_at: null
          })
        } catch (notifErr) {
          console.warn('Notification creation note:', notifErr.message)
        }
        setFormMessage({ type: 'success', text: `✅ Orden ${uniqueId} registrada. 🔔 Notificación enviada al Designador para asignación de proveedor.` })
      } else {
        // ARREGLOS: immediate print flow
        setRecords(prev => [newRecord, ...prev])
        setFormMessage({ type: 'success', text: `✅ Orden ${uniqueId} registrada exitosamente.` })
        // Trigger box-count print modal
        setPendingPrintRecord(newRecord)
        setBoxCount(1)
        setShowBoxModal(true)
      }

      // Update local state
      setRecords(prev => [newRecord, ...prev])

      // Reset form
      setFormData({ pedido_num: '', cliente: '', proveedor_nombre: '' })
      setAddedProcesses([])
      setTempProcessName('')
      setTempProcessPiezas('')
    } catch (err) {
      console.error('Error creating order:', err)
      setFormMessage({ type: 'error', text: '❌ Error al guardar la orden: ' + err.message })
    } finally {
      setFormSubmitting(false)
    }
  }


  // Sequential QR Scan Logic
  const handleQRScan = async (e) => {
    e.preventDefault()
    if (!scanCode.trim()) return

    if (!canMonitor && !canCapture) {
      setScanFeedback({ type: 'error', text: '⛔ No tienes permisos para escanear y actualizar pedidos.' })
      return
    }

    const rawCode = scanCode.trim()
    setScanCode('')
    setScanFeedback(null)

    // Find record by ID or Pedido Num
    const targetRecord = records.find(
      r => r.id.toLowerCase() === rawCode.toLowerCase() || String(r.pedido_num).toLowerCase() === rawCode.toLowerCase()
    )

    if (!targetRecord) {
      setScanFeedback({ type: 'error', text: `❌ No se encontró ninguna orden con el código/pedido: ${rawCode}` })
      return
    }

    const currentUserName = profile?.name || user?.email || 'USUARIO ALMACÉN'
    const nowIso = new Date().toISOString()

    if (targetRecord.status === 'PENDIENTE') {
      // FIRST SCAN: OUTBOUND TO SUPPLIER
      const updates = {
        status: 'ENTREGADO_PROVEEDOR',
        fecha_salida: nowIso,
        user_salida: currentUserName
      }

      // Update Supabase
      try {
        await supabase.from('external_processes').update(updates).eq('id', targetRecord.id)
      } catch (e) {}

      // Dual Sync to Firebase Firestore
      try {
        await setDoc(doc(db, 'external_processes', targetRecord.id), updates, { merge: true })
        await addDoc(collection(db, 'external_processes_history'), {
          id: targetRecord.id,
          pedido_num: targetRecord.pedido_num,
          section: targetRecord.section,
          status: 'ENTREGADO_PROVEEDOR',
          user_salida: currentUserName,
          fecha_salida: nowIso,
          action: '1ER_ESCANEO_SALIDA'
        })
      } catch (fbErr) {
        console.warn('Firebase scan sync note:', fbErr.message)
      }

      setRecords(prev => prev.map(r => r.id === targetRecord.id ? { ...r, ...updates } : r))
      
      setScanFeedback({
        type: 'success',
        text: `🚚 [1er Escaneo - SALIDA] Orden #${targetRecord.pedido_num} (${targetRecord.cliente}) cambiada a "ENTREGADO AL PROVEEDOR"`
      })
    } else if (targetRecord.status === 'ENTREGADO_PROVEEDOR') {
      // SECOND SCAN: RETURN / RECEPTION FROM SUPPLIER
      const updates = {
        status: 'RECIBIDO',
        fecha_recepcion: nowIso,
        user_recepcion: currentUserName
      }

      // Update Supabase
      try {
        await supabase.from('external_processes').update(updates).eq('id', targetRecord.id)
      } catch (e) {}

      // Dual Sync to Firebase Firestore
      try {
        await setDoc(doc(db, 'external_processes', targetRecord.id), updates, { merge: true })
        await addDoc(collection(db, 'external_processes_history'), {
          id: targetRecord.id,
          pedido_num: targetRecord.pedido_num,
          section: targetRecord.section,
          status: 'RECIBIDO',
          user_recepcion: currentUserName,
          fecha_recepcion: nowIso,
          action: '2DO_ESCANEO_RECEPCION'
        })
      } catch (fbErr) {
        console.warn('Firebase scan sync note:', fbErr.message)
      }

      setRecords(prev => prev.map(r => r.id === targetRecord.id ? { ...r, ...updates } : r))

      setScanFeedback({
        type: 'success',
        text: `✅ [2do Escaneo - RECEPCIÓN] Orden #${targetRecord.pedido_num} marcada como "RECIBIDO" por ${currentUserName}`
      })
    } else if (targetRecord.status === 'RECIBIDO') {
      setScanFeedback({
        type: 'info',
        text: `ℹ️ La orden #${targetRecord.pedido_num} ya se encuentra completada y recibida previamente por ${targetRecord.user_recepcion || 'usuario'}.`
      })
    }
  }

  // Catalog Management Handlers (Supabase + Dual Backup Firestore)
  const handleAddProcess = async () => {
    if (!newProcessName.trim()) return
    setCatalogMsg(null)
    const costVal = canSeeCosts ? (parseFloat(newProcessCost) || 0) : 0
    const newType = {
      section: activeSection,
      name: newProcessName.trim(),
      unit_cost: costVal,
      created_at: new Date().toISOString()
    }

    let savedItem = null
    // 1. Try Supabase
    try {
      const { data, error } = await supabase.from('external_process_types').insert([newType]).select()
      if (!error && data && data.length > 0) {
        savedItem = data[0]
      }
    } catch (e) {}

    // 2. Dual Backup to Firestore
    try {
      const docRef = await addDoc(collection(db, 'external_process_types'), newType)
      if (!savedItem) {
        savedItem = { id: docRef.id, firestoreId: docRef.id, ...newType }
      }
    } catch (fbErr) {
      console.warn('Firestore process type sync note:', fbErr)
    }

    if (savedItem) {
      setProcessTypes(prev => [...prev, savedItem])
      setCatalogMsg({ type: 'success', text: `✅ Proceso "${newType.name}" guardado correctamente.` })
    } else {
      setCatalogMsg({ type: 'error', text: '❌ Error al guardar proceso.' })
    }

    setNewProcessName('')
    setNewProcessCost('')
  }

  const handleDeleteProcess = async (item) => {
    const id = typeof item === 'object' ? item.id : item
    const fsId = typeof item === 'object' ? item.firestoreId : item
    try { if (id) await supabase.from('external_process_types').delete().eq('id', id) } catch (e) {}
    try { if (fsId) await deleteDoc(doc(db, 'external_process_types', fsId)) } catch (e) {}
    setProcessTypes(prev => prev.filter(p => p.id !== id && p.firestoreId !== fsId))
  }

  const handleAddSupplier = async () => {
    if (!newSupplierName.trim()) return
    setCatalogMsg(null)
    const newSup = {
      section: activeSection,
      name: newSupplierName.trim(),
      contact_info: newSupplierContact.trim(),
      created_at: new Date().toISOString()
    }

    let savedSup = null
    // 1. Try Supabase
    try {
      const { data, error } = await supabase.from('external_suppliers').insert([newSup]).select()
      if (!error && data && data.length > 0) {
        savedSup = data[0]
      }
    } catch (e) {}

    // 2. Dual Backup to Firestore
    try {
      const docRef = await addDoc(collection(db, 'external_suppliers'), newSup)
      if (!savedSup) {
        savedSup = { id: docRef.id, firestoreId: docRef.id, ...newSup }
      }
    } catch (fbErr) {
      console.warn('Firestore supplier sync note:', fbErr)
    }

    if (savedSup) {
      setSuppliers(prev => [...prev, savedSup])
      setCatalogMsg({ type: 'success', text: `✅ Proveedor "${newSup.name}" guardado correctamente.` })
    } else {
      setCatalogMsg({ type: 'error', text: '❌ Error al guardar proveedor.' })
    }

    setNewSupplierName('')
    setNewSupplierContact('')
  }

  const handleDeleteSupplier = async (item) => {
    const id = typeof item === 'object' ? item.id : item
    const fsId = typeof item === 'object' ? item.firestoreId : item
    try { if (id) await supabase.from('external_suppliers').delete().eq('id', id) } catch (e) {}
    try { if (fsId) await deleteDoc(doc(db, 'external_suppliers', fsId)) } catch (e) {}
    setSuppliers(prev => prev.filter(s => s.id !== id && s.firestoreId !== fsId))
  }

  // ── Authorization Handler: Designador assigns supplier + cost ──
  const handleAssignAuthorization = async () => {
    if (!selectedNotification || !assignProveedor) {
      alert('⚠️ Seleccione un proveedor para continuar.')
      return
    }
    const costoPrenda = parseFloat(assignCostoPorPrenda) || 0
    const totalPiezas = selectedNotification.total_piezas || 0
    const totalCosto = costoPrenda * totalPiezas

    setAssignSaving(true)
    try {
      const updates = {
        proveedor_nombre: assignProveedor,
        unit_cost: costoPrenda,
        total_cost: totalCosto,
        status: 'PENDIENTE',
        assigned_by: profile?.name || user?.email,
        assigned_at: new Date().toISOString()
      }
      
      // 1. Update Supabase
      try {
        await supabase.from('external_processes').update(updates).eq('id', selectedNotification.record_id)
      } catch (e) {}

      // 2. Update Firestore
      try {
        await setDoc(doc(db, 'external_processes', selectedNotification.record_id), updates, { merge: true })
      } catch (e) {}

      // 3. Mark authorizer notification as read
      await updateDoc(doc(db, 'external_process_notifications', selectedNotification.firestoreId), {
        read: true,
        resolved_at: new Date().toISOString()
      })

      // 4. Fire notification to Operator (LISTO_PARA_IMPRIMIR)
      await addDoc(collection(db, 'external_process_notifications'), {
        type: 'LISTO_PARA_IMPRIMIR',
        record_id: selectedNotification.record_id,
        pedido_num: selectedNotification.pedido_num,
        cliente: selectedNotification.cliente,
        proceso_nombre: selectedNotification.proceso_nombre,
        total_piezas: totalPiezas,
        proveedor_nombre: assignProveedor,
        costo_por_prenda: costoPrenda,
        total_costo: totalCosto,
        section: selectedNotification.section,
        created_at: new Date().toISOString(),
        read: false,
        target_role: 'operator',
        assigned_by: profile?.name || user?.email,
        created_by_uid: selectedNotification.created_by_uid,
        resolved_at: null
      })

      // 5. Update local records
      setRecords(prev => prev.map(r =>
        r.id === selectedNotification.record_id ? { ...r, ...updates } : r
      ))

      setShowAssignModal(false)
      setSelectedNotification(null)
      setAssignProveedor('')
      setAssignCostoPorPrenda('')
    } catch (err) {
      alert('❌ Error al guardar asignación: ' + err.message)
    } finally {
      setAssignSaving(false)
    }
  }

  // ── Printer Click Handler with Authorization & Box Modal Validation ──
  const handlePrinterClick = (record) => {
    if (!record) return

    if (record.status === 'CANCELADO') {
      alert('⚠️ IMPRESIÓN RESTRINGIDA: Este pedido se encuentra CANCELADO y no se pueden generar etiquetas.')
      return
    }

    // Regla de negocio: No permitir imprimir ni mostrar el pop-up de cajas si el autorizador no ha asignado proveedor y costo
    if (record.status === 'PENDIENTE_ASIGNACION' || !record.proveedor_nombre || record.proveedor_nombre.trim() === '') {
      alert('⚠️ IMPRESIÓN RESTRINGIDA: No se puede imprimir la etiqueta debido a que el usuario autorizador (Designador) aún no ha asignado un proveedor y su respectivo costo a este pedido.')
      return
    }

    // Mostrar inmediatamente el pop-up preguntando "¿Cuántas cajas son?"
    setPendingPrintRecord(record)
    setBoxCount(1)
    setShowBoxModal(true)
  }

  // ── Mandatory Cancellation Handlers ──
  const handleOpenCancelModal = (record) => {
    setPendingCancelRecord(record)
    setCancelReason('')
    setCancelError(null)
    setShowCancelModal(true)
  }

  const handleConfirmCancel = async () => {
    if (!pendingCancelRecord) return

    if (!cancelReason.trim()) {
      setCancelError('⚠️ El motivo de cancelación es ESTRICTAMENTE OBLIGATORIO.')
      return
    }

    setCancelSubmitting(true)
    setCancelError(null)

    const nowIso = new Date().toISOString()
    const cancelledByName = profile?.name || user?.email || 'USUARIO ALMACÉN'

    const updates = {
      status: 'CANCELADO',
      motivo_cancelacion: cancelReason.trim(),
      cancelled_by: cancelledByName,
      cancelled_at: nowIso
    }

    try {
      // 1. Update Supabase
      try {
        await supabase.from('external_processes').update(updates).eq('id', pendingCancelRecord.id)
      } catch (sbErr) {
        console.warn('Supabase cancel update note:', sbErr.message)
      }

      // 2. Update Firestore & add history entry
      try {
        await setDoc(doc(db, 'external_processes', pendingCancelRecord.id), updates, { merge: true })
        await addDoc(collection(db, 'external_processes_history'), {
          id: pendingCancelRecord.id,
          pedido_num: pendingCancelRecord.pedido_num,
          section: pendingCancelRecord.section,
          status: 'CANCELADO',
          motivo_cancelacion: cancelReason.trim(),
          cancelled_by: cancelledByName,
          cancelled_at: nowIso,
          action: 'CANCELACION_ORDEN'
        })
      } catch (fbErr) {
        console.warn('Firestore cancel sync note:', fbErr.message)
      }

      // 3. Update local state
      setRecords(prev => prev.map(r => r.id === pendingCancelRecord.id ? { ...r, ...updates } : r))

      // 4. Close modal
      setShowCancelModal(false)
      setPendingCancelRecord(null)
      setCancelReason('')
    } catch (err) {
      console.error('Error cancelling order:', err)
      setCancelError('❌ Error al procesar la cancelación: ' + err.message)
    } finally {
      setCancelSubmitting(false)
    }
  }

  // ── Box-count print handler ──
  const handleConfirmBoxPrint = async () => {
    if (!pendingPrintRecord) return
    const n = parseInt(boxCount, 10) || 1
    setShowBoxModal(false)
    setBoxPrintProgress(0)
    if (n === 1) {
      // Single box: use standard printLabel
      setSelectedLabelRecord(pendingPrintRecord)
      await triggerLabelPrint(pendingPrintRecord)
    } else {
      // Multi-box: use printLabelMultiBox
      const printData = {
        code: pendingPrintRecord.id,
        isExternalProcess: true,
        section: pendingPrintRecord.section,
        op: pendingPrintRecord.pedido_num,
        quantity: pendingPrintRecord.total_piezas,
        cliente: pendingPrintRecord.cliente,
        proceso: pendingPrintRecord.proceso_nombre,
        proveedor: pendingPrintRecord.proveedor_nombre,
        date: new Date(pendingPrintRecord.created_at).toLocaleDateString('es-MX')
      }
      const res = await printLabelMultiBox(printData, n, (pct) => setBoxPrintProgress(pct))
      if (res.success) {
        setPrinterMsg({ type: 'success', text: `🖨️ ${n} etiquetas impresas (Caja 1 de ${n} ... Caja ${n} de ${n}).` })
      } else {
        // Fallback: open label preview for browser print
        setSelectedLabelRecord(pendingPrintRecord)
        setPrinterMsg({ type: 'warning', text: '⚠️ Impresión directa no completada: ' + res.error })
      }
      setBoxPrintProgress(null)
    }
    setPendingPrintRecord(null)
  }

  // Billing & Reconciliation Report Export (Excel & CSV)
  const exportReconciliationReport = (format = 'excel') => {
    if (!canSeeReports) {
      alert('⛔ No tienes permisos asignados para descargar reportes de conciliación.')
      return
    }

    // AJUSTE: El detalle del reporte incluye TODOS los registros (incluyendo CANCELADOS) para trazabilidad completa
    const reportData = filteredRecords.map(r => {
      const row = {
        'SECCIÓN': r.section,
        'PEDIDO #': r.pedido_num,
        'CLIENTE': r.cliente,
        'PROVEEDOR': r.proveedor_nombre,
        'PROCESO(S)': r.proceso_nombre,
        'PIEZAS TOTALES': r.total_piezas,
        'ESTATUS': r.status === 'ENTREGADO_PROVEEDOR' ? 'ENTREGADO AL PROVEEDOR' : r.status,
        'FECHA REGISTRO': r.created_at ? new Date(r.created_at).toLocaleString() : '—',
        'FECHA SALIDA (1er Escaneo)': r.fecha_salida ? new Date(r.fecha_salida).toLocaleString() : 'PENDIENTE',
        'FECHA RECEPCIÓN (2do Escaneo)': r.fecha_recepcion ? new Date(r.fecha_recepcion).toLocaleString() : 'PENDIENTE',
        'USUARIO RECEPCIÓN': r.user_recepcion || '—',
        'MOTIVO CANCELACIÓN': r.motivo_cancelacion || '—',
        'CANCELADO POR': r.cancelled_by || '—',
        'FECHA CANCELACIÓN': r.cancelled_at ? new Date(r.cancelled_at).toLocaleString() : '—',
      }

      if (canSeeCosts) {
        row['COSTO UNITARIO PROM ($)'] = r.unit_cost || 0
        // AJUSTE: Los registros CANCELADOS se muestran con $0 en el facturable para que el total del Excel sea correcto
        row['TOTAL FACTURABLE ($)'] = r.status === 'CANCELADO' ? 0 : (r.total_cost || 0)
        row['COSTO ORIGINAL ($)'] = r.total_cost || 0
      }

      return row
    })

    if (reportData.length === 0) {
      alert('No hay datos disponibles para exportar con los filtros actuales.')
      return
    }

    if (format === 'excel') {
      const worksheet = XLSX.utils.json_to_sheet(reportData)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, `Conciliación_${activeSection}`)

      if (canSeeCosts) {
        // AJUSTE: El resumen por proveedor excluye CANCELADOS del total monetario
        const summaryBySupplier = {}
        filteredRecords.forEach(r => {
          const sup = r.proveedor_nombre || '(SIN ASIGNAR)'
          if (!summaryBySupplier[sup]) {
            summaryBySupplier[sup] = { 'PROVEEDOR': sup, 'PEDIDOS TOTALES': 0, 'PEDIDOS CANCELADOS': 0, 'TOTAL PIEZAS': 0, 'MONTO FACTURABLE ($)': 0 }
          }
          summaryBySupplier[sup]['PEDIDOS TOTALES'] += 1
          if (r.status === 'CANCELADO') {
            summaryBySupplier[sup]['PEDIDOS CANCELADOS'] += 1
          } else {
            summaryBySupplier[sup]['TOTAL PIEZAS'] += r.total_piezas || 0
            summaryBySupplier[sup]['MONTO FACTURABLE ($)'] += r.total_cost || 0
          }
        })

        const summarySheet = XLSX.utils.json_to_sheet(Object.values(summaryBySupplier))
        XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen por Proveedor')
      }

      XLSX.writeFile(workbook, `Reporte_Conciliacion_Maquila_${activeSection}_${new Date().toISOString().slice(0,10)}.xlsx`)
    } else {
      const worksheet = XLSX.utils.json_to_sheet(reportData)
      const csvOutput = XLSX.utils.sheet_to_csv(worksheet)
      const blob = new Blob([csvOutput], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.setAttribute('download', `Reporte_Conciliacion_${activeSection}_${new Date().toISOString().slice(0,10)}.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }

  // Filtered records
  const filteredRecords = records.filter(r => {
    const matchesSearch = 
      String(r.pedido_num).toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(r.cliente).toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(r.proveedor_nombre).toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(r.proceso_nombre).toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(r.id).toLowerCase().includes(searchTerm.toLowerCase())

    const matchesSupplier = filterSupplier === 'ALL' || r.proveedor_nombre === filterSupplier
    const matchesStatus = filterStatus === 'ALL' || r.status === filterStatus

    return matchesSearch && matchesSupplier && matchesStatus
  })

  // Summary Metrics
  const totalOrdersCount = filteredRecords.length
  const totalPiecesCount = filteredRecords.reduce((acc, curr) => acc + (curr.total_piezas || 0), 0)
  // AJUSTE: Los procesos CANCELADOS se excluyen del monto total facturable en pantalla
  const totalCostSum = filteredRecords
    .filter(r => r.status !== 'CANCELADO')
    .reduce((acc, curr) => acc + (curr.total_cost || 0), 0)

  // Render Full Restricted Access Banner if user has neither capture nor monitor access
  if (!canCapture && !canMonitor) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', background: 'rgba(15,23,42,0.8)', borderRadius: '1.5rem', border: '1px solid rgba(239,68,68,0.2)', color: 'white' }}>
        <Lock size={48} color="#ef4444" style={{ marginBottom: '1rem' }} />
        <h2 style={{ fontSize: '1.5rem', fontWeight: 1000, color: '#ef4444', textTransform: 'uppercase' }}>ACCESO RESTRINGIDO</h2>
        <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '0.5rem', maxWidth: '500px', margin: '0.5rem auto' }}>
          No tienes permisos asignados para acceder al módulo de Procesos Externos. Contacte a un Usuario Master o Administrador.
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minHeight: '100%' }}>
      
      {/* Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#EF4444', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 1000, textTransform: 'uppercase', letterSpacing: '0.25em' }}>
              CONTROL DE MAQUILA EXTERNA
            </span>
          </div>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 1000, color: 'white', textTransform: 'uppercase', letterSpacing: '-0.02em' }}>
            CONTROL DE <span style={{ color: '#EF4444' }}>PROCESOS EXTERNOS</span>
          </h1>
        </div>

        {/* Section Tabs Switcher & Printer Connect Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            onClick={handleConnectPrinter}
            style={{
              padding: '0.75rem 1.25rem',
              borderRadius: '1rem',
              background: printerConnected ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${printerConnected ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.1)'}`,
              color: printerConnected ? '#4ade80' : '#94a3b8',
              fontWeight: 1000,
              fontSize: '0.75rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              textTransform: 'uppercase'
            }}
          >
            <Printer size={16} /> {printerConnected ? 'IMPRESORA LISTA (4"x2")' : 'CONECTAR IMPRESORA TSC'}
          </button>

          {/* Section Switcher (ARREGLOS | SERIGRAFÍA | BORDADO) */}
          <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(255,255,255,0.03)', padding: '0.35rem', borderRadius: '1.25rem', border: '1px solid rgba(255,255,255,0.05)' }}>
            <button
              onClick={() => handleSwitchSection('ARREGLOS')}
              style={{
                padding: '0.65rem 1.5rem',
                borderRadius: '1rem',
                background: activeSection === 'ARREGLOS' ? 'linear-gradient(135deg,#ef4444,#b91c1c)' : 'transparent',
                color: activeSection === 'ARREGLOS' ? 'white' : '#64748B',
                border: 'none', fontWeight: 1000, fontSize: '0.85rem', textTransform: 'uppercase',
                cursor: 'pointer', transition: 'all 0.2s',
                boxShadow: activeSection === 'ARREGLOS' ? '0 0 20px rgba(239,68,68,0.4)' : 'none',
                display: 'flex', alignItems: 'center', gap: '0.4rem'
              }}
            >
              ✂️ ARREGLOS
            </button>

            <button
              onClick={() => handleSwitchSection('SERIGRAFIA')}
              style={{
                padding: '0.65rem 1.5rem', borderRadius: '1rem',
                background: activeSection === 'SERIGRAFIA' ? 'linear-gradient(135deg,#3b82f6,#1d4ed8)' : 'transparent',
                color: activeSection === 'SERIGRAFIA' ? 'white' : '#64748B',
                border: 'none', fontWeight: 1000, fontSize: '0.85rem', textTransform: 'uppercase',
                cursor: 'pointer', transition: 'all 0.2s',
                boxShadow: activeSection === 'SERIGRAFIA' ? '0 0 20px rgba(59,130,246,0.4)' : 'none',
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                opacity: canSeeSerigrafia ? 1 : 0.6
              }}
            >
              🎨 SERIGRAFÍA {!canSeeSerigrafia && <Lock size={12} style={{ marginLeft: '4px' }} />}
            </button>

            <button
              onClick={() => handleSwitchSection('BORDADO')}
              style={{
                padding: '0.65rem 1.5rem', borderRadius: '1rem',
                background: activeSection === 'BORDADO' ? 'linear-gradient(135deg,#8b5cf6,#6d28d9)' : 'transparent',
                color: activeSection === 'BORDADO' ? 'white' : '#64748B',
                border: 'none', fontWeight: 1000, fontSize: '0.85rem', textTransform: 'uppercase',
                cursor: 'pointer', transition: 'all 0.2s',
                boxShadow: activeSection === 'BORDADO' ? '0 0 20px rgba(139,92,246,0.4)' : 'none',
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                opacity: canSeeBordado ? 1 : 0.6
              }}
            >
              🧵 BORDADO {!canSeeBordado && <Lock size={12} style={{ marginLeft: '4px' }} />}
            </button>
          </div>
        </div>
      </div>

      {printerMsg && (
        <div style={{
          padding: '0.75rem 1.25rem', borderRadius: '1rem', fontSize: '0.8rem', fontWeight: 900,
          background: printerMsg.type === 'error' ? 'rgba(239,68,68,0.15)' : printerMsg.type === 'warning' ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.15)',
          border: `1px solid ${printerMsg.type === 'error' ? '#ef4444' : printerMsg.type === 'warning' ? '#f59e0b' : '#22c55e'}`,
          color: printerMsg.type === 'error' ? '#f87171' : printerMsg.type === 'warning' ? '#fbbf24' : '#4ade80'
        }}>
          {printerMsg.text}
        </div>
      )}

      {/* Module Internal Sub-Tabs Navigation (Pestaña 1: Captura | Pestaña 2: Monitor) */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', gap: '1rem' }}>
        {canCapture && (
          <button
            onClick={() => setModuleTab('capture')}
            style={{
              padding: '0.875rem 1.75rem',
              border: 'none',
              borderBottom: moduleTab === 'capture' ? '3px solid #ef4444' : '3px solid transparent',
              background: 'transparent',
              color: moduleTab === 'capture' ? 'white' : '#64748b',
              fontWeight: 1000,
              fontSize: '0.85rem',
              textTransform: 'uppercase',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s'
            }}
          >
            <FileText size={18} color={moduleTab === 'capture' ? '#ef4444' : '#64748b'} />
            1. CAPTURA Y REGISTRO
          </button>
        )}

        {canMonitor && (
          <button
            onClick={() => setModuleTab('monitor')}
            style={{
              padding: '0.875rem 1.75rem', border: 'none',
              borderBottom: moduleTab === 'monitor' ? '3px solid #ef4444' : '3px solid transparent',
              background: 'transparent', color: moduleTab === 'monitor' ? 'white' : '#64748b',
              fontWeight: 1000, fontSize: '0.85rem', textTransform: 'uppercase',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s'
            }}
          >
            <LayoutDashboard size={18} color={moduleTab === 'monitor' ? '#ef4444' : '#64748b'} />
            2. MONITOR DE SEGUIMIENTO ({records.length})
          </button>
        )}

        {/* BUZÓN tab — visible to all with module access */}
        {(canCapture || canMonitor) && (
          <button
            onClick={() => setModuleTab('inbox')}
            style={{
              padding: '0.875rem 1.75rem', border: 'none',
              borderBottom: moduleTab === 'inbox' ? '3px solid #f59e0b' : '3px solid transparent',
              background: 'transparent', color: moduleTab === 'inbox' ? 'white' : '#64748b',
              fontWeight: 1000, fontSize: '0.85rem', textTransform: 'uppercase',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s',
              position: 'relative'
            }}
          >
            <Bell size={18} color={moduleTab === 'inbox' ? '#f59e0b' : '#64748b'} />
            3. BUZÓN
            {notifications.length > 0 && (
              <span style={{
                position: 'absolute', top: '6px', right: '6px',
                background: '#ef4444', color: 'white',
                borderRadius: '999px', fontSize: '0.6rem', fontWeight: 900,
                padding: '1px 5px', minWidth: '16px', textAlign: 'center'
              }}>{notifications.length}</span>
            )}
          </button>
        )}
      </div>

      {/* PESTAÑA 1: CAPTURA Y REGISTRO */}
      {moduleTab === 'capture' && canCapture && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem' }}>
          
          {/* Operator Form */}
          <div style={{
            background: 'rgba(15,23,42,0.6)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '1.5rem',
            padding: '1.5rem',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 1000, color: 'white', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileText size={18} color="#ef4444" /> FORMULARIO DE REGISTRO - {activeSection}
              </h3>
              <span style={{ fontSize: '0.65rem', background: 'rgba(239,68,68,0.15)', color: '#ef4444', padding: '0.2rem 0.6rem', borderRadius: '0.5rem', fontWeight: 900, textTransform: 'uppercase' }}>
                CAPTURA
              </span>
            </div>

            {formMessage && (
              <div style={{
                padding: '0.75rem 1rem',
                borderRadius: '0.75rem',
                marginBottom: '1rem',
                fontSize: '0.8rem',
                fontWeight: 900,
                background: formMessage.type === 'error' ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                border: `1px solid ${formMessage.type === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
                color: formMessage.type === 'error' ? '#f87171' : '#4ade80'
              }}>
                {formMessage.text}
              </div>
            )}

            <form onSubmit={handleCreateOrder} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.65rem', fontWeight: 1000, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '0.3rem' }}>
                    NÚMERO DE PEDIDO *
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: 54109"
                    value={formData.pedido_num}
                    onChange={e => setFormData({ ...formData, pedido_num: e.target.value })}
                    style={{
                      width: '100%', background: 'rgba(2,6,23,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem',
                      padding: '0.65rem 0.875rem', color: 'white', fontWeight: 800, fontSize: '0.85rem', outline: 'none'
                    }}
                    required
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.65rem', fontWeight: 1000, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '0.3rem' }}>
                    NOMBRE DEL CLIENTE *
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: CORPORACIÓN INDUSTRIAL SUR"
                    value={formData.cliente}
                    onChange={e => setFormData({ ...formData, cliente: e.target.value })}
                    style={{
                      width: '100%', background: 'rgba(2,6,23,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem',
                      padding: '0.65rem 0.875rem', color: 'white', fontWeight: 800, fontSize: '0.85rem', outline: 'none'
                    }}
                    required
                  />
                </div>
              </div>

              {/* PROVEEDOR — required for ARREGLOS, optional/informational for auth sections */}
              {activeSection === 'ARREGLOS' ? (
                <div>
                  <label style={{ fontSize: '0.65rem', fontWeight: 1000, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '0.3rem' }}>
                    PROVEEDOR ASIGNADO *
                  </label>
                  <select
                    value={formData.proveedor_nombre}
                    onChange={e => setFormData({ ...formData, proveedor_nombre: e.target.value })}
                    style={{
                      width: '100%', background: '#0b0e14', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem',
                      padding: '0.65rem 0.875rem', color: 'white', fontWeight: 800, fontSize: '0.85rem', outline: 'none', cursor: 'pointer'
                    }}
                    required
                  >
                    <option value="">SELECCIONAR PROVEEDOR...</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div style={{
                  padding: '0.75rem 1rem', borderRadius: '0.75rem',
                  background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)',
                  display: 'flex', alignItems: 'center', gap: '0.5rem'
                }}>
                  <Bell size={16} color="#f59e0b" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#fbbf24' }}>
                    🔔 FLUJO DE AUTORIZACIÓN: El proveedor y cotización serán asignados por el Designador tras guardar este pedido. Se enviará notificación automática al Buzón.
                  </span>
                </div>
              )}

              {/* Multiple Processes Add Area */}
              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '1rem', border: '1px dashed rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 1000, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  ⚙️ AGREGAR PROCESO(S) AL PEDIDO
                </span>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.6rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '0.2rem' }}>
                      PROCESO A REALIZAR
                    </label>
                    <select
                      value={tempProcessName}
                      onChange={e => setTempProcessName(e.target.value)}
                      style={{
                        width: '100%', background: '#0b0e14', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.6rem',
                        padding: '0.5rem 0.75rem', color: 'white', fontWeight: 800, fontSize: '0.8rem', outline: 'none'
                      }}
                    >
                      <option value="">SELECCIONAR PROCESO...</option>
                      {processTypes.map(pt => (
                        <option key={pt.id} value={pt.name}>
                          {pt.name} {canSeeCosts && pt.unit_cost ? `($${pt.unit_cost}/pz)` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.6rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '0.2rem' }}>
                      PIEZAS
                    </label>
                    <input
                      type="number"
                      placeholder="Ej: 100"
                      min="1"
                      value={tempProcessPiezas}
                      onChange={e => setTempProcessPiezas(e.target.value)}
                      style={{
                        width: '100%', background: 'rgba(2,6,23,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.6rem',
                        padding: '0.5rem 0.75rem', color: 'white', fontWeight: 800, fontSize: '0.8rem', outline: 'none'
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={handleAddProcessToOrder}
                      style={{
                        padding: '0.55rem 1rem', borderRadius: '0.6rem', background: '#3b82f6', color: 'white', border: 'none',
                        fontWeight: 1000, fontSize: '0.75rem', cursor: 'pointer', textTransform: 'uppercase', whiteSpace: 'nowrap'
                      }}
                    >
                      + AÑADIR
                    </button>
                  </div>
                </div>

                {/* List of attached processes */}
                {addedProcesses.length > 0 && (
                  <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.65rem', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase' }}>
                      PROCESOS AGREGADOS A ESTE PEDIDO ({addedProcesses.length}):
                    </span>
                    {addedProcesses.map((p) => (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '0.5rem', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div>
                          <span style={{ fontWeight: 900, fontSize: '0.8rem', color: 'white', textTransform: 'uppercase' }}>
                            {p.proceso_nombre}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: '#3b82f6', fontWeight: 900, marginLeft: '0.5rem' }}>
                            ({p.total_piezas} PZ)
                          </span>
                          {canSeeCosts && (
                            <span style={{ fontSize: '0.75rem', color: '#22c55e', fontWeight: 900, marginLeft: '0.75rem' }}>
                              ${p.unit_cost.toFixed(2)}/pz = ${p.total_cost.toFixed(2)}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveProcessFromOrder(p.id)}
                          style={{ background: 'rgba(239,68,68,0.15)', border: 'none', color: '#f87171', padding: '0.3rem', borderRadius: '0.4rem', cursor: 'pointer' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.4rem', borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: '0.8rem', fontWeight: 1000, color: 'white' }}>
                      <span>PIEZAS TOTALES: {addedProcesses.reduce((a, b) => a + b.total_piezas, 0)} PZ</span>
                      {canSeeCosts && (
                        <span style={{ color: '#22c55e' }}>TOTAL: ${addedProcesses.reduce((a, b) => a + b.total_cost, 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={formSubmitting}
                style={{
                  marginTop: '0.5rem',
                  width: '100%',
                  padding: '0.875rem',
                  borderRadius: '0.875rem',
                  background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                  border: 'none',
                  color: 'white',
                  fontWeight: 1000,
                  fontSize: '0.85rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(239,68,68,0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem'
                }}
              >
                <Printer size={18} /> GENERAR E IMPRIMIR ETIQUETA QR
              </button>
            </form>
          </div>

          {/* Sequential QR Scanner */}
          <div style={{
            background: 'rgba(15,23,42,0.6)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '1.5rem',
            padding: '1.5rem',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)'
          }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 1000, color: 'white', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <QrCode size={18} color="#3b82f6" /> LECTOR DE ESCANEO DE ETIQUETA QR
                </h3>
                <span style={{ fontSize: '0.65rem', background: 'rgba(59,130,246,0.15)', color: '#3b82f6', padding: '0.2rem 0.6rem', borderRadius: '0.5rem', fontWeight: 900, textTransform: 'uppercase' }}>
                  SECUENCIAL
                </span>
              </div>

              {scanFeedback && (
                <div style={{
                  padding: '0.875rem 1rem',
                  borderRadius: '0.875rem',
                  marginBottom: '1.25rem',
                  fontSize: '0.85rem',
                  fontWeight: 900,
                  background: scanFeedback.type === 'error' ? 'rgba(239,68,68,0.15)' : scanFeedback.type === 'info' ? 'rgba(59,130,246,0.15)' : 'rgba(34,197,94,0.15)',
                  border: `1px solid ${scanFeedback.type === 'error' ? 'rgba(239,68,68,0.3)' : scanFeedback.type === 'info' ? 'rgba(59,130,246,0.3)' : 'rgba(34,197,94,0.3)'}`,
                  color: scanFeedback.type === 'error' ? '#f87171' : scanFeedback.type === 'info' ? '#60a5fa' : '#4ade80'
                }}>
                  {scanFeedback.text}
                </div>
              )}

              <form onSubmit={handleQRScan} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.65rem', fontWeight: 1000, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '0.3rem' }}>
                    CÓDIGO QR / NÚMERO DE PEDIDO
                  </label>
                  <input
                    type="text"
                    placeholder="ESCANEE O INGRESE CÓDIGO AQUÍ..."
                    value={scanCode}
                    onChange={e => setScanCode(e.target.value)}
                    autoFocus
                    style={{
                      width: '100%', background: 'rgba(2,6,23,0.9)', border: '2px solid #3b82f6', borderRadius: '0.75rem',
                      padding: '0.75rem 1rem', color: 'white', fontWeight: 1000, fontSize: '0.95rem', outline: 'none',
                      boxShadow: '0 0 15px rgba(59,130,246,0.2)'
                    }}
                  />
                </div>

                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.05)', fontSize: '0.75rem', color: '#94a3b8' }}>
                  <p style={{ fontWeight: 900, color: 'white', marginBottom: '0.4rem', textTransform: 'uppercase' }}>📌 FLUJO DE ESCANEO AUTOMÁTICO:</p>
                  <p style={{ marginBottom: '0.25rem' }}>• <b>1er Escaneo:</b> Cambia estatus a <span style={{ color: '#f59e0b', fontWeight: 900 }}>ENTREGADO AL PROVEEDOR</span> (Registra fecha y hora de salida).</p>
                  <p>• <b>2do Escaneo:</b> Cambia estatus a <span style={{ color: '#22c55e', fontWeight: 900 }}>RECIBIDO</span> (Registra recepción de maquila y usuario receptor).</p>
                </div>
              </form>
            </div>
          </div>

        </div>
      )}

      {/* PESTAÑA 2: MONITOR DE SEGUIMIENTO */}
      {moduleTab === 'monitor' && canMonitor && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Summary Cards Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            <div style={{ background: 'rgba(15,23,42,0.6)', padding: '1.25rem', borderRadius: '1.25rem', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 1000, color: '#94a3b8', textTransform: 'uppercase' }}>TOTAL ORDENES FILTRADAS</span>
              <p style={{ fontSize: '1.75rem', fontWeight: 1000, color: 'white', marginTop: '0.2rem' }}>{totalOrdersCount}</p>
            </div>

            <div style={{ background: 'rgba(15,23,42,0.6)', padding: '1.25rem', borderRadius: '1.25rem', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 1000, color: '#94a3b8', textTransform: 'uppercase' }}>TOTAL PIEZAS EN PROCESO</span>
              <p style={{ fontSize: '1.75rem', fontWeight: 1000, color: '#3b82f6', marginTop: '0.2rem' }}>{totalPiecesCount.toLocaleString()}</p>
            </div>

            {canSeeCosts && (
              <div style={{ background: 'rgba(15,23,42,0.6)', padding: '1.25rem', borderRadius: '1.25rem', border: '1px solid rgba(255,255,255,0.08)' }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 1000, color: '#94a3b8', textTransform: 'uppercase' }}>MONTO TOTAL FACTURABLE</span>
                <p style={{ fontSize: '1.75rem', fontWeight: 1000, color: '#22c55e', marginTop: '0.2rem' }}>
                  ${totalCostSum.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            )}
          </div>

          {/* Filter Bar & Export Actions */}
          <div style={{
            background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '1.5rem', padding: '1.25rem',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', flex: 1 }}>
              
              {/* Search bar */}
              <div style={{ position: 'relative', minWidth: '240px' }}>
                <Search size={16} color="#64748b" style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="BUSCAR POR PEDIDO, CLIENTE, PROCESO..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  style={{
                    width: '100%', background: 'rgba(2,6,23,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem',
                    padding: '0.6rem 0.875rem 0.6rem 2.5rem', color: 'white', fontWeight: 800, fontSize: '0.8rem', outline: 'none'
                  }}
                />
              </div>

              {/* Supplier Filter */}
              <select
                value={filterSupplier}
                onChange={e => setFilterSupplier(e.target.value)}
                style={{
                  background: '#0b0e14', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem',
                  padding: '0.6rem 0.875rem', color: 'white', fontWeight: 800, fontSize: '0.8rem', outline: 'none', cursor: 'pointer'
                }}
              >
                <option value="ALL">TODOS LOS PROVEEDORES</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>

              {/* Status Filter */}
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                style={{
                  background: '#0b0e14', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem',
                  padding: '0.6rem 0.875rem', color: 'white', fontWeight: 800, fontSize: '0.8rem', outline: 'none', cursor: 'pointer'
                }}
              >
                <option value="ALL">TODOS LOS ESTATUS</option>
                <option value="PENDIENTE_ASIGNACION">PENDIENTE DE ASIGNACIÓN</option>
                <option value="PENDIENTE">PENDIENTE (AUTORIZADO)</option>
                <option value="ENTREGADO_PROVEEDOR">ENTREGADO AL PROVEEDOR</option>
                <option value="RECIBIDO">RECIBIDO (COMPLETADO)</option>
                <option value="CANCELADO">CANCELADO</option>
              </select>
            </div>

            {/* Admin Buttons (Gestión de Catálogo & Exportación) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {isMaster && (
                <button
                  onClick={() => setShowCatalogModal(true)}
                  style={{
                    padding: '0.65rem 1rem', borderRadius: '0.75rem', background: 'rgba(139,92,246,0.15)',
                    border: '1px solid rgba(139,92,246,0.3)', color: '#c084fc', fontWeight: 1000, fontSize: '0.75rem',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', textTransform: 'uppercase'
                  }}
                >
                  ⚙️ PROCESOS Y PROVEEDORES
                </button>
              )}

              {canSeeReports && (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => exportReconciliationReport('excel')}
                    style={{
                      padding: '0.65rem 1rem', borderRadius: '0.75rem', background: 'rgba(34,197,94,0.15)',
                      border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80', fontWeight: 1000, fontSize: '0.75rem',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', textTransform: 'uppercase'
                    }}
                  >
                    <Download size={14} /> EXCEL (AUDITORÍA)
                  </button>

                  <button
                    onClick={() => exportReconciliationReport('csv')}
                    style={{
                      padding: '0.65rem 1rem', borderRadius: '0.75rem', background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)', color: '#cbd5e1', fontWeight: 1000, fontSize: '0.75rem',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', textTransform: 'uppercase'
                    }}
                  >
                    CSV
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Records Table */}
          <div style={{
            background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '1.5rem',
            overflow: 'hidden', backdropFilter: 'blur(12px)'
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: canSeeCosts ? '1.2fr 1fr 1fr 2fr 1.2fr 1.2fr 1.2fr 1fr 1.2fr' : '1.2fr 1fr 1fr 2fr 1.2fr 1.2fr 1.2fr 1.2fr',
              padding: '1rem 1.25rem', background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.08)',
              fontSize: '0.65rem', fontWeight: 1000, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em'
            }}>
              <div>PEDIDO / CLIENTE</div>
              <div>PROVEEDOR</div>
              <div>PIEZAS</div>
              <div>PROCESO(S)</div>
              <div>SALIDA (1er SCAN)</div>
              <div>RECEPCIÓN (2do SCAN)</div>
              <div>USUARIO RECEPTOR</div>
              {canSeeCosts && <div>TOTAL FACTURABLE</div>}
              <div>ESTATUS / ETIQUETA</div>
            </div>

            <div className="custom-scrollbar" style={{ maxHeight: '550px', overflowY: 'auto' }}>
              {loading ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                  <div className="spinner" style={{ width: 24, height: 24, border: '2px solid #ef4444', borderTopColor: 'transparent', borderRadius: '50%', margin: '0 auto 1rem' }} />
                  CARGANDO PEDIDOS DE PROCESOS EXTERNOS...
                </div>
              ) : filteredRecords.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem', fontWeight: 800 }}>
                  NO SE ENCONTRARON PEDIDOS REGISTRADOS EN ESTA SECCIÓN ({activeSection}).
                </div>
              ) : (
                filteredRecords.map(r => {
                  const isCancelled = r.status === 'CANCELADO'
                  const statusColor = isCancelled ? '#ef4444' : r.status === 'RECIBIDO' ? '#22c55e' : r.status === 'ENTREGADO_PROVEEDOR' ? '#f59e0b' : r.status === 'PENDIENTE_ASIGNACION' ? '#a855f7' : '#3b82f6'
                  const statusText = isCancelled ? 'CANCELADO' : r.status === 'ENTREGADO_PROVEEDOR' ? 'EN PROVEEDOR' : r.status === 'PENDIENTE_ASIGNACION' ? 'PEND. ASIGNACIÓN' : r.status

                  return (
                    <div
                      key={r.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: canSeeCosts ? '1.2fr 1fr 1fr 2fr 1.2fr 1.2fr 1.2fr 1fr 1.2fr' : '1.2fr 1fr 1fr 2fr 1.2fr 1.2fr 1.2fr 1.2fr',
                        padding: '1rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.04)', alignItems: 'center',
                        background: isCancelled ? 'rgba(239,68,68,0.03)' : 'rgba(255,255,255,0.01)', transition: 'background 0.2s',
                        opacity: isCancelled ? 0.75 : 1
                      }}
                    >
                      {/* Pedido / Cliente */}
                      <div>
                        <span style={{ fontSize: '0.95rem', color: isCancelled ? '#94a3b8' : '#ef4444', fontWeight: 1000, background: isCancelled ? 'rgba(255,255,255,0.05)' : 'rgba(239,68,68,0.1)', padding: '0.25rem 0.6rem', borderRadius: '0.5rem', textDecoration: isCancelled ? 'line-through' : 'none' }}>
                          #{r.pedido_num}
                        </span>
                        <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 800, marginTop: '0.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {r.cliente}
                        </div>
                      </div>

                      {/* Proveedor */}
                      <div style={{ fontSize: '0.85rem', color: r.proveedor_nombre ? 'white' : '#64748b', fontWeight: 900, textTransform: 'uppercase' }}>
                        {r.proveedor_nombre || 'SIN ASIGNAR'}
                      </div>

                      {/* Piezas */}
                      <div style={{ fontSize: '0.95rem', color: 'white', fontWeight: 1000 }}>
                        {r.total_piezas} <span style={{ fontSize: '0.7rem', color: '#64748b' }}>PZ</span>
                      </div>

                      {/* Proceso */}
                      <div style={{ fontSize: '0.85rem', color: '#e2e8f0', fontWeight: 900, textTransform: 'uppercase' }}>
                        {r.proceso_nombre}
                      </div>

                      {/* Fecha Salida (1er Escaneo) */}
                      <div style={{ fontSize: '0.75rem', color: r.fecha_salida ? '#f59e0b' : '#64748b', fontWeight: 900 }}>
                        {r.fecha_salida ? new Date(r.fecha_salida).toLocaleString('es-MX', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </div>

                      {/* Fecha Recepción (2do Escaneo) */}
                      <div style={{ fontSize: '0.75rem', color: r.fecha_recepcion ? '#22c55e' : '#64748b', fontWeight: 900 }}>
                        {r.fecha_recepcion ? new Date(r.fecha_recepcion).toLocaleString('es-MX', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </div>

                      {/* Usuario Receptor */}
                      <div style={{ fontSize: '0.75rem', color: '#cbd5e1', fontWeight: 900, textTransform: 'uppercase' }}>
                        {r.user_recepcion || '—'}
                      </div>

                      {/* Costo (Solo si tiene permisos) */}
                      {canSeeCosts && (
                        <div style={{ fontSize: '0.85rem', color: isCancelled ? '#94a3b8' : '#22c55e', fontWeight: 1000, textDecoration: isCancelled ? 'line-through' : 'none' }}>
                          ${(r.total_cost || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        </div>
                      )}

                      {/* Estatus & Actions (Botón X y Botón Impresora) */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'nowrap' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', padding: '0.35rem 0.65rem', borderRadius: '0.6rem',
                            background: `${statusColor}15`, color: statusColor, border: `1px solid ${statusColor}30`,
                            fontSize: '0.65rem', fontWeight: 1000, textTransform: 'uppercase'
                          }}>
                            {statusText}
                          </span>
                          {isCancelled && r.motivo_cancelacion && (
                            <span style={{ fontSize: '0.6rem', color: '#f87171', fontWeight: 800, marginTop: '2px', maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`Motivo: ${r.motivo_cancelacion}`}>
                              Motivo: {r.motivo_cancelacion}
                            </span>
                          )}
                        </div>

                        {/* Botón de Cancelación (X) - Requerimiento 1 */}
                        {!isCancelled && (
                          <button
                            onClick={() => handleOpenCancelModal(r)}
                            title="CANCELAR PROCESO"
                            style={{
                              background: 'rgba(239,68,68,0.15)',
                              border: '1px solid rgba(239,68,68,0.3)',
                              color: '#ef4444',
                              borderRadius: '0.4rem',
                              padding: '0.35rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.2s'
                            }}
                          >
                            <X size={14} />
                          </button>
                        )}

                        {/* Botón de Impresión con validación y modal de cajas - Requerimiento 2 */}
                        <button
                          onClick={() => handlePrinterClick(r)}
                          title={(r.status === 'PENDIENTE_ASIGNACION' || !r.proveedor_nombre) ? 'Requiere asignación de proveedor/costo por autorizador para imprimir' : 'IMPRIMIR ETIQUETA QR'}
                          style={{
                            background: (r.status === 'PENDIENTE_ASIGNACION' || !r.proveedor_nombre || isCancelled) ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)',
                            border: 'none',
                            color: (r.status === 'PENDIENTE_ASIGNACION' || !r.proveedor_nombre || isCancelled) ? '#475569' : '#94a3b8',
                            borderRadius: '0.4rem',
                            padding: '0.35rem',
                            cursor: (r.status === 'PENDIENTE_ASIGNACION' || !r.proveedor_nombre || isCancelled) ? 'not-allowed' : 'pointer'
                          }}
                        >
                          <Printer size={14} />
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

        </div>
      )}

      {/* ─── PESTAÑA 3: BUZÓN DE NOTIFICACIONES ─── */}
      {moduleTab === 'inbox' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 1000, color: 'white', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Bell size={20} color="#f59e0b" />
              BUZÓN DE NOTIFICACIONES
              {notifications.length > 0 && (
                <span style={{ background: '#ef4444', color: 'white', borderRadius: '999px', fontSize: '0.65rem', padding: '2px 8px', fontWeight: 900 }}>
                  {notifications.length} NUEVO{notifications.length > 1 ? 'S' : ''}
                </span>
              )}
            </h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {['ALL', 'ASIGNACION_PENDIENTE', 'LISTO_PARA_IMPRIMIR'].map(f => (
                <button key={f} onClick={() => setInboxFilter(f)}
                  style={{
                    padding: '0.4rem 0.875rem', borderRadius: '0.75rem', border: 'none',
                    background: inboxFilter === f ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)',
                    color: inboxFilter === f ? '#fbbf24' : '#64748b',
                    fontWeight: 900, fontSize: '0.65rem', textTransform: 'uppercase', cursor: 'pointer'
                  }}>
                  {f === 'ALL' ? 'TODOS' : f === 'ASIGNACION_PENDIENTE' ? 'PEND. ASIGNACIÓN' : 'LISTO IMPRIMIR'}
                </button>
              ))}
            </div>
          </div>

          {notifications.length === 0 ? (
            <div style={{
              padding: '3rem', textAlign: 'center',
              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '1.5rem', color: '#475569'
            }}>
              <Bell size={40} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
              <p style={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase' }}>BUZÓN VACÍO — Sin notificaciones pendientes</p>
              <p style={{ fontSize: '0.7rem', marginTop: '0.25rem' }}>
                {canAuthorize
                  ? 'Aquí aparecerán los pedidos de Serigrafía/Bordado que requieren asignación de proveedor.'
                  : 'Aquí aparecerán las notificaciones de pedidos listos para imprimir su etiqueta.'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {notifications
                .filter(n => inboxFilter === 'ALL' || n.type === inboxFilter)
                .map(notif => (
                  <div key={notif.firestoreId} style={{
                    background: notif.type === 'ASIGNACION_PENDIENTE' ? 'rgba(245,158,11,0.06)' : 'rgba(34,197,94,0.06)',
                    border: `1px solid ${notif.type === 'ASIGNACION_PENDIENTE' ? 'rgba(245,158,11,0.25)' : 'rgba(34,197,94,0.25)'}`,
                    borderRadius: '1.25rem', padding: '1.25rem',
                    display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap'
                  }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                      background: notif.type === 'ASIGNACION_PENDIENTE' ? 'rgba(245,158,11,0.2)' : 'rgba(34,197,94,0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      {notif.type === 'ASIGNACION_PENDIENTE' ? <Clock size={18} color="#f59e0b" /> : <CheckCircle size={18} color="#22c55e" />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: 900, color: 'white', fontSize: '0.85rem', textTransform: 'uppercase' }}>
                        {notif.type === 'ASIGNACION_PENDIENTE' ? '🕐 PENDIENTE DE ASIGNACIÓN' : '✅ LISTO PARA IMPRIMIR'}
                      </p>
                      <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                        📦 Pedido #{notif.pedido_num} · {notif.cliente} · {notif.section}
                      </p>
                      <p style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.1rem' }}>
                        {notif.proceso_nombre} · {notif.total_piezas} pz
                        {notif.proveedor_nombre && ` · Proveedor: ${notif.proveedor_nombre}`}
                      </p>
                      <p style={{ fontSize: '0.65rem', color: '#475569', marginTop: '0.1rem' }}>
                        Registrado por {notif.created_by_name} · {notif.created_at ? new Date(notif.created_at).toLocaleString('es-MX') : ''}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                      {/* Designador: assign supplier */}
                      {notif.type === 'ASIGNACION_PENDIENTE' && canAuthorize && (
                        <button
                          onClick={() => { setSelectedNotification(notif); setAssignProveedor(''); setAssignCostoPorPrenda(''); setShowAssignModal(true); }}
                          style={{
                            padding: '0.5rem 1rem', borderRadius: '0.75rem', border: 'none',
                            background: 'rgba(245,158,11,0.15)', color: '#fbbf24',
                            fontWeight: 900, fontSize: '0.7rem', textTransform: 'uppercase', cursor: 'pointer'
                          }}>
                          🔐 ASIGNAR PROVEEDOR
                        </button>
                      )}
                      {/* Operator: print label from completed notification */}
                      {notif.type === 'LISTO_PARA_IMPRIMIR' && (
                        <button
                          onClick={() => {
                            const rec = records.find(r => r.id === notif.record_id) || { id: notif.record_id, pedido_num: notif.pedido_num, cliente: notif.cliente, proceso_nombre: notif.proceso_nombre, proveedor_nombre: notif.proveedor_nombre, total_piezas: notif.total_piezas, section: notif.section, created_at: new Date().toISOString() }
                            setPendingPrintRecord(rec)
                            setBoxCount(1)
                            setShowBoxModal(true)
                          }}
                          style={{
                            padding: '0.5rem 1rem', borderRadius: '0.75rem', border: 'none',
                            background: 'rgba(34,197,94,0.15)', color: '#4ade80',
                            fontWeight: 900, fontSize: '0.7rem', textTransform: 'uppercase', cursor: 'pointer'
                          }}>
                          🖨️ IMPRIMIR ETIQUETA
                        </button>
                      )}
                      {/* Mark as read */}
                      <button
                        onClick={async () => {
                          await updateDoc(doc(db, 'external_process_notifications', notif.firestoreId), { read: true, resolved_at: new Date().toISOString() })
                        }}
                        title="Marcar como leído"
                        style={{
                          padding: '0.5rem', borderRadius: '0.75rem', border: 'none',
                          background: 'rgba(255,255,255,0.05)', color: '#64748b', cursor: 'pointer'
                        }}>
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* ─── MODAL: ASIGNACIÓN DE PROVEEDOR (Designador) ─── */}
      {showAssignModal && selectedNotification && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 150, padding: '1rem'
        }}>
          <div style={{
            background: '#0f172a', border: '2px solid #f59e0b', borderRadius: '1.5rem', padding: '2rem', width: '100%', maxWidth: '440px',
            boxShadow: '0 25px 50px -12px rgba(245,158,11,0.4)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 1000, color: 'white', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                🔐 ASIGNACIÓN DE PROVEEDOR
              </h3>
              <button onClick={() => setShowAssignModal(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '1rem', padding: '0.875rem', marginBottom: '1.25rem', fontSize: '0.78rem', color: '#94a3b8' }}>
              <p><strong style={{ color: 'white' }}>Pedido:</strong> #{selectedNotification.pedido_num} — {selectedNotification.cliente}</p>
              <p style={{ marginTop: '0.3rem' }}><strong style={{ color: 'white' }}>Proceso(s):</strong> {selectedNotification.proceso_nombre}</p>
              <p style={{ marginTop: '0.3rem' }}><strong style={{ color: 'white' }}>Total piezas:</strong> {selectedNotification.total_piezas} pz</p>
              <p style={{ marginTop: '0.3rem' }}><strong style={{ color: 'white' }}>Sección:</strong> {selectedNotification.section}</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div>
                <label style={{ fontSize: '0.65rem', fontWeight: 1000, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '0.3rem' }}>
                  PROVEEDOR ASIGNADO *
                </label>
                <select
                  value={assignProveedor}
                  onChange={e => setAssignProveedor(e.target.value)}
                  style={{ width: '100%', background: '#0b0e14', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem', padding: '0.65rem 0.875rem', color: 'white', fontWeight: 800, fontSize: '0.85rem', outline: 'none', cursor: 'pointer' }}>
                  <option value="">SELECCIONAR PROVEEDOR...</option>
                  {suppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.65rem', fontWeight: 1000, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '0.3rem' }}>
                  COSTO POR PRENDA (MXN) *
                </label>
                <input
                  type="number" min="0" step="0.01"
                  placeholder="Ej: 12.50"
                  value={assignCostoPorPrenda}
                  onChange={e => setAssignCostoPorPrenda(e.target.value)}
                  style={{ width: '100%', background: 'rgba(2,6,23,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem', padding: '0.65rem 0.875rem', color: 'white', fontWeight: 800, fontSize: '0.85rem', outline: 'none' }}
                />
              </div>

              {assignCostoPorPrenda && !isNaN(parseFloat(assignCostoPorPrenda)) && (
                <div style={{ padding: '0.75rem', borderRadius: '0.75rem', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 1000, color: '#4ade80' }}>
                    TOTAL: ${(parseFloat(assignCostoPorPrenda) * (selectedNotification.total_piezas || 0)).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                  </span>
                  <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'block', marginTop: '0.15rem' }}>
                    ({assignCostoPorPrenda} × {selectedNotification.total_piezas} pz)
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
                <button onClick={() => setShowAssignModal(false)}
                  style={{ flex: 1, padding: '0.75rem', borderRadius: '0.75rem', background: 'rgba(255,255,255,0.05)', color: '#94a3b8', fontWeight: 900, fontSize: '0.8rem', border: 'none', cursor: 'pointer', textTransform: 'uppercase' }}>
                  CANCELAR
                </button>
                <button onClick={handleAssignAuthorization} disabled={assignSaving || !assignProveedor}
                  style={{
                    flex: 2, padding: '0.75rem', borderRadius: '0.75rem', border: 'none', cursor: assignSaving ? 'wait' : 'pointer',
                    background: assignProveedor ? 'linear-gradient(135deg,#f59e0b,#d97706)' : 'rgba(255,255,255,0.05)',
                    color: assignProveedor ? 'white' : '#475569', fontWeight: 1000, fontSize: '0.85rem', textTransform: 'uppercase'
                  }}>
                  {assignSaving ? '⏳ GUARDANDO...' : '✅ CONFIRMAR ASIGNACIÓN'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: CANCELACIÓN OBLIGATORIA CON MOTIVO ─── */}
      {showCancelModal && pendingCancelRecord && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 160, padding: '1rem'
        }}>
          <div style={{
            background: '#0f172a', border: '2px solid #ef4444', borderRadius: '1.5rem', padding: '2rem', width: '100%', maxWidth: '440px',
            boxShadow: '0 25px 50px -12px rgba(239,68,68,0.4)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 1000, color: '#f87171', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertTriangle size={20} color="#ef4444" /> CANCELACIÓN DE PROCESO
              </h3>
              <button onClick={() => { setShowCancelModal(false); setPendingCancelRecord(null); }} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '1rem', padding: '0.875rem', marginBottom: '1.25rem', fontSize: '0.78rem', color: '#94a3b8' }}>
              <p><strong style={{ color: 'white' }}>Pedido:</strong> #{pendingCancelRecord.pedido_num} — {pendingCancelRecord.cliente}</p>
              <p style={{ marginTop: '0.3rem' }}><strong style={{ color: 'white' }}>Proceso(s):</strong> {pendingCancelRecord.proceso_nombre}</p>
              <p style={{ marginTop: '0.3rem' }}><strong style={{ color: 'white' }}>Piezas:</strong> {pendingCancelRecord.total_piezas} PZ</p>
              <p style={{ marginTop: '0.3rem' }}><strong style={{ color: 'white' }}>Proveedor:</strong> {pendingCancelRecord.proveedor_nombre || 'Sin asignar'}</p>
            </div>

            {cancelError && (
              <div style={{
                padding: '0.75rem', borderRadius: '0.75rem', marginBottom: '1rem',
                fontSize: '0.78rem', fontWeight: 900, background: 'rgba(239,68,68,0.15)',
                border: '1px solid rgba(239,68,68,0.3)', color: '#f87171'
              }}>
                {cancelError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div>
                <label style={{ fontSize: '0.65rem', fontWeight: 1000, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '0.3rem' }}>
                  MOTIVO DE LA CANCELACIÓN (OBLIGATORIO) *
                </label>
                <textarea
                  rows="3"
                  placeholder="Ingrese obligatoriamente la razón detallada de la cancelación..."
                  value={cancelReason}
                  onChange={e => { setCancelReason(e.target.value); setCancelError(null); }}
                  autoFocus
                  style={{
                    width: '100%', background: 'rgba(2,6,23,0.9)', border: '2px solid rgba(239,68,68,0.4)', borderRadius: '0.75rem',
                    padding: '0.65rem 0.875rem', color: 'white', fontWeight: 700, fontSize: '0.85rem', outline: 'none', resize: 'vertical'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => { setShowCancelModal(false); setPendingCancelRecord(null); }}
                  style={{ flex: 1, padding: '0.75rem', borderRadius: '0.75rem', background: 'rgba(255,255,255,0.05)', color: '#94a3b8', fontWeight: 900, fontSize: '0.8rem', border: 'none', cursor: 'pointer', textTransform: 'uppercase' }}
                >
                  VOLVER
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCancel}
                  disabled={cancelSubmitting || !cancelReason.trim()}
                  style={{
                    flex: 2, padding: '0.75rem', borderRadius: '0.75rem', border: 'none',
                    cursor: (cancelSubmitting || !cancelReason.trim()) ? 'not-allowed' : 'pointer',
                    background: cancelReason.trim() ? 'linear-gradient(135deg,#ef4444,#dc2626)' : 'rgba(255,255,255,0.05)',
                    color: cancelReason.trim() ? 'white' : '#475569', fontWeight: 1000, fontSize: '0.85rem', textTransform: 'uppercase',
                    boxShadow: cancelReason.trim() ? '0 4px 15px rgba(239,68,68,0.4)' : 'none'
                  }}
                >
                  {cancelSubmitting ? '⏳ CANCELANDO...' : '🚫 CONFIRMAR CANCELACIÓN'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: CUÁNTAS CAJAS (Multi-etiquetas) ─── */}
      {showBoxModal && pendingPrintRecord && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 150, padding: '1rem'
        }}>
          <div style={{
            background: '#0f172a', border: '2px solid #3b82f6', borderRadius: '1.5rem', padding: '2rem', width: '100%', maxWidth: '380px',
            boxShadow: '0 25px 50px -12px rgba(59,130,246,0.5)', textAlign: 'center'
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
              <div style={{ background: 'rgba(59,130,246,0.2)', padding: '1rem', borderRadius: '50%' }}>
                <Package size={32} color="#3b82f6" />
              </div>
            </div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 1000, color: 'white', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
              MULTI-ETIQUETAS
            </h3>
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '1.25rem' }}>
              ¿Cuántas cajas necesita etiquetar?<br />
              Cada caja recibirá una etiqueta con "CAJA X de N".
            </p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
              <button onClick={() => setBoxCount(c => Math.max(1, parseInt(c) - 1))}
                style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: 'none', color: 'white', fontSize: '1.25rem', cursor: 'pointer', fontWeight: 900 }}>−</button>
              <input type="number" min="1" max="50" value={boxCount}
                onChange={e => setBoxCount(Math.max(1, parseInt(e.target.value) || 1))}
                style={{
                  width: 80, textAlign: 'center', background: 'rgba(2,6,23,0.8)', border: '1px solid rgba(59,130,246,0.4)',
                  borderRadius: '0.75rem', padding: '0.5rem', color: 'white', fontWeight: 900, fontSize: '1.2rem', outline: 'none'
                }} />
              <button onClick={() => setBoxCount(c => Math.min(50, parseInt(c) + 1))}
                style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: 'none', color: 'white', fontSize: '1.25rem', cursor: 'pointer', fontWeight: 900 }}>+</button>
            </div>
            <p style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '1.25rem' }}>
              Se imprimirán {boxCount} etiqueta{boxCount > 1 ? 's' : ''} para el pedido #{pendingPrintRecord.pedido_num}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => { setShowBoxModal(false); setPendingPrintRecord(null); }}
                style={{ flex: 1, padding: '0.75rem', borderRadius: '0.75rem', background: 'rgba(255,255,255,0.05)', color: '#94a3b8', fontWeight: 900, fontSize: '0.8rem', border: 'none', cursor: 'pointer', textTransform: 'uppercase' }}>
                CANCELAR
              </button>
              <button onClick={handleConfirmBoxPrint}
                style={{ flex: 2, padding: '0.75rem', borderRadius: '0.75rem', background: 'linear-gradient(135deg,#3b82f6,#1d4ed8)', color: 'white', fontWeight: 1000, fontSize: '0.85rem', border: 'none', cursor: 'pointer', textTransform: 'uppercase' }}>
                🖨️ IMPRIMIR {boxCount > 1 ? `${boxCount} CAJAS` : '1 ETIQUETA'}
              </button>
            </div>
          </div>
        </div>
      )}

      {boxPrintProgress !== null && (
        <div style={{
          position: 'fixed', bottom: '2rem', right: '2rem', background: '#0f172a', border: '1px solid #3b82f6',
          borderRadius: '1rem', padding: '1rem 1.5rem', zIndex: 200, minWidth: '220px'
        }}>
          <p style={{ color: 'white', fontWeight: 900, fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
            🖨️ Imprimiendo etiquetas... {boxPrintProgress}%
          </p>
          <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '999px', height: 6, overflow: 'hidden' }}>
            <div style={{ background: '#3b82f6', height: '100%', width: `${boxPrintProgress}%`, transition: 'width 0.3s' }} />
          </div>
        </div>
      )}

      {/* Manual Quote Pop-Up Modal for Serigrafia */}
      {showQuoteModal && pendingQuoteItem && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 120, padding: '1rem'
        }}>
          <div style={{
            background: '#0f172a', border: '2px solid #3b82f6', borderRadius: '1.5rem', padding: '2rem', width: '100%', maxWidth: '420px',
            boxShadow: '0 25px 50px -12px rgba(59,130,246,0.5)', textAlign: 'center'
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
              <div style={{ background: 'rgba(59,130,246,0.2)', padding: '0.75rem', borderRadius: '50%' }}>
                <DollarSign size={32} color="#3b82f6" />
              </div>
            </div>

            <h3 style={{ fontSize: '1.2rem', fontWeight: 1000, color: 'white', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
              COTIZACIÓN MANUAL DE SERIGRAFÍA
            </h3>

            <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '1.25rem' }}>
              Ingrese el precio unitario cotizado por el proveedor <b>{formData.proveedor_nombre}</b> para el proceso <b>{pendingQuoteItem.proceso_nombre}</b> ({pendingQuoteItem.total_piezas} PZ).
            </p>

            <div style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
              <label style={{ fontSize: '0.65rem', fontWeight: 1000, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '0.3rem' }}>
                PRECIO COTIZADO UNITARIO ($ / PRENDA) *
              </label>
              <input
                type="number"
                step="0.10"
                placeholder="Ej: 12.50"
                value={quotePrice}
                onChange={e => setQuotePrice(e.target.value)}
                autoFocus
                style={{
                  width: '100%', background: 'rgba(2,6,23,0.9)', border: '2px solid #3b82f6', borderRadius: '0.75rem',
                  padding: '0.75rem 1rem', color: 'white', fontWeight: 1000, fontSize: '1.1rem', outline: 'none'
                }}
              />
              {quotePrice && !isNaN(parseFloat(quotePrice)) && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#22c55e', fontWeight: 900, textAlign: 'right' }}>
                  SUBTOTAL PROCESO: ${(parseFloat(quotePrice) * pendingQuoteItem.total_piezas).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={handleConfirmQuote}
                style={{
                  flex: 1, padding: '0.75rem', borderRadius: '0.75rem', background: '#3b82f6', color: 'white', fontWeight: 1000,
                  fontSize: '0.85rem', border: 'none', cursor: 'pointer', textTransform: 'uppercase'
                }}
              >
                CONFIRMAR COTIZACIÓN
              </button>

              <button
                type="button"
                onClick={() => { setShowQuoteModal(false); setPendingQuoteItem(null); }}
                style={{
                  padding: '0.75rem 1rem', borderRadius: '0.75rem', background: 'rgba(255,255,255,0.08)', color: '#94a3b8', fontWeight: 900,
                  fontSize: '0.85rem', border: 'none', cursor: 'pointer', textTransform: 'uppercase'
                }}
              >
                CANCELAR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Catalog & Cost Management Modal (Gestión de Catálogos, Costos y Permisos) */}
      {showCatalogModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem'
        }}>
          <div style={{
            background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '1.5rem', width: '100%', maxWidth: '650px',
            padding: '2rem', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7)', maxHeight: '90vh', overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.3rem', fontWeight: 1000, color: 'white', textTransform: 'uppercase' }}>
                  ⚙️ GESTIÓN DE CATÁLOGOS Y COSTOS - {activeSection}
                </h2>
                <p style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 800 }}>ADMINISTRACIÓN DE PROCESOS, PROVEEDORES Y COSTOS UNITARIOS</p>
              </div>
              <button onClick={() => setShowCatalogModal(false)} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>

            {/* Sub-tabs inside catalog modal */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <button
                onClick={() => setCatalogTab('procesos')}
                style={{
                  flex: 1, padding: '0.65rem', borderRadius: '0.75rem',
                  background: catalogTab === 'procesos' ? '#ef4444' : 'rgba(255,255,255,0.05)',
                  color: 'white', fontWeight: 1000, fontSize: '0.8rem', border: 'none', cursor: 'pointer', textTransform: 'uppercase'
                }}
              >
                1. TIPOS DE PROCESO
              </button>
              <button
                onClick={() => setCatalogTab('proveedores')}
                style={{
                  flex: 1, padding: '0.65rem', borderRadius: '0.75rem',
                  background: catalogTab === 'proveedores' ? '#ef4444' : 'rgba(255,255,255,0.05)',
                  color: 'white', fontWeight: 1000, fontSize: '0.8rem', border: 'none', cursor: 'pointer', textTransform: 'uppercase'
                }}
              >
                2. PROVEEDORES
              </button>
            </div>

            {/* Catalog feedback message */}
            {catalogMsg && (
              <div style={{
                padding: '0.65rem 1rem', borderRadius: '0.75rem', marginBottom: '1rem',
                fontSize: '0.78rem', fontWeight: 900,
                background: catalogMsg.type === 'error' ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                border: `1px solid ${catalogMsg.type === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
                color: catalogMsg.type === 'error' ? '#f87171' : '#4ade80'
              }}>
                {catalogMsg.text}
              </div>
            )}

            {/* Catalog Tab 1: Procesos */}
            {catalogTab === 'procesos' && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: canSeeCosts ? '2fr 1fr auto' : '3fr auto', gap: '0.75rem', marginBottom: '1.5rem' }}>
                  <input
                    type="text"
                    placeholder="NUEVO NOMBRE DE PROCESO..."
                    value={newProcessName}
                    onChange={e => setNewProcessName(e.target.value)}
                    style={{ background: 'rgba(2,6,23,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem', padding: '0.65rem 0.875rem', color: 'white', fontWeight: 800, fontSize: '0.85rem' }}
                  />

                  {canSeeCosts && (
                    <input
                      type="number"
                      placeholder="COSTO / PZ ($)"
                      step="0.50"
                      value={newProcessCost}
                      onChange={e => setNewProcessCost(e.target.value)}
                      style={{ background: 'rgba(2,6,23,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem', padding: '0.65rem 0.875rem', color: 'white', fontWeight: 800, fontSize: '0.85rem' }}
                    />
                  )}

                  <button
                    onClick={handleAddProcess}
                    style={{ padding: '0.65rem 1.25rem', borderRadius: '0.75rem', background: '#22c55e', border: 'none', color: 'white', fontWeight: 1000, fontSize: '0.8rem', cursor: 'pointer', textTransform: 'uppercase' }}
                  >
                    AGREGAR
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {processTypes.map(pt => (
                    <div key={pt.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div>
                        <span style={{ fontSize: '0.85rem', color: 'white', fontWeight: 900, textTransform: 'uppercase' }}>{pt.name}</span>
                        {canSeeCosts && (
                          <span style={{ fontSize: '0.75rem', color: '#22c55e', fontWeight: 900, marginLeft: '1rem' }}>
                            ${parseFloat(pt.unit_cost || 0).toFixed(2)} por prenda
                          </span>
                        )}
                      </div>

                      <button onClick={() => handleDeleteProcess(pt.id)} style={{ background: 'rgba(239,68,68,0.15)', border: 'none', color: '#f87171', padding: '0.4rem', borderRadius: '0.5rem', cursor: 'pointer' }}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Catalog Tab 2: Proveedores */}
            {catalogTab === 'proveedores' && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr auto', gap: '0.75rem', marginBottom: '1.5rem' }}>
                  <input
                    type="text"
                    placeholder="NOMBRE PROVEEDOR..."
                    value={newSupplierName}
                    onChange={e => setNewSupplierName(e.target.value)}
                    style={{ background: 'rgba(2,6,23,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem', padding: '0.65rem 0.875rem', color: 'white', fontWeight: 800, fontSize: '0.85rem' }}
                  />

                  <input
                    type="text"
                    placeholder="TEL / CONTACTO (OPCIONAL)"
                    value={newSupplierContact}
                    onChange={e => setNewSupplierContact(e.target.value)}
                    style={{ background: 'rgba(2,6,23,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem', padding: '0.65rem 0.875rem', color: 'white', fontWeight: 800, fontSize: '0.85rem' }}
                  />

                  <button
                    onClick={handleAddSupplier}
                    style={{ padding: '0.65rem 1.25rem', borderRadius: '0.75rem', background: '#22c55e', border: 'none', color: 'white', fontWeight: 1000, fontSize: '0.8rem', cursor: 'pointer', textTransform: 'uppercase' }}
                  >
                    AGREGAR
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {suppliers.map(s => (
                    <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div>
                        <span style={{ fontSize: '0.85rem', color: 'white', fontWeight: 900, textTransform: 'uppercase' }}>{s.name}</span>
                        {s.contact_info && <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: '1rem' }}>({s.contact_info})</span>}
                      </div>

                      <button onClick={() => handleDeleteSupplier(s.id)} style={{ background: 'rgba(239,68,68,0.15)', border: 'none', color: '#f87171', padding: '0.4rem', borderRadius: '0.5rem', cursor: 'pointer' }}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Label Preview & Print Dialog */}
      {selectedLabelRecord && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110, padding: '1rem'
        }}>
          <div style={{
            background: 'white', color: 'black', borderRadius: '1.5rem', padding: '2rem', width: '100%', maxWidth: '450px', textAlign: 'center',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.8)'
          }}>
            <div style={{ borderBottom: '2px solid black', paddingBottom: '0.75rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 1000, fontSize: '1.1rem' }}>AIRMAN WMS - ETIQUETA QR</span>
              <button onClick={() => setSelectedLabelRecord(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 900 }}>✕</button>
            </div>

            {/* Label Print Area (Structured 4" x 2" proportions) */}
            <div id="printable-label-content" style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '0.6rem 0.8rem',
              border: '2px dashed #94a3b8',
              borderRadius: '0.75rem',
              background: '#ffffff',
              color: '#000000',
              fontFamily: 'system-ui, -apple-system, sans-serif'
            }}>
              {/* Header Bar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #000', paddingBottom: '3px', marginBottom: '6px' }}>
                <span style={{ fontWeight: 1000, fontSize: '9pt', textTransform: 'uppercase', letterSpacing: '-0.01em' }}>
                  AIRMAN WMS - PROCESO EXTERNO ({selectedLabelRecord.section})
                </span>
                <span style={{ fontWeight: 800, fontSize: '8pt' }}>
                  {new Date(selectedLabelRecord.created_at).toLocaleDateString('es-MX')}
                </span>
              </div>

              {/* Grid Body: Left 62% details + Right 38% QR */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                
                {/* Left Column: Operator Captured Information */}
                <div style={{ width: '62%', display: 'flex', flexDirection: 'column', gap: '3px', textAlign: 'left' }}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'baseline' }}>
                    <span style={{ fontSize: '12pt', fontWeight: 1000, color: '#000' }}>PEDIDO: #{selectedLabelRecord.pedido_num}</span>
                    <span style={{ fontSize: '10pt', fontWeight: 900, color: '#000' }}>({selectedLabelRecord.total_piezas} PZ)</span>
                  </div>

                  <div style={{ fontSize: '8.5pt', lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <b>CLIENTE:</b> <span style={{ fontWeight: 900, textTransform: 'uppercase' }}>{selectedLabelRecord.cliente}</span>
                  </div>

                  <div style={{ fontSize: '8.5pt', lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <b>PROCESO:</b> <span style={{ fontWeight: 900, textTransform: 'uppercase' }}>{selectedLabelRecord.proceso_nombre}</span>
                  </div>

                  <div style={{ fontSize: '8.5pt', lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <b>PROVEEDOR:</b> <span style={{ fontWeight: 900, textTransform: 'uppercase' }}>{selectedLabelRecord.proveedor_nombre}</span>
                  </div>
                </div>

                {/* Right Column: Unique QR Code & ID */}
                <div style={{ width: '35%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <QRCodeSVG value={selectedLabelRecord.id} size={85} level="M" />
                  <span style={{ fontSize: '6.5pt', fontWeight: 1000, marginTop: '2px', letterSpacing: '-0.02em', textAlign: 'center' }}>
                    {selectedLabelRecord.id}
                  </span>
                </div>

              </div>

              {/* Safety Legend & Supplier Signature Line */}
              <div style={{ marginTop: '6px', paddingTop: '4px', borderTop: '1px solid #000', display: 'flex', flexDirection: 'column', gap: '3px', textAlign: 'left' }}>
                <div style={{ fontSize: '7pt', fontWeight: 1000, color: '#000', textTransform: 'uppercase', letterSpacing: '-0.01em' }}>
                  ⚠️ CUIDAR LA VISIBILIDAD DE LA ETIQUETA
                </div>
                <div style={{ fontSize: '7.5pt', fontWeight: 900, color: '#000' }}>
                  RECIBIDO (FIRMA): __________________________________
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
              <button
                onClick={() => triggerLabelPrint(selectedLabelRecord)}
                style={{
                  flex: 1, padding: '0.75rem', borderRadius: '0.75rem', background: '#ef4444', color: 'white', fontWeight: 1000,
                  fontSize: '0.8rem', border: 'none', cursor: 'pointer', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem'
                }}
              >
                <Printer size={16} /> IMPRESIÓN DIRECTA TSC (4"x2")
              </button>
              
              <button
                onClick={() => window.print()}
                style={{
                  padding: '0.75rem 1rem', borderRadius: '0.75rem', background: '#3b82f6', color: 'white', fontWeight: 1000,
                  fontSize: '0.8rem', border: 'none', cursor: 'pointer', textTransform: 'uppercase'
                }}
              >
                📄 VÍA NAVEGADOR
              </button>

              <button
                onClick={() => setSelectedLabelRecord(null)}
                style={{
                  padding: '0.75rem 1rem', borderRadius: '0.75rem', background: '#e2e8f0', color: '#1e293b', fontWeight: 900,
                  fontSize: '0.8rem', border: 'none', cursor: 'pointer', textTransform: 'uppercase'
                }}
              >
                CERRAR
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .spinner { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255,255,255,0.02); }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); borderRadius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(239,68,68,0.2); }
        @page {
          size: 4in 2in;
          margin: 0;
        }
        @media print {
          html, body {
            width: 4in !important;
            height: 2in !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            background: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body * { visibility: hidden !important; }
          #printable-label-content, #printable-label-content * { visibility: visible !important; }
          #printable-label-content {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 4in !important;
            height: 2in !important;
            margin: 0 !important;
            padding: 0.1in 0.15in !important;
            box-sizing: border-box !important;
            border: none !important;
            background: white !important;
            color: black !important;
            overflow: hidden !important;
          }
        }
      `}</style>
    </div>
  )
}
