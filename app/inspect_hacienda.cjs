const XLSX = require('xlsx');
const filePath = 'c:\\Users\\Sistemas\\Downloads\\CAJA CERRADA AIRMAN\\Hacienda Req 2.0.xlsm';
try {
    const workbook = XLSX.readFile(filePath);
    workbook.SheetNames.forEach(sheetName => {
        console.log(`\nSHEET: ${sheetName}`);
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        if (data.length > 0) {
            console.log('HEADERS:', data[0].join(' | '));
            for(let i=1; i < Math.min(data.length, 10); i++) {
                console.log(`ROW ${i}:`, data[i].join(' | '));
            }
        } else {
            console.log('EMPTY SHEET');
        }
    });
} catch (e) {
    console.error(`ERROR: ${e.message}`);
}
