import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

/**
 * Genera la Hoja de Reabastecimiento / Surtido (Picking) en PDF.
 * Incluye datos de folio, fecha, almacenes origen y destino, listado de SKUs,
 * cantidades, casillas de verificación física y secciones de firmas.
 */
export function generateResupplyPDF(order, lines = []) {
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

  const filename = `Reabastecimiento_${order?.folio || 'KAN'}.pdf`
  doc.save(filename)
  return filename
}

/**
 * Genera la Hoja de Trabajo para Producción / Maquila en PDF.
 * Incluye Matriz Lineal Horizontal de Tallas (estilo ERP), Explosión de Insumos
 * (TELA y AVÍOS), datos de empaque por caja cerrada, taller maquilero y casillas de control.
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
  doc.roundedRect(14, 38, pageWidth - 28, 36, 2, 2, 'FD')

  doc.setTextColor(71, 85, 105)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')

  doc.text('MODELO / CÓDIGO PADRE:', 18, 45)
  doc.text('DESCRIPCIÓN PRENDA:', 18, 52)
  doc.text('GÉNERO / LÍNEA:', 18, 59)
  doc.text('DESTINO (ALMACÉN):', 18, 66)

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(15, 23, 42)
  doc.text(String(order?.code || 'N/A').toUpperCase(), 62, 45)
  doc.text(String(order?.description || 'PRENDA INDUSTRIAL AIRMAN').toUpperCase(), 62, 52)
  doc.text(String(order?.gender || 'CABALLERO').toUpperCase(), 62, 59)
  doc.text(String(order?.warehouse_dest || 'PLANTA / CEDIS').toUpperCase(), 62, 66)

  doc.setFont('helvetica', 'bold')
  doc.setTextColor(71, 85, 105)
  doc.text('TALLER / MAQUILERO:', pageWidth / 2 + 5, 45)
  doc.text('# ORDEN ERP (OP):', pageWidth / 2 + 5, 52)
  doc.text('# SALIDA MATERIAL (SM):', pageWidth / 2 + 5, 59)
  doc.text('FECHA COMPROMISO:', pageWidth / 2 + 5, 66)

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(15, 23, 42)
  doc.text(String(supplier?.name || order?.supplier_name || 'TALLER DE CONFECCIÓN').toUpperCase(), pageWidth / 2 + 48, 45)
  doc.text(String(order?.erp_op_number || 'PENDIENTE ERP').toUpperCase(), pageWidth / 2 + 48, 52)
  doc.text(String(order?.erp_sm_number || 'PENDIENTE ERP').toUpperCase(), pageWidth / 2 + 48, 59)
  
  const committedDate = order?.committed_delivery_date || (supplier?.lead_time_days ? new Date(Date.now() + (supplier.lead_time_days + (supplier.logistics_days || 0)) * 86400000).toLocaleDateString('es-MX') : 'POR DEFINIR')
  doc.text(committedDate, pageWidth / 2 + 48, 66)

  // ═══════════════════════════════════════════════════════════════════════════
  // ── SECCIÓN 1: MATRIZ LINEAL HORIZONTAL DE TALLAS (ESTILO ERP) ──
  // ═══════════════════════════════════════════════════════════════════════════
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(15, 23, 42)
  doc.text('1. MATRIZ LINEAL DE TALLAS Y ESTÁNDAR DE EMPAQUE (CORRIDA HORIZONTAL)', 14, 80)

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
    startY: 83,
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
