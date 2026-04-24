# SyllabusCheck 🎓

**AI-Powered Syllabus Gap Analysis Platform**

SyllabusCheck identifies the gap between what a university course teaches and what the job market currently demands. Upload a syllabus (PDF or DOCX), let the platform scrape live job postings, and get an AI-powered keyword coverage score and gap report — all in an interactive dashboard.

---

## 🌐 Live Demo

| Service | URL |
|---------|-----|
| Frontend | [https://jsom-citm-syllabus-check.vercel.app/](https://jsom-citm-syllabus-check.vercel.app/) |


---

## 🚀 Project Status

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Setup, Docker, DB schema, Auth, CI/CD pipeline | ✅ Complete |
| Phase 2 | Syllabus upload endpoint, PDF/DOCX parsing & text extraction | ✅ Complete |
| Phase 3 | Job board scraping — live job posting collection & storage | ✅ Complete |
| Phase 4 | AI/NLP keyword extraction via Anthropic Claude API | ✅ Complete |
| Phase 5 | Coverage engine and gap analysis scoring logic | ✅ Complete |
| Phase 6 | Frontend dashboard — interactive charts and results UI | ✅ Complete |
| Phase 7 | Report generation, Vercel + Railway cloud deployment | ✅ Complete |

---

## 🏗️ Tech Stack

### Backend
| Technology | Purpose |
|------------|---------|
| Python 3.11 | Core application language |
| FastAPI | REST API framework — async, high-performance |
| PostgreSQL | Primary relational database |
| SQLAlchemy + Alembic | ORM and schema migration management |
| Celery + Redis | Async task queue for background scraping & NLP jobs |
| BeautifulSoup / Scrapy | Job board scraping and HTML parsing |
| pdfplumber / PyPDF2 | Syllabus PDF ingestion and text extraction |

### AI / NLP
| Technology | Purpose |
|------------|---------|
| Anthropic Claude API | Keyword extraction, gap analysis, NLP summarisation |
| spaCy | Supporting NLP preprocessing and entity recognition |
| OpenAI Embeddings | Semantic vector similarity matching |

### Frontend
| Technology | Purpose |
|------------|---------|
| React 18 + TypeScript | Component-driven UI with full type safety |
| Vite | Fast dev build tooling |
| Tailwind CSS | Utility-first responsive styling |
| Recharts | Interactive coverage charts and visualisations |

### Infrastructure & DevOps
| Technology | Purpose |
|------------|---------|
| Docker / Docker Compose | Containerisation and local multi-service orchestration |
| GitHub Actions | Automated CI/CD — lint, test, and build on every push |
| **Vercel** | Frontend deployment (React app via CDN) |
| **Railway** | Backend deployment (FastAPI + PostgreSQL + Redis) |
| JWT | Stateless authentication tokens |
| Google OAuth | Single sign-on via Google |

---

## 🗂️ Project Structure

```
SyllabusCheck/
│
├── backend/                          # FastAPI Python backend
│   ├── main.py                       # App entry point
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── railway.toml                  # Railway backend service config
│   ├── railway.worker.toml           # Railway Celery worker config
│   │
│   ├── core/                         # App-wide config & utilities
│   │   ├── config.py                 # Settings (reads from .env)
│   │   ├── database.py               # Async SQLAlchemy engine
│   │   ├── celery_app.py             # Celery + scheduled tasks
│   │   └── auth.py                   # JWT + password utilities
│   │
│   ├── models/
│   │   └── models.py                 # All DB tables (User, Course, Job, Keyword, Coverage, Report)
│   │
│   ├── api/routes/
│   │   ├── auth.py                   # /api/auth — register, login, refresh, me
│   │   ├── google_auth.py            # /api/auth/google — Google OAuth flow
│   │   ├── courses.py                # /api/courses — upload & manage syllabi
│   │   ├── jobs.py                   # /api/jobs — browse job postings
│   │   ├── keywords.py               # /api/keywords — keyword management
│   │   ├── coverage.py               # /api/coverage — matrix & gap analysis
│   │   ├── reports.py                # /api/reports — generate PDF/Excel reports
│   │   └── health.py                 # /api/health — service health check
│   │
│   ├── services/                     # Business logic
│   │   ├── scraper/                  # Job board scrapers
│   │   ├── nlp/                      # Keyword extraction + embeddings + normalizer
│   │   ├── parser/                   # PDF/DOCX syllabus parser + topic extractor
│   │   ├── coverage/                 # Coverage engine & gap analyzer
│   │   └── reports/                  # Report generator (PDF/Excel)
│   │
│   ├── tasks/                        # Celery async tasks
│   │   ├── scrape_tasks.py
│   │   ├── nlp_tasks.py
│   │   ├── coverage_tasks.py
│   │   └── report_tasks.py
│   │
│   └── migrations/                   # Alembic DB migrations
│       └── versions/
│
├── frontend/                         # React + TypeScript frontend
│   ├── Dockerfile
│   ├── vercel.json                   # Vercel deployment config
│   └── src/
│       ├── pages/                    # Dashboard, JobExplorer, Syllabi, CoverageMatrix,
│       │                             # GapAnalysis, Reports, Login, Register, OAuthCallback
│       ├── components/               # Layout and reusable UI components
│       ├── store/                    # Zustand state management (authStore)
│       ├── hooks/                    # Custom React hooks
│       └── lib/                      # API client, utils
│
├── infra/
│   ├── docker/
│   │   └── init.sql                  # Enables pgvector + uuid-ossp extensions
│   └── nginx/
│       └── nginx.conf                # Reverse proxy config (local dev)
│
├── .github/
│   └── workflows/
│       └── ci.yml                    # GitHub Actions — test + deploy
│
├── docker-compose.yml                # Full local dev stack
├── .env.example                      # Environment variable template
├── Makefile                          # Dev convenience commands
└── railway.toml                      # Root Railway config
```

---

## ☁️ Deployment

This project uses a **split-deployment model**:

| Layer | Platform | Notes |
|-------|----------|-------|
| **Frontend** | **Vercel** | React app; auto-deploys from `master` on every push |
| **Backend API** | **Railway** | FastAPI server |
| **Celery Worker** | **Railway** | Background task worker (scraping, NLP) |
| **PostgreSQL** | **Railway** | Managed Postgres add-on |
| **Redis** | **Railway** | Celery broker + result backend |


---

## ⚙️ Local Development

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- [Git](https://git-scm.com/)
- An [Anthropic API key](https://console.anthropic.com/)
- An [OpenAI API key](https://platform.openai.com/api-keys) (for embeddings)
- A [Google OAuth client](https://console.cloud.google.com/) (for Google login)

### Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/KrutikaShindeGH/SyllabusCheck.git
cd SyllabusCheck

# 2. Create your .env file
cp .env.example .env
# Open .env and fill in your API keys

# 3. Start all services
make up

# 4. Run database migrations
make migrate

# 5. Open in browser:
#    App:       http://localhost:5173
#    API docs:  http://localhost:8000/api/docs
```

---

## 🔑 Environment Variables

Copy `.env.example` to `.env` and fill in the values:

| Variable | Required | Description |
|----------|----------|-------------|
| `SECRET_KEY` | ✅ | Random string for app security |
| `JWT_SECRET_KEY` | ✅ | Random string for JWT signing |
| `ANTHROPIC_API_KEY` | ✅ | Your Anthropic API key (Claude NLP) |
| `OPENAI_API_KEY` | ✅ | Your OpenAI key (embeddings) |
| `POSTGRES_PASSWORD` | ✅ | DB password (change in production) |
| `DATABASE_URL` | ✅ | PostgreSQL async connection string |
| `REDIS_URL` | ✅ | Redis connection string |
| `CELERY_BROKER_URL` | ✅ | Redis URL for Celery broker |
| `GOOGLE_CLIENT_ID` | ✅ | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | ✅ | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | ✅ | OAuth callback URL |
| `FRONTEND_URL` | ✅ | Frontend base URL (for redirects) |
| `CORS_ORIGINS` | ✅ | Comma-separated list of allowed origins |

> ⚠️ **Never commit `.env`** — only `.env.example` belongs in the repo.

---

## 🛠️ Available Make Commands

```bash
make up                                      # Start all services
make down                                    # Stop all services
make build                                   # Rebuild Docker images from scratch
make logs                                    # Follow all logs
make logs-api                                # Follow API logs only
make migrate                                 # Run DB migrations
make migrate-create name="add_users_table"   # Create a new migration
make shell-api                               # Bash shell inside the API container
make shell-db                                # psql shell in the database
make test                                    # Run pytest
make lint                                    # Run ruff linter
```

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/auth/register` | Create account |
| `POST` | `/api/auth/login` | Login → get tokens |
| `POST` | `/api/auth/refresh` | Refresh access token |
| `GET` | `/api/auth/me` | Get current user |
| `GET` | `/api/auth/google` | Google OAuth login |
| `GET` | `/api/auth/google/callback` | Google OAuth callback |
| `GET/POST` | `/api/courses` | List / upload syllabi |
| `GET` | `/api/jobs` | Browse job postings |
| `GET` | `/api/keywords` | List extracted keywords |
| `GET` | `/api/coverage` | Coverage matrix |
| `GET` | `/api/coverage/gaps` | Gap analysis |
| `GET/POST` | `/api/reports` | List / generate reports |

---

