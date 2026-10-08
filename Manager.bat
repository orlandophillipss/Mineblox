@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\bootstrap.ps1" -Manager %*
set "launchExit=%errorlevel%"
if errorlevel 1 pause
endlocal & exit /b %launchExit%
