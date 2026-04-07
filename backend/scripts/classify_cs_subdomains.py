"""
One-time script to classify all Computer Science keywords into subdomains.
Run: docker compose exec api python scripts/classify_cs_subdomains.py

Subdomains:
  AI/ML              - machine learning, deep learning, NLP, LLMs, PyTorch, TensorFlow, neural networks
  Cybersecurity      - security, pentesting, SOC, SIEM, encryption, firewalls, vulnerabilities
  Data Science       - statistics, data analysis, pandas, SQL, ETL, BI, visualization, R
  Software Engineering - APIs, Git, CI/CD, testing, web dev, mobile dev, OOP, design patterns
  Networking         - TCP/IP, DNS, routing, protocols, Cisco, network infrastructure
  General CS         - algorithms, data structures, theory, compilers, OS, general programming
"""
import sys
import os
import json
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text
from core.config import settings
import anthropic

engine = create_engine(
    settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql+psycopg2://"),
    pool_pre_ping=True,
)

client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

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


def classify_batch(keywords: list[str]) -> dict[str, str]:
    """Classify a batch of keywords into subdomains."""
    kw_list = "\n".join(f"- {k}" for k in keywords)
    prompt = SUBDOMAIN_PROMPT.format(keywords=kw_list)

    try:
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}]
        )
        text = message.content[0].text.strip()
        text = text.removeprefix("```json").removeprefix("```").removesuffix("```").strip()

        # Find JSON object
        start = text.find("{")
        end = text.rfind("}") + 1
        if start != -1 and end > 0:
            return json.loads(text[start:end])
        return {}
    except Exception as e:
        print(f"  Claude error: {e}")
        return {}


VALID_SUBDOMAINS = {"AI/ML", "Cybersecurity", "Data Science", "Software Engineering", "Networking", "General CS"}


def main():
    print("=== CS Keyword Subdomain Classifier ===")

    with engine.connect() as conn:
        # Fetch all unclassified CS keywords
        rows = conn.execute(text("""
            SELECT id::text, text
            FROM keywords
            WHERE domain = 'Computer Science'
              AND subdomain IS NULL
            ORDER BY frequency DESC
        """)).fetchall()

        total = len(rows)
        print(f"Found {total} unclassified CS keywords")

        if total == 0:
            print("All CS keywords already classified!")
            return

        # Process in batches of 50
        batch_size = 50
        updated = 0
        failed = 0

        for i in range(0, total, batch_size):
            batch = rows[i:i + batch_size]
            keywords = [r[1] for r in batch]
            id_map = {r[1]: r[0] for r in batch}  # text -> id

            batch_num = i // batch_size + 1
            total_batches = (total + batch_size - 1) // batch_size
            print(f"\nBatch {batch_num}/{total_batches} ({len(batch)} keywords)...")

            # Classify with Claude
            classifications = classify_batch(keywords)

            # Update DB
            for kw_text, subdomain in classifications.items():
                if subdomain not in VALID_SUBDOMAINS:
                    subdomain = "General CS"  # fallback

                kw_id = id_map.get(kw_text)
                if not kw_id:
                    # Try case-insensitive match
                    kw_id = next((id_map[k] for k in id_map if k.lower() == kw_text.lower()), None)

                if kw_id:
                    conn.execute(text("""
                        UPDATE keywords SET subdomain = :subdomain WHERE id = :id
                    """), {"subdomain": subdomain, "id": kw_id})
                    updated += 1

            # Keywords not returned by Claude → General CS
            classified_texts = set(classifications.keys())
            for kw_text, kw_id in id_map.items():
                if kw_text not in classified_texts and kw_text.lower() not in [c.lower() for c in classified_texts]:
                    conn.execute(text("""
                        UPDATE keywords SET subdomain = 'General CS' WHERE id = :id
                    """), {"id": kw_id})
                    failed += 1

            conn.commit()
            print(f"  Classified {len(classifications)}/{len(batch)} | fallback: {len(batch) - len(classifications)}")

            # Rate limit protection
            time.sleep(0.3)

        print(f"\n=== Done ===")
        print(f"Updated: {updated} | Fallback to General CS: {failed}")

        # Show distribution
        dist = conn.execute(text("""
            SELECT subdomain, COUNT(*) as count
            FROM keywords
            WHERE domain = 'Computer Science'
            GROUP BY subdomain
            ORDER BY count DESC
        """)).fetchall()

        print("\nSubdomain distribution:")
        for r in dist:
            print(f"  {r[0] or 'NULL'}: {r[1]}")


if __name__ == "__main__":
    main()


    