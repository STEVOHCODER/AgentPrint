@echo off
REM AgentPrint Agent — visible console (for first run / troubleshooting)
title AgentPrint Agent
cd /d "%~dp0"
if not exist "agent\config.json" (
  echo.
  echo  No config found - starting setup wizard...
  echo.
  "node.exe" "agent\setup.js"
  if errorlevel 1 pause & exit /b 1
)
"node.exe" "agent\agent.js"
pause
