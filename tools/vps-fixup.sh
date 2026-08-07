#!/usr/bin/env bash
set -euo pipefail
IP="187.127.92.55"
BASE="${IP}.sslip.io"
API="api.${BASE}"
ADMIN="admin.${BASE}"
STORE="${BASE}"
APP=/opt/keyvault

echo "==> Fix backend .env URLs"
cd "$APP/backend"
sed -i \
  -e "s|^PORT=.*|PORT=5000|" \
  -e "s|^FRONTEND_URL=.*|FRONTEND_URL=\"http://${STORE}\"|" \
  -e "s|^TELEGRAM_WEBAPP_URL=.*|TELEGRAM_WEBAPP_URL=\"http://${STORE}\"|" \
  -e "s|^BACKEND_PUBLIC_URL=.*|BACKEND_PUBLIC_URL=\"http://${API}\"|" \
  .env
ls -la dist/main.js

echo "==> Store frontend: env + rebuild"
cd "$APP/frontend"
cat > .env.production <<EOF
NEXT_PUBLIC_API_URL=http://${API}
NEXT_PUBLIC_STORE_NAME=KeyVault Store
EOF
npm run build

echo "==> Admin frontend: env + rebuild"
cd "$APP/admin"
cat > .env.production <<EOF
NEXT_PUBLIC_API_URL=http://${API}
NEXT_PUBLIC_STORE_NAME=KeyVault Store
EOF
npm run build

echo "==> Nginx config"
cat > /etc/nginx/sites-available/keyvault <<EOF
server {
    listen 80;
    server_name ${API};
    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
}
server {
    listen 80;
    server_name ${ADMIN};
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
}
server {
    listen 80 default_server;
    server_name ${STORE} _;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
}
EOF
nginx -t && systemctl reload nginx

echo "==> PM2 restart with correct cwd"
pm2 delete all 2>/dev/null || true
pm2 start "$APP/backend/dist/main.js" --name keyvault-api --cwd "$APP/backend"
pm2 start npm --name keyvault-web --cwd "$APP/frontend" -- start
PORT=3001 pm2 start npm --name keyvault-admin --cwd "$APP/admin" -- start -- -p 3001
pm2 save
sleep 6
pm2 list
echo "==> Smoke tests"
curl -s -o /dev/null -w "api(5000): %{http_code}\n" http://127.0.0.1:5000/products
curl -s -o /dev/null -w "web(3000): %{http_code}\n" http://127.0.0.1:3000/
curl -s -o /dev/null -w "admin(3001): %{http_code}\n" http://127.0.0.1:3001/
curl -s -o /dev/null -w "nginx store: %{http_code}\n" -H "Host: ${STORE}" http://127.0.0.1/
curl -s -o /dev/null -w "nginx admin: %{http_code}\n" -H "Host: ${ADMIN}" http://127.0.0.1/
curl -s -o /dev/null -w "nginx api: %{http_code}\n" -H "Host: ${API}" http://127.0.0.1/products
echo "==> FIXUP DONE"
