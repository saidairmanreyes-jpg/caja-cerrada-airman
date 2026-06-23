
$excelFile = "c:\Users\Sistemas\Downloads\CAJA CERRADA AIRMAN\VENTAS POR SEMANA.xlsx"
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

try {
    $wb = $excel.Workbooks.Open($excelFile)
    $ws = $wb.Sheets.Item(1)
    $output = "--- VENTAS POR SEMANA Structure ---`r`n"
    
    # Read headers (Row 1-5, cols 1-15)
    for($r=1; $r -le 10; $r++) {
        $cols = @()
        for($c=1; $c -le 15; $c++) {
            $v = $ws.Cells.Item($r, $c).Value2
            $cols += [string]$v
        }
        $output += ($cols -join " | ") + "`r`n"
    }
    
    $output | Out-File "c:\Users\Sistemas\Downloads\CAJA CERRADA AIRMAN\sales_analysis.txt"
    $wb.Close($false)
} finally {
    $excel.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
}
