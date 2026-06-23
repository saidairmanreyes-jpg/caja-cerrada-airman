$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
try {
    $workbook = $excel.Workbooks.Open('c:\Users\Sistemas\Downloads\CAJA CERRADA AIRMAN\CAJA CERRADA FIN-bak 1.xlsm')
    $sheet = $workbook.Sheets.Item('BD DESCRIPCION')
    $usedRange = $sheet.UsedRange
    $rowCount = $usedRange.Rows.Count
    
    $products = @()
    for ($i = 2; $i -le $rowCount; $i++) {
        $code = $sheet.Cells.Item($i, 1).Value2
        $desc = $sheet.Cells.Item($i, 2).Value2
        if ($code -and $desc) {
            $products += @{ code = $code.ToString().ToUpper().Trim(); description = $desc.ToString().Trim() }
        }
    }
    $products | ConvertTo-Json
} finally {
    if ($workbook) { $workbook.Close($false) }
    $excel.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
}
