@echo off
REM AgentPrint local backend — visible console (LAN-only mode)
title AgentPrint Backend (http://localhost:3000)
cd /d "%~dp0"
"node.exe" "server\server.js"
pause
