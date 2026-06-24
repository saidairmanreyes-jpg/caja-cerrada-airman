/**
 * Utility for TSC TTP-244CE Label Printing using TSPL commands.
 * Uses Web Serial API to communicate with the printer via the browser.
 */

export const printLabel = async (data) => {
  const { code, description, talla, quantity, qty, op, location, date, inventory_id, warehouse, package_id } = data;
  const finalQty = quantity !== undefined ? quantity : qty;

  // Generate a 6-digit Package ID if not present
  const pkgId = package_id || Math.floor(100000 + Math.random() * 900000).toString();

  // Format Date for QR (DDMMYY)
  let qrDate = '000000';
  if (date) {
    const d = new Date(date);
    if (!isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = String(d.getFullYear()).substring(2);
      qrDate = `${day}${month}${year}`;
    }
  } else {
    const now = new Date();
    qrDate = `${String(now.getDate()).padStart(2, '0')}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getFullYear()).substring(2)}`;
  }

  // Concatenated String for QR (FIFO Traceability)
  // Format: [Code+Talla:12][Qty:2][OP:var][Date:6][PkgID:6]
  const cleanCode = (code || '').substring(0, 10).padEnd(10, ' ');
  const cleanTalla = (talla || '').substring(0, 2).padEnd(2, ' ');
  const cleanQty = String(finalQty || 0).substring(0, 2).padStart(2, '0');
  const cleanOP = String(op || '0').substring(0, 10).padEnd(10, ' '); // Max 10 for OP to avoid overflow
  
  const qrString = `${cleanCode}${cleanTalla}${cleanQty}${cleanOP}${qrDate}${pkgId}`;

  // TSPL commands for TSC TTP-244CE (4x2 inches)
  const commands = `
SIZE 4.00, 2.00
GAP 0.12, 0.00
DIRECTION 1
CLS
TEXT 400, 20, "ROMAN.TTF", 0, 10, 10, "AIRMAN WMS"
TEXT 780, 20, "ROMAN.TTF", 0, 8, 8, "${date || new Date().toLocaleDateString('es-MX')}"
BARCODE 80, 60, "128", 120, 1, 0, 3, 3, "${code}"
QRCODE 550, 60, M, 7, A, 0, "${qrString}"
TEXT 80, 230, "ROMAN.TTF", 0, 14, 14, "COD: ${code}"
TEXT 80, 290, "ROMAN.TTF", 0, 10, 10, "${(description || '').substring(0, 30)}"
TEXT 80, 400, "ROMAN.TTF", 0, 12, 12, "TALLA: ${talla}"
TEXT 400, 400, "ROMAN.TTF", 0, 12, 12, "CANT: ${finalQty}"
TEXT 80, 460, "ROMAN.TTF", 0, 10, 10, "OP: ${op || 'S/OP'}"
TEXT 420, 460, "ROMAN.TTF", 0, 12, 12, "PKG: ${pkgId}"
TEXT 80, 520, "ROMAN.TTF", 0, 15, 15, "LOC: ${location}"
PRINT 1
`;


  try {
    const port = await connectPrinter();
    if (!port) return { success: false, error: 'No se pudo conectar a la impresora.' };

    const encoder = new TextEncoder();
    const writer = port.writable.getWriter();
    await writer.write(encoder.encode(commands));
    
    writer.releaseLock();
    // We don't close the port here to allow faster subsequent prints if needed, 
    // but in batch we manage it carefully.
    return { success: true };
  } catch (error) {
    console.error('Label printing error (Web Serial):', error);
    return { success: false, error: error.message };
  }
};

/**
 * Connects to the serial printer and returns the port.
 * Reuses existing port if available.
 */
let sharedPort = null;
export const connectPrinter = async () => {
  try {
    if (sharedPort && sharedPort.readable && sharedPort.writable) {
      return sharedPort;
    }

    const ports = await navigator.serial.getPorts();
    let port = ports[0];

    if (!port) {
      port = await navigator.serial.requestPort();
    }

    if (!port.readable || !port.writable) {
      await port.open({ baudRate: 9600 });
    }

    sharedPort = port;
    return port;
  } catch (err) {
    console.error('Error connecting to printer:', err);
    return null;
  }
};

/**
 * Prints a batch of labels efficiently.
 */
export const printLabelsBatch = async (items, onProgress) => {
  try {
    const port = await connectPrinter();
    if (!port) return { success: false, error: 'No se pudo conectar a la impresora.' };

    const encoder = new TextEncoder();
    const writer = port.writable.getWriter();

    for (let i = 0; i < items.length; i++) {
      const data = items[i];
      const pkgId = data.package_id || Math.floor(100000 + Math.random() * 900000).toString();
      
      // FIFO Date formatting
      let qrDate = '000000';
      const d = data.date ? new Date(data.date) : new Date();
      if (!isNaN(d.getTime())) {
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = String(d.getFullYear()).substring(2);
        qrDate = `${day}${month}${year}`;
      }

      const cleanCode = (data.code || '').substring(0, 10).padEnd(10, ' ');
      const cleanTalla = (data.talla || '').substring(0, 2).padEnd(2, ' ');
      const cleanQty = String(data.quantity !== undefined ? data.quantity : (data.qty || 0)).substring(0, 2).padStart(2, '0');
      const cleanOP = String(data.op || '0').substring(0, 10).padEnd(10, ' ');
      
      const qrString = `${cleanCode}${cleanTalla}${cleanQty}${cleanOP}${qrDate}${pkgId}`;

      const commands = `
SIZE 4.00, 2.00
GAP 0.12, 0.00
DIRECTION 1
CLS
TEXT 400, 20, "ROMAN.TTF", 0, 10, 10, "AIRMAN WMS"
TEXT 780, 20, "ROMAN.TTF", 0, 8, 8, "${new Date().toLocaleDateString('es-MX')}"
BARCODE 80, 60, "128", 120, 1, 0, 3, 3, "${data.code}"
QRCODE 550, 60, M, 7, A, 0, "${qrString}"
TEXT 80, 230, "ROMAN.TTF", 0, 14, 14, "COD: ${data.code}"
TEXT 80, 290, "ROMAN.TTF", 0, 10, 10, "${(data.description || '').substring(0, 30)}"
TEXT 80, 400, "ROMAN.TTF", 0, 12, 12, "TALLA: ${data.talla}"
TEXT 400, 400, "ROMAN.TTF", 0, 12, 12, "CANT: ${data.quantity !== undefined ? data.quantity : data.qty}"
TEXT 80, 460, "ROMAN.TTF", 0, 10, 10, "OP: ${data.op || 'S/OP'}"
TEXT 420, 460, "ROMAN.TTF", 0, 12, 12, "PKG: ${pkgId}"
TEXT 80, 520, "ROMAN.TTF", 0, 15, 15, "LOC: ${data.location}"
PRINT 1
`;
      await writer.write(encoder.encode(commands));
      
      if (onProgress) onProgress(Math.round(((i + 1) / items.length) * 100));
      
      // Delay for printer buffer
      await new Promise(r => setTimeout(r, 600));
    }

    writer.releaseLock();
    return { success: true };
  } catch (error) {
    console.error('Batch printing error:', error);
    return { success: false, error: error.message };
  }
};
