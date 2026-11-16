@echo off
cd /d "%~dp0"
echo ==================================================
echo   Meihua Xiantian Qigua - Demo Server
echo   URL:  http://127.0.0.1:8642/web/index.html
echo   Close this window or press Ctrl+C to stop.
echo ==================================================
node tools\serve.mjs --open
pause
