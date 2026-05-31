# Switch – Deployment Guide

## Quick Start (Dev)

```bash
npm install
cp .env.example .env.local
# Fill in your DATABASE_URL and JWT_SECRET
npm run dev
# → http://localhost:3000
```

## Database Setup (PostgreSQL)

```bash
# With a real DATABASE_URL set:
npm run db:push       # Push schema to DB
npm run db:seed       # Seed demo data
npm run db:studio     # GUI browser for DB
```

### Demo Accounts (after seeding)
| Role     | Phone       | Password |
|----------|-------------|----------|
| Admin    | 9999999900  | admin123 |
| Employer | 9999999901  | demo123  |
| Worker   | 9999999902  | demo123  |

---

## Deploy to Vercel + Railway

### 1. Database (Railway)
1. Go to [railway.app](https://railway.app) → New Project → PostgreSQL
2. Copy the `DATABASE_URL` from Railway dashboard
3. Run schema push: `DATABASE_URL=<your-url> npm run db:push`

### 2. Deploy Frontend + API (Vercel)
```bash
npm install -g vercel
vercel login
vercel --prod
```

Set these environment variables in Vercel dashboard:
```
DATABASE_URL=<railway postgresql url>
JWT_SECRET=<random 32+ char string>
PII_ENC_KEY=<32-byte base64; openssl rand -base64 32>
RAZORPAY_KEY_ID=<your razorpay key>
RAZORPAY_KEY_SECRET=<your razorpay secret>
NEXT_PUBLIC_RAZORPAY_KEY_ID=<same as above>
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

**`PII_ENC_KEY` is required.** Aadhaar number and UPI ID are AES-256-GCM
encrypted at rest (DPDP Act compliance — see `lib/crypto.ts`). If this
env var is missing, the worker profile PATCH endpoint returns
`PII_ENC_KEY_MISSING` and **nothing is written to the DB** — Aadhaar
images and selfie included. Generate once with
`openssl rand -base64 32`, paste into Vercel + Railway, and **never
rotate it without first decrypting/re-encrypting existing rows.**

**`ADMIN_PHONES` is required to onboard admins.** Comma-separated list of
10-digit phone numbers that get the ADMIN role on signup. Was previously
hardcoded in the repo — that's now removed. If this env var is empty,
no admin can be promoted from the signup flow (fail-closed). Set it
in Vercel → Settings → Env Vars before your first admin login.

**Image storage = Railway Postgres bytea (no external bucket needed).**
Worker selfies (`WorkerProfile.profilePhotoBytes`), Aadhaar front/back
(`aadhaarFrontBytes` / `aadhaarBackBytes`), captain/employer/ops avatars
(`User.avatarBytes`), and employer logos (`EmployerProfile.logoBytes`)
all live as PostgreSQL `bytea` columns next to a sibling `*Mime` column
holding the content-type. Reads go through dedicated streaming
endpoints with browser-cache headers — never inline in JSON:

  - `GET /api/worker/photo`               — own selfie (worker session)
  - `GET /api/worker/aadhaar/front|back`  — own Aadhaar (worker session)
  - `GET /api/ops/workers/[id]/aadhaar`   — ops view + audit-logged
  - `GET /api/users/[id]/avatar`          — public-readable avatar
  - `GET /api/employers/[id]/logo`        — public-readable employer logo

Supabase Storage is **no longer used** — `lib/storage.ts` has no
callers. The `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` env vars can
be removed from Vercel/Railway. Legacy rows that contain `https://...`
URLs from earlier deploys continue to work because the GET endpoints
fall through to the String column when bytea is null.

### 3. Install as PWA (Android APK-like)
After deploying to Vercel:
1. Open the URL in Chrome on Android
2. Tap the 3-dot menu → "Add to Home Screen"
3. App installs like a native APK with splash screen

---

## Project Structure

```
switch/
├── app/
│   ├── page.tsx              ← Premium landing page
│   ├── login/page.tsx        ← Login with demo accounts
│   ├── register/page.tsx     ← Role-based registration
│   ├── employer/
│   │   ├── dashboard/        ← Shift overview + stats
│   │   ├── post-shift/       ← 3-step shift posting
│   │   ├── bookings/         ← All shifts + status filter
│   │   └── profile/          ← Account settings
│   ├── worker/
│   │   ├── dashboard/        ← Earnings + nearby jobs
│   │   ├── jobs/             ← Job feed with accept/reject
│   │   ├── earnings/         ← Full earnings history
│   │   ├── onboarding/       ← KYC: Aadhaar + selfie
│   │   └── profile/          ← Worker profile + skills
│   ├── admin/
│   │   ├── dashboard/        ← Platform stats + revenue
│   │   ├── workers/          ← KYC approval queue
│   │   ├── bookings/         ← All platform bookings
│   │   └── complaints/       ← Issue resolution
│   └── api/
│       ├── auth/             ← Login, register, me, logout
│       ├── shifts/           ← CRUD + matching
│       ├── bookings/         ← Booking lifecycle
│       ├── ratings/          ← Worker ratings
│       └── admin/            ← KYC, stats
├── components/
│   ├── ui/                   ← Button, Input, Badge, Avatar...
│   ├── shared/               ← BottomNav, TopBar, SplashScreen
│   ├── employer/             ← ShiftCard
│   └── worker/               ← WorkerCard
├── lib/
│   ├── auth.ts               ← JWT + bcrypt
│   ├── matching.ts           ← Haversine distance algorithm
│   ├── prisma.ts             ← DB client
│   └── utils.ts              ← Helpers + formatters
└── prisma/
    ├── schema.prisma         ← Full DB schema
    └── seed.ts               ← Demo data seeder
```

---

## Business Pricing Logic

| Who        | Amount     |
|------------|------------|
| Customer   | ₹200/hr    |
| Worker     | ₹150/hr    |
| Platform   | ₹50/hr     |
| Urgent fee | +₹99       |
| Replace    | +₹49       |

Implemented in `lib/utils.ts` → `calculateShiftCost()`

## Matching Algorithm

File: `lib/matching.ts`

Priority scoring (0–100):
1. **Distance** (50pts): Haversine formula, penalizes >10km
2. **Rating** (30pts): Worker rating × 30/5
3. **Experience** (20pts): Shifts completed (caps at 50)

Returns top 5 workers sorted by score.

---

## Database connection pooling

Prisma + Supabase setup uses two connection strings:

```
DATABASE_URL = postgresql://USER:PASS@aws-1-...pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
DIRECT_URL   = postgresql://USER:PASS@db.<project>.supabase.co:5432/postgres
```

- `DATABASE_URL` → pgBouncer pooler (port **6543**, transaction mode). Used by all runtime queries.
- `DIRECT_URL`   → direct Postgres (port **5432**). Used by `prisma migrate` only.

### Choosing `connection_limit`

| Host                                  | `connection_limit` |
|---------------------------------------|--------------------|
| Vercel / Netlify / serverless         | **1** ← current    |
| Render / Railway / Fly / single VM    | 5–10               |
| Multi-instance Node (k8s, etc)        | (instances) × 5    |

Each Node process opens this many slots in pgBouncer; pgBouncer multiplexes them onto Supabase's actual Postgres pool.

### Supabase pooler caps

| Plan  | Pooler connections | Direct |
|-------|--------------------|--------|
| Free  | 60                 | 60     |
| Pro   | 200                | 90     |
| Team+ | tunable            | tunable|

If users start seeing `Too many connections` errors, raise `connection_limit` *only if direct Postgres has spare capacity* — pgBouncer can hide the real bottleneck.

### Backups

Supabase automatic daily backups are included on **Pro plan and above** (free tier has none).
Until you upgrade, the repo ships with a **GitHub Actions workflow at `.github/workflows/db-backup.yml`**
that runs a `pg_dump` nightly at 02:00 IST and uploads to S3-compatible storage. 30-day retention
(older backups are pruned automatically).

#### One-time setup (~10 min)

You need **(a)** an S3-compatible bucket and **(b)** an access key for it.
Pick whichever provider you prefer — they all work with this workflow:

| Provider | Free tier | Notes |
|----------|-----------|-------|
| **Cloudflare R2** | 10 GB free, no egress fees | Cheapest. Get an S3-compatible API token from the R2 dashboard. |
| **Backblaze B2**  | 10 GB free | Cheap and simple. |
| **AWS S3**        | 5 GB free for 12 months | Standard. After free tier, ~$0.023/GB-month. |
| **DigitalOcean Spaces** | None free, $5/mo flat | Bundles 250 GB. |

1. **Create a private bucket** (e.g. `switch-backups`).
2. **Create an access key** with permissions to `PutObject`, `ListBucket`, `DeleteObject` on that bucket only.
3. **Add secrets** to GitHub: repo → Settings → **Secrets and variables → Actions → New secret**:
   - `BACKUP_DATABASE_URL` — set this to the value of your `DIRECT_URL` (port 5432, not the pooler)
   - `BACKUP_AWS_ACCESS_KEY_ID`
   - `BACKUP_AWS_SECRET_ACCESS_KEY`
   - `BACKUP_S3_BUCKET` — just the bucket name, e.g. `switch-backups`
4. **Add variables** (same screen, **Variables** tab):
   - `BACKUP_S3_PREFIX` — defaults to `switch/db`
   - `BACKUP_AWS_REGION` — `auto` for R2/B2, otherwise the AWS region (e.g. `ap-south-1`)
   - `BACKUP_S3_ENDPOINT` — **only set this for R2/B2/MinIO**. Leave blank for AWS S3.
     - R2:  `https://<account-id>.r2.cloudflarestorage.com`
     - B2:  `https://s3.<region>.backblazeb2.com`

#### Test the workflow before it matters

Once secrets are saved, go to your repo's **Actions** tab → "Nightly DB backup → S3" → **Run workflow**.
It runs a one-off backup right now. You can verify the file landed in your bucket with the dashboard
of whichever provider you chose.

#### Restoring from a backup

Download the `.sql.gz` file from your bucket, then:

```bash
gunzip -c switch-2026-05-07T20-30-00Z.sql.gz | psql "$DIRECT_URL"
```

The dump uses `--clean --if-exists` so a partial / interrupted restore won't leave orphan tables.

#### Why this script and not Supabase Pro?

You should still upgrade to Supabase Pro when revenue justifies it (~₹2,000/mo for full daily PITR
backups with 7-day point-in-time recovery — more recoverable than this script). This GitHub Actions
backup is the **stopgap until then**: free, runs autonomously, no infra to maintain.

---

## Migrations

The schema is now under Prisma migrations (folder `prisma/migrations/`).

**Day-to-day workflow:**

```bash
# Edit prisma/schema.prisma, then:
npx prisma migrate dev --name describe_change
# This creates a new migration folder, applies it, and regenerates the client.
```

**On deploy:**

```bash
# In CI / deploy script before starting the app:
npx prisma migrate deploy
```

**Never use `npx prisma db push` again** — it bypasses migrations and there is no rollback.
