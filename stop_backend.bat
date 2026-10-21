@echo off
rem Hentikan backend Gakkum (main.py) saja, tanpa menghentikan dasbor/agent.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','%~dp0backend\stop_backend.ps1'"
pause
