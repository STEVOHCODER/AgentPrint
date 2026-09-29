@echo off
REM AgentPrint agent installer for Windows (printer PC)
title AgentPrint Agent Setup
cd /d %~dp0
echo.
echo  ============================================
echo   AgentPrint Agent - Windows installer
echo  ============================================
echo.
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [ERROR] Node.js not found. Install LTS from https://nodejs.org then re-run.
  pause
  exit /b 1
)
call npm install
if not exist config.json (
  echo.
  echo  No config.json - launching setup wizard...
  call node setup.js
)
echo.
echo  For DOCX/PPTX/XLSX auto-print, install LibreOffice:
echo  https://www.libreoffice.org/download/download/
echo.
echo  Starting agent...
call npm start
pause
