import jsPDF from 'jspdf'
import 'jspdf-autotable'

export const generateKanbanPDF = (order, lines) => {
  const doc = new jsPDF()
  
  // Header
  doc.setFontSize(20)
  doc.setTextColor(40)
  doc.text('ORDEN DE SURTIDO KANBAN', 105, 15, null, null, 'center')
  
  doc.setFontSize(10)
  doc.setTextColor(100)
  doc.text(`ID Orden: ${order.id}`, 20, 25)
  doc.text(`Fecha: ${new Date(order.created_at).toLocaleString()}`, 20, 30)
  doc.text(`Origen: ${order.warehouse_origin}`, 20, 35)
  doc.text(`Destino: ${order.warehouse_dest}`, 20, 40)
  doc.text(`Estatus: ${order.status}`, 20, 45)

  // Items Table
  const tableRows = lines.map((line, index) => [
    index + 1,
    line.model,
    line.size,
    line.pieces_per_box,
    line.quantity_requested,
    line.quantity_picked || 0,
    line.status || 'PENDIENTE'
  ])

  doc.autoTable({
    startY: 55,
    head: [['#', 'Modelo', 'Talla', 'Pzas/Caja', 'Cajas Solicitadas', 'Surtido', 'Estatus']],
    body: tableRows,
    theme: 'grid',
    headStyles: { fillColor: [16, 185, 129] },
    styles: { fontSize: 9, cellPadding: 3 }
  })

  // Footer for signature / verification
  const finalY = doc.lastAutoTable.finalY + 20
  doc.setDrawColor(200)
  doc.line(20, finalY + 15, 80, finalY + 15)
  doc.text('FIRMA SURTIDOR', 35, finalY + 20)
  
  doc.line(130, finalY + 15, 190, finalY + 15)
  doc.text('FIRMA RECOLECCIÓN', 145, finalY + 20)

  doc.save(`Kanban_Picking_${order.id}.pdf`)
}
