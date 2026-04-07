# SyllabusCheck 🎓

**Curriculum vs. Industry Keyword Alignment Analyzer**

SyllabusCheck helps university professors keep their course syllabi aligned with what companies are actually hiring for. Upload your syllabi, scrape live job boards, extract required skills with AI, and get a per-course gap report showing exactly what needs to be added.

---

## Project Status

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Setup, Docker, DB, Auth, CI/CD | ✅ Complete |
| Phase 2 | Syllabus upload & parsing | 🔜 Next |
| Phase 3 | Job board scraping | 🔜 Upcoming |
| Phase 4 | AI/NLP keyword extraction | 🔜 Upcoming |
| Phase 5 | Coverage engine & gap analysis | 🔜 Upcoming |
| Phase 6 | Frontend dashboard | 🔜 Upcoming |
| Phase 7 | Reports & deployment | 🔜 Upcoming |

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
| Job Data | Indeed/Dice MCP + Playwright | Live job postings from 11+ sources |
| Auth | JWT + RBAC | Secure, role-based access |
| Infra | Docker + Nginx | Local dev + production ready |
| CI/CD | GitHub Actions | Auto test + deploy on push |

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- [Git](https://git-scm.com/)
- An [OpenAI API key](https://platform.openai.com/api-keys) (for Phase 4+)

---

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/your-username/syllacheck.git
cd syllacheck

# 2. Create your .env file
make setup
# Then open .env and add your OPENAI_API_KEY

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
syllacheck/
│
├── backend/                        # FastAPI Python backend
│   ├── main.py                     # App entry point
│   ├── requirements.txt
│   ├── Dockerfile
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
│   │       ├── courses.py          # /api/courses — upload & manage syllabi  [Phase 2]
│   │       ├── jobs.py             # /api/jobs — browse job postings          [Phase 3]
│   │       ├── coverage.py         # /api/coverage — matrix & gap analysis    [Phase 5]
│   │       ├── reports.py          # /api/reports — generate PDF/Excel        [Phase 7]
│   │       └── health.py           # /api/health — service health check
│   │
│   ├── services/                   # Business logic (Phase 2–5)
│   │   ├── scraper/                # Job board scrapers
│   │   ├── nlp/                    # Keyword extraction + embeddings
│   │   ├── parser/                 # PDF/DOCX syllabus parser
│   │   └── coverage/               # Coverage engine & gap analyzer
│   │
│   ├── tasks/                      # Celery async tasks (Phase 3–5)
│   │   ├── scrape_tasks.py
│   │   ├── nlp_tasks.py
│   │   ├── coverage_tasks.py
│   │   └── report_tasks.py
│   │
│   ├── migrations/                 # Alembic DB migrations
│   │   └── versions/
│   │       └── 001_initial.py
│   │
│   └── tests/                      # pytest test suite
│
├── frontend/                       # React + TypeScript frontend  [Phase 6]
│   └── src/
│       ├── pages/                  # Dashboard, JobExplorer, Syllabi, Matrix, Gaps, Reports
│       ├── components/             # Reusable UI components
│       ├── store/                  # Zustand state management
│       ├── hooks/                  # Custom React hooks
│       └── lib/                    # API client, utils
│
├── infra/
│   ├── docker/
│   │   └── init.sql                # Enables pgvector + uuid-ossp extensions
│   └── nginx/
│       └── nginx.conf              # Reverse proxy config
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

## API Endpoints (Phase 1)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/health | Health check |
| POST | /api/auth/register | Create account |
| POST | /api/auth/login | Login → get tokens |
| POST | /api/auth/refresh | Refresh access token |
| GET | /api/auth/me | Get current user |

Full interactive docs: **http://localhost/api/docs**

---

## Environment Variables

Copy `.env.example` to `.env` and fill in:

| Variable | Required | Description |
|----------|----------|-------------|
| `SECRET_KEY` | Yes | Random string for app security |
| `JWT_SECRET_KEY` | Yes | Random string for JWT signing |
| `OPENAI_API_KEY` | Phase 4+ | Your OpenAI key |
| `POSTGRES_PASSWORD` | Yes | DB password (change in production) |

---

## Deployment

**Development** (current): Docker Compose on your local machine

**Pilot** (Phase 7): [Render](https://render.com) + [Supabase](https://supabase.com) — free tier available

**Production**: AWS ECS / Azure Container Apps — see `infra/` folder

---

## Contributing / Development Notes

- All API changes go through `dev` branch → PR to `main`
- CI must pass before merging (tests + lint + build)
- Never commit `.env` — only `.env.example`
- Database changes always go through an Alembic migration — never edit tables manually
