import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import JSZip from 'jszip'

/**
 * Genera la instancia jsPDF de la Hoja de Reabastecimiento / Surtido (Picking).
 */
export function generateResupplyPDFDoc(order, lines = []) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  })

  const pageWidth = doc.internal.pageSize.getWidth()

  // Header Banner
  doc.setFillColor(15, 23, 42) // Dark slate
  doc.rect(0, 0, pageWidth, 32, 'F')

  // Red accent line
  doc.setFillColor(239, 68, 68) // Airman red
  doc.rect(0, 32, pageWidth, 2, 'F')

  // Brand / Title
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('AIRMAN WMS - SISTEMA KANBAN PULL', 14, 14)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(203, 213, 225)
  doc.text('HOJA DE REABASTECIMIENTO Y SURTIDO (PICKING DE TRASPASO)', 14, 22)

  // Folio badge on top right
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(239, 68, 68)
  const folioText = `FOLIO: ${order?.folio || 'KAN-TRASP-001'}`
  doc.text(folioText, pageWidth - 14, 18, { align: 'right' })

  // Metadata Card
  doc.setDrawColor(226, 232, 240)
  doc.setFillColor(248, 250, 252)
  doc.roundedRect(14, 40, pageWidth - 28, 30, 2, 2, 'FD')

  doc.setTextColor(51, 65, 85)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('ORIGEN DE SURTIDO:', 18, 48)
  doc.text('DESTINO (SUCURSAL):', 18, 56)
  doc.text('SOLICITANTE:', 18, 64)

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(15, 23, 42)
  doc.text(String(order?.warehouse_origin || 'MATRIZ / PLANTA').toUpperCase(), 60, 48)
  doc.text(String(order?.warehouse_dest || 'CDMX / SUCURSAL').toUpperCase(), 60, 56)
  doc.text(String(order?.created_by || 'SISTEMA AUTOMÁTICO').toUpperCase(), 60, 64)

  doc.setFont('helvetica', 'bold')
  doc.setTextColor(51, 65, 85)
  doc.text('FECHA DE EMISIÓN:', pageWidth / 2 + 10, 48)
  doc.text('ESTATUS DE ORDEN:', pageWidth / 2 + 10, 56)
  doc.text('PRIORIDAD:', pageWidth / 2 + 10, 64)

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(15, 23, 42)
  doc.text(order?.created_at ? new Date(order.created_at).toLocaleString('es-MX') : new Date().toLocaleString('es-MX'), pageWidth / 2 + 50, 48)
  doc.text(String(order?.status || 'POR SURTIR').toUpperCase(), pageWidth / 2 + 50, 56)
  doc.text(String(order?.priority || 'ALTA - REPOSICIÓN PULL').toUpperCase(), pageWidth / 2 + 50, 64)

  // Items Table
  const items = lines.length > 0 ? lines : (order?.lines || [])
  const tableData = items.map((item, idx) => [
    idx + 1,
    item.code || item.product_code || 'N/A',
    item.description || 'PRENDA AIRMAN',
    item.talla || item.size || 'UN',
    item.cajas_solicitadas || item.quantity_requested || item.needed || 1,
    item.pzas_por_caja ? `${item.pzas_por_caja} pzas` : 'Estándar',
    item.assigned_location || 'ÁREA GENERAL',
    '[   ]'
  ])

  autoTable(doc, {
    startY: 76,
    head: [['#', 'CÓDIGO', 'DESCRIPCIÓN', 'TALLA', 'CANTIDAD', 'EMPAQUE', 'UBICACIÓN', 'SURTIDO']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'center'
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [15, 23, 42],
      cellPadding: 2.5
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { halign: 'center', fontStyle: 'bold', cellWidth: 28 },
      2: { cellWidth: 50 },
      3: { halign: 'center', fontStyle: 'bold', cellWidth: 16 },
      4: { halign: 'center', fontStyle: 'bold', textColor: [220, 38, 38], cellWidth: 20 },
      5: { halign: 'center', cellWidth: 20 },
      6: { halign: 'center', cellWidth: 24 },
      7: { halign: 'center', fontStyle: 'bold', cellWidth: 18 }
    },
    margin: { left: 14, right: 14 }
  })

  // Signatures Section
  const finalY = (doc.lastAutoTable ? doc.lastAutoTable.finalY : 120) + 20

  doc.setDrawColor(148, 163, 184)
  doc.setLineWidth(0.5)

  // Signature 1: Surtidor
  doc.line(20, finalY + 12, 70, finalY + 12)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(71, 85, 105)
  doc.text('ALMACENISTA (SURTIDOR)', 45, finalY + 17, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.text('Firma y Fecha de Picking', 45, finalY + 22, { align: 'center' })

  // Signature 2: Auditor / Embarques
  doc.line(pageWidth / 2 - 25, finalY + 12, pageWidth / 2 + 25, finalY + 12)
  doc.setFont('helvetica', 'bold')
  doc.text('AUDITOR / EMBARQUES', pageWidth / 2, finalY + 17, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.text('Validación de Salida', pageWidth / 2, finalY + 22, { align: 'center' })

  // Signature 3: Receptor en Sucursal
  doc.line(pageWidth - 70, finalY + 12, pageWidth - 20, finalY + 12)
  doc.setFont('helvetica', 'bold')
  doc.text('RECEPTOR (SUCURSAL)', pageWidth - 45, finalY + 17, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.text('Firma y Sello de Ingreso', pageWidth - 45, finalY + 22, { align: 'center' })

  // Footer
  doc.setFontSize(7)
  doc.setTextColor(148, 163, 184)
  doc.text('DOCUMENTO DE CONTROL INTERNO AIRMAN - PROCESO KANBAN PULL RESUPPLY', 14, 285)
  doc.text(`Generado: ${new Date().toISOString()}`, pageWidth - 14, 285, { align: 'right' })

  return doc
}

/**
 * Genera y descarga directamente la Hoja de Reabastecimiento / Surtido en PDF.
 */
export function generateResupplyPDF(order, lines = []) {
  const doc = generateResupplyPDFDoc(order, lines)
  const filename = `Reabastecimiento_${order?.warehouse_origin || 'ORIGEN'}_${order?.folio || 'KAN'}.pdf`
  doc.save(filename)
  return filename
}

/**
 * Empaqueta múltiples Hojas de Surtido independientes en un archivo .ZIP descargable.
 * Esencial para Traspasos Multiorigen (ej. MATRIZ + MTY).
 */
export async function generateResupplyZip(ordersList = [], zipTitle = 'Traspasos_Multiorigen') {
  if (!ordersList || ordersList.length === 0) return null

  const zip = new JSZip()
  const dateStamp = new Date().toISOString().slice(0, 10)

  ordersList.forEach((order) => {
    const doc = generateResupplyPDFDoc(order, order.lines || [])
    const pdfArrayBuffer = doc.output('arraybuffer')
    const pdfName = `Picking_${order.warehouse_origin || 'ORIGEN'}_${order.folio || 'KAN'}.pdf`
    zip.file(pdfName, pdfArrayBuffer)
  })

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  const zipFilename = `${zipTitle}_${dateStamp}.zip`

  // Trigger download in browser
  const link = document.createElement('a')
  link.href = URL.createObjectURL(zipBlob)
  link.download = zipFilename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(link.href)

  return zipFilename
}

/**
 * Genera el Borrador u Orden de Compra (OC) oficial para Proveedores de Telas y Avíos en PDF.
 */
export function generatePurchaseOrderPDF(po, supplier = null) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  })

  const pageWidth = doc.internal.pageSize.getWidth()

  // Header Banner
  doc.setFillColor(15, 23, 42) // Slate 900
  doc.rect(0, 0, pageWidth, 32, 'F')

  // Accent line: Cyan for fabrics, Amber for trims, Emerald for general
  const isFabric = po?.supplier_type === 'TELA' || po?.material_type === 'TELA'
  const isTrim = po?.supplier_type === 'AVÍO' || po?.material_type === 'AVÍO'
  if (isFabric) {
    doc.setFillColor(14, 165, 233) // Cyan
  } else if (isTrim) {
    doc.setFillColor(245, 158, 11) // Amber
  } else {
    doc.setFillColor(34, 197, 94) // Green
  }
  doc.rect(0, 32, pageWidth, 2, 'F')

  // Brand / Title
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(15)
  doc.setFont('helvetica', 'bold')
  doc.text('AIRMAN WMS - ORDEN DE COMPRA DE MATERIA PRIMA', 14, 13)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(186, 230, 253)
  doc.text(`SOLICITUD DE ABASTECIMIENTO DE ${isFabric ? 'TELAS' : isTrim ? 'AVÍOS Y FORNITURAS' : 'INSUMOS INDUSTRIALES'} (EXPLOSIÓN BOM)`, 14, 21)

  // Folio Badge
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(isFabric ? 56 : 245, isFabric ? 189 : 158, isFabric ? 248 : 11)
  const folioText = `OC FOLIO: ${po?.folio || 'OC-2026-001'}`
  doc.text(folioText, pageWidth - 14, 17, { align: 'right' })

  // Summary Card: Supplier & Terms Info
  doc.setDrawColor(226, 232, 240)
  doc.setFillColor(248, 250, 252)
  doc.roundedRect(14, 38, pageWidth - 28, 42, 2, 2, 'FD')

  doc.setTextColor(71, 85, 105)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')

  doc.text('PROVEEDOR REGISTRADO:', 18, 46)
  doc.text('TIPO DE PROVEEDOR:', 18, 53)
  doc.text('PERSONA DE CONTACTO:', 18, 60)
  doc.text('TELÉFONO / CORREO:', 18, 67)
  doc.text('UBICACIÓN / DIRECCIÓN:', 18, 74)

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(15, 23, 42)
  doc.text(String(supplier?.name || po?.supplier_name || 'PROVEEDOR INDUSTRIAL').toUpperCase(), 64, 46)
  doc.text(String(supplier?.type || po?.supplier_type || 'PROVEEDOR DE INSUMOS').toUpperCase(), 64, 53)
  doc.text(String(supplier?.contact || po?.supplier_contact || 'ATENCIÓN A VENTAS').toUpperCase(), 64, 60)
  doc.text(String(supplier?.phone || supplier?.email || po?.supplier_phone || 'REGISTRADO EN CATÁLOGO').toUpperCase(), 64, 67)
  doc.text(String(supplier?.address || 'ENTREGA EN ALMACÉN CENTRAL / MATRIZ').toUpperCase(), 64, 74)

  doc.setFont('helvetica', 'bold')
  doc.setTextColor(71, 85, 105)
  doc.text('FECHA DE EMISIÓN:', pageWidth / 2 + 10, 46)
  doc.text('ESTATUS DE OC:', pageWidth / 2 + 10, 53)
  doc.text('LEAD TIME FABRICACIÓN:', pageWidth / 2 + 10, 60)
  doc.text('LEAD TIME LOGÍSTICA:', pageWidth / 2 + 10, 67)
  doc.text('FECHA ENTREGA COMPROMISO:', pageWidth / 2 + 10, 74)

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(15, 23, 42)
  doc.text(po?.created_at ? new Date(po.created_at).toLocaleDateString('es-MX') : new Date().toLocaleDateString('es-MX'), pageWidth / 2 + 58, 46)
  doc.text(String(po?.status || 'BORRADOR').toUpperCase(), pageWidth / 2 + 58, 53)
  doc.text(`${supplier?.lead_time_days || po?.lead_time_days || 5} DÍAS HÁBILES`, pageWidth / 2 + 58, 60)
  doc.text(`${supplier?.logistics_days || po?.logistics_days || 1} DÍAS`, pageWidth / 2 + 58, 67)

  const committedDate = po?.committed_delivery_date || (new Date(Date.now() + ((supplier?.lead_time_days || 5) + (supplier?.logistics_days || 1)) * 86400000).toLocaleDateString('es-MX'))
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(14, 165, 233)
  doc.text(committedDate, pageWidth / 2 + 58, 74)

  // ═══════════════════════════════════════════════════════════════════════════
  // ── SECCIÓN 1: DETALLE DE MATERIALES REQUERIDOS ──
  // ═══════════════════════════════════════════════════════════════════════════
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(15, 23, 42)
  doc.text('1. PARTIDAS DE INSUMOS REQUERIDOS (DETALLE DE SUMINISTRO)', 14, 88)

  const items = po?.items && po.items.length > 0 ? po.items : [{
    code: po?.material_code || 'MAT-001',
    name: po?.material_name || 'INSUMO REQUERIDO',
    type: po?.material_type || 'TELA',
    quantity: po?.quantity_required || po?.quantity || 100,
    unit: po?.unit || 'MTS',
    cost: po?.unit_cost || 0,
    associated_op: po?.associated_op_folio || 'OP-KANBAN',
    notes: po?.notes || 'Abastecimiento automático por explosión de BOM'
  }]

  const tableData = items.map((item, idx) => {
    const qty = Number(item.quantity || item.quantity_required || 0)
    const cost = Number(item.cost || item.unit_cost || 0)
    const total = qty * cost
    return [
      idx + 1,
      item.type || 'INSUMO',
      item.code || 'N/A',
      String(item.name || 'INSUMO').toUpperCase(),
      item.associated_op || po?.associated_op_folio || 'OP CENTRAL',
      `${qty.toLocaleString()} ${item.unit || 'UND'}`,
      cost > 0 ? `$${cost.toFixed(2)}` : 'POR COTIZAR',
      cost > 0 ? `$${total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'POR COTIZAR'
    ]
  })

  autoTable(doc, {
    startY: 92,
    head: [['#', 'TIPO', 'CÓDIGO INSUMO', 'DESCRIPCIÓN DE MATERIA PRIMA', 'ORDEN PROD.', 'CANTIDAD', 'COSTO UNIT.', 'IMPORTE TOTAL']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 7.5,
      fontStyle: 'bold',
      halign: 'center'
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [15, 23, 42],
      cellPadding: 2.5
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      1: { halign: 'center', fontStyle: 'bold', cellWidth: 16 },
      2: { halign: 'center', fontStyle: 'bold', cellWidth: 26 },
      3: { cellWidth: 54 },
      4: { halign: 'center', cellWidth: 24 },
      5: { halign: 'center', fontStyle: 'bold', textColor: [2, 132, 199], cellWidth: 22 },
      6: { halign: 'right', cellWidth: 20 },
      7: { halign: 'right', fontStyle: 'bold', textColor: [22, 163, 74], cellWidth: 22 }
    },
    margin: { left: 14, right: 14 }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // ── INSTRUCCIONES DE ENTREGA Y CALIDAD ──
  // ═══════════════════════════════════════════════════════════════════════════
  const itemsBottom = doc.lastAutoTable ? doc.lastAutoTable.finalY : 160
  const finalY = Math.min(itemsBottom + 8, 225)

  doc.setFillColor(248, 250, 252)
  doc.setDrawColor(203, 213, 225)
  doc.roundedRect(14, finalY, pageWidth - 28, 20, 1, 1, 'FD')

  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 41, 59)
  doc.text('CONDICIONES DE RECEPCIÓN Y ESPECIFICACIONES DE CALIDAD:', 18, finalY + 5.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(71, 85, 105)
  doc.text('• La materia prima debe entregarse con factura/remisión y número de lote claramente rotulado en cada bulto/rollo.', 18, finalY + 10)
  doc.text('• Telas sujetas a inspección de tono, ancho útil y pruebas de encogimiento. Avíos deben venir contados en empaque cerrado.', 18, finalY + 14)
  doc.text('• El tiempo de entrega rige a partir de la fecha de autorización de este documento.', 18, finalY + 17.5)

  // ═══════════════════════════════════════════════════════════════════════════
  // ── SECCIÓN DE FIRMAS ──
  // ═══════════════════════════════════════════════════════════════════════════
  const signY = finalY + 26

  doc.setDrawColor(148, 163, 184)
  doc.setLineWidth(0.5)

  // Signature 1: Compras
  doc.line(20, signY + 10, 70, signY + 10)
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(71, 85, 105)
  doc.text('COMPRAS Y ABASTECIMIENTO', 45, signY + 14, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.text(String(po?.created_by || 'Planeación Central').toUpperCase(), 45, signY + 18, { align: 'center' })

  // Signature 2: Autorización Dirección
  doc.line(pageWidth / 2 - 25, signY + 10, pageWidth / 2 + 25, signY + 10)
  doc.setFont('helvetica', 'bold')
  doc.text('DIRECCIÓN / AUTORIZACIÓN', pageWidth / 2, signY + 14, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.text('Aprobación de Gasto', pageWidth / 2, signY + 18, { align: 'center' })

  // Signature 3: Aceptación Proveedor
  doc.line(pageWidth - 70, signY + 10, pageWidth - 20, signY + 10)
  doc.setFont('helvetica', 'bold')
  doc.text('ACEPTACIÓN DEL PROVEEDOR', pageWidth - 45, signY + 14, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.text(String(supplier?.name || po?.supplier_name || 'Firma / Sello Comercial').toUpperCase(), pageWidth - 45, signY + 18, { align: 'center' })

  // Footer
  doc.setFontSize(6.5)
  doc.setTextColor(148, 163, 184)
  doc.text('DOCUMENTO OFICIAL AIRMAN WMS - SISTEMA KANBAN PULL Y COMPRAS DE MATERIA PRIMA', 14, 287)
  doc.text(`Generado: ${new Date().toLocaleString('es-MX')}`, pageWidth - 14, 287, { align: 'right' })

  const filename = `Orden_Compra_${po?.folio || 'OC'}.pdf`
  doc.save(filename)
  return filename
}

/**
 * Genera la Hoja de Trabajo para Producción / Maquila en PDF.
 * Incluye Matriz Lineal Horizontal de Tallas (estilo ERP), Explosión de Insumos
 * (TELA y AVÍOS), datos de empaque por caja cerrada, taller maquilero, desglose integral de Lead Times y firmas.
 */
export function generateWorkOrderPDF(order, bomBreakdown = [], supplier = null, standards = []) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  })

  const pageWidth = doc.internal.pageSize.getWidth()

  // Header Banner
  doc.setFillColor(15, 23, 42) // Slate 900
  doc.rect(0, 0, pageWidth, 32, 'F')

  doc.setFillColor(2, 132, 199) // Sky blue accent for production
  doc.rect(0, 32, pageWidth, 2, 'F')

  // Brand / Title
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(15)
  doc.setFont('helvetica', 'bold')
  doc.text('AIRMAN WMS - ORDEN DE PRODUCCIÓN INDUSTRIAL', 14, 13)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(186, 230, 253)
  doc.text('HOJA DE TRABAJO, CORRIDA DE TALLAS Y EXPLOSIÓN DE INSUMOS (PULL)', 14, 21)

  // Folio Badge
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(56, 189, 248)
  const folioText = `OP FOLIO: ${order?.folio || order?.id?.slice(0, 10) || 'OP-2026-001'}`
  doc.text(folioText, pageWidth - 14, 17, { align: 'right' })

  // Summary Card: Order & Supplier info
  doc.setDrawColor(226, 232, 240)
  doc.setFillColor(248, 250, 252)
  doc.roundedRect(14, 38, pageWidth - 28, 38, 2, 2, 'FD')

  doc.setTextColor(71, 85, 105)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')

  doc.text('MODELO / CÓDIGO PADRE:', 18, 45)
  doc.text('DESCRIPCIÓN PRENDA:', 18, 52)
  doc.text('GÉNERO / LÍNEA:', 18, 59)
  doc.text('DESTINO (ALMACÉN):', 18, 66)
  doc.text('LEAD TIME INSUMOS:', 18, 73)

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(15, 23, 42)
  doc.text(String(order?.code || 'N/A').toUpperCase(), 62, 45)
  doc.text(String(order?.description || 'PRENDA INDUSTRIAL AIRMAN').toUpperCase(), 62, 52)
  doc.text(String(order?.gender || 'CABALLERO').toUpperCase(), 62, 59)
  doc.text(String(order?.warehouse_dest || 'PLANTA / CEDIS').toUpperCase(), 62, 66)
  doc.text(`${order?.insumos_lead_time_days || 0} DÍAS (ABASTECIMIENTO)`, 62, 73)

  doc.setFont('helvetica', 'bold')
  doc.setTextColor(71, 85, 105)
  doc.text('TALLER / MAQUILERO:', pageWidth / 2 + 5, 45)
  doc.text('# ORDEN ERP (OP):', pageWidth / 2 + 5, 52)
  doc.text('# SALIDA MATERIAL (SM):', pageWidth / 2 + 5, 59)
  doc.text('LEAD TIME CONFECCIÓN:', pageWidth / 2 + 5, 66)
  doc.text('FECHA COMPROMISO FINAL:', pageWidth / 2 + 5, 73)

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(15, 23, 42)
  doc.text(String(supplier?.name || order?.supplier_name || 'TALLER DE CONFECCIÓN').toUpperCase(), pageWidth / 2 + 48, 45)
  doc.text(String(order?.erp_op_number || 'PENDIENTE ERP').toUpperCase(), pageWidth / 2 + 48, 52)
  doc.text(String(order?.erp_sm_number || 'PENDIENTE ERP').toUpperCase(), pageWidth / 2 + 48, 59)
  doc.text(`${order?.supplier_lead_time_days || supplier?.lead_time_days || 7} DÍAS (+${order?.supplier_logistics_days || supplier?.logistics_days || 1}D TRASLADO)`, pageWidth / 2 + 48, 66)
  
  const committedDate = order?.committed_delivery_date || (supplier?.lead_time_days ? new Date(Date.now() + (supplier.lead_time_days + (supplier.logistics_days || 0)) * 86400000).toLocaleDateString('es-MX') : 'POR DEFINIR')
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(2, 132, 199)
  doc.text(committedDate, pageWidth / 2 + 48, 73)

  // ═══════════════════════════════════════════════════════════════════════════
  // ── SECCIÓN 1: MATRIZ LINEAL HORIZONTAL DE TALLAS (ESTILO ERP) ──
  // ═══════════════════════════════════════════════════════════════════════════
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(15, 23, 42)
  doc.text('1. MATRIZ LINEAL DE TALLAS Y ESTÁNDAR DE EMPAQUE (CORRIDA HORIZONTAL)', 14, 82)

  // Determine standard size run
  let sizeRun = []
  const g = String(order?.gender || '').toUpperCase()
  const currentTalla = String(order?.talla || '').toUpperCase()

  if (g.includes('DAMA') || g.includes('MUJER')) {
    sizeRun = ['3', '5', '7', '9', '11', '13', '15', '17']
  } else if (['28', '30', '32', '34', '36', '38', '40', '42', '44'].includes(currentTalla)) {
    sizeRun = ['28', '30', '32', '34', '36', '38', '40', '42', '44']
  } else if (['XC', 'CH', 'M', 'G', 'XG', '2X', '3X', '4X', '5X'].includes(currentTalla)) {
    sizeRun = ['XC', 'CH', 'M', 'G', 'XG', '2X', '3X', '4X', '5X']
  } else {
    sizeRun = ['28', '30', '32', '34', '36', '38', '40', '42', '44']
  }

  if (currentTalla && !sizeRun.includes(currentTalla)) {
    sizeRun.push(currentTalla)
  }

  const totalGarments = Number(order?.quantity || order?.needed || 0)

  // Build matrix rows
  const qtyRow = ['CANTIDAD (PZAS)']
  const stdRow = ['ESTÁNDAR (PZAS/CAJA)']
  const boxRow = ['CAJAS CALCULADAS']

  sizeRun.forEach(sz => {
    // Quantity
    const q = order?.size_quantities?.[sz] !== undefined ? Number(order.size_quantities[sz]) : (currentTalla === sz ? totalGarments : 0)
    qtyRow.push(q > 0 ? String(q) : '0')

    // Standard
    const matchedStd = standards?.find(s => s.code === order?.code && s.talla === sz)
    const stdVal = matchedStd ? matchedStd.pzas_por_caja : (currentTalla === sz && order?.box_standard ? order.box_standard : 0)
    stdRow.push(stdVal > 0 ? `${stdVal}` : '—')

    // Boxes
    if (q > 0 && stdVal > 0) {
      const b = (q / stdVal).toFixed(1)
      boxRow.push(`${b} CJ`)
    } else if (q > 0) {
      boxRow.push('1 PARC.')
    } else {
      boxRow.push('0')
    }
  })

  // Add TOTAL column
  qtyRow.push(`${totalGarments} PZAS`)
  stdRow.push('—')
  const totalBoxes = order?.box_standard ? (totalGarments / order.box_standard).toFixed(1) + ' CJ' : (order?.boxes_count ? `${order.boxes_count} CJ` : '—')
  boxRow.push(totalBoxes)

  autoTable(doc, {
    startY: 85,
    head: [['CONCEPTO / TALLA', ...sizeRun, 'TOTAL']],
    body: [qtyRow, stdRow, boxRow],
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 7.5,
      fontStyle: 'bold',
      halign: 'center'
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [15, 23, 42],
      cellPadding: 2,
      halign: 'center'
    },
    columnStyles: {
      0: { halign: 'left', fontStyle: 'bold', cellWidth: 42, fillColor: [248, 250, 252] },
      [sizeRun.length + 1]: { halign: 'center', fontStyle: 'bold', textColor: [2, 132, 199], cellWidth: 24, fillColor: [240, 249, 255] }
    },
    margin: { left: 14, right: 14 }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // ── SECCIÓN 2: DESGLOSE HORIZONTAL DE INSUMOS Y MATERIALES ──
  // ═══════════════════════════════════════════════════════════════════════════
  const matrixBottom = doc.lastAutoTable ? doc.lastAutoTable.finalY : 110
  const bomStartY = matrixBottom + 8

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(15, 23, 42)
  doc.text(`2. EXPLOSIÓN DE MATERIALES E INSUMOS (TALLA ${currentTalla || 'UN'} | ${totalGarments} PRENDAS)`, 14, bomStartY)

  const materials = bomBreakdown.length > 0 ? bomBreakdown : (order?.bom_breakdown || [])

  const materialsData = materials.map((item, idx) => {
    const unitCons = Number(item.consumption_per_unit || item.consumo_unitario || 1)
    const totalReq = (unitCons * totalGarments).toFixed(2)
    return [
      idx + 1,
      String(item.material_type || item.tipo || 'TELA').toUpperCase(),
      item.material_code || item.codigo_insumo || 'N/A',
      String(item.material_name || item.nombre_insumo || 'INSUMO').toUpperCase(),
      `${unitCons} ${item.unit || item.unidad || 'UND'}`,
      `${totalReq} ${item.unit || item.unidad || 'UND'}`,
      item.notes || 'Estándar',
      '[    ]'
    ]
  })

  autoTable(doc, {
    startY: bomStartY + 3,
    head: [['#', 'TIPO', 'CÓDIGO INSUMO', 'DESCRIPCIÓN DE MATERIA PRIMA', 'CONS. UNIT.', 'TOTAL REQUERIDO', 'NOTAS / ESPEC.', 'SURTIDO']],
    body: materialsData.length > 0 ? materialsData : [
      [1, 'TELA', 'TEL-01', 'TELA BASE PRINCIPAL', '1.20 MTS', `${(1.20 * totalGarments).toFixed(2)} MTS`, 'Corte directo', '[    ]'],
      [2, 'AVÍO', 'BOT-01', 'BOTONES METÁLICOS / PASTA', '6 PZAS', `${6 * totalGarments} PZAS`, 'Bolsa cerrada', '[    ]'],
      [3, 'AVÍO', 'ETI-01', 'ETIQUETA DE MARCA / CUIDADO', '1 PZA', `${1 * totalGarments} PZAS`, 'Costura interna', '[    ]'],
      [4, 'AVÍO', 'HIL-01', 'HILO 40/2 ALTA TENACIDAD', '0.05 CONO', `${(0.05 * totalGarments).toFixed(2)} CONOS`, 'Tono a juego', '[    ]']
    ],
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontSize: 7.5,
      fontStyle: 'bold',
      halign: 'center'
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [15, 23, 42],
      cellPadding: 2
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 7 },
      1: { halign: 'center', fontStyle: 'bold', cellWidth: 15 },
      2: { halign: 'center', fontStyle: 'bold', cellWidth: 25 },
      3: { cellWidth: 52 },
      4: { halign: 'center', cellWidth: 18 },
      5: { halign: 'center', fontStyle: 'bold', textColor: [2, 132, 199], cellWidth: 24 },
      6: { cellWidth: 25 },
      7: { halign: 'center', fontStyle: 'bold', cellWidth: 16 }
    },
    margin: { left: 14, right: 14 }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // ── INSTRUCCIONES TÉCNICAS Y CONTROL DE CALIDAD ──
  // ═══════════════════════════════════════════════════════════════════════════
  const materialsBottom = doc.lastAutoTable ? doc.lastAutoTable.finalY : 175
  const finalY = Math.min(materialsBottom + 8, 235)

  doc.setFillColor(248, 250, 252)
  doc.setDrawColor(203, 213, 225)
  doc.roundedRect(14, finalY, pageWidth - 28, 16, 1, 1, 'FD')

  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 41, 59)
  doc.text('CONTROL DE CALIDAD Y REGLAS DE CONFECCIÓN EN PISO:', 18, finalY + 5.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(71, 85, 105)
  doc.text('• Inspección obligatoria de costuras y tolerancias (+/- 1 cm). Prohibido mezclar rollos de tela sin autorización.', 18, finalY + 10)
  doc.text('• Empacar estrictamente por cajas cerradas identificadas con código, talla y cantidad según esta orden.', 18, finalY + 13.5)

  // ═══════════════════════════════════════════════════════════════════════════
  // ── SECCIÓN DE FIRMAS Y RESPONSABLES ──
  // ═══════════════════════════════════════════════════════════════════════════
  const signY = finalY + 22

  doc.setDrawColor(148, 163, 184)
  doc.setLineWidth(0.5)

  // Signature 1: Entrega Materias Primas
  doc.line(20, signY + 10, 70, signY + 10)
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(71, 85, 105)
  doc.text('ENTREGA MATERIA PRIMA', 45, signY + 14, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.text('Almacén Central', 45, signY + 18, { align: 'center' })

  // Signature 2: Planeación y Autorización
  doc.line(pageWidth / 2 - 25, signY + 10, pageWidth / 2 + 25, signY + 10)
  doc.setFont('helvetica', 'bold')
  doc.text('PLANEACIÓN / AUTORIZADO', pageWidth / 2, signY + 14, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.text(String(order?.created_by || 'Planeación Automática').toUpperCase(), pageWidth / 2, signY + 18, { align: 'center' })

  // Signature 3: Recepción Maquilero
  doc.line(pageWidth - 70, signY + 10, pageWidth - 20, signY + 10)
  doc.setFont('helvetica', 'bold')
  doc.text('RECEPCIÓN MAQUILERO / TALLER', pageWidth - 45, signY + 14, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.text(String(supplier?.name || order?.supplier_name || 'Firma Responsable').toUpperCase(), pageWidth - 45, signY + 18, { align: 'center' })

  // Footer
  doc.setFontSize(6.5)
  doc.setTextColor(148, 163, 184)
  doc.text('DOCUMENTO OFICIAL AIRMAN WMS - SISTEMA KANBAN INDUSTRIAL PULL', 14, 287)
  doc.text(`Generado: ${new Date().toLocaleString('es-MX')}`, pageWidth - 14, 287, { align: 'right' })

  const filename = `Hoja_Trabajo_OP_${order?.folio || 'OP'}.pdf`
  doc.save(filename)
  return filename
}

