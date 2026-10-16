@echo off
chcp 65001 > nul
REM Abre o leitor para o celular na mesma rede Wi-Fi deste PC.
cd /d "%~dp0.."

where node > nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERRO] Node.js não encontrado. Baixe em https://nodejs.org/
    pause
    exit /b 1
)

echo.
echo  =============================================
echo   FZA Leitor PGN - teste no celular
echo  =============================================
echo.
echo  1. Celular e PC precisam estar no mesmo Wi-Fi.
echo  2. No Chrome do celular, abra um destes endereços:
echo.
powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | ForEach-Object { '       http://' + $_.IPAddress + ':8765' }"
echo.
echo  3. Se o Windows perguntar sobre o firewall, permita em "Redes privadas".
echo.
node "%~dp0servidor.mjs" 8765 "%cd%" 0.0.0.0
pause
