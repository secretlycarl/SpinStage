Set-Location $PSScriptRoot
python scripts\ensure_user_settings.py
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run build:debug
Read-Host "Press Enter to close"
