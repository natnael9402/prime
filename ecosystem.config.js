/**
 * PM2 production layout — `pm2 start ecosystem.config.js`
 *
 * kv-api      NestJS API in cluster mode (one process per CPU core).
 *             A crashed worker is replaced instantly; slow requests in one
 *             worker never block the others. Bot polling is OFF here.
 * kv-bot      ONE fork process: Telegram bot polling + fulfillment worker.
 *             DISABLE_HTTP=true so it never competes for the API port.
 * kv-frontend / kv-admin  Next.js production servers (next start).
 *
 * Prereqs: backend built (npm run build), frontend/admin built (next build),
 *          .env with DATABASE_URL (Postgres) + REDIS_URL.
 */
module.exports = {
  apps: [
    {
      name: 'kv-api',
      cwd: './backend',
      script: 'dist/main.js',
      instances: 'max',
      exec_mode: 'cluster',
      max_memory_restart: '512M',
      kill_timeout: 8000,
      listen_timeout: 10000,
      env: {
        NODE_ENV: 'production',
        TELEGRAM_ENABLE_BOT: 'false', // bot lives only in kv-bot
      },
    },
    {
      name: 'kv-bot',
      cwd: './backend',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        TELEGRAM_ENABLE_BOT: 'true',
        DISABLE_HTTP: 'true',
        QUEUE_WORKER_ENABLED: 'true',
      },
    },
    {
      name: 'kv-frontend',
      cwd: './frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      instances: 1,
      max_memory_restart: '512M',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'kv-admin',
      cwd: './admin',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3001',
      instances: 1,
      max_memory_restart: '256M',
      env: { NODE_ENV: 'production' },
    },
  ],
};
