#Requires -Version 5.1
$ErrorActionPreference = "Stop"

$Root = $PSScriptRoot
$Tizen = if ($env:TIZEN_CLI) { $env:TIZEN_CLI } else { "C:\tizen-studio\tools\ide\bin\tizen.bat" }
$Profile = if ($env:TIZEN_CERT_PROFILE) { $env:TIZEN_CERT_PROFILE } else { "spinstage" }

if (-not (Test-Path $Tizen)) {
    throw "tizen.bat not found at $Tizen — set TIZEN_CLI to your tizen.bat path"
}

Set-Location $Root
$BuildResult = Join-Path $Root ".buildResult"

Write-Host "==> inject defaults (optional)"
& npm run inject:defaults

Write-Host "==> build-web"
& $Tizen build-web -- $Root
if ($LASTEXITCODE -ne 0) {
    if (Test-Path (Join-Path $BuildResult "config.xml")) {
        Write-Warning "build-web failed (known Tizen Studio 6.1.x CLI bug). Continuing with existing .buildResult."
    } else {
        exit $LASTEXITCODE
    }
}

if (-not (Test-Path $BuildResult)) {
    throw "Missing .buildResult — build-web failed?"
}

Write-Host "==> package + sign ($Profile)"
& $Tizen package -t wgt -s $Profile -- $BuildResult
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$Wgt = Get-ChildItem -Path $BuildResult -Filter "*.wgt" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($Wgt) {
    Write-Host ""
    Write-Host "Signed WGT: $($Wgt.FullName)"
} else {
    Write-Host "Package finished — check $BuildResult for *.wgt"
}
