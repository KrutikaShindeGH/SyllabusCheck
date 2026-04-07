# SyllabusCheck 🎓

**Curriculum vs. Industry Keyword Alignment Analyzer**

SyllabusCheck helps university professors keep their course syllabi aligned with what companies are actually hiring for. Upload your syllabi, scrape live job boards, extract required skills with AI, and get a per-course gap report showing exactly what needs to be added.

---

## Project Status

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Setup, Docker, DB, Auth, CI/CD | ✅ Complete |
| Phase 2 | Syllabus upload & parsing | ✅ Complete |
| Phase 3 | Job board scraping | ✅ Complete |
| Phase 4 | AI/NLP keyword extraction | ✅ Complete |
| Phase 5 | Coverage engine & gap analysis | ✅ Complete |
| Phase 6 | Frontend dashboard | ✅ Complete |
| Phase 7 | Reports & Railway deployment | ✅ Complete |

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | React 18 + TypeScript + Vite | Fast SPA, industry standard |
| Styling | Tailwind CSS + shadcn/ui | Clean, accessible UI components |
| Backend | Python 3.11 + FastAPI | Async API, auto docs, type-safe |
| Task Queue | Celery + Redis | Background scraping & NLP jobs |
| AI / NLP | spaCy + GPT-4o + OpenAI Embeddings | Keyword extraction + semantic matching |
| Database | PostgreSQL 16 + pgvector | Primary store + vector similarity search |
| Doc Parsing | pdfplumber + python-docx | PDF and Word syllabus extraction |
| Job Data | Indeed/Dice + GitHub Jobs Scraper | Live job postings from multiple sources |
| Auth | JWT + Google OAuth + RBAC | Secure, role-based access with SSO |
| Infra | Docker + Nginx | Local dev + production ready |
| CI/CD | GitHub Actions | Auto test + deploy on push |
| Deployment | Railway | Cloud hosting for backend, worker & frontend |

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- [Git](https://git-scm.com/)
- An [OpenAI API key](https://platform.openai.com/api-keys)
- A [Google OAuth client](https://console.cloud.google.com/) (for Google login)
- A [Railway account](https://railway.app/) (for deployment)

---

## Quick Start (Local)

```bash
# 1. Clone the repo
git clone https://github.com/KrutikaShindeGH/SyllabusCheck.git
cd SyllabusCheck

# 2. Create your .env file
make setup
# Then open .env and fill in your keys

# 3. Start all services
make up

# 4. Run database migrations
make migrate

# 5. Done! Open in browser:
#    App:      http://localhost
#    API docs: http://localhost/api/docs
#    API:      http://localhost:8000
```

---

## Project Structure

```
SyllabusCheck/
│
├── backend/                        # FastAPI Python backend
│   ├── main.py                     # App entry point
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── railway.toml                # Railway backend service config
│   ├── railway.worker.toml         # Railway Celery worker config
│   │
│   ├── core/                       # App-wide config & utilities
│   │   ├── config.py               # Settings (reads from .env)
│   │   ├── database.py             # Async SQLAlchemy engine
│   │   ├── celery_app.py           # Celery + scheduled tasks
│   │   └── auth.py                 # JWT + password utilities
│   │
│   ├── models/
│   │   └── models.py               # All DB tables (User, Course, Job, Keyword, Coverage, Report)
│   │
│   ├── api/
│   │   └── routes/
│   │       ├── auth.py             # /api/auth — register, login, refresh, me
│   │       ├── google_auth.py      # /api/auth/google — Google OAuth flow
│   │       ├── courses.py          # /api/courses — upload & manage syllabi
│   │       ├── jobs.py             # /api/jobs — browse job postings
│   │       ├── keywords.py         # /api/keywords — keyword management
│   │       ├── coverage.py         # /api/coverage — matrix & gap analysis
│   │       ├── reports.py          # /api/reports — generate PDF/Excel reports
│   │       └── health.py           # /api/health — service health check
│   │
│   ├── services/                   # Business logic
│   │   ├── scraper/                # Job board scrapers (GitHub, JSearch)
│   │   ├── nlp/                    # Keyword extraction + embeddings + normalizer
│   │   ├── parser/                 # PDF/DOCX syllabus parser + topic extractor
│   │   ├── coverage/               # Coverage engine & gap analyzer
│   │   └── reports/                # Report generator (PDF/Excel)
│   │
│   ├── tasks/                      # Celery async tasks
│   │   ├── scrape_tasks.py
│   │   ├── nlp_tasks.py
│   │   ├── coverage_tasks.py
│   │   └── report_tasks.py
│   │
│   ├── migrations/                 # Alembic DB migrations
│   │   └── versions/
│   │       ├── 001_initial.py
│   │       └── 007_phase7_google_reports.py
│   │
│   └── scripts/
│       └── classify_cs_subdomains.py
│
├── frontend/                       # React + TypeScript frontend
│   ├── Dockerfile
│   ├── railway.toml                # Railway frontend service config
│   ├── nginx.spa.conf              # Nginx SPA routing config
│   ├── docker-entrypoint.sh
│   └── src/
│       ├── pages/                  # Dashboard, JobExplorer, Syllabi, CoverageMatrix,
│       │                           # GapAnalysis, Reports, Login, Register, OAuthCallback
│       ├── components/             # Layout and reusable UI components
│       ├── store/                  # Zustand state management (authStore)
│       ├── hooks/                  # Custom React hooks
│       └── lib/                    # API client, utils
│
├── infra/
│   ├── docker/
│   │   └── init.sql                # Enables pgvector + uuid-ossp extensions
│   └── nginx/
│       └── nginx.conf              # Reverse proxy config
│
├── railway_deployment/             # Railway deployment configs & guides
│   └── railway/
│       ├── RAILWAY_GUIDE.md
│       ├── backend/
│       └── frontend/
│
├── .github/
│   └── workflows/
│       └── ci.yml                  # GitHub Actions — test + deploy
│
├── docker-compose.yml              # Full dev stack
├── .env.example                    # Environment variable template
├── Makefile                        # Dev commands
└── README.md
```

---

## Available Commands

```bash
make up              # Start all services
make down            # Stop all services
make build           # Rebuild Docker images from scratch
make logs            # Follow all logs
make logs-api        # Follow API logs only
make migrate         # Run DB migrations
make migrate-create name="add_users_table"   # Create new migration
make shell-api       # Bash shell inside the API container
make shell-db        # psql shell in the database
make test            # Run pytest
make lint            # Run ruff linter
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/health | Health check |
| POST | /api/auth/register | Create account |
| POST | /api/auth/login | Login → get tokens |
| POST | /api/auth/refresh | Refresh access token |
| GET | /api/auth/me | Get current user |
| GET | /api/auth/google | Google OAuth login |
| GET | /api/auth/google/callback | Google OAuth callback |
| GET/POST | /api/courses | List / upload syllabi |
| GET | /api/jobs | Browse job postings |
| GET | /api/keywords | List extracted keywords |
| GET | /api/coverage | Coverage matrix |
| GET | /api/coverage/gaps | Gap analysis |
| GET/POST | /api/reports | List / generate reports |

Full interactive docs: **http://localhost/api/docs**

---

## Environment Variables

Copy `.env.example` to `.env` and fill in:

| Variable | Required | Description |
|----------|----------|-------------|
| `SECRET_KEY` | Yes | Random string for app security |
| `JWT_SECRET_KEY` | Yes | Random string for JWT signing |
| `OPENAI_API_KEY` | Yes | Your OpenAI key (NLP + embeddings) |
| `POSTGRES_PASSWORD` | Yes | DB password (change in production) |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret |
| `REDIS_URL` | Yes | Redis connection string |
| `DATABASE_URL` | Yes | PostgreSQL connection string |

> ⚠️ Never commit `.env` — only `.env.example` should be in the repo.

---

## Deployment (Railway)

This project is deployed on [Railway](https://railway.app/) with three services:

| Service | Config File | Description |
|---------|------------|-------------|
| Backend API | `backend/railway.toml` | FastAPI server |
| Celery Worker | `backend/railway.worker.toml` | Background task worker |
| Frontend | `frontend/railway.toml` | React app via Nginx |

### Deploy Steps

```bash
# 1. Push your code to GitHub
git push origin master

# 2. Go to railway.app → New Project → Deploy from GitHub repo
# 3. Select KrutikaShindeGH/SyllabusCheck
# 4. Add services: Backend, Worker, Frontend, PostgreSQL, Redis
# 5. Set environment variables in Railway dashboard
# 6. Railway auto-deploys on every push to master ✅
```

See `railway_deployment/railway/RAILWAY_GUIDE.md` for full step-by-step instructions.

---

## Contributing / Development Notes

- All feature changes go through a `dev` branch → PR to `master`
- CI must pass before merging (tests + lint + build)
- Never commit `.env` — only `.env.example`
- Database changes always go through an Alembic migration — never edit tables manually
- Celery tasks must be registered in `backend/core/celery_app.py`
