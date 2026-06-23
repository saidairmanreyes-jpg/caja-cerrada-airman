import * as XLSX from 'xlsx';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const filePath = 'c:\\Users\\Sistemas\\Downloads\\CAJA CERRADA AIRMAN\\CAJA CERRADA FIN-bak 1.xlsm';

try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = 'BD DESCRIPCION';
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
        console.log('Sheet "BD DESCRIPCION" not found. Available sheets:', workbook.SheetNames);
        process.exit(1);
    }
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    console.log('--- FIRST 20 ROWS ---');
    console.log(JSON.stringify(data.slice(0, 20), null, 2));
} catch (error) {
    console.error('Error reading Excel:', error.message);
}
