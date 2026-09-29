@echo off
REM Start backend + agent together for local demo
title AgentPrint - local demo
cd /d %~dp0
start "AgentPrint backend :3000" cmd /k "npm --prefix backend start"
timeout /t 3 >nul
start "AgentPrint agent dashboard :39500" cmd /k "npm --prefix agent start"
echo Backend:  http://localhost:3000
echo Agent UI: http://localhost:39500
pause
