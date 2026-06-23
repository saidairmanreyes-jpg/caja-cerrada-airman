const XLSX = require('xlsx');
const fs = require('fs');

const files = [
    'c:\\Users\\Sistemas\\Downloads\\CAJA CERRADA AIRMAN\\Surtimiento.xls',
    'c:\\Users\\Sistemas\\Downloads\\CAJA CERRADA AIRMAN\\Monitor_de_Operaciones.xlsx'
];

let results = {};

files.forEach(filePath => {
    const fileName = filePath.split('\\').pop();
    results[fileName] = {};
    try {
        const workbook = XLSX.readFile(filePath);
        workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            results[fileName][sheetName] = {
                headers: data[0] || [],
                samples: data.slice(1, 4)
            };
        });
    } catch (e) {
        results[fileName].error = e.message;
    }
});

fs.writeFileSync('excel_inspection_results.json', JSON.stringify(results, null, 2));
console.log('Results written to excel_inspection_results.json');
