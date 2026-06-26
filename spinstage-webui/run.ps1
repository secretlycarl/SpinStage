Set-Location $PSScriptRoot
python scripts\ensure_user_settings.py
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
python server.py @args
Read-Host "Press Enter to close"
