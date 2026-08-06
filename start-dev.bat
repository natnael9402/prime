@echo off
title KeyVault Store Launcher
set "PATH=C:\Program Files\nodejs;%PATH%"

echo ============================================
echo   KeyVault Store - starting the full stack
echo ============================================
echo.

REM --- 1. Cloudflare named tunnel (permanent URLs) ---
echo   [1/4] Cloudflare tunnel  (shop + kv-api .careerlyft.ai)
start "KV Tunnel" /min cmd /k "cd /d C:\Users\natna\Downloads\store\tools && cloudflared.exe tunnel run keyvault"
timeout /t 3 /nobreak >nul

REM --- 2. Backend API (NestJS, watch mode) ---
echo   [2/4] Backend API        http://localhost:5000
start "KV Backend   :5000" cmd /k "cd /d C:\Users\natna\Downloads\store\backend && npm run start:dev"
timeout /t 3 /nobreak >nul

REM --- 3. Storefront (PRODUCTION - fast in the Telegram mini app) ---
if not exist "C:\Users\natna\Downloads\store\frontend\.next\BUILD_ID" (
  echo   [3/4] Storefront       building production bundle first...
  cd /d C:\Users\natna\Downloads\store\frontend
  call npm run build
  if errorlevel 1 (
    echo.
    echo   BUILD FAILED - fix the error above, then run this file again.
    pause
    exit /b 1
  )
)
echo   [3/4] Storefront (prod)  https://shop.careerlyft.ai
start "KV Storefront:3000" cmd /k "cd /d C:\Users\natna\Downloads\store\frontend && npm run start"

REM --- 4. Admin panel ---
echo   [4/4] Admin panel        http://localhost:3001
start "KV Admin     :3001" cmd /k "cd /d C:\Users\natna\Downloads\store\admin && npm run dev"

echo.
echo ============================================
echo   Bot        : @primestoret_bot (polling starts with backend)
echo   Storefront : https://shop.careerlyft.ai
echo   API        : https://kv-api.careerlyft.ai
echo ============================================
echo.
echo   NOTE: the storefront runs the PRODUCTION build.
echo   After editing frontend code, run "npm run build" in
echo   the frontend folder, then restart the KV Storefront window.
echo.
echo Close the four server windows to stop everything.
pause
