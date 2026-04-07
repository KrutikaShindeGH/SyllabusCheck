import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import logging
import numpy as np
from typing import List, Dict, Tuple, Optional
from sqlalchemy import create_engine, text

from core.config import settings

logger = logging.getLogger(__name__)

DATABASE_URL_SYNC = settings.DATABASE_URL.replace(
    "postgresql+asyncpg://", "postgresql+psycopg2://"
)
sync_engine = create_engine(DATABASE_URL_SYNC, pool_pre_ping=True)

COVERED_THRESHOLD = 0.72
PARTIAL_THRESHOLD  = 0.45

# Max keywords to compare against per domain — keeps scores realistic
# and consistent with Coverage Matrix (which also uses top N by frequency)
MAX_KEYWORDS_PER_DOMAIN = 150

# ── UTD Department → Keyword Domains to check against ─────────────────────────
CS_SUBDOMAINS = ["AI/ML", "Cybersecurity", "Data Science", "Software Engineering", "Networking", "General CS"]

DOMAIN_FILTER_MAP = {

    # ── Erik Jonsson School ───────────────────────────────────────────────────

    "Computer Science":                    [("Computer Science", None)],
    "Computer Science/AI/ML":             [("Computer Science", "AI/ML")],
    "Computer Science/Cybersecurity":     [("Computer Science", "Cybersecurity")],
    "Computer Science/Data Science":      [("Computer Science", "Data Science")],
    "Computer Science/Software Engineering": [("Computer Science", "Software Engineering")],
    "Computer Science/Networking":        [("Computer Science", "Networking")],

    "Electrical & Computer Engineering":   [("Electrical & Computer Engineering", None),
                                           ("Computer Science", "General CS")],
    "Bioengineering":                      [("Bioengineering", None)],
    "Mechanical Engineering":              [("Mechanical Engineering", None)],
    "Materials Science & Engineering":     [("Materials Science & Engineering", None)],
    "Systems Engineering":                 [("Systems Engineering", None)],

    # ── Naveen Jindal School ──────────────────────────────────────────────────

    "Accounting":                          [("Accounting", None)],
    "Finance":                             [("Finance", None)],
    "Information Systems":                 [("Information Systems", None),
                                            ("Computer Science", "Software Engineering"),
                                            ("Computer Science", "Data Science")],
    "Information Systems/AI/ML":          [("Information Systems", None),
                                            ("Computer Science", "AI/ML"),
                                            ("Computer Science", "Data Science")],
    "Marketing":                           [("Marketing", None)],
    "Operations / Supply Chain":           [("Operations / Supply Chain", None)],
    "Organizations, Strategy & Intl Mgmt": [("Organizations, Strategy & Intl Mgmt", None)],
}

DOMAIN_ALIASES = {
    "CS":                            "Computer Science",
    "ECE":                           "Electrical & Computer Engineering",
    "Electrical and Computer Engineering": "Electrical & Computer Engineering",
    "Biomedical Engineering":        "Bioengineering",
    "Bio Engineering":               "Bioengineering",
    "Mechanical":                    "Mechanical Engineering",
    "Materials Science":             "Materials Science & Engineering",
    "Systems":                       "Systems Engineering",
    "MIS":                           "Information Systems",
    "Management Information Systems": "Information Systems",
    "Supply Chain":                  "Operations / Supply Chain",
    "Operations":                    "Operations / Supply Chain",
    "Strategy":                      "Organizations, Strategy & Intl Mgmt",
    "Org Strategy":                  "Organizations, Strategy & Intl Mgmt",
    "AI/ML":                         "Computer Science",
    "AIML":                          "Computer Science",
    "Artificial Intelligence":       "Computer Science",
    "Machine Learning":              "Computer Science",
    "Data Science":                  "Computer Science",
    "Software Engineering":          "Computer Science",
    "Computer Engineering":          "Electrical & Computer Engineering",
    "Cloud & DevOps":                "Systems Engineering",
    "Databases":                     "Computer Science",
    "Information Technology Management": "Information Systems",
    "IT Management":                 "Information Systems",
    "Business Analyst":              "Information Systems",
    "Business Analytics":            "Information Systems",
    "Finance":                       "Finance",
    "Financial Accounting":          "Accounting",
    "Medical":                       "Bioengineering",
    "Healthcare":                    "Bioengineering",
    "Health Informatics":            "Bioengineering",
}

FALLBACK_DOMAINS = [("Computer Science", None)]

ALL_DEPARTMENTS = list(DOMAIN_FILTER_MAP.keys())


def _get_relevant_domains(course_domain: Optional[str]) -> List[tuple]:
    if not course_domain:
        logger.warning("[CoverageEngine] No course domain — using fallback")
        return FALLBACK_DOMAINS

    if course_domain in DOMAIN_FILTER_MAP:
        return DOMAIN_FILTER_MAP[course_domain]

    if course_domain in DOMAIN_ALIASES:
        canonical = DOMAIN_ALIASES[course_domain]
        return DOMAIN_FILTER_MAP.get(canonical, FALLBACK_DOMAINS)

    for key in DOMAIN_FILTER_MAP:
        if key.lower() == course_domain.lower():
            return DOMAIN_FILTER_MAP[key]

    for alias, canonical in DOMAIN_ALIASES.items():
        if alias.lower() == course_domain.lower():
            return DOMAIN_FILTER_MAP.get(canonical, FALLBACK_DOMAINS)

    for key in DOMAIN_FILTER_MAP:
        if key.lower() in course_domain.lower() or course_domain.lower() in key.lower():
            return DOMAIN_FILTER_MAP[key]

    logger.warning(f"[CoverageEngine] Unrecognized domain '{course_domain}' — fallback")
    return FALLBACK_DOMAINS


def _get_sentence_transformer():
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer("all-MiniLM-L6-v2")


def _embed_topics(topics: List[str]) -> np.ndarray:
    if not topics:
        return np.empty((0, 384), dtype=np.float32)
    model = _get_sentence_transformer()
    vectors = model.encode(topics, normalize_embeddings=True, show_progress_bar=False)
    return np.array(vectors, dtype=np.float32)


def _fetch_keyword_embeddings(
    conn,
    relevant_domains: List[tuple],
    limit: int = MAX_KEYWORDS_PER_DOMAIN,
) -> Tuple[List[str], np.ndarray]:
    """Fetch top-N keyword embeddings by frequency, filtered by (domain, subdomain) tuples."""
    if not relevant_domains:
        return [], np.empty((0, 384), dtype=np.float32)

    conditions = []
    params = {}
    for i, (domain, subdomain) in enumerate(relevant_domains):
        if subdomain is None:
            conditions.append(f"domain = :d{i}")
            params[f"d{i}"] = domain
        else:
            conditions.append(f"(domain = :d{i} AND subdomain = :s{i})")
            params[f"d{i}"] = domain
            params[f"s{i}"] = subdomain

    where_clause = " OR ".join(conditions)
    params["limit"] = limit

    rows = conn.execute(
        text(f"""
            SELECT id::text, embedding::text
            FROM keywords
            WHERE embedding IS NOT NULL
              AND ({where_clause})
            ORDER BY frequency DESC
            LIMIT :limit
        """),
        params
    ).fetchall()

    if not rows:
        return [], np.empty((0, 384), dtype=np.float32)

    valid_ids, valid_vecs = [], []
    for r in rows:
        try:
            vec = [float(x) for x in r[1].strip("[]").split(",")]
            if len(vec) == 384:
                valid_ids.append(r[0])
                valid_vecs.append(vec)
        except Exception:
            continue

    if not valid_vecs:
        return [], np.empty((0, 384), dtype=np.float32)

    return valid_ids, np.array(valid_vecs, dtype=np.float32)


def _cosine_similarity_matrix(topic_vecs: np.ndarray, kw_vecs: np.ndarray) -> np.ndarray:
    return np.dot(topic_vecs, kw_vecs.T)


def _status_from_score(score: float) -> str:
    if score >= COVERED_THRESHOLD:
        return "covered"
    if score >= PARTIAL_THRESHOLD:
        return "partial"
    return "missing"


def compute_coverage_for_course(course_id: str) -> Dict:
    logger.info(f"[CoverageEngine] Starting coverage for course {course_id}")

    with sync_engine.connect() as conn:
        row = conn.execute(
            text("SELECT parsed_topics, status, domain FROM courses WHERE id = :id"),
            {"id": course_id}
        ).fetchone()

        if not row:
            raise ValueError(f"Course {course_id} not found")

        parsed_topics = row[0]
        course_domain = row[2]

        if not parsed_topics:
            logger.warning(f"[CoverageEngine] No parsed_topics for course {course_id}")
            return {"covered": 0, "partial": 0, "missing": 0, "total": 0, "score": 0.0}

        relevant_domains = _get_relevant_domains(course_domain)
        logger.info(
            f"[CoverageEngine] domain='{course_domain}' → "
            f"checking {len(relevant_domains)} filters: {[(d, s) for d,s in relevant_domains]}"
        )

        logger.info(f"[CoverageEngine] Embedding {len(parsed_topics)} topics …")
        topic_vecs = _embed_topics(parsed_topics)

        keyword_ids, kw_vecs = _fetch_keyword_embeddings(conn, relevant_domains)
        if len(keyword_ids) == 0:
            logger.warning("[CoverageEngine] No keyword embeddings for these domains")
            return {"covered": 0, "partial": 0, "missing": 0, "total": 0, "score": 0.0}

        logger.info(f"[CoverageEngine] Comparing against {len(keyword_ids)} keywords …")

        # sim_matrix shape: (n_topics, n_keywords)
        sim_matrix = _cosine_similarity_matrix(topic_vecs, kw_vecs)

        # ── Per-keyword: best matching topic score (for coverage_rows) ────────
        best_scores_per_kw = sim_matrix.max(axis=0)  # shape: (n_keywords,)

        # ── Per-topic: best matching keyword score (for coverage_score) ───────
        # This answers: "what % of course topics are industry-relevant?"
        # A course teaching 20 topics should score on those 20, not against 356 keywords.
        best_scores_per_topic = sim_matrix.max(axis=1)  # shape: (n_topics,)

        # Write coverage_rows (per-keyword, for Reports/Gap Analysis UI)
        conn.execute(
            text("DELETE FROM coverage_rows WHERE course_id = :cid"),
            {"cid": course_id}
        )

        covered = partial = missing = 0
        for kw_id, score in zip(keyword_ids, best_scores_per_kw.tolist()):
            status = _status_from_score(score)
            if status == "covered":   covered += 1
            elif status == "partial": partial += 1
            else:                     missing += 1

            conn.execute(text("""
                INSERT INTO coverage_rows (id, course_id, keyword_id, similarity_score, status, updated_at)
                VALUES (gen_random_uuid(), :course_id, :kw_id, :score, :status, NOW())
                ON CONFLICT (course_id, keyword_id)
                DO UPDATE SET
                    similarity_score = EXCLUDED.similarity_score,
                    status           = EXCLUDED.status,
                    updated_at       = NOW()
            """), {
                "course_id": course_id,
                "kw_id":     kw_id,
                "score":     float(score),
                "status":    status,
            })

        # ── Coverage score: topic-based (how many course topics are industry-relevant) ──
        n_topics = len(parsed_topics)
        topics_covered = sum(1 for s in best_scores_per_topic if s >= COVERED_THRESHOLD)
        topics_partial = sum(1 for s in best_scores_per_topic if PARTIAL_THRESHOLD <= s < COVERED_THRESHOLD)
        coverage_score = ((topics_covered * 1.0 + topics_partial * 0.5) / n_topics * 100) if n_topics > 0 else 0.0

        conn.execute(text("""
            UPDATE courses SET coverage_score = :score, updated_at = NOW()
            WHERE id = :course_id
        """), {"score": coverage_score, "course_id": course_id})

        conn.commit()

    total = covered + partial + missing
    logger.info(
        f"[CoverageEngine] Done — domain='{course_domain}' "
        f"kw: covered={covered} partial={partial} missing={missing} | "
        f"topic score={coverage_score:.1f}% ({topics_covered}/{n_topics} topics covered)"
    )
    return {
        "covered":         covered,
        "partial":         partial,
        "missing":         missing,
        "total":           total,
        "score":           round(coverage_score, 2),
        "domain":          course_domain,
        "domains_checked": relevant_domains,
    }

