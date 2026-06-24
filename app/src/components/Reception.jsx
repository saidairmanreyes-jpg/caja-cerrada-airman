import { useState, useRef, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { db } from '../firebase'
import { collection, addDoc, query, where, getDocs, doc, updateDoc } from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
// Eliminamos lucide-react ya que no usaremos iconos
import * as XLSX from 'xlsx'
import { QRCodeSVG } from 'qrcode.react'

const inputStyle = {
  background: 'rgba(15,23,42,0.7)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '0.75rem',
  padding: '0.75rem 1rem',
  color: 'white',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

const fmt = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('es-MX') + ', ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

// ─── Componente de Etiqueta Imprimible ───────────────────────────────────────
function PrintableLabel({ data }) {
  if (!data) return null;
  return (
    <div id="printable-area" style={{
      position: 'fixed',
      top: '-9999px',
      left: '-9999px',
    }}>
      <div style={{
        width: '150mm',
        height: '100mm',
        padding: '5mm 10mm',
        boxSizing: 'border-box',
        background: 'white',
        color: 'black',
        fontFamily: 'Arial, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '3.5pt solid black', paddingBottom: '2mm' }}>
          <span style={{ fontWeight: 900, fontSize: '24pt', letterSpacing: '1pt' }}>AIRMAN WMS</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4mm' }}>
            <span style={{ fontSize: '14pt', fontWeight: 600 }}>{data.receipt_date || new Date().toLocaleDateString('es-MX')}</span>
            {/* QR Code for Kanban/Traceability (New Apostrophe Separated Format) */}
            <div style={{ 
              background: 'white', 
              padding: '1mm', 
              border: '1px solid #eee',
              borderRadius: '1mm'
            }}>
              <QRCodeSVG 
                value={(function() {
                  const cleanCode = (data.code || '').trim();
                  const cleanTalla = (data.talla || '').trim();
                  const cleanQty = parseInt(data.qty || data.quantity || 0);
                  const cleanOP = (data.op || '0').trim();
                  
                  let qrDate = '000000';
                  const d = new Date(data.original_entry_date || data.entry_date || data.date || new Date());
                  if (!isNaN(d.getTime())) {
                    const day = String(d.getDate()).padStart(2, '0');
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const year = String(d.getFullYear()).substring(2);
                    qrDate = `${day}${month}${year}`;
                  }
                  
                  const pkgId = data.package_id || '000000';
                  return `${cleanCode}|${cleanTalla}|${cleanQty}|${cleanOP}|${qrDate}|${pkgId}`;
                })()}
                size={75} 
                level="M"
                includeMargin={false}
              />
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ 
            fontSize: '48pt', 
            fontWeight: 950, 
            textAlign: 'center', 
            letterSpacing: '0.1mm', 
            lineHeight: '1.1', 
            margin: '2mm 0',
            whiteSpace: 'nowrap',
            width: '100%',
            fontFamily: 'Arial, sans-serif'
          }}>
            {data.code}
          </div>
          <div style={{ 
            fontSize: '14pt', 
            fontWeight: 700, 
            textAlign: 'center', 
            lineHeight: '1.2', 
            maxHeight: '18mm', 
            overflow: 'hidden', 
            textTransform: 'uppercase',
            width: '100%',
            opacity: 0.95
          }}>
            {data.description || 'SIN DESCRIPCIÓN'}
          </div>
        </div>

        {/* Footer Info */}
        <div style={{ display: 'flex', borderTop: '3.5pt solid black', paddingTop: '3mm' }}>
          <div style={{ flex: '0 0 50mm', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <span style={{ fontSize: '9pt', textTransform: 'uppercase', display: 'block', fontWeight: 700 }}>Talla</span>
              <span style={{ fontSize: '26pt', fontWeight: 900, lineHeight: 1 }}>{data.talla}</span>
            </div>
            <div style={{ marginTop: '2mm' }}>
              <span style={{ fontSize: '11pt', fontWeight: 900 }}>OP: {data.op || 'S/OP'}</span>
            </div>
          </div>
          <div style={{ flex: '1', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <span style={{ fontSize: '9pt', textTransform: 'uppercase', display: 'block', fontWeight: 700 }}>Cant.</span>
              <span style={{ fontSize: '26pt', fontWeight: 900, lineHeight: 1 }}>{data.qty || data.quantity} <small style={{fontSize:'14pt'}}>PZ</small></span>
            </div>
            <div style={{ marginTop: '2mm' }}>
              <span style={{ fontSize: '11pt', fontWeight: 900 }}>PKG: {data.package_id || '000000'}</span>
            </div>
          </div>
          <div style={{ flex: '0 0 45mm', textAlign: 'right', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
            <span style={{ fontSize: '9pt', textTransform: 'uppercase', display: 'block', fontWeight: 700 }}>Loc.</span>
            <span style={{ fontSize: '34pt', fontWeight: 900, lineHeight: 1 }}>{data.location}</span>
          </div>
        </div>
      </div>

      <style>{`
        @page {
          size: 150mm 100mm;
          margin: 0;
        }
        @media print {
          html, body {
            height: 100mm !important;
            width: 150mm !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            background: white !important;
          }
          body * {
            visibility: hidden !important;
          }
          #printable-area, #printable-area * {
            visibility: visible !important;
          }
          #printable-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 150mm !important;
            height: 100mm !important;
            display: block !important;
            box-sizing: border-box !important;
          }
        }
      `}</style>
    </div>
  )
}

// ─── Componente Principal ────────────────────────────────────────────────────
export default function Reception() {
  const { profile, user, activeWarehouse } = useAuth()
  const [tab, setTab]               = useState('scan')
  const [scanValue, setScanValue]   = useState('')
  const [loading, setLoading]       = useState(false)
  const [message, setMessage]       = useState(null)
  const [lastAssigned, setLastAssigned] = useState(null)
  const [availableCount, setAvailableCount] = useState(0)
  const [printData, setPrintData]   = useState(null)
  const [assignLocation, setAssignLocation] = useState(true)
  const [rackFilter, setRackFilter] = useState('')
  const inputRef = useRef(null)
  const scanningRef = useRef(false)

  const [histLoading, setHistLoading] = useState(false)
  const [historyData, setHistoryData] = useState([])
  const [filterDate, setFilterDate]   = useState(new Date().toISOString().slice(0, 10))

  const fetchAvailableCount = useCallback(async () => {
    const { count } = await supabase
      .from('locations')
      .select('*', { count: 'exact', head: true })
      .eq('warehouse', activeWarehouse)
      .eq('is_occupied', false)
    setAvailableCount(count || 0)
  }, [activeWarehouse])

  useEffect(() => {
    fetchAvailableCount()
    const sub = supabase.channel('loc_count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, fetchAvailableCount)
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [fetchAvailableCount])

  const parseScan = (input) => {
    try {
      if (!input) return null;

      // Intentar como JSON (Formato Kanban Antiguo/Legacy)
      if (input.startsWith('{') && input.includes('"')) {
        const parsed = JSON.parse(input)
        return { 
          code: parsed.c, 
          talla: parsed.t, 
          qty: parsed.q, 
          op: parsed.op, 
          inventory_id: parsed.id,
          is_json: true 
        }
      }

      // Separadores conocidos del formato de etiquetas (incluye ] usado por etiquetas de Maquila/Hacienda)
      const knownSeparators = ['|', ']', "'", '!', '>', '{', '-', '_'];
      let separator = null;
      let isLegacy = false;

      // 1. Buscar en separadores explícitos primero (el que produzca exactamente 6 partes)
      for (const sep of knownSeparators) {
        if (input.includes(sep) && input.split(sep).length === 6) {
          separator = sep;
          break;
        }
      }

      // 2. Si no es formato nuevo con separador conocido, intentar fallback
      //    EXCLUIMOS el espacio para evitar que OPs con espacios (ej. "2968 A") rompan la separación
      if (!separator) {
        const chars = input.split('');
        const possibleSeparators = [...new Set(chars.filter(c => !/[A-Za-z0-9\s]/.test(c)))];
        
        for (const sep of possibleSeparators) {
          if (input.split(sep).length >= 3) {
            separator = sep;
            isLegacy = true;
            break;
          }
        }
      }

      if (separator) {
        const parts = input.split(separator)
        
        if (!isLegacy && parts.length === 6) {
          return {
            code:        parts[0].trim().toUpperCase(),
            talla:       parts[1].trim().toUpperCase(),
            qty:         parseInt(parts[2]) || 0,
            op:          parts[3].trim().toUpperCase(),
            date_hint:   parts[4].trim(),
            package_id:  parts[5].trim(),
            is_new_format: true,
            separator_used: separator
          }
        }
        
        // Fallback: Formato Antiguo (CODE'QTY'OP)
        if (parts.length >= 3) {
          const codeWithTalla = parts[0]
          const code  = codeWithTalla.substring(0, 10).toUpperCase()
          const talla = codeWithTalla.substring(10).toUpperCase()
          const qty   = parseInt(parts[1]) || 0
          const op    = parts[2].toUpperCase()
          return { code, talla, qty, op, is_json: false }
        }
      }
      
      return null
    } catch { return null }
  }

  const handleScan = async (e) => {
    e?.preventDefault()
    if (!scanValue || loading || scanningRef.current) return
    scanningRef.current = true
    setLoading(true); setMessage(null)

    try {
      const data = parseScan(scanValue)
      if (!data) {
        setMessage({ type: 'error', text: 'Formato de código inválido.' })
        return
      }

      let inventoryId = data.inventory_id
      let finalInventoryId = data.inventory_id
      let productData = null
      let isKanbanBox = false
      let currentQty = data.qty
      let currentOp = data.op
      let currentTalla = data.talla

      let isTransfer = false
      let oldLocationId = null

      // 1. Verificación si el QR trae ID explícito (JSON) o lo buscamos por Package ID
      if (!inventoryId && data.package_id && data.package_id !== '000000') {
        const { data: invRecord } = await supabase
          .from('inventory')
          .select('id')
          .eq('package_id', data.package_id)
          .single()
        
        if (invRecord) {
          inventoryId = invRecord.id
          finalInventoryId = invRecord.id
        }
      }

      if (inventoryId) {
        const { data: invRecord } = await supabase
          .from('inventory')
          .select('*, products(id, code, description)')
          .eq('id', inventoryId)
          .single()
        
        if (invRecord) {
          currentTalla = invRecord.talla
          if (invRecord.warehouse === 'TRANSITO') {
            isKanbanBox = true
            productData = invRecord.products
            currentQty = invRecord.quantity
            currentOp = invRecord.op
            oldLocationId = invRecord.location_id
          } else if (invRecord.warehouse === activeWarehouse) {
            if (assignLocation && !invRecord.location_id) {
              // Caja sin localidad en el mismo almacén, permitimos asignarle una
              isKanbanBox = true
              isTransfer = false
              productData = invRecord.products
              currentQty = invRecord.quantity
              currentOp = invRecord.op
              oldLocationId = invRecord.location_id
            } else {
              setMessage({ type: 'error', text: `Esta caja ya se encuentra recepcionada en ${activeWarehouse}.` })
              return
            }
          } else {
            // Se está recibiendo físicamente una caja que estaba en OTRO almacén activo
            isKanbanBox = true
            isTransfer = true
            oldLocationId = invRecord.location_id
            productData = invRecord.products
            currentQty = invRecord.quantity
            currentOp = invRecord.op
          }
        }
      }

      // 2. Si no es Kanban ni un traspaso, buscar producto por código (Flujo normal - nueva entrada)
      if (!productData) {
        const { data: product } = await supabase.from('products').select('id, code, description').eq('code', data.code).single()
        if (!product) {
          setMessage({ type: 'error', text: `Código ${data.code} no encontrado en catálogo.` })
          return
        }
        productData = product
      }

      let location = null
      let locationName = ''

      if (assignLocation) {
        let locQuery = supabase.from('locations').select('id, name')
          .eq('warehouse', activeWarehouse)
          .eq('is_occupied', false)
          
        if (rackFilter) {
          locQuery = locQuery.like('name', `${rackFilter}%`)
        }
        
        const { data: locData } = await locQuery.order('name', { ascending: true }).limit(1).single()
        
        if (!locData) {
          setMessage({ type: 'error', text: 'No hay localidades disponibles.' })
          return
        }
        location = locData;
        locationName = locData.name;
      }

      // ─── FIFO Logic: Busca la fecha de ingreso original de la OP ───
      let finalEntryDate = new Date().toISOString()
      if (currentOp && currentOp !== 'S/OP') {
        const { data: oldestRecord } = await supabase
          .from('inventory')
          .select('entry_date')
          .eq('op', currentOp)
          .order('entry_date', { ascending: true })
          .limit(1)
          .single()
        
        if (oldestRecord) {
          finalEntryDate = oldestRecord.entry_date
          console.log(`[FIFO] Usando fecha original de OP ${currentOp}: ${finalEntryDate}`)
        }
      }

      const assignmentDate = new Date().toISOString() // Real receipt date for history
      const receivedByStr = profile?.name || user?.email || 'MÁSTER'
      
      // Capturar información de origen ANTES de cualquier actualización para el historial
      let detectedOriginWarehouse = null
      if (inventoryId) {
        const { data: invRecord } = await supabase
          .from('inventory')
          .select('warehouse')
          .eq('id', inventoryId)
          .single()
        
        if (invRecord) {
          detectedOriginWarehouse = invRecord.warehouse
          console.log(`[RECEPTION] Detectado almacén de origen: ${detectedOriginWarehouse}`)
        }
      }

      // Si no se detectó por ID, intentar por Package ID en la tabla de etiquetas de producción
      if (!detectedOriginWarehouse && data.package_id) {
        const { data: lbl } = await supabase
          .from('maquila_production_labels')
          .select('maquila_name')
          .eq('package_id', data.package_id)
          .maybeSingle()
        if (lbl) detectedOriginWarehouse = lbl.maquila_name
      }
      const pkgId = data.package_id || (location?.id ? Math.floor(100000 + Math.random() * 900000).toString() : null)

      if (isKanbanBox) {
        // Registrar llegada de resurtido Kanban o Traspaso
        const { error: moveErr } = await supabase
          .from('inventory')
          .update({
            warehouse: activeWarehouse,
            location_id: location?.id || null,
            kanban_replenishment_id: null, // Liberar stock para uso local
            quantity: currentQty,
            op: currentOp,
            // En resurtidos Kanban, MANTENEMOS la fecha que traiga la caja para FIFO
            received_by: receivedByStr
          })
          .eq('id', inventoryId)
        
        if (moveErr) {
          setMessage({ type: 'error', text: 'Error al mover caja de Tránsito: ' + moveErr.message })
          return
        }
      } else {
        // Inserción normal de nueva recepción
        const inventoryPayload = {
          product_id:  productData.id,
          talla:       currentTalla,
          quantity:    data.qty,
          op:          data.op || 'S/OP',
          entry_date:  finalEntryDate, // Usar fecha de OP original si existe
          received_by: receivedByStr,
          warehouse:   activeWarehouse,
          package_id:  pkgId
        };
        if (location) inventoryPayload.location_id = location.id;

        const { data: insertedData, error: iError } = await supabase
          .from('inventory')
          .insert(inventoryPayload)
          .select()
          .single()

        if (iError || !insertedData) {
          setMessage({ type: 'error', text: 'Error al registrar entrada: ' + (iError?.message || 'No data returned') })
          return
        }
        finalInventoryId = insertedData.id
      }

      if (location) {
        await supabase.from('locations').update({ is_occupied: true }).eq('id', location.id)
      }

      if (oldLocationId) {
        await supabase.from('locations').update({ is_occupied: false }).eq('id', oldLocationId)
      }

      // 6. Imprimir Etiqueta
      const printData = {
        code: productData.code,
        description: productData.description.toUpperCase(),
        talla: currentTalla,
        quantity: currentQty,
        op: currentOp ? currentOp.toUpperCase() : 'S/OP',
        location: locationName,
        date: finalEntryDate, // En el QR va la fecha FIFO
        receipt_date: assignmentDate, // En el texto de la etiqueta va la fecha de hoy
        package_id: pkgId,
        warehouse: activeWarehouse,
        inventory_id: finalInventoryId
      }
      setPrintData(printData)

      if (profile?.printMode === 'direct') {
        const pResult = await printLabel({
          ...printData,
          date: finalEntryDate // Overwrite date for utility to use as QR date
        })
        if (!pResult.success) {
          setMessage({ type: 'warning', text: 'Entrada registrada, pero error en impresora TSC: ' + pResult.error })
        }
      }

      // 5. Historial de Recepción (Firestore)
      try {
        await addDoc(collection(db, 'reception_history'), {
          code: productData.code,
          description: productData.description.toUpperCase(),
          talla: currentTalla,
          quantity: currentQty,
          op: currentOp ? currentOp.toUpperCase() : 'S/OP',
          location: locationName,
          entry_date: assignmentDate,
          original_entry_date: finalEntryDate,
          received_by: receivedByStr,
          warehouse: activeWarehouse,
          origin_warehouse: detectedOriginWarehouse, // Usar el detectado antes de la actualización
          package_id: pkgId,
          is_printed: true,
          type: isTransfer ? 'TRASPASO' : (isKanbanBox ? 'KANBAN_RESURTIDO' : 'NORMAL')
        })
      } catch (fsErr) {
        console.error("Error guardando historial en Firestore", fsErr)
      }

      const assignment = { 
        location: locationName, 
        code: productData.code, 
        talla: currentTalla, 
        qty: currentQty, 
        op: currentOp, 
        description: productData.description,
        inventory_id: finalInventoryId,
        warehouse: activeWarehouse
      }
      setLastAssigned(assignment)
      setMessage({ 
        type: 'success', 
        text: isTransfer ? `✓ Traspaso exitoso a ${locationName}` : (isKanbanBox ? `✓ Resurtido KANBAN Recibido en ${locationName}` : `✓ Registrado en ${locationName}`) 
      })
      setScanValue('')
      inputRef.current?.focus()
      
      // Auto print solo si se asignó localidad
      if (assignLocation) {
        handlePrint(
          locationName, 
          productData.code, 
          productData.description, 
          currentTalla, 
          currentQty, 
          currentOp, 
          null, 
          finalInventoryId,
          pkgId,
          finalEntryDate
        )
      }
    } finally {
      setLoading(false)
      scanningRef.current = false
    }
  }

  useEffect(() => {
    if (!scanValue || scanValue.length < 15) return;
    
    // Si ya estamos procesando, no inicies nuevos timers
    if (loading || scanningRef.current) return;

    // Debounce de 300ms para asegurar que la pistola de códigos haya terminado de escribir
    const timeoutId = setTimeout(() => {
      const parsed = parseScan(scanValue)
      if (parsed) {
        handleScan({ preventDefault: () => {} })
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanValue])

  const handlePrint = async (loc, code, desc, talla, qty, op, historyId = null, inventoryId = null, pkgId = null, origDate = null) => {
    // Si viene desde el historial, marcamos como impreso en Firebase
    if (historyId) {
      try {
        await updateDoc(doc(db, 'reception_history', historyId), { is_printed: true })
        setHistoryData(prev => prev.map(r => r.id === historyId ? { ...r, is_printed: true } : r))
      } catch (err) {
        console.error('Error actualizando estado de impresión', err)
      }
    }

    const pData = { 
      location: loc, 
      code, 
      description: desc, 
      talla, 
      qty, 
      quantity: qty,
      op,
      inventory_id: inventoryId,
      warehouse: activeWarehouse,
      package_id: pkgId,
      original_entry_date: origDate
    }

    // Impresora TSC (Directa)
    if (profile?.printMode === 'direct') {
      const pResult = await printLabel({
        ...pData,
        date: origDate || new Date()
      })
      if (!pResult.success) {
        setMessage({ type: 'error', text: 'Error en impresora TSC: ' + pResult.error })
      }
      return
    }

    // Impresora Normal (Web Browser PDF Dialog)
    setPrintData(pData)
    setTimeout(() => {
      window.print();
    }, 250); // Give React enough time to render PrintableLabel
  }

  const fetchHistory = useCallback(async (date) => {
    setHistLoading(true)
    const start = date + 'T00:00:00.000Z'
    const end   = date + 'T23:59:59.999Z'
    
    console.log('[DEBUG] Fetching History:', { activeWarehouse, start, end })
    
    try {
      // Fetch by DATE only to avoid composite index requirement and handle legacy records
      const q = query(
        collection(db, 'reception_history'),
        where('entry_date', '>=', start),
        where('entry_date', '<=', end)
      )
      
      const snapshot = await getDocs(q)
      let allDateData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))

      // Filter by activeWarehouse in memory
      const filtered = allDateData.filter(item => {
        // Match if warehouse field is missing AND activeWarehouse is MATRIZ (legacy fallback)
        if (!item.warehouse) return activeWarehouse === 'MATRIZ'
        // Otherwise match exactly
        return item.warehouse === activeWarehouse
      })
      
      // Sort descending by date
      filtered.sort((a,b) => new Date(b.entry_date) - new Date(a.entry_date))
      
      setHistoryData(filtered)
    } catch (e) {
      console.error('Error fetching history:', e)
      setHistoryData([])
    } finally {
      setHistLoading(false)
    }
  }, [activeWarehouse])

  useEffect(() => {
    if (tab === 'history') fetchHistory(filterDate)
  }, [tab, filterDate, fetchHistory, activeWarehouse])

  const exportHistory = () => {
    const rows = historyData.map(r => ({
      'ALMACÉN':       r.warehouse || activeWarehouse,
      'FECHA/HORA':    fmt(r.entry_date),
      'FECHA OP (FIFO)': r.original_entry_date ? new Date(r.original_entry_date).toLocaleDateString('es-MX') : '-',
      'CÓDIGO':        r.code,
      'DESCRIPCIÓN':   r.description,
      'TALLA':         r.talla,
      'CANTIDAD':      r.quantity,
      'OP':            r.op || '-',
      'PACKAGE ID':    r.package_id || '-',
      'LOCALIDAD ASIGNADA': r.location,
      'RECIBIÓ':       r.received_by || '-',
      'IMPRESA':       r.is_printed ? 'SÍ' : 'NO'
    }))
    
    if (rows.length === 0) {
      alert('No hay datos para exportar');
      return;
    }

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Recepciones')
    
    // Nombre de archivo sanitizado (sin caracteres especiales que confundan al navegador)
    const safeDate = (filterDate || new Date().toISOString().split('T')[0]).replace(/[^a-zA-Z0-9]/g, '_')
    const filename = `Recepciones_${activeWarehouse}_${safeDate}.xlsx`
    
    try {
      XLSX.writeFile(wb, filename)
    } catch (err) {
      console.error('Error exportando:', err)
      alert('Error al generar el archivo Excel: ' + err.message)
    }
  }

  return (
    <div style={{display:'flex',flexDirection:'column',gap:'1.5rem'}}>
      
      {/* Invisible Printable Label */}
      <PrintableLabel data={printData} />

      {/* Tabs */}
      <div style={{display:'flex',gap:'0.5rem',borderBottom:'1px solid rgba(255,255,255,0.07)',paddingBottom:'0.5rem'}}>
        {[
          { id:'scan',    label:'ESCANEO'  },
          { id:'history', label:'HISTORIAL' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding:'0.875rem 1.75rem',borderRadius:'0.75rem',
            background: tab===t.id ? '#dc2626' : 'transparent',
            border: 'none',
            color: tab===t.id ? 'white' : '#64748b',
            fontWeight:900,fontSize:'0.75rem',cursor:'pointer',transition:'all 0.15s'
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'scan' && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 260px',gap:'2rem'}}>
          <div style={{display:'flex',flexDirection:'column',gap:'1.5rem'}}>
            <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:'1.5rem',padding:'2rem'}}>
              <div style={{display:'flex',alignItems:'center',gap:'0.875rem',marginBottom:'1.5rem'}}>
                <div>
                  <h3 style={{fontWeight:900,color:'white',fontSize:'1.25rem', textTransform:'uppercase', letterSpacing:'-0.01em'}}>ESCANEO: {activeWarehouse}</h3>
                  <p style={{color:'#64748b',fontSize:'0.75rem', textTransform:'uppercase', fontWeight:800, letterSpacing:'0.05em'}}>LA FECHA DE ENTRADA SE REGISTRA AUTOMÁTICAMENTE.</p>
                </div>
              </div>

              {/* Toggles de Configuración */}
              <div style={{display:'flex',gap:'1rem',marginBottom:'1.5rem',background:'rgba(255,255,255,0.03)',padding:'1rem',borderRadius:'1rem',border:'1px solid rgba(255,255,255,0.05)'}}>
                <label style={{display:'flex',alignItems:'center',gap:'0.5rem',cursor:'pointer',fontSize:'0.8rem',color:'white',fontWeight:900, textTransform:'uppercase'}}>
                  <input type="checkbox" checked={assignLocation} onChange={(e) => setAssignLocation(e.target.checked)} style={{cursor:'pointer'}} />
                  ASIGNAR LOCALIDAD
                </label>
                {assignLocation && (
                  <div style={{display:'flex',alignItems:'center',gap:'0.5rem',marginLeft:'auto'}}>
                    <span style={{fontSize:'0.7rem',color:'#94a3b8',fontWeight:900,textTransform:'uppercase'}}>RACK:</span>
                    <select
                      value={rackFilter}
                      onChange={(e) => setRackFilter(e.target.value)}
                      style={{
                        background:'rgba(15,23,42,0.7)',
                        border:'1px solid rgba(255,255,255,0.1)',
                        borderRadius:'0.5rem',
                        padding:'0.25rem 0.5rem',
                        color:'white',
                        outline:'none',
                        fontSize:'0.75rem',
                        fontWeight:700,
                        cursor:'pointer'
                      }}
                    >
                      <option value="">GENERAL</option>
                      {['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'].map(letter => (
                        <option key={letter} value={letter}>RACK {letter}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <form onSubmit={handleScan} style={{display:'flex',gap:'0.75rem'}}>
                <input ref={inputRef} autoFocus value={scanValue}
                  onChange={e => setScanValue(e.target.value)}
                  placeholder="ESCANEA EL CÓDIGO (EJ. CMMZ4CLAZ5CH{11{2618)..."
                  style={{...inputStyle,flex:1,fontFamily:'monospace',fontSize:'1rem',padding:'1rem 1.25rem', textTransform:'uppercase'}} />
                <button type="submit" disabled={loading} style={{
                  background:'#dc2626',color:'white',border:'none',borderRadius:'0.75rem',
                  padding:'0 2rem',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',
                  minWidth:120,opacity:loading?0.6:1, fontWeight:900, fontSize:'0.75rem'
                }}>
                  {loading
                    ? <div style={{width:16,height:16,border:'3px solid rgba(255,255,255,0.3)',borderTopColor:'white',borderRadius:'50%',animation:'spin 1s linear infinite'}} />
                    : "RECIBIR"
                  }
                </button>
              </form>

              {message && (
                <div style={{
                  marginTop:'1rem',padding:'0.875rem 1rem',borderRadius:'0.875rem',
                  display:'flex',alignItems:'center',gap:'0.625rem',
                  background: message.type==='success'?'rgba(34,197,94,0.08)':'rgba(239,68,68,0.08)',
                  border:`1px solid ${message.type==='success'?'rgba(34,197,94,0.2)':'rgba(239,68,68,0.2)'}`,
                  color: message.type==='success'?'#4ade80':'#f87171',
                }}>
                   <span style={{fontWeight:900,fontSize:'0.875rem', textTransform:'uppercase'}}>{message.text}</span>
                </div>
              )}
            </div>

            {lastAssigned && (
              <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.07)',borderLeft:'5px solid #dc2626',borderRadius:'1.5rem',padding:'1.75rem'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'1.25rem'}}>
                  <div>
                    <p style={{fontSize:'0.6rem',color:'#ef4444',fontWeight:900,textTransform:'uppercase',letterSpacing:'0.15em',marginBottom:'0.25rem'}}>ÚLTIMA ASIGNACIÓN</p>
                    <p style={{fontSize:'3rem',fontWeight:900,color:'white',lineHeight:1}}>{lastAssigned.location}</p>
                  </div>
                    <button onClick={() => handlePrint(lastAssigned.location, lastAssigned.code, lastAssigned.description, lastAssigned.talla, lastAssigned.qty, lastAssigned.op, null, lastAssigned.inventory_id)}
                      style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:'0.75rem',padding:'0.75rem 1rem',cursor:'pointer',color:'white', fontWeight:900, fontSize:'0.65rem'}}>
                      REIMPRIMIR
                    </button>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:'0.75rem',paddingTop:'1rem',borderTop:'1px solid rgba(255,255,255,0.05)'}}>
                  {[{l:'CÓDIGO',v:lastAssigned.code},{l:'TALLA',v:lastAssigned.talla},{l:'CANT.',v:lastAssigned.qty},{l:'OP',v:lastAssigned.op}].map(({l,v})=>(
                    <div key={l} style={{background:'rgba(255,255,255,0.04)',borderRadius:'0.75rem',padding:'0.75rem',textAlign:'center'}}>
                      <p style={{fontSize:'0.55rem',color:'#64748b',fontWeight:900,textTransform:'uppercase',marginBottom:'0.25rem'}}>{l}</p>
                      <p style={{fontWeight:900,color:'white',fontSize:l==='CÓDIGO'?'0.85rem':'1.25rem', textTransform:'uppercase'}}>{v}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{display:'flex',flexDirection:'column',gap:'1rem'}}>
            <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:'1.25rem',padding:'1.5rem',textAlign:'center'}}>
              <p style={{fontSize:'0.65rem',color:'#64748b',fontWeight:900,textTransform:'uppercase',letterSpacing:'0.15em',marginBottom:'0.75rem'}}>
                LOCALIDADES LIBRES
              </p>
              <p style={{fontSize:'4rem',fontWeight:900,color:'white',lineHeight:1}}>{availableCount}</p>
              <p style={{fontSize:'0.6rem',color:'#475569',marginTop:'0.5rem',fontWeight:900, textTransform:'uppercase'}}>
                FIFO AUTOMÁTICO
              </p>
            </div>
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div style={{display:'flex',flexDirection:'column',gap:'1.25rem'}}>
          <div style={{display:'flex',alignItems:'center',gap:'1rem',flexWrap:'wrap'}}>
            <div style={{display:'flex',alignItems:'center',gap:'0.5rem'}}>
              <label style={{fontSize:'0.75rem',fontWeight:900,color:'#94a3b8', textTransform:'uppercase'}}>FECHA:</label>
              <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
                style={{...inputStyle,width:'auto',padding:'0.5rem 0.75rem',fontSize:'0.85rem'}} />
            </div>
            <button onClick={() => fetchHistory(filterDate)} style={{
              padding:'0.5rem 1.5rem',borderRadius:'0.625rem',background:'rgba(239,68,68,0.1)',
              border:'1px solid rgba(239,68,68,0.2)',color:'#ef4444',cursor:'pointer',
              fontWeight:900,fontSize:'0.75rem'
            }}>
              BUSCAR
            </button>
            {historyData.length > 0 && (
              <button onClick={exportHistory} style={{
                marginLeft:'auto',padding:'0.5rem 1.5rem',borderRadius:'0.625rem',
                background:'rgba(34,197,94,0.1)',border:'1px solid rgba(34,197,94,0.2)',
                color:'#4ade80',cursor:'pointer',fontWeight:900,fontSize:'0.75rem'
              }}>
                EXPORTAR EXCEL
              </button>
            )}
          </div>

          {histLoading ? (
            <div style={{textAlign:'center',padding:'3rem',color:'#475569', fontWeight:900}}>CARGANDO...</div>
          ) : historyData.length === 0 ? (
            <div style={{textAlign:'center',padding:'3rem',color:'#475569',border:'1px dashed rgba(255,255,255,0.07)',borderRadius:'1rem', fontWeight:900, textTransform:'uppercase'}}>
              SIN RECEPCIONES PARA LA FECHA SELECCIONADA.
            </div>
          ) : (
            <div style={{borderRadius:'1rem',border:'1px solid rgba(255,255,255,0.07)',overflow:'hidden'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.8rem'}}>
                <thead>
                   <tr style={{background:'rgba(255,255,255,0.04)'}}>
                    {['FECHA/HORA','CÓDIGO','TALLA','CANT.','OP','PKG ID','FECHA FIFO','UBICACIÓN','RECIBIÓ','ESTADO','ACCIÓN'].map(h => (
                      <th key={h} style={{padding:'0.875rem 1rem',textAlign:'left',color:'#64748b',fontWeight:900,fontSize:'0.65rem',textTransform:'uppercase',letterSpacing:'0.1em'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {historyData.map((r,i)=>(
                    <tr key={r.id} style={{borderTop:'1px solid rgba(255,255,255,0.05)',background:i%2===0?'transparent':'rgba(255,255,255,0.01)'}}>
                      <td style={{padding:'1rem',color:'#64748b',fontSize:'0.7rem'}}>{fmt(r.entry_date)}</td>
                      <td style={{padding:'1rem'}}>
                        <p style={{fontWeight:900,color:'white',fontSize:'0.85rem'}}>{r.code}</p>
                        <p style={{fontSize:'0.65rem',color:'#475569',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.description}</p>
                      </td>
                      <td style={{padding:'1rem',color:'white',fontWeight:700}}>{r.talla}</td>
                      <td style={{padding:'1rem',color:'white',fontWeight:900}}>{r.quantity}</td>
                      <td style={{padding:'1rem',color:'#94a3b8'}}>{r.op || '—'}</td>
                      <td style={{padding:'1rem',color:'#64748b',fontSize:'0.7rem'}}>{r.package_id || '—'}</td>
                      <td style={{padding:'1rem',color:'#64748b',fontSize:'0.7rem'}}>
                        {r.original_entry_date ? new Date(r.original_entry_date).toLocaleDateString('es-MX') : '—'}
                      </td>
                      <td style={{padding:'1rem',color:'#4ade80',fontWeight:700}}>{r.location}</td>
                      <td style={{padding:'1rem',color:'#64748b',fontSize:'0.7rem'}}>{r.received_by || '—'}</td>
                      <td style={{padding:'1rem', textAlign:'center'}}>
                        <span style={{color: r.is_printed ? '#4ade80' : '#f87171', fontWeight:900, fontSize:'0.7rem', display:'block'}}>
                          {r.is_printed ? 'IMPRESA' : 'PENDIENTE'}
                        </span>
                      </td>
                      <td style={{padding:'1rem'}}>
                        <button onClick={() => handlePrint(r.location, r.code, r.description, r.talla, r.quantity, r.op, r.id, r.inventory_id, r.package_id, r.original_entry_date)}
                          style={{
                            background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:'0.5rem',
                            padding:'0.5rem 1rem',cursor:'pointer',color:'white', fontWeight:900, fontSize:'0.65rem'
                          }}>
                          REIMPRIMIR
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
