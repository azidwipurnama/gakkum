# Dijalankan elevated (UAC) untuk me-restart backend Gakkum dengan kode terbaru.
$ErrorActionPreference = 'SilentlyContinue'

# Matikan backend lama (proses elevated yang tidak bisa dibunuh dari shell biasa)
Get-CimInstance Win32_Process -Filter "Name='python.exe'" | Where-Object {
    $_.CommandLine -like '*main.py*'
} | ForEach-Object { Write-Host ("Killing " + $_.ProcessId); Stop-Process -Id $_.ProcessId -Force }

Start-Sleep -Seconds 1

# Bersihkan log lama
Remove-Item 'D:\programmingProject\vscode\laragon\www\gakkum\backend\server.log' -Force
Remove-Item 'D:\programmingProject\vscode\laragon\www\gakkum\backend\server.err' -Force

# Jalankan backend baru (tetap elevated supaya passive sniff scapy tetap jalan)
Start-Process -FilePath 'D:\programmingProject\vscode\laragon\www\gakkum\backend\venv\Scripts\python.exe' `
    -ArgumentList '-u', 'main.py' `
    -WorkingDirectory 'D:\programmingProject\vscode\laragon\www\gakkum\backend' `
    -RedirectStandardOutput 'D:\programmingProject\vscode\laragon\www\gakkum\backend\server.log' `
    -RedirectStandardError 'D:\programmingProject\vscode\laragon\www\gakkum\backend\server.err' `
    -WindowStyle Hidden
