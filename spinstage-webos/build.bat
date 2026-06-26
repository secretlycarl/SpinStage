@echo off
cd /d "%~dp0"
python scripts\ensure_user_settings.py
if errorlevel 1 exit /b 1
call npm run package
pause
