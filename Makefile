# SyllaCheck — Developer Commands
# Usage: make <command>

.PHONY: up down build logs shell-api shell-db migrate seed test lint

# ── Docker ─────────────────────────────────────────────────────────────
up:
	docker compose up -d
	@echo "✅  SyllaCheck running at http://localhost"
	@echo "📖  API docs at http://localhost/api/docs"

down:
	docker compose down

build:
	docker compose build --no-cache

logs:
	docker compose logs -f

logs-api:
	docker compose logs -f api

logs-worker:
	docker compose logs -f worker

# ── Database ───────────────────────────────────────────────────────────
migrate:
	docker compose exec api alembic upgrade head

migrate-create:
	docker compose exec api alembic revision --autogenerate -m "$(name)"

shell-db:
	docker compose exec db psql -U syllacheck -d syllacheck

# ── Backend ────────────────────────────────────────────────────────────
shell-api:
	docker compose exec api bash

test:
	docker compose exec api pytest tests/ -v

lint:
	docker compose exec api ruff check .

# ── Frontend ───────────────────────────────────────────────────────────
shell-frontend:
	docker compose exec frontend sh

# ── Setup ──────────────────────────────────────────────────────────────
setup:
	cp .env.example .env
	@echo "⚠️  Edit .env and add your OPENAI_API_KEY, then run: make up && make migrate"
