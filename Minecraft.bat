@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\bootstrap.ps1" -ClientOnly %*
set "launchExit=%errorlevel%"
if errorlevel 1 (
  echo Minecraft could not start. See .local\native-client\client.log and server.log.
  pause
)
endlocal & exit /b %launchExit%
