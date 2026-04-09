"""
Celery NLP tasks — syllabus parsing + job keyword extraction.
"""
import sys
import os
import json
import re
import logging
from core.celery_app import celery_app
from core.config import settings
from models.models import Course, JobPosting, Keyword, JobKeyword
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.ext.asyncio import create_async_engine 

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

logger = logging.getLogger(__name__)

sync_engine = create_engine(
    settings.DATABASE_URL
        .replace("postgresql+asyncpg://", "postgresql://")
        .replace("postgresql+psycopg2://", "postgresql://")
        .replace("postgresql://", "postgresql+psycopg2://"),
    pool_pre_ping=True,
)

# ── Robust JSON parser ─────────────────────────────────────────────────────────

def _parse_claude_json(text: str) -> dict:
    text = text.strip()
    text = text.removeprefix("```json").removeprefix("```").removesuffix("```").strip()

    try:
        return json.loads(text)
    except Exception:
        pass

    start = text.find("{")
    end = text.rfind("}") + 1
    if start != -1 and end > 0:
        try:
            return json.loads(text[start:end])
        except Exception:
            pass

    stripped = text.strip().rstrip(",")
    if '"' in stripped:
        try:
            wrapped = "{\n" + stripped + "\n}"
            wrapped = re.sub(r",\s*}", "}", wrapped)
            wrapped = re.sub(r",\s*]", "]", wrapped)
            return json.loads(wrapped)
        except Exception:
            pass

    raise ValueError(f"Could not parse Claude JSON: {text[:150]}")


# ── Domain classification prompt (UTD taxonomy) ───────────────────────────────

DOMAIN_PROMPT = """\
Classify this university course into exactly one UTD department, and extract all topics taught.

UTD DEPARTMENTS — pick the single best match:

Erik Jonsson School of Engineering & Computer Science:
- "Computer Science"                    → course codes CS, SE — programming, algorithms, AI/ML, data science, cybersecurity, networking, software engineering
- "Electrical & Computer Engineering"   → course codes EE, ECE, CE — embedded systems, hardware, FPGA, circuit design, signal processing, IoT
- "Bioengineering"                      → course code BMEN — biomedical devices, clinical instrumentation, bioinformatics, genomics, tissue engineering
- "Mechanical Engineering"              → course codes MECH, ME — CAD, thermodynamics, fluid mechanics, manufacturing, robotics, FEA
- "Materials Science & Engineering"     → course code MSEN — materials characterization, polymers, semiconductors, nanotechnology
- "Systems Engineering"                 → course code SEM — systems integration, DevOps, cloud infrastructure, reliability, architecture

Naveen Jindal School of Management:
- "Accounting"                          → course code ACCT — financial reporting, GAAP, auditing, tax, bookkeeping, CPA
- "Finance"                             → course code FIN — financial analysis, investment, risk management, quantitative finance, banking
- "Information Systems"                 → course codes MIS, ITSS, BUAN — IT management, ERP, enterprise systems, business analytics, IT strategy
- "Marketing"                           → course code MKT — digital marketing, SEO, brand management, market research, CRM
- "Operations / Supply Chain"           → course code OPRE — supply chain, logistics, procurement, inventory, lean, Six Sigma
- "Organizations, Strategy & Intl Mgmt" → course codes OBHR, HMGT, BA — strategy, leadership, organizational behavior, change management

CLASSIFICATION RULES — course code prefix is the STRONGEST signal, always prioritize it:
- "ACCT 2301 Introduction to Financial Accounting" → Accounting         (ACCT prefix)
- "CS 6375 Machine Learning"                       → Computer Science   (CS prefix — even though topic is ML/AI)
- "SE 6367 Software Testing"                       → Computer Science   (SE prefix = Software Engineering)
- "BUAN 6341 / MIS 6341 Applied Machine Learning"  → Information Systems (BUAN/MIS prefix — even though topic is ML)
- "EE 4301 Digital Signal Processing"              → Electrical & Computer Engineering (EE prefix)
- "FIN 6301 Corporate Finance"                     → Finance            (FIN prefix)
- "MIS 6300 IT Management"                         → Information Systems (MIS prefix)
- "OPRE 6301 Operations Management"                → Operations / Supply Chain (OPRE prefix)
- "MKT 6301 Marketing Analytics"                   → Marketing          (MKT prefix)
- "SEM 6301 Systems Architecture"                  → Systems Engineering (SEM prefix)
- "BMEN 3301 Biomedical Instrumentation"           → Bioengineering     (BMEN prefix)

CS SUBDOMAIN RULES — if course is Computer Science or Information Systems with technical content:
- Neural networks, deep learning, ML, AI, PyTorch, NLP, LLM → append "/AI/ML"
  e.g. domain = "Computer Science/AI/ML" or "Information Systems/AI/ML"
- Penetration testing, security, cryptography, SOC, SIEM → append "/Cybersecurity"
  e.g. domain = "Computer Science/Cybersecurity"
- Statistics, data analysis, visualization, SQL, R → append "/Data Science"
  e.g. domain = "Computer Science/Data Science"
- APIs, testing, design patterns, web dev, mobile dev → append "/Software Engineering"
  e.g. domain = "Computer Science/Software Engineering"
- TCP/IP, routing, protocols, network admin → append "/Networking"
  e.g. domain = "Computer Science/Networking"
- If course is general CS with no clear subdomain → keep as "Computer Science"

SUBDOMAIN EXAMPLES:
- "BUAN 6341 Applied Machine Learning" → "Information Systems/AI/ML"
- "CS 6375 Machine Learning"           → "Computer Science/AI/ML"
- "CS 6324 Information Security"       → "Computer Science/Cybersecurity"
- "CS 6360 Database Design"            → "Computer Science/Data Science"
- "SE 6367 Software Testing"           → "Computer Science/Software Engineering"
- "CS 4390 Computer Networks"          → "Computer Science/Networking"
- "CS 5333 Discrete Structures"        → "Computer Science"

CRITICAL: A machine learning or AI course with MIS/BUAN prefix → "Information Systems", NOT "Computer Science".
The department offering the course (shown by prefix) determines the domain, not the subject matter.

TOPIC EXTRACTION RULES:
- Extract 10-25 specific academic topics actually taught in this course
- Look at ALL sections: course description, chapter titles, weekly schedule, lecture topics, learning objectives
- Extract the actual subject matter (e.g. "Financial Statements", "Neural Networks", "Supply Chain Optimization")
- Chapter and lecture titles from the class schedule are especially valuable — extract each one
- DO NOT include administrative items: "exam", "quiz", "homework", "grading", "attendance", "syllabus"
- Each topic should be 2-6 words, specific and meaningful

Course name: {course_title}

Syllabus (first 6000 chars):
{syllabus_text}

Respond with ONLY this JSON object and nothing else:
{{
  "course_title": "official course title from syllabus",
  "domain": "UTD department string, optionally with CS subdomain e.g. 'Computer Science/AI/ML' or 'Information Systems/AI/ML'",
  "domain_reasoning": "one sentence explaining why",
  "topics": ["topic1", "topic2", "topic3"],
  "sections": {{
    "objectives": "brief summary of course objectives",
    "weekly_topics": [],
    "tools_used": [],
    "prerequisites": ""
  }}
}}"""


# ── Syllabus Parsing ───────────────────────────────────────────────────────────

@celery_app.task(bind=True, max_retries=3)
def parse_syllabus(self, course_id: str):
    """Parse uploaded syllabus — extract text + topics + UTD department via Claude Haiku."""
    try:
        from services.parser.pdf import extract_text_from_pdf
        from services.parser.docx_parser import extract_text_from_docx
        import anthropic

        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

        with Session(sync_engine) as db:
            course = db.get(Course, course_id)
            if not course or not course.file_path:
                return

            course.status = "parsing"
            db.commit()

            # Use already-extracted text if available (uploaded before file loss)
            # Otherwise try to extract from file (may fail on ephemeral filesystem)
            if course.raw_text and len(course.raw_text) > 100:
                raw_text = course.raw_text
            else:
                ext = os.path.splitext(course.file_path)[1].lower() if course.file_path else ""
                if ext == ".pdf":
                    raw_text = extract_text_from_pdf(course.file_path)
                elif ext in (".docx", ".doc"):
                    raw_text = extract_text_from_docx(course.file_path)
                else:
                    raw_text = ""
                course.raw_text = raw_text

            if raw_text and len(raw_text) > 100:
                try:
                    prompt = DOMAIN_PROMPT.format(
                        course_title=course.title or "Unknown Course",
                        syllabus_text=raw_text[:6000],
                    )

                    message = client.messages.create(
                        model="claude-haiku-4-5-20251001",
                        max_tokens=2000,
                        messages=[{"role": "user", "content": prompt}]
                    )

                    raw_response = message.content[0].text
                    logger.info(f"[ParseTask] Raw response (first 300): {raw_response[:300]}")

                    result = _parse_claude_json(raw_response)

                    # Filter out admin words from topics
                    admin_words = {
                        "exam", "quiz", "homework", "grading", "attendance",
                        "syllabus", "chapter", "week", "introduction", "final",
                        "midterm", "project", "assignment", "lecture", "class"
                    }
                    topics = [
                        t for t in result.get("topics", [])
                        if t and len(t) > 3
                        and not any(w in t.lower() for w in admin_words)
                    ]

                    course.parsed_topics   = topics
                    course.parsed_sections = result.get("sections", {})

                    if result.get("course_title") and not course.title:
                        course.title = result["course_title"]

                    if result.get("domain"):
                        course.domain = result["domain"]
                        logger.info(
                            f"[ParseTask] '{course.title}' → dept='{result['domain']}' "
                            f"| {len(topics)} topics | reason: {result.get('domain_reasoning', '')}"
                        )

                except Exception as e:
                    logger.error(f"[ParseTask] Claude extraction failed: {e}")
                    course.parsed_topics = []

            course.status = "parsed"
            db.commit()

            from tasks.coverage_tasks import compute_course_coverage
            compute_course_coverage.delay(str(course_id))
            logger.info(f"[ParseTask] Coverage queued for course {course_id}")

    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)


# ── Job Keyword Extraction ─────────────────────────────────────────────────────

@celery_app.task(bind=True, max_retries=2)
def extract_job_keywords(self, job_id: str):
    """Extract and store keywords from a single job posting."""
    try:
        from services.nlp.keyword_extractor import extract_keywords_with_claude
        from services.nlp.normalizer import normalize_skill
        from services.nlp.embeddings import get_embedding

        with Session(sync_engine) as db:
            job = db.get(JobPosting, job_id)
            if not job:
                return

            result = extract_keywords_with_claude(
                title=job.title,
                description=job.description or "",
            )

            if not result["keywords"]:
                return

            if result["role_domain"] and not job.domain:
                job.domain = result["role_domain"]

            for kw in result["keywords"]:
                raw_skill = kw.get("skill", "")
                if not raw_skill:
                    continue

                normalized = normalize_skill(raw_skill).lower().replace(" ", "_")
                canonical  = normalize_skill(raw_skill)

                existing = db.execute(
                    select(Keyword).where(Keyword.normalized == normalized)
                ).scalar_one_or_none()

                if existing:
                    existing.frequency += 1
                    keyword = existing
                else:
                    embedding = get_embedding(canonical)
                    keyword = Keyword(
                        text=canonical,
                        normalized=normalized,
                        domain=kw.get("category", result["role_domain"]),
                        category=kw.get("category", ""),
                        importance=kw.get("importance", "required"),
                        is_emerging=kw.get("is_emerging", False),
                        embedding=embedding if embedding else None,
                        frequency=1,
                    )
                    db.add(keyword)
                    db.flush()

                existing_link = db.execute(
                    select(JobKeyword).where(
                        JobKeyword.job_id    == job.id,
                        JobKeyword.keyword_id == keyword.id,
                    )
                ).scalar_one_or_none()

                if not existing_link:
                    db.add(JobKeyword(job_id=job.id, keyword_id=keyword.id))

            db.commit()
            print(f"Extracted {len(result['keywords'])} keywords from: {job.title[:50]}")

    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(bind=True)
def extract_all_job_keywords(self, batch_size: int = 50, limit: int = 500):
    """Process all unprocessed job postings in batches."""
    from services.nlp.keyword_extractor import extract_keywords_with_claude
    from services.nlp.normalizer import normalize_skill
    from services.nlp.embeddings import get_embedding

    with Session(sync_engine) as db:
        processed_job_ids = db.execute(
            select(JobKeyword.job_id).distinct()
        ).scalars().all()

        jobs = db.execute(
            select(JobPosting)
            .where(JobPosting.id.notin_(processed_job_ids))
            .limit(limit)
        ).scalars().all()

        total = len(jobs)
        print(f"Processing {total} jobs for keyword extraction...")

        for i, job in enumerate(jobs):
            try:
                result = extract_keywords_with_claude(
                    title=job.title,
                    description=job.description or "",
                )

                if result["role_domain"] and not job.domain:
                    job.domain = result["role_domain"]

                for kw in result["keywords"]:
                    raw_skill = kw.get("skill", "")
                    if not raw_skill:
                        continue

                    normalized = normalize_skill(raw_skill).lower().replace(" ", "_")
                    canonical  = normalize_skill(raw_skill)

                    existing = db.execute(
                        select(Keyword).where(Keyword.normalized == normalized)
                    ).scalar_one_or_none()

                    if existing:
                        existing.frequency += 1
                        keyword = existing
                    else:
                        embedding = get_embedding(canonical)
                        keyword = Keyword(
                            text=canonical,
                            normalized=normalized,
                            domain=kw.get("category", result["role_domain"]),
                            category=kw.get("category", ""),
                            importance=kw.get("importance", "required"),
                            is_emerging=kw.get("is_emerging", False),
                            embedding=embedding if embedding else None,
                            frequency=1,
                        )
                        db.add(keyword)
                        db.flush()

                    existing_link = db.execute(
                        select(JobKeyword).where(
                            JobKeyword.job_id    == job.id,
                            JobKeyword.keyword_id == keyword.id,
                        )
                    ).scalar_one_or_none()

                    if not existing_link:
                        db.add(JobKeyword(job_id=job.id, keyword_id=keyword.id))

                db.commit()

                if (i + 1) % 10 == 0:
                    print(f"Progress: {i+1}/{total} jobs processed")

            except Exception as e:
                print(f"Failed on job {job.id}: {e}")
                db.rollback()
                continue

        print(f"Keyword extraction complete — {total} jobs processed")
        return {"processed": total}
    

    