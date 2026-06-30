@echo off
REM Copy to build-install.bat and fill in the SET values below.
setlocal EnableExtensions

set "PROJECT_DIR=C:\path\to\spinstage-tizen-beta"
set "TIZEN_CLI=C:\tizen-studio\tools\ide\bin\tizen.bat"
set "SDB_DIR=C:\tizen-studio\tools"
set "SDB=%SDB_DIR%\sdb.exe"
set "CERT_PROFILE=spinstage"
set "TV_IP=192.168.1.187"
set "TV_SDB_PORT=26101"
set "TV_DEVICE_ID=YOUR_DEVICE_ID_FROM_SDB_DEVICES"

cd /d "%PROJECT_DIR%" || exit /b 1

echo ==^> build-web
call "%TIZEN_CLI%" build-web -- "%PROJECT_DIR%"
if errorlevel 1 (
  if exist "%PROJECT_DIR%\.buildResult\config.xml" (
    echo WARNING: build-web failed ^(known Tizen Studio 6.1.x CLI bug^). Using existing .buildResult.
  ) else (
    echo ERROR: build-web failed and no .buildResult found. Build once from Tizen IDE or fix CLI, then retry.
    exit /b 1
  )
)

echo ==^> package + sign
call "%TIZEN_CLI%" package -t wgt -s %CERT_PROFILE% -- "%PROJECT_DIR%\.buildResult"
if errorlevel 1 exit /b 1

echo ==^> sdb connect
cd /d "%SDB_DIR%" || exit /b 1
call "%SDB%" connect %TV_IP%:%TV_SDB_PORT%

echo ==^> sdb devices  (confirm TV_DEVICE_ID matches -t below)
call "%SDB%" devices

echo ==^> install
call "%TIZEN_CLI%" install -n "%PROJECT_DIR%\.buildResult\SpinStage.wgt" -t %TV_DEVICE_ID%
exit /b %errorlevel%
