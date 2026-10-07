@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\bootstrap.ps1" %*
if errorlevel 1 (
  echo Mineblox could not start. See the message above and .local\logs.
  pause
)
endlocal
