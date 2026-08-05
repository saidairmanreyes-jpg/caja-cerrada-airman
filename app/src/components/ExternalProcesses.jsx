import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { db } from '../firebase'
import { collection, addDoc } from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import { printLabel, connectPrinter } from '../utils/printer'
import { QRCodeSVG } from 'qrcode.react'
import * as XLSX from 'xlsx'
import { Search, Printer, Download, Plus, Edit2, Trash2, Lock, ShieldCheck, CheckCircle2, Truck, Clock, RefreshCw, X, FileText, QrCode, Eye, LayoutDashboard, Database } from 'lucide-react'

export default function ExternalProcesses() {
  const { user, profile, isAdmin, hasPermission, activeWarehouse } = useAuth()
  const [activeSection, setActiveSection] = useState('ARREGLOS') // 'ARREGLOS' | 'SERIGRAFIA'
  const [moduleTab, setModuleTab] = useState('capture') // 'capture' | 'monitor'
  
  // Granular Permission Checks
  const isMaster = profile?.role === 'master' || isAdmin
  const canCapture = isMaster || hasPermission('external_processes_capture') || hasPermission('external_processes')
  const canMonitor = isMaster || hasPermission('external_processes_monitor') || hasPermission('external_processes')
  const canSeeCosts = isMaster || hasPermission('external_processes_costs')
  const canSeeReports = isMaster || hasPermission('external_processes_reports')

  // Printer State
  const [printerConnected, setPrinterConnected] = useState(false)
  const [printerMsg, setPrinterMsg] = useState(null)

  // Data states
  const [records, setRecords] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [processTypes, setProcessTypes] = useState([])
  const [loading, setLoading] = useState(true)

  // Form state for creating new order
  const [formData, setFormData] = useState({
    pedido_num: '',
    cliente: '',
    total_piezas: '',
    proceso_nombre: '',
    proveedor_nombre: '',
  })
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

  // Initial load & real-time subscription
  useEffect(() => {
    fetchInitialData()

    const channel = supabase
      .channel(`external_processes_${activeSection}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'external_processes' }, () => {
        fetchRecords()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [activeSection])

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
      
      if (!error && data) {
        setRecords(data)
      } else {
        console.warn('Supabase external_processes read info:', error?.message)
      }
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

      if (!error && data) {
        setSuppliers(data)
      }
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

      if (!error && data) {
        setProcessTypes(data)
      }
    } catch (e) {
      console.error('Error fetching process types:', e)
    }
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

    if (!formData.pedido_num || !formData.cliente || !formData.total_piezas || !formData.proceso_nombre || !formData.proveedor_nombre) {
      setFormMessage({ type: 'error', text: '⚠️ Todos los campos del formulario son obligatorios.' })
      return
    }

    const piezasNum = parseInt(formData.total_piezas, 10)
    if (isNaN(piezasNum) || piezasNum <= 0) {
      setFormMessage({ type: 'error', text: '⚠️ El número de piezas debe ser un valor entero mayor a cero.' })
      return
    }

    setFormSubmitting(true)

    // Lookup unit cost for the process type
    const matchedProcess = processTypes.find(p => p.name.toUpperCase() === formData.proceso_nombre.toUpperCase())
    const unitCost = matchedProcess ? parseFloat(matchedProcess.unit_cost || 0) : 0
    const totalCost = unitCost * piezasNum

    // Unique ID generation (e.g. EXT-ARR-105234)
    const prefix = activeSection === 'ARREGLOS' ? 'EXT-ARR' : 'EXT-SER'
    const uniqueId = `${prefix}-${formData.pedido_num.trim()}-${Math.floor(100 + Math.random() * 900)}`

    const newRecord = {
      id: uniqueId,
      section: activeSection,
      pedido_num: formData.pedido_num.trim(),
      cliente: formData.cliente.trim(),
      total_piezas: piezasNum,
      proceso_nombre: formData.proceso_nombre,
      proveedor_nombre: formData.proveedor_nombre,
      unit_cost: unitCost,
      total_cost: totalCost,
      status: 'PENDIENTE',
      warehouse: activeWarehouse || 'MATRIZ',
      created_at: new Date().toISOString()
    }

    try {
      // 1. Save to Supabase
      const { error } = await supabase.from('external_processes').insert([newRecord])
      if (error) {
        console.warn('Supabase insert notice:', error.message)
      }

      // 2. Dual Backup to Firebase Firestore
      try {
        await addDoc(collection(db, 'external_processes_history'), {
          ...newRecord,
          created_by: profile?.name || user?.email || 'OPERADOR',
          action: 'CREACION_ORDEN'
        })
      } catch (fbErr) {
        console.warn('Firebase history sync note:', fbErr.message)
      }
      
      // Update local state
      setRecords(prev => [newRecord, ...prev])
      setFormMessage({ type: 'success', text: `✅ Orden ${uniqueId} registrada exitosamente.` })

      // Open print modal & attempt printing
      setSelectedLabelRecord(newRecord)
      triggerLabelPrint(newRecord)

      // Reset form
      setFormData({
        pedido_num: '',
        cliente: '',
        total_piezas: '',
        proceso_nombre: '',
        proveedor_nombre: '',
      })
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
      await supabase.from('external_processes').update(updates).eq('id', targetRecord.id)

      // Dual Sync to Firebase Firestore
      try {
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
      await supabase.from('external_processes').update(updates).eq('id', targetRecord.id)

      // Dual Sync to Firebase Firestore
      try {
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

  // Catalog Management Handlers
  const handleAddProcess = async () => {
    if (!newProcessName.trim()) return
    const costVal = canSeeCosts ? (parseFloat(newProcessCost) || 0) : 0
    const newType = {
      section: activeSection,
      name: newProcessName.trim(),
      unit_cost: costVal,
      created_at: new Date().toISOString()
    }

    const { data, error } = await supabase.from('external_process_types').insert([newType]).select()
    if (!error && data) {
      setProcessTypes(prev => [...prev, data[0]])
    } else {
      setProcessTypes(prev => [...prev, { id: Date.now(), ...newType }])
    }
    setNewProcessName('')
    setNewProcessCost('')
  }

  const handleDeleteProcess = async (id) => {
    await supabase.from('external_process_types').delete().eq('id', id)
    setProcessTypes(prev => prev.filter(p => p.id !== id))
  }

  const handleAddSupplier = async () => {
    if (!newSupplierName.trim()) return
    const newSup = {
      section: activeSection,
      name: newSupplierName.trim(),
      contact_info: newSupplierContact.trim(),
      created_at: new Date().toISOString()
    }

    const { data, error } = await supabase.from('external_suppliers').insert([newSup]).select()
    if (!error && data) {
      setSuppliers(prev => [...prev, data[0]])
    } else {
      setSuppliers(prev => [...prev, { id: Date.now(), ...newSup }])
    }
    setNewSupplierName('')
    setNewSupplierContact('')
  }

  const handleDeleteSupplier = async (id) => {
    await supabase.from('external_suppliers').delete().eq('id', id)
    setSuppliers(prev => prev.filter(s => s.id !== id))
  }

  // Billing & Reconciliation Report Export (Excel & CSV)
  const exportReconciliationReport = (format = 'excel') => {
    if (!canSeeReports) {
      alert('⛔ No tienes permisos asignados para descargar reportes de conciliación.')
      return
    }

    const reportData = filteredRecords.map(r => {
      const row = {
        'SECCIÓN': r.section,
        'PEDIDO #': r.pedido_num,
        'CLIENTE': r.cliente,
        'PROVEEDOR': r.proveedor_nombre,
        'PROCESO': r.proceso_nombre,
        'PIEZAS': r.total_piezas,
        'ESTATUS': r.status === 'ENTREGADO_PROVEEDOR' ? 'ENTREGADO AL PROVEEDOR' : r.status,
        'FECHA REGISTRO': r.created_at ? new Date(r.created_at).toLocaleString() : '—',
        'FECHA SALIDA (1er Escaneo)': r.fecha_salida ? new Date(r.fecha_salida).toLocaleString() : 'PENDIENTE',
        'FECHA RECEPCIÓN (2do Escaneo)': r.fecha_recepcion ? new Date(r.fecha_recepcion).toLocaleString() : 'PENDIENTE',
        'USUARIO RECEPCIÓN': r.user_recepcion || '—',
      }

      if (canSeeCosts) {
        row['COSTO UNITARIO ($)'] = r.unit_cost || 0
        row['TOTAL FACTURABLE ($)'] = r.total_cost || 0
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
        const summaryBySupplier = {}
        reportData.forEach(r => {
          const sup = r['PROVEEDOR']
          if (!summaryBySupplier[sup]) {
            summaryBySupplier[sup] = { 'PROVEEDOR': sup, 'PEDIDOS': 0, 'TOTAL PIEZAS': 0, 'MONTO TOTAL ($)': 0 }
          }
          summaryBySupplier[sup]['PEDIDOS'] += 1
          summaryBySupplier[sup]['TOTAL PIEZAS'] += r['PIEZAS']
          summaryBySupplier[sup]['MONTO TOTAL ($)'] += r['TOTAL FACTURABLE ($)'] || 0
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
  const totalCostSum = filteredRecords.reduce((acc, curr) => acc + (curr.total_cost || 0), 0)

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

          {/* Section Switcher (ARREGLOS vs SERIGRAFÍA) */}
          <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(255,255,255,0.03)', padding: '0.35rem', borderRadius: '1.25rem', border: '1px solid rgba(255,255,255,0.05)' }}>
            <button
              onClick={() => setActiveSection('ARREGLOS')}
              style={{
                padding: '0.65rem 1.5rem',
                borderRadius: '1rem',
                background: activeSection === 'ARREGLOS' ? 'linear-gradient(135deg,#ef4444,#b91c1c)' : 'transparent',
                color: activeSection === 'ARREGLOS' ? 'white' : '#64748B',
                border: 'none',
                fontWeight: 1000,
                fontSize: '0.85rem',
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: activeSection === 'ARREGLOS' ? '0 0 20px rgba(239,68,68,0.4)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}
            >
              ✂️ ARREGLOS
            </button>

            <button
              onClick={() => setActiveSection('SERIGRAFIA')}
              style={{
                padding: '0.65rem 1.5rem',
                borderRadius: '1rem',
                background: activeSection === 'SERIGRAFIA' ? 'linear-gradient(135deg,#3b82f6,#1d4ed8)' : 'transparent',
                color: activeSection === 'SERIGRAFIA' ? 'white' : '#64748B',
                border: 'none',
                fontWeight: 1000,
                fontSize: '0.85rem',
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: activeSection === 'SERIGRAFIA' ? '0 0 20px rgba(59,130,246,0.4)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}
            >
              🎨 SERIGRAFÍA
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
              padding: '0.875rem 1.75rem',
              border: 'none',
              borderBottom: moduleTab === 'monitor' ? '3px solid #ef4444' : '3px solid transparent',
              background: 'transparent',
              color: moduleTab === 'monitor' ? 'white' : '#64748b',
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
            <LayoutDashboard size={18} color={moduleTab === 'monitor' ? '#ef4444' : '#64748b'} />
            2. MONITOR DE SEGUIMIENTO ({records.length})
          </button>
        )}
      </div>

      {/* PESTAÑA 1: CAPTURA Y REGISTRO */}
      {moduleTab === 'capture' && (
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
                    TOTAL DE PIEZAS *
                  </label>
                  <input
                    type="number"
                    placeholder="Ej: 150"
                    min="1"
                    value={formData.total_piezas}
                    onChange={e => setFormData({ ...formData, total_piezas: e.target.value })}
                    style={{
                      width: '100%', background: 'rgba(2,6,23,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem',
                      padding: '0.65rem 0.875rem', color: 'white', fontWeight: 800, fontSize: '0.85rem', outline: 'none'
                    }}
                    required
                  />
                </div>
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.65rem', fontWeight: 1000, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '0.3rem' }}>
                    PROCESO A REALIZAR *
                  </label>
                  <select
                    value={formData.proceso_nombre}
                    onChange={e => setFormData({ ...formData, proceso_nombre: e.target.value })}
                    style={{
                      width: '100%', background: '#0b0e14', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem',
                      padding: '0.65rem 0.875rem', color: 'white', fontWeight: 800, fontSize: '0.85rem', outline: 'none', cursor: 'pointer'
                    }}
                    required
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
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
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
            justify: 'space-between',
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

              <p style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 700, marginBottom: '1rem', lineHeight: '1.4' }}>
                Escanee el código QR de la etiqueta para registrar las 2 etapas del proceso:
                <br />
                • <b>1er Escaneo</b>: Salida ➔ Estatus: <span style={{ color: '#f59e0b' }}>ENTREGADO AL PROVEEDOR</span>.
                <br />
                • <b>2do Escaneo</b>: Recepción ➔ Estatus: <span style={{ color: '#22c55e' }}>RECIBIDO</span> (Captura automática de usuario logueado).
              </p>

              {scanFeedback && (
                <div style={{
                  padding: '0.875rem 1rem',
                  borderRadius: '0.875rem',
                  marginBottom: '1rem',
                  fontSize: '0.85rem',
                  fontWeight: 900,
                  background: scanFeedback.type === 'error' ? 'rgba(239,68,68,0.2)' : scanFeedback.type === 'info' ? 'rgba(59,130,246,0.2)' : 'rgba(34,197,94,0.2)',
                  border: `1px solid ${scanFeedback.type === 'error' ? '#ef4444' : scanFeedback.type === 'info' ? '#3b82f6' : '#22c55e'}`,
                  color: scanFeedback.type === 'error' ? '#f87171' : scanFeedback.type === 'info' ? '#60a5fa' : '#4ade80}'
                }}>
                  {scanFeedback.text}
                </div>
              )}

              <form onSubmit={handleQRScan} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                <input
                  type="text"
                  placeholder="ESCANEAR O INGRESAR CÓDIGO QR / PEDIDO..."
                  value={scanCode}
                  onChange={e => setScanCode(e.target.value)}
                  autoFocus
                  style={{
                    flex: 1, background: 'rgba(2,6,23,0.9)', border: '2px solid rgba(59,130,246,0.5)', borderRadius: '0.75rem',
                    padding: '0.75rem 1rem', color: 'white', fontWeight: 900, fontSize: '0.9rem', outline: 'none', letterSpacing: '0.05em'
                  }}
                />
                <button
                  type="submit"
                  style={{
                    padding: '0.75rem 1.25rem', borderRadius: '0.75rem', background: '#3b82f6', border: 'none', color: 'white',
                    fontWeight: 1000, fontSize: '0.8rem', cursor: 'pointer', textTransform: 'uppercase'
                  }}
                >
                  PROCESAR
                </button>
              </form>
            </div>

            {/* Quick Catalog Config Button */}
            <div style={{ paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 900, textTransform: 'uppercase', display: 'block' }}>USUARIO LOGUEADO:</span>
                <span style={{ fontSize: '0.8rem', color: 'white', fontWeight: 1000, textTransform: 'uppercase' }}>
                  {profile?.name || user?.email || 'MASTER'}
                </span>
              </div>

              {canSeeCosts && (
                <button
                  onClick={() => setShowCatalogModal(true)}
                  style={{
                    padding: '0.6rem 1rem',
                    borderRadius: '0.75rem',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#e2e8f0',
                    fontWeight: 900,
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    textTransform: 'uppercase'
                  }}
                >
                  ⚙️ CATÁLOGOS Y COSTOS
                </button>
              )}
            </div>
          </div>

        </div>
      )}

      {/* PESTAÑA 2: MONITOR Y SEGUIMIENTO */}
      {moduleTab === 'monitor' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Controls & Filters Bar */}
          <div style={{
            display: 'flex',
            justify: 'space-between',
            alignItems: 'center',
            gap: '1rem',
            flexWrap: 'wrap',
            background: 'rgba(255,255,255,0.02)',
            padding: '1.25rem',
            borderRadius: '1.5rem',
            border: '1px solid rgba(255,255,255,0.06)'
          }}>
            {/* Search and Filters */}
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', flex: 1 }}>
              <div style={{
                background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '1rem',
                padding: '0.25rem 0.5rem', display: 'flex', alignItems: 'center', flex: 2, minWidth: '220px'
              }}>
                <Search size={16} color="#64748b" style={{ marginLeft: '0.5rem' }} />
                <input
                  type="text"
                  placeholder="BUSCAR PEDIDO, CLIENTE O PROVEEDOR..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  style={{ background: 'transparent', border: 'none', color: 'white', padding: '0.65rem 0.75rem', width: '100%', outline: 'none', fontWeight: 900, textTransform: 'uppercase', fontSize: '0.8rem' }}
                />
              </div>

              <div style={{
                background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '1rem',
                padding: '0.25rem 0.5rem', display: 'flex', alignItems: 'center', flex: 1, minWidth: '180px'
              }}>
                <select
                  value={filterSupplier}
                  onChange={e => setFilterSupplier(e.target.value)}
                  style={{ background: 'transparent', border: 'none', color: 'white', padding: '0.65rem 0.75rem', width: '100%', outline: 'none', fontWeight: 900, cursor: 'pointer', textTransform: 'uppercase', fontSize: '0.8rem' }}
                >
                  <option value="ALL" style={{ background: '#0b0e14' }}>TODOS LOS PROVEEDORES</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.name} style={{ background: '#0b0e14' }}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div style={{
                background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '1rem',
                padding: '0.25rem 0.5rem', display: 'flex', alignItems: 'center', flex: 1, minWidth: '180px'
              }}>
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  style={{ background: 'transparent', border: 'none', color: 'white', padding: '0.65rem 0.75rem', width: '100%', outline: 'none', fontWeight: 900, cursor: 'pointer', textTransform: 'uppercase', fontSize: '0.8rem' }}
                >
                  <option value="ALL" style={{ background: '#0b0e14' }}>TODOS LOS ESTATUS</option>
                  <option value="PENDIENTE" style={{ background: '#0b0e14' }}>PENDIENTE DE SALIDA</option>
                  <option value="ENTREGADO_PROVEEDOR" style={{ background: '#0b0e14' }}>ENTREGADO AL PROVEEDOR</option>
                  <option value="RECIBIDO" style={{ background: '#0b0e14' }}>RECIBIDO</option>
                </select>
              </div>
            </div>

            {/* Metrics & Export Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ display: 'flex', gap: '1rem', paddingRight: '1rem', borderRight: '1px solid rgba(255,255,255,0.08)' }}>
                <div>
                  <span style={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 900, textTransform: 'uppercase', display: 'block' }}>PEDIDOS:</span>
                  <span style={{ fontSize: '1rem', fontWeight: 1000, color: 'white' }}>{totalOrdersCount}</span>
                </div>
                <div>
                  <span style={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 900, textTransform: 'uppercase', display: 'block' }}>PRENDAS:</span>
                  <span style={{ fontSize: '1rem', fontWeight: 1000, color: '#ef4444' }}>{totalPiecesCount} PZ</span>
                </div>
                {canSeeCosts && (
                  <div>
                    <span style={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 900, textTransform: 'uppercase', display: 'block' }}>TOTAL AUDITADO:</span>
                    <span style={{ fontSize: '1rem', fontWeight: 1000, color: '#22c55e' }}>${totalCostSum.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
              </div>

              {canSeeReports && (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => exportReconciliationReport('excel')}
                    style={{
                      padding: '0.65rem 1rem', borderRadius: '0.75rem', background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)',
                      color: '#22c55e', fontWeight: 1000, fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', textTransform: 'uppercase'
                    }}
                  >
                    <Download size={15} /> REPORTE EXCEL
                  </button>

                  <button
                    onClick={() => exportReconciliationReport('csv')}
                    style={{
                      padding: '0.65rem 1rem', borderRadius: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                      color: '#94a3b8', fontWeight: 1000, fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', textTransform: 'uppercase'
                    }}
                  >
                    <Download size={15} /> CSV
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Monitor Grid / Table */}
          <div style={{ background: 'rgba(2,6,23,0.4)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '1.75rem', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
            
            {/* Table Header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: canSeeCosts ? '1.5fr 1fr 1fr 1.5fr 1.2fr 1.2fr 1.2fr 1fr 1fr' : '1.5fr 1fr 1fr 1.5fr 1.3fr 1.3fr 1.3fr 1fr',
              gap: '0.75rem',
              padding: '1.25rem 1.75rem',
              background: 'rgba(255,255,255,0.03)',
              borderBottom: '1px solid rgba(255,255,255,0.08)'
            }}>
              {['PROVEEDOR', 'PEDIDO', 'PRENDAS', 'PROCESO', 'ENTREGA (1ER SCAN)', 'RECEPCIÓN (2DO SCAN)', 'USUARIO RECEPTOR', canSeeCosts && 'COSTO TOTAL', 'ESTATUS'].filter(Boolean).map(h => (
                <div key={h} style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 1000, textTransform: 'uppercase', letterSpacing: '0.15em' }}>
                  {h}
                </div>
              ))}
            </div>

            {/* Table Content */}
            <div style={{ maxHeight: '600px', overflowY: 'auto' }} className="custom-scrollbar">
              {loading ? (
                <div style={{ padding: '5rem 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                  <div className="spinner" style={{ width: '36px', height: '36px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#EF4444', borderRadius: '50%' }}></div>
                  <span style={{ color: '#64748B', fontSize: '0.8rem', fontWeight: 1000, letterSpacing: '0.15em', textTransform: 'uppercase' }}>CARGANDO REGISTROS DE MONITOR...</span>
                </div>
              ) : filteredRecords.length === 0 ? (
                <div style={{ padding: '5rem 0', display: 'flex', justifyContent: 'center', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                  <p style={{ color: '#EF4444', fontSize: '1.1rem', fontWeight: 1000, textTransform: 'uppercase' }}>NO HAY REGISTROS REGISTRADOS EN {activeSection}</p>
                  <p style={{ color: '#64748B', fontSize: '0.8rem', fontWeight: 900, textTransform: 'uppercase' }}>INGRESE UN NUEVO PEDIDO CON EL FORMULARIO DE OPERADOR</p>
                </div>
              ) : (
                filteredRecords.map((r, idx) => {
                  const isReceived = r.status === 'RECIBIDO'
                  const isOutbound = r.status === 'ENTREGADO_PROVEEDOR'

                  const statusColor = isReceived ? '#22c55e' : isOutbound ? '#f59e0b' : '#64748b'
                  const statusText = isReceived ? 'RECIBIDO' : isOutbound ? 'ENTREGADO AL PROVEEDOR' : 'PENDIENTE SALIDA'

                  return (
                    <div key={r.id || idx} style={{
                      display: 'grid',
                      gridTemplateColumns: canSeeCosts ? '1.5fr 1fr 1fr 1.5fr 1.2fr 1.2fr 1.2fr 1fr 1fr' : '1.5fr 1fr 1fr 1.5fr 1.3fr 1.3fr 1.3fr 1fr',
                      gap: '0.75rem',
                      padding: '1.25rem 1.75rem',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                      alignItems: 'center', transition: 'all 0.2s'
                    }}>
                      {/* Proveedor */}
                      <div>
                        <div style={{ fontSize: '0.9rem', color: 'white', fontWeight: 1000, textTransform: 'uppercase' }}>{r.proveedor_nombre}</div>
                        <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 800 }}>ID: {r.id}</div>
                      </div>

                      {/* Pedido */}
                      <div>
                        <span style={{ fontSize: '0.95rem', color: '#ef4444', fontWeight: 1000, background: 'rgba(239,68,68,0.1)', padding: '0.25rem 0.6rem', borderRadius: '0.5rem' }}>
                          #{r.pedido_num}
                        </span>
                        <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 800, marginTop: '0.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {r.cliente}
                        </div>
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
                        <div style={{ fontSize: '0.85rem', color: '#22c55e', fontWeight: 1000 }}>
                          ${(r.total_cost || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        </div>
                      )}

                      {/* Estatus & Print action */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', padding: '0.35rem 0.65rem', borderRadius: '0.6rem',
                          background: `${statusColor}15`, color: statusColor, border: `1px solid ${statusColor}30`,
                          fontSize: '0.65rem', fontWeight: 1000, textTransform: 'uppercase'
                        }}>
                          {statusText}
                        </span>

                        <button
                          onClick={() => { setSelectedLabelRecord(r); triggerLabelPrint(r); }}
                          title="REIMPRIMIR ETIQUETA QR"
                          style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', borderRadius: '0.4rem', padding: '0.35rem', cursor: 'pointer' }}
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
                  <QRCodeSVG value={selectedLabelRecord.id} size={90} level="M" />
                  <span style={{ fontSize: '6.5pt', fontWeight: 1000, marginTop: '3px', letterSpacing: '-0.02em', textAlign: 'center' }}>
                    {selectedLabelRecord.id}
                  </span>
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
