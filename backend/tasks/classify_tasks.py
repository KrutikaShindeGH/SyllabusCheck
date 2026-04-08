"""
Celery tasks for keyword subdomain classification.

Converts the one-time script (scripts/classify_cs_subdomains.py) into a
triggerable Celery task so it can be run in production via Swagger or beat.

Subdomains:
  AI/ML | Cybersecurity | Data Science | Software Engineering | Networking | General CS
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import json
import time
import logging

from sqlalchemy import create_engine, text
import anthropic

from core.config import settings
from core.celery_app import celery_app

logger = logging.getLogger(__name__)

DATABASE_URL_SYNC = settings.DATABASE_URL.replace(
    "postgresql+asyncpg://", "postgresql+psycopg2://"
).replace(
    "postgresql://", "postgresql+psycopg2://"
)
sync_engine = create_engine(DATABASE_URL_SYNC, pool_pre_ping=True)

VALID_SUBDOMAINS = {
    "AI/ML", "Cybersecurity", "Data Science",
    "Software Engineering", "Networking", "General CS"
}

SUBDOMAIN_PROMPT = """Classify each Computer Science keyword into exactly one subdomain.

SUBDOMAINS:
- "AI/ML"                 → machine learning, deep learning, NLP, LLMs, neural networks, PyTorch, TensorFlow, computer vision, reinforcement learning, embeddings, transformers, RAG, fine-tuning, model training/evaluation, MLOps, AI agents
- "Cybersecurity"         → security, pentesting, SOC, SIEM, encryption, firewalls, vulnerabilities, malware, incident response, compliance, zero trust, IAM, OWASP
- "Data Science"          → statistics, data analysis, pandas, numpy, SQL, ETL, BI tools, data visualization, Tableau, Power BI, R, data warehousing, data pipelines, Spark, Hadoop
- "Software Engineering"  → programming languages, APIs, Git, CI/CD, testing, web dev, mobile dev, OOP, design patterns, microservices, Docker, Kubernetes, system design, databases (as tools)
- "Networking"            → TCP/IP, DNS, routing, protocols, Cisco, network infrastructure, VPN, SDN, load balancing, CDN, HTTP, REST (as protocol)
- "General CS"            → algorithms, data structures, theory of computation, compilers, operating systems, general programming concepts, computer architecture, discrete math

Return ONLY a JSON object mapping each keyword to its subdomain:
{{"keyword1": "AI/ML", "keyword2": "Software Engineering", ...}}

Keywords to classify:
{keywords}"""


def _classify_batch(client: anthropic.Anthropic, keywords: list[str]) -> dict[str, str]:
    """Call Claude Haiku to classify a batch of keywords into subdomains."""
    kw_list = "\n".join(f"- {k}" for k in keywords)
    prompt = SUBDOMAIN_PROMPT.format(keywords=kw_list)

    try:
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}]
        )
        raw = message.content[0].text.strip()
        raw = raw.removeprefix("```json").removeprefix("```").removesuffix("```").strip()

        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start != -1 and end > 0:
            return json.loads(raw[start:end])
        return {}
    except Exception as e:
        logger.error(f"[ClassifyTask] Claude API error: {e}")
        return {}


@celery_app.task(name="tasks.classify_tasks.classify_keyword_subdomains", bind=True, max_retries=1)
def classify_keyword_subdomains(self, domain: str = "Computer Science", batch_size: int = 50):
    """
    Classify all unclassified keywords in a given domain into subdomains.

    Calls Claude Haiku in batches of `batch_size` keywords.
    Keywords not classified by Claude fall back to 'General CS'.

    Args:
        domain:     The keyword domain to classify (default: 'Computer Science')
        batch_size: Keywords per Claude API call (default: 50, max recommended: 100)

    Returns:
        dict with updated, fallback, skipped counts and subdomain distribution.
    """
    logger.info(f"[ClassifyTask] classify_keyword_subdomains started — domain={domain}")

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    updated = 0
    fallback = 0

    try:
        with sync_engine.connect() as conn:
            rows = conn.execute(text("""
                SELECT id::text, text
                FROM keywords
                WHERE domain = :domain
                  AND subdomain IS NULL
                ORDER BY frequency DESC
            """), {"domain": domain}).fetchall()

            total = len(rows)
            logger.info(f"[ClassifyTask] Found {total} unclassified keywords in domain '{domain}'")

            if total == 0:
                logger.info("[ClassifyTask] Nothing to classify.")
                return {"updated": 0, "fallback": 0, "total": 0, "message": "All keywords already classified"}

            for i in range(0, total, batch_size):
                batch = rows[i:i + batch_size]
                keywords = [r[1] for r in batch]
                id_map = {r[1]: r[0] for r in batch}  # text -> uuid string

                batch_num = i // batch_size + 1
                total_batches = (total + batch_size - 1) // batch_size
                logger.info(f"[ClassifyTask] Batch {batch_num}/{total_batches} ({len(batch)} keywords)...")

                classifications = _classify_batch(client, keywords)

                # Write classified results
                classified_lower = {k.lower(): v for k, v in classifications.items()}
                for kw_text, kw_id in id_map.items():
                    subdomain = (
                        classifications.get(kw_text)
                        or classified_lower.get(kw_text.lower())
                    )

                    if subdomain not in VALID_SUBDOMAINS:
                        subdomain = "General CS"
                        fallback += 1
                    else:
                        updated += 1

                    conn.execute(text("""
                        UPDATE keywords SET subdomain = :subdomain WHERE id = :id
                    """), {"subdomain": subdomain, "id": kw_id})

                conn.commit()
                logger.info(
                    f"[ClassifyTask] Batch {batch_num} done — "
                    f"classified: {len(classifications)}, fallback: {len(batch) - len(classifications)}"
                )

                # Avoid hammering the API
                time.sleep(0.3)

            # Final distribution
            dist_rows = conn.execute(text("""
                SELECT subdomain, COUNT(*) as count
                FROM keywords
                WHERE domain = :domain
                GROUP BY subdomain
                ORDER BY count DESC
            """), {"domain": domain}).fetchall()

            distribution = {r[0] or "NULL": r[1] for r in dist_rows}

        logger.info(f"[ClassifyTask] Done — updated={updated} fallback={fallback}")
        logger.info(f"[ClassifyTask] Distribution: {distribution}")

        return {
            "domain": domain,
            "total_processed": total,
            "updated": updated,
            "fallback_to_general_cs": fallback,
            "distribution": distribution,
        }

    except Exception as exc:
        logger.error(f"[ClassifyTask] Fatal error: {exc}", exc_info=True)
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(name="tasks.classify_tasks.backfill_keyword_embeddings", bind=True, max_retries=1)
def backfill_keyword_embeddings(self, batch_size: int = 200):
    """
    Backfill embeddings for all keywords that have NULL embeddings.
    Uses sentence-transformers all-MiniLM-L6-v2 (local, no API key needed).
    Run once after importing keywords without embeddings.
    """
    from services.nlp.embeddings import get_embeddings_batch

    logger.info("[EmbedTask] backfill_keyword_embeddings started")

    try:
        with sync_engine.connect() as conn:
            rows = conn.execute(text("""
                SELECT id::text, text
                FROM keywords
                WHERE embedding IS NULL
                ORDER BY frequency DESC
            """)).fetchall()

            total = len(rows)
            logger.info(f"[EmbedTask] Found {total} keywords missing embeddings")

            if total == 0:
                return {"message": "All keywords already have embeddings", "updated": 0}

            updated = 0
            for i in range(0, total, batch_size):
                batch = rows[i:i + batch_size]
                texts = [r[1] for r in batch]
                ids = [r[0] for r in batch]

                batch_num = i // batch_size + 1
                total_batches = (total + batch_size - 1) // batch_size
                logger.info(f"[EmbedTask] Batch {batch_num}/{total_batches} ({len(batch)} keywords)...")

                embeddings = get_embeddings_batch(texts)

                for kw_id, embedding in zip(ids, embeddings):
                    if embedding:
                        conn.execute(text("""
                            UPDATE keywords SET embedding = :emb WHERE id = :id
                        """), {"emb": str(embedding), "id": kw_id})
                        updated += 1

                conn.commit()
                logger.info(f"[EmbedTask] Batch {batch_num} done — embedded {len([e for e in embeddings if e])}/{len(batch)}")

        logger.info(f"[EmbedTask] Done — updated={updated}/{total}")
        return {"total": total, "updated": updated}

    except Exception as exc:
        logger.error(f"[EmbedTask] Fatal error: {exc}", exc_info=True)
        raise self.retry(exc=exc, countdown=60)
    
    