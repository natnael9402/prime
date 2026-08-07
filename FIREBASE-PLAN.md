# Firebase Integration Plan — KeyVault Store

Goal: replace the (failed) AWS deployment with Firebase / Google Cloud, and eventually
replace Cloudflare R2 image storage with Firebase Storage so the app has zero AWS-flavored
dependencies.

## Current stack recap

| Piece | Today | Notes |
|---|---|---|
| Store frontend | Next.js (SSR) | `frontend/` |
| Admin panel | Next.js (SSR) | `admin/` |
| API | NestJS + Prisma | `backend/` |
| Database | PostgreSQL (docker) | prod schema: `prisma/schema.postgres.prisma` |
| Queue/cache | Redis + BullMQ | fulfillment queue |
| Images | Cloudflare R2 via `@aws-sdk/client-s3` | S3-protocol only, no actual AWS |
| Bot | Telegram webhook → backend | |

## Target Firebase architecture

| Piece | Firebase/GCP service | Why |
|---|---|---|
| Store frontend | **Firebase App Hosting** | Native Next.js SSR support, global CDN, auto HTTPS, `*.web.app` URL out of the box |
| Admin panel | **Firebase App Hosting** (2nd backend) | Same repo, separate rollout, gets `admin` URL |
| NestJS API | **Firebase App Hosting** (custom Node server) or **Cloud Run** | App Hosting runs any Node server; Cloud Run if you want raw control |
| PostgreSQL | **Neon free tier** (or Cloud SQL later) | Firebase has no Postgres; Neon free tier is instant, Prisma-compatible, zero migration |
| Redis/BullMQ | **Upstash Redis free tier** (or swap queue to Cloud Tasks later) | Keeps current code working unchanged |
| Images | **Firebase Storage** | Drops `@aws-sdk/client-s3` entirely; SDK: `firebase-admin` |
| Secrets | **Google Secret Manager** (built into App Hosting) | No `.env` files on servers |
| Domain later | Firebase Hosting custom domain | Free SSL, one CLI command |

Resulting URLs (no domain purchase needed):
- Store: `https://keyvault-store--<project>.web.app` (customizable)
- Admin: `https://keyvault-admin--<project>.web.app`
- API: `https://keyvault-api--<project>.web.app` (or Cloud Run URL)

## Cost

- Firebase **Spark (free) plan**: Hosting + Storage (5 GB) + small usage — enough to start
- App Hosting / Cloud Run need the **Blaze (pay-as-you-go) plan**, but both have permanent
  free allowances (Cloud Run: 2M requests/mo free). Expected real cost at your scale: **$0–5/mo**
- Neon Postgres free tier + Upstash Redis free tier: **$0**

## Implementation steps (in order)

### Phase 1 — make it live (fastest, keeps current code)
1. `npm i -g firebase-tools` → `firebase login` → `firebase init apphosting`
2. Create Neon Postgres → get `DATABASE_URL`
3. Create Upstash Redis → get `REDIS_URL`
4. Put all backend secrets into Google Secret Manager, wire into `apphosting.yaml`
5. Deploy API → run `prisma db push` (postgres schema) against Neon
6. Deploy store + admin frontends with `NEXT_PUBLIC_API_URL` pointing at the API URL
7. Update Telegram bot webhook / Mini App URL to the new store URL

### Phase 2 — kill the last AWS-flavored dependency (R2 → Firebase Storage)
1. `npm uninstall @aws-sdk/client-s3` in `backend/`
2. `npm i firebase-admin`
3. Replace `backend/src/r2/` with a `storage/` module implementing the same interface
   (`uploadFile`, `deleteFile`, `listFiles`) using the Firebase Storage bucket API
   — `uploads.controller.ts` and the admin `R2ImagePicker` keep working unchanged
4. Env change: drop `CLOUDFLARE_R2_*`, add `FIREBASE_STORAGE_BUCKET` + service account
5. Migrate existing R2 images (one-off script: list → download → re-upload)

### Phase 3 (optional, later)
- Move Telegram webhook handling to Cloud Functions
- Swap BullMQ fulfillment queue to Cloud Tasks / PubSub (drops Redis entirely)
- Custom domain on Firebase Hosting

## What stays untouched
- All Prisma models, all business logic, Telegram bot, Chapa payments, supplier integration
- Local dev workflow (`start-dev.bat`, docker-compose) keeps working exactly as today
