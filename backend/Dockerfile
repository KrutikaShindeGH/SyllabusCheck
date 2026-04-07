FROM python:3.11-slim

WORKDIR /app

# System dependencies - minimal
RUN apt-get update && apt-get install -y \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download only the small spaCy model
RUN python -m spacy download en_core_web_sm && \
    pip cache purge

# Copy source
COPY . .

RUN mkdir -p /app/uploads /app/reports

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

