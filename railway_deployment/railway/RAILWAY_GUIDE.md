# Railway Deployment Guide — SyllabusCheck
## Complete step-by-step from zero to live

---

## Architecture on Railway

```
Railway Project: syllacheck
├── syllacheck-api        (FastAPI — backend/Dockerfile)
├── syllacheck-worker     (Celery — same Dockerfile, different start cmd)
├── syllacheck-frontend   (React — frontend/Dockerfile)
├── PostgreSQL            (Railway plugin — pgvector enabled via init.sql)
└── Redis                 (Railway plugin)
```

All 5 services live inside one Railway project and communicate over Railway's
private network using internal hostnames like `syllacheck-api.railway.internal`.

---

## Files to Copy Into Your Repo

```
backend/
  Dockerfile              ← REPLACE existing
  railway.toml            ← NEW (controls build + start for API service)
  railway.worker.toml     ← NEW (reference config for worker service)

frontend/
  Dockerfile              ← NEW (multi-stage Node → nginx build)
  railway.toml            ← NEW
  nginx.spa.conf          ← NEW (SPA routing, PORT injection)
  docker-entrypoint.sh    ← NEW (injects Railway $PORT into nginx)
  vite.config.ts          ← REPLACE
  src/lib/api.ts          ← REPLACE (reads VITE_API_URL)

.github/workflows/
  ci.yml                  ← REPLACE (adds Railway deploy steps)
```

---

## Step 1 — Prep your repo (5 min)

Copy all files above into place, then commit and push to GitHub:

```bash
git add .
git commit -m "chore: add Railway deployment config"
git push origin main
```

---

## Step 2 — Create Railway account and project (2 min)

1. Go to **railway.app** → sign up with GitHub
2. Click **New Project**
3. Choose **Empty Project**
4. Name it `syllacheck`

---

## Step 3 — Add PostgreSQL (2 min)

1. Inside your project → **+ New** → **Database** → **PostgreSQL**
2. Railway provisions it instantly
3. Click the PostgreSQL service → **Variables** tab
4. Copy the `DATABASE_URL` value — you'll need it shortly

> ⚠️ Railway's PostgreSQL does NOT have pgvector by default.
> After the DB is up, open a **Query** tab and run:
> ```sql
> CREATE EXTENSION IF NOT EXISTS vector;
> CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
> ```

---

## Step 4 — Add Redis (1 min)

1. **+ New** → **Database** → **Redis**
2. Railway provisions it instantly
3. Copy the `REDIS_URL` from its Variables tab

---

## Step 5 — Deploy the API service (5 min)

1. **+ New** → **GitHub Repo** → select your repo
2. When asked for the **root directory**, type: `backend`
3. Railway detects `backend/railway.toml` and uses the Dockerfile automatically
4. **Before the first deploy**, click the service → **Variables** tab and add all env vars (see Step 7 below)
5. Railway will auto-deploy on every push to `main`

---

## Step 6 — Deploy the Worker service (3 min)

The Celery worker uses the same Docker image as the API but a different start command.

1. **+ New** → **GitHub Repo** → same repo
2. Root directory: `backend`
3. After it's created, go to its **Settings** tab
4. Under **Deploy** → **Start Command**, set:
   ```
   celery -A core.celery_app worker --loglevel=info -Q default,scrape,nlp,coverage
   ```
5. Add the same environment variables as the API service (minus `PORT` — Railway handles that)

---

## Step 7 — Deploy the Frontend service (3 min)

1. **+ New** → **GitHub Repo** → same repo
2. Root directory: `frontend`
3. Railway detects `frontend/railway.toml`
4. Add this one variable before first deploy:
   ```
   VITE_API_URL = https://syllacheck-api.up.railway.app
   ```
   (use the actual URL from your API service — found in its Settings → Domains)

---

## Step 8 — Set environment variables

### API service + Worker service — add ALL of these:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | (auto-linked from PostgreSQL plugin — click "Add Reference") |
| `REDIS_URL` | (auto-linked from Redis plugin) |
| `CELERY_BROKER_URL` | same as REDIS_URL |
| `CELERY_RESULT_BACKEND` | same as REDIS_URL with `/1` at end |
| `SECRET_KEY` | run: `python -c "import secrets; print(secrets.token_urlsafe(32))"` |
| `JWT_SECRET_KEY` | another random string (same command) |
| `OPENAI_API_KEY` | your OpenAI key |
| `GOOGLE_CLIENT_ID` | from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | from Google Cloud Console |
| `GOOGLE_REDIRECT_URI` | `https://syllacheck-api.up.railway.app/api/auth/google/callback` |
| `FRONTEND_URL` | `https://syllacheck-frontend.up.railway.app` |
| `CORS_ORIGINS` | `https://syllacheck-frontend.up.railway.app` |
| `REPORT_DIR` | `/app/reports` |
| `UPLOAD_DIR` | `/app/uploads` |
| `APP_ENV` | `production` |
| `DEBUG` | `false` |

> 💡 **Tip:** In Railway, click **+ New Variable** → **Add Reference** to auto-link
> DATABASE_URL and REDIS_URL directly from the plugin — no copy-pasting needed.

### Frontend service — add only:

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://syllacheck-api.up.railway.app` |

---

## Step 9 — Run migrations (one-time)

After the API service is deployed and green:

1. Railway dashboard → `syllacheck-api` service
2. Click **Deploy** tab → most recent deploy → **View Logs**
3. The start command already runs `alembic upgrade head` before uvicorn starts
   (see `backend/railway.toml` startCommand)

If you need to run it manually:
1. `syllacheck-api` → **Settings** → **Railway CLI**
2. Copy the connect command and run:
   ```bash
   railway run --service syllacheck-api bash
   > alembic upgrade head
   ```

---

## Step 10 — Add custom domain (optional, 2 min)

1. `syllacheck-frontend` → **Settings** → **Domains** → **+ Custom Domain**
2. Enter e.g. `syllacheck.yourdomain.com`
3. Railway gives you a CNAME record to add to your DNS
4. Update `CORS_ORIGINS`, `FRONTEND_URL`, and `GOOGLE_REDIRECT_URI` env vars to use the custom domain
5. Update the Google OAuth authorized redirect URI in Google Cloud Console

---

## Step 11 — Add persistent storage volumes (important for reports)

Railway's filesystem is ephemeral — files written to `/app/reports` and `/app/uploads`
are lost on redeploy. To persist them:

1. `syllacheck-api` → **Volumes** tab → **+ New Volume**
2. Mount path: `/app/uploads`, size: 1 GB
3. Add another: `/app/reports`, size: 1 GB
4. Redeploy the service — volumes now survive deploys

> For the worker service, add the same two volumes so it can write report files.

---

## Step 12 — Wire up GitHub Actions auto-deploy

1. In Railway → **Account Settings** → **Tokens** → **New Token**
2. Name it `github-actions`, copy the token
3. In GitHub → your repo → **Settings** → **Secrets and variables** → **Actions**
4. Add secret: `RAILWAY_TOKEN` = the token you copied
5. Now every push to `main` runs tests → deploys all 3 services automatically

---

## Verifying Everything Works

```bash
# 1. API health check
curl https://syllacheck-api.up.railway.app/api/health

# 2. API docs
open https://syllacheck-api.up.railway.app/api/docs

# 3. Frontend
open https://syllacheck-frontend.up.railway.app

# 4. Google OAuth (should redirect to Google)
open https://syllacheck-api.up.railway.app/api/auth/google
```

---

## Cost on Railway

| Service | Plan | ~Monthly cost |
|---------|------|--------------|
| PostgreSQL | Hobby ($5 credit included) | ~$0–2 |
| Redis | Hobby | ~$0–1 |
| API (FastAPI) | Hobby | ~$2–5 |
| Worker (Celery) | Hobby | ~$2–5 |
| Frontend | Hobby | ~$1–2 |
| **Total** | | **~$5–15/month** |

Railway gives $5 free credit/month on the Hobby plan. For a pilot with low traffic,
you'll likely pay $5–10/month total. No spin-down like Render free tier.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `pgvector extension not found` | Open Railway DB Query tab → `CREATE EXTENSION IF NOT EXISTS vector;` |
| Build fails: `npm ci` error | Make sure `package-lock.json` is committed to the repo |
| `VITE_API_URL` not working | It must be set BEFORE the build runs — Railway re-builds on env var changes |
| Google callback 400 "Invalid state" | Make sure `GOOGLE_REDIRECT_URI` exactly matches what's in Google Cloud Console |
| Worker not processing tasks | Check `CELERY_BROKER_URL` is set and Redis is running |
| Reports PDF not found after redeploy | Add Railway Volumes for `/app/reports` (Step 11) |
| CORS errors in browser | `CORS_ORIGINS` must include the exact frontend URL with no trailing slash |
