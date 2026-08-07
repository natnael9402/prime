#!/usr/bin/env bash
set -euo pipefail
IP="187.127.92.55"
BASE="${IP}.sslip.io"
API="api.${BASE}"
ADMIN="admin.${BASE}"
STORE="${BASE}"
APP=/opt/keyvault

echo "==> Extract fresh code"
mkdir -p "$APP"
tar xzf /tmp/keyvault-src.tgz -C "$APP"
cp /tmp/keyvault-real.env "$APP/backend/.env"

echo "==> Fix .env URLs for this server"
cd "$APP/backend"
sed -i \
  -e "s|^PORT=.*|PORT=5000|" \
  -e "s|^FRONTEND_URL=.*|FRONTEND_URL=\"http://${STORE}\"|" \
  -e "s|^TELEGRAM_WEBAPP_URL=.*|TELEGRAM_WEBAPP_URL=\"http://${STORE}\"|" \
  -e "s|^BACKEND_PUBLIC_URL=.*|BACKEND_PUBLIC_URL=\"http://${API}\"|" \
  .env
grep -q '^NODE_ENV=' .env || echo 'NODE_ENV=production' >> .env

echo "==> Reuse existing Postgres password (keeps existing volume valid)"
PG_PASS="$(grep '^DATABASE_URL=' .env | sed -E 's|.*keyvault:([^@]+)@.*|\1|' | tr -d '"')"
if [ -z "$PG_PASS" ] || [ "$PG_PASS" = "change_me_now" ]; then PG_PASS="$(openssl rand -hex 16)"; fi
echo "PG password length: ${#PG_PASS}"

echo "==> Stop PM2 apps (Docker takes over now)"
pm2 delete all 2>/dev/null || true
pm2 save --force 2>/dev/null || true

echo "==> Docker compose build + up (this takes a few minutes)"
cd "$APP"
POSTGRES_PASSWORD="$PG_PASS" PUBLIC_API_URL="http://${API}" docker compose up -d --build

echo "==> Wait for containers"
sleep 15
docker compose ps
echo "==> Smoke tests"
curl -s -o /dev/null -w "api(5000): %{http_code}\n" http://127.0.0.1:5000/products || true
curl -s -o /dev/null -w "web(3000): %{http_code}\n" http://127.0.0.1:3000/ || true
curl -s -o /dev/null -w "admin(3001): %{http_code}\n" http://127.0.0.1:3001/ || true
echo "==> DOCKER DEPLOY DONE"
