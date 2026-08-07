#!/usr/bin/env bash
# KeyVault Store - Hostinger VPS one-shot setup (Ubuntu 24.04), run as root
set -euo pipefail

IP="187.127.92.55"
BASE="${IP}.sslip.io"
API="api.${BASE}"
ADMIN="admin.${BASE}"
STORE="${BASE}"
APP=/opt/keyvault

export DEBIAN_FRONTEND=noninteractive

echo "==> [1/8] System packages"
apt-get update -y
apt-get install -y git nginx curl ca-certificates
if ! command -v docker >/dev/null; then curl -fsSL https://get.docker.com | sh; fi
if ! command -v node >/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
npm install -g pm2

echo "==> [2/8] Source code"
mkdir -p "$APP"
tar xzf /tmp/keyvault-src.tgz -C "$APP"
cp /tmp/keyvault-real.env "$APP/backend/.env"
cd "$APP"

echo "==> [3/8] Postgres + Redis"
PG_PASS="$(openssl rand -hex 16)"
POSTGRES_PASSWORD="$PG_PASS" docker compose up -d
sleep 5

echo "==> [4/8] Backend env + Prisma"
cd "$APP/backend"
# Point env at this server (keep all secrets as uploaded)
sed -i \
  -e "s|^PORT=.*|PORT=5000|" \
  -e "s|^DATABASE_URL=.*|DATABASE_URL=\"postgresql://keyvault:${PG_PASS}@localhost:5432/keyvault\"|" \
  -e "s|^REDIS_URL=.*|REDIS_URL=\"redis://localhost:6379\"|" \
  -e "s|^FRONTEND_URL=.*|FRONTEND_URL=\"http://${STORE}\"|" \
  -e "s|^TELEGRAM_WEBAPP_URL=.*|TELEGRAM_WEBAPP_URL=\"http://${STORE}\"|" \
  -e "s|^BACKEND_PUBLIC_URL=.*|BACKEND_PUBLIC_URL=\"http://${API}\"|" \
  .env
grep -q '^NODE_ENV=' .env || echo 'NODE_ENV=production' >> .env

echo "==> [5/8] Backend build"
npm ci
npm run prisma:generate:pg
npm run prisma:db:push:pg
npm run build
pm2 delete keyvault-api 2>/dev/null || true
pm2 start dist/main.js --name keyvault-api

echo "==> [6/8] Store frontend"
cd "$APP/frontend"
cat > .env.production <<EOF
NEXT_PUBLIC_API_URL=http://${API}
NEXT_PUBLIC_STORE_NAME=KeyVault Store
EOF
npm ci
npm run build
pm2 delete keyvault-web 2>/dev/null || true
pm2 start npm --name keyvault-web -- start

echo "==> [7/8] Admin frontend"
cd "$APP/admin"
cat > .env.production <<EOF
NEXT_PUBLIC_API_URL=http://${API}
NEXT_PUBLIC_STORE_NAME=KeyVault Store
EOF
npm ci
PORT=3001 pm2 delete keyvault-admin 2>/dev/null || true
PORT=3001 pm2 start npm --name keyvault-admin -- start -- -p 3001

pm2 save
pm2 startup systemd -u root --hp /root || true
env PATH=$PATH:/usr/bin pm2 startup systemd -u root --hp /root || true

echo "==> [8/8] Nginx"
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
ln -sf /etc/nginx/sites-available/keyvault /etc/nginx/sites-enabled/keyvault
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "==> ALL DONE"
echo "STORE: http://${STORE}"
echo "ADMIN: http://${ADMIN}"
echo "API:   http://${API}"
