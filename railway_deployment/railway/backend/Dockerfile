# backend/Dockerfile  (Railway-compatible — replaces existing)
FROM python:3.11-slim

WORKDIR /app

# System dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Python dependencies (cached layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download spaCy model
RUN python -m spacy download en_core_web_sm

# Copy source
COPY . .

# Create output dirs (Railway uses ephemeral storage;
# for persistence wire a Railway Volume in the dashboard)
RUN mkdir -p /app/uploads /app/reports

# Railway injects $PORT at runtime — do NOT hardcode 8000 here.
# The start command in railway.toml uses $PORT.
EXPOSE 8000

# Default dev command (overridden by railway.toml in production)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
