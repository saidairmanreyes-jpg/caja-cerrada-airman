/**
 * Utility for TSC TTP-244CE Label Printing using TSPL commands.
 * Uses Web Serial API to communicate with the printer via the browser.
 */

export const printLabel = async (data) => {
  const { code, description, talla, quantity, qty, op, location, date, cliente, proceso, proveedor, section, isExternalProcess } = data;
  const finalQty = quantity !== undefined ? quantity : qty;

  let commands = '';

  if (isExternalProcess || cliente) {
    // TSPL commands for External Process Label (4.00 x 2.00 inches)
    commands = `
SIZE 4.00, 2.00
GAP 0.12, 0.00
DIRECTION 1
CLS
TEXT 40, 20, "ROMAN.TTF", 0, 10, 10, "AIRMAN WMS - PROCESO EXTERNO (${section || 'MAQUILA'})"
TEXT 620, 20, "ROMAN.TTF", 0, 8, 8, "${date || new Date().toLocaleDateString('es-MX')}"
QRCODE 530, 50, M, 6, A, 0, "${code}"
TEXT 40, 55, "ROMAN.TTF", 0, 12, 12, "PEDIDO: #${op}"
TEXT 260, 55, "ROMAN.TTF", 0, 12, 12, "CANT: ${finalQty} PZ"
TEXT 40, 100, "ROMAN.TTF", 0, 10, 10, "CLIENTE: ${(cliente || '').substring(0, 26).toUpperCase()}"
TEXT 40, 140, "ROMAN.TTF", 0, 10, 10, "PROCESO: ${(proceso || description || '').substring(0, 26).toUpperCase()}"
TEXT 40, 180, "ROMAN.TTF", 0, 10, 10, "PROVEEDOR: ${(proveedor || location || '').substring(0, 26).toUpperCase()}"
TEXT 510, 230, "ROMAN.TTF", 0, 8, 8, "${code}"
PRINT 1
`;
  } else {
    // Standard Inventory TSPL commands
    const pkgId = data.package_id || Math.floor(100000 + Math.random() * 900000).toString();
    const cleanCode = (code || '').substring(0, 10).padEnd(10, ' ');
    const cleanTalla = (talla || '').substring(0, 2).padEnd(2, ' ');
    const cleanQty = String(finalQty || 0).substring(0, 2).padStart(2, '0');
    const cleanOP = String(op || '0').substring(0, 10).padEnd(10, ' ');
    let qrDate = '000000';
    const d = date ? new Date(date) : new Date();
    if (!isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = String(d.getFullYear()).substring(2);
      qrDate = `${day}${month}${year}`;
    }
    const fullQrString = `${cleanCode}${cleanTalla}${cleanQty}${cleanOP}${qrDate}${pkgId}`;

    commands = `
SIZE 4.00, 2.00
GAP 0.12, 0.00
DIRECTION 1
CLS
TEXT 400, 20, "ROMAN.TTF", 0, 10, 10, "AIRMAN WMS"
TEXT 780, 20, "ROMAN.TTF", 0, 8, 8, "${date || new Date().toLocaleDateString('es-MX')}"
BARCODE 80, 60, "128", 120, 1, 0, 3, 3, "${code}"
QRCODE 550, 60, M, 7, A, 0, "${fullQrString}"
TEXT 80, 230, "ROMAN.TTF", 0, 14, 14, "COD: ${code}"
TEXT 80, 290, "ROMAN.TTF", 0, 10, 10, "${(description || '').substring(0, 30)}"
TEXT 80, 400, "ROMAN.TTF", 0, 12, 12, "TALLA: ${talla}"
TEXT 400, 400, "ROMAN.TTF", 0, 12, 12, "CANT: ${finalQty}"
TEXT 80, 460, "ROMAN.TTF", 0, 10, 10, "OP: ${op || 'S/OP'}"
TEXT 420, 460, "ROMAN.TTF", 0, 12, 12, "PKG: ${pkgId}"
TEXT 80, 520, "ROMAN.TTF", 0, 15, 15, "LOC: ${location}"
PRINT 1
`;
  }

  try {
    const port = await connectPrinter();
    if (!port) return { success: false, error: 'No se pudo conectar a la impresora.' };

    const encoder = new TextEncoder();
    const writer = port.writable.getWriter();
    await writer.write(encoder.encode(commands));
    
    writer.releaseLock();
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
export const connectPrinter = async (forceRequest = false) => {
  if (!('serial' in navigator)) {
    console.warn('Web Serial API no soportada en este navegador.');
    return null;
  }

  try {
    if (!forceRequest && sharedPort && sharedPort.readable && sharedPort.writable) {
      return sharedPort;
    }

    let port = null;

    if (!forceRequest) {
      const ports = await navigator.serial.getPorts();
      if (ports.length > 0) {
        port = ports[0];
      }
    }

    if (!port || forceRequest) {
      port = await navigator.serial.requestPort();
    }

    if (port) {
      try {
        if (!port.readable || !port.writable) {
          await port.open({ baudRate: 9600 });
        }
        sharedPort = port;
        return port;
      } catch (openErr) {
        console.warn('No se pudo abrir el puerto cacheado, solicitando selección de nuevo puerto...', openErr);
        port = await navigator.serial.requestPort();
        if (!port.readable || !port.writable) {
          await port.open({ baudRate: 9600 });
        }
        sharedPort = port;
        return port;
      }
    }

    return null;
  } catch (err) {
    console.error('Error al conectar con la impresora:', err);
    sharedPort = null;
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
