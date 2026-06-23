
$excelFile = "c:\Users\Sistemas\Downloads\CAJA CERRADA AIRMAN\CAJA CERRADA FIN-bak 1.xlsm"
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

try {
    $wb = $excel.Workbooks.Open($excelFile)
    $sheets = @('STORLOC', 'BD DESCRIPCION', 'SURTIDO', 'VACIAS')

    foreach($sn in $sheets) {
        $ws = $wb.Sheets.Item($sn)
        Write-Output "`n--- $sn ---"
        for($r=1; $r -le 30; $r++) {
            $rowValues = @()
            for($c=1; $c -le 10; $c++) {
                $v = $ws.Cells.Item($r,$c).Text
                $rowValues += $v
            }
            Write-Output ($rowValues -join "`t")
        }
    }
    $wb.Close($false)
} finally {
    $excel.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
}
