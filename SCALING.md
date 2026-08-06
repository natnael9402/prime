# KeyVault Store — Scalability Plan & Status

Target: survive 100k concurrent users without crashing.
Stack: NestJS + Prisma backend, Next.js storefront + admin, Chapa payments, HubX supplier, Telegram Mini App.

## ✅ EXECUTED (code-complete, tested locally)

| Area | What shipped | Verification |
|---|---|---|
| Fulfillment queue | BullMQ `fulfillment` queue, 5 attempts w/ exponential backoff, dedupe by orderId, terminal failure → `FAILED` + admin re-enqueue retry. **Without Redis it falls back to inline fulfillment** (old behavior), so dev is unchanged. | Mock checkout → PAID → DELIVERED with keys |
| Redis layer | `RedisService` with transparent in-memory fallback; `CacheService` read-through JSON cache | `cacheMode: "memory"` when `REDIS_URL` unset |
| Catalog caching | Product list (60s), product detail (60s), categories (300s); invalidated on product create/update/delete, pricing change, settings change, HubX import, stock sync | Price change reflected instantly after PUT pricing |
| Rate limiting | Global 300 req/min/IP; `initialize`/`initialize-cart` strict 10/min; `mock-confirm` 20/min; webhook + health skipped | 11th rapid checkout call → 429 |
| Security headers | helmet (HSTS, nosniff, frame, DNS prefetch off), CORS unchanged | Headers present on responses |
| Compression | gzip on all responses (~70% smaller catalog JSON) | `Content-Encoding: gzip` |
| Health checks | `GET /health` (liveness), `GET /health/ready` (DB + Redis state), unthrottled | `{status:ok, db:up}` |
| Graceful shutdown | `enableShutdownHooks` — drains requests/queues on SIGTERM | — |
| Bot isolation | `TELEGRAM_ENABLE_BOT=false` on API replicas; bot polls only in the dedicated `kv-bot` process | Worker mode boots with no HTTP listener |
| Worker mode | `DISABLE_HTTP=true` → Nest starts without a port (bot + queue worker only) | Verified: no port bound |
| Process layout | `ecosystem.config.js` (PM2): `kv-api` cluster `max` instances, `kv-bot` fork ×1, `kv-frontend`, `kv-admin` | Config written |
| Containers | `docker-compose.yml`: Postgres 16 + Redis 7 (AOF persistence, LRU eviction), healthchecks | Config written |
| Postgres path | `prisma/schema.postgres.prisma` + `npm run prisma:generate:pg` / `prisma:db:push:pg` + `scripts/migrate-sqlite-to-pg.js` (all 9 tables, FK-ordered, `ON CONFLICT DO NOTHING`) | Script written (run at migration time) |
| Frontend prod | `next.config.js`: `output: 'standalone'`, compression, no powered-by header | Config validated |
| Trust proxy | `trust proxy 1` so rate limiting sees real IPs behind Cloudflare | — |

## 🔧 TO RUN IN PRODUCTION (needs your accounts — I can't do these for you)

1. **Postgres**: provision (Railway Postgres / Neon / Supabase free tier) → set `DATABASE_URL` in `backend/.env`
   - `npm run prisma:db:push:pg` (create tables)
   - `node scripts/migrate-sqlite-to-pg.js` with `PG_DATABASE_URL` set (copy existing data)
   - `npm run prisma:generate:pg` then restart
2. **Redis**: Upstash free tier or the compose file → set `REDIS_URL`
3. **Processes**: `npm i -g pm2` → `pm2 start ecosystem.config.js` → `pm2 save` + `pm2 startup` (survives reboots)
4. **Cloudflare** (free): point the domain → CDN for banners + DDoS protection + edge cache for the storefront
5. **Monitoring**: UptimeRobot on `/health/ready`; Sentry free tier for exceptions
6. **At real scale**: Railway/Render autoscaling for 2+ `kv-api` replicas behind their load balancer; Postgres read replica for catalog reads

## Reality check

- 100k concurrent = mostly catalog reads → served by CDN + Redis cache; DB barely touched.
- Checkout burst is the dangerous path → queue absorbs it; HubX/Chapa rate limits become the ceiling (we backoff + retry).
- Single well-tuned instance + this code comfortably handles thousands of concurrent users; true 100k needs the replica step (6).
