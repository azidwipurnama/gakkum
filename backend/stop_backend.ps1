# Mematikan backend Gakkum (main.py) yang berjalan, termasuk yang elevated.
$ErrorActionPreference = 'SilentlyContinue'

$killed = 0
Get-CimInstance Win32_Process -Filter "Name='python.exe'" | Where-Object {
    $_.CommandLine -like '*main.py*'
} | ForEach-Object {
    Write-Host ("Menghentikan main.py PID " + $_.ProcessId)
    Stop-Process -Id $_.ProcessId -Force
    $killed++
}

if ($killed -eq 0) {
    Write-Host "Backend tidak sedang berjalan."
} else {
    Write-Host "Backend dihentikan."
}
