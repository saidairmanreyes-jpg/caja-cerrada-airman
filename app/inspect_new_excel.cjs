const XLSX = require('xlsx');
const fs = require('fs');

const files = [
    'c:\\Users\\Sistemas\\Downloads\\CAJA CERRADA AIRMAN\\Surtimiento.xls',
    'c:\\Users\\Sistemas\\Downloads\\CAJA CERRADA AIRMAN\\Monitor_de_Operaciones.xlsx'
];

files.forEach(filePath => {
    console.log(`\n--- INSPECTING FILE: ${filePath} ---`);
    try {
        if (!fs.existsSync(filePath)) {
            console.error('File not found:', filePath);
            return;
        }
        const workbook = XLSX.readFile(filePath);
        workbook.SheetNames.forEach(sheetName => {
            console.log(`\nSheet Name: ${sheetName}`);
            const worksheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            console.log('Columns (Row 1):', JSON.stringify(data[0]));
            if (data.length > 1) {
                console.log('Sample Data (Row 2):', JSON.stringify(data[1]));
            }
        });
    } catch (error) {
        console.error('Error reading Excel:', error.message);
    }
});
