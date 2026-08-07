@echo off
title KeyVault Store Launcher
set "PATH=C:\Program Files\nodejs;%PATH%"

echo ============================================
echo   KeyVault Store - starting the full stack
echo ============================================
echo.

REM --- 1. Backend API (NestJS, watch mode) ---
echo   [1/3] Backend API        http://localhost:5000
start "KV Backend   :5000" cmd /k "cd /d C:\Users\natna\Downloads\store\backend && npm run start:dev"
timeout /t 3 /nobreak >nul

REM --- 2. Storefront (PRODUCTION - fast in the Telegram mini app) ---
if not exist "C:\Users\natna\Downloads\store\frontend\.next\BUILD_ID" (
  echo   [2/3] Storefront       building production bundle first...
  cd /d C:\Users\natna\Downloads\store\frontend
  call npm run build
  if errorlevel 1 (
    echo.
    echo   BUILD FAILED - fix the error above, then run this file again.
    pause
    exit /b 1
  )
)
echo   [2/3] Storefront (prod)  http://localhost:3000
start "KV Storefront:3000" cmd /k "cd /d C:\Users\natna\Downloads\store\frontend && npm run start"

REM --- 3. Admin panel ---
echo   [3/3] Admin panel        http://localhost:3001
start "KV Admin     :3001" cmd /k "cd /d C:\Users\natna\Downloads\store\admin && npm run dev"

echo.
echo ============================================
echo   Bot        : @primestoret_bot (polling starts with backend)
echo   Storefront : http://localhost:3000
echo   API        : http://localhost:5000
echo   Admin      : http://localhost:3001
echo ============================================
echo.
echo   NOTE: the storefront runs the PRODUCTION build.
echo   After editing frontend code, run "npm run build" in
echo   the frontend folder, then restart the KV Storefront window.
echo.
echo Close the three server windows to stop everything.
pause
