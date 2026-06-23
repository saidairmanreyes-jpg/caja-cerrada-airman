
$excelFile = "c:\Users\Sistemas\Downloads\CAJA CERRADA AIRMAN\CAJA CERRADA FIN-bak 1.xlsm"
$outputDir = "c:\Users\Sistemas\Downloads\CAJA CERRADA AIRMAN\extracted_vba"

if (!(Test-Path $outputDir)) { New-Item -ItemType Directory -Path $outputDir }

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

try {
    $wb = $excel.Workbooks.Open($excelFile)
    
    # List Sheets
    Write-Output "--- SHEETS ---"
    foreach($sheet in $wb.Sheets) {
        Write-Output $sheet.Name
    }

    # Attempt VBA Export (Requires Trust Access to VBA Project)
    Write-Output "--- VBA COMPONENTS ---"
    try {
        $vbaProject = $wb.VBProject
        foreach($component in $vbaProject.VBComponents) {
            $name = $component.Name
            $type = $component.Type # 1=Module, 2=Class, 3=Form, 100=Sheet/Workbook
            Write-Output "Exporting: $name (Type: $type)"
            $ext = ".txt"
            if ($type -eq 1) { $ext = ".bas" }
            elseif ($type -eq 2) { $ext = ".cls" }
            elseif ($type -eq 3) { $ext = ".frm" }
            
            $targetPath = Join-Path $outputDir "$name$ext"
            $component.Export($targetPath)
        }
    } catch {
        Write-Output "Could not access VBA project. 'Trust access to the VBA project object model' might be disabled."
        Write-Output $_.Exception.Message
    }

    $wb.Close($false)
} finally {
    $excel.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
}
