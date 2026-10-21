@echo off
rem Jalankan satu kali setelah boot untuk menyiapkan dasbor Gakkum.
rem Urutan: (1) backend elevated + UAC, (2) monitor_agent, (3) dasbor Next.js.
cd /d "%~dp0"

echo.
echo [1/3] Menjalankan backend (akan diminta klik Yes pada UAC)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','%~dp0backend\restart_elevated.ps1'"

echo.
echo [2/3] Menjalankan monitor_agent di jendela terpisah...
start "gakkum_monitor_agent" cmd /k "cd /d %~dp0scripts\monitor_agent && python monitor_agent.py"

echo.
echo [3/3] Menjalankan dasbor Next.js di jendela ini...
npm run dev
