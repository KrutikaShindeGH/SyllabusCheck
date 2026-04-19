import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import logging
import numpy as np
from typing import List, Dict, Any, Optional
from sqlalchemy import create_engine, text

from core.config import settings

logger = logging.getLogger(__name__)

DATABASE_URL_SYNC = settings.DATABASE_URL.replace(
    "postgresql+asyncpg://", "postgresql+psycopg2://"
)
sync_engine = create_engine(DATABASE_URL_SYNC, pool_pre_ping=True)

# ── Coverage score formula ─────────────────────────────────────────────────────
COVERED_WEIGHT = 1.0
PARTIAL_WEIGHT = 0.5


def _compute_score(covered: int, partial: int, total: int) -> float:
    if total == 0:
        return 0.0
    return (covered * COVERED_WEIGHT + partial * PARTIAL_WEIGHT) / total * 100


def _get_percentile_thresholds(frequencies: List[int]) -> Dict[str, float]:
    if not frequencies:
        return {"critical": 0, "high": 0, "medium": 0}
    arr = np.array(frequencies)
    return {
        "critical": float(np.percentile(arr, 70)),
        "high":     float(np.percentile(arr, 40)),
        "medium":   float(np.percentile(arr, 20)),
    }


def _tier_from_frequency(freq: int, thresholds: Dict[str, float]) -> str:
    if freq >= thresholds["critical"]:
        return "critical"
    if freq >= thresholds["high"]:
        return "high"
    if freq >= thresholds["medium"]:
        return "medium"
    return "low"


def get_gap_analysis(course_id: str, limit_keywords: int = 50, owner_id: Optional[str] = None) -> Dict[str, Any]:
    with sync_engine.connect() as conn:
        if owner_id:
            course_row = conn.execute(
                text("SELECT domain, coverage_score FROM courses WHERE id = :id AND owner_id = :owner_id"),
                {"id": course_id, "owner_id": owner_id}
            ).fetchone()
        else:
            course_row = conn.execute(
                text("SELECT domain, coverage_score FROM courses WHERE id = :id"),
                {"id": course_id}
            ).fetchone()

        if not course_row:
            raise ValueError(f"Course {course_id} not found")

        summary_rows = conn.execute(text("""
            SELECT cr.status, COUNT(*) as cnt
            FROM coverage_rows cr
            JOIN keywords k ON k.id = cr.keyword_id
            WHERE cr.course_id = :cid
              AND cr.keyword_id IN (
                SELECT cr2.keyword_id
                FROM coverage_rows cr2
                JOIN keywords k2 ON k2.id = cr2.keyword_id
                WHERE cr2.course_id = :cid
                ORDER BY k2.frequency DESC
                LIMIT :lim
              )
            GROUP BY cr.status
        """), {"cid": course_id, "lim": limit_keywords}).fetchall()

        summary = {"covered": 0, "partial": 0, "missing": 0, "total": 0}
        for r in summary_rows:
            summary[r[0]] = r[1]
        summary["total"] = sum(summary[s] for s in ["covered", "partial", "missing"])

        stored_score = course_row[1]
        if stored_score is not None:
            coverage_score = stored_score
        else:
            coverage_score = _compute_score(
                summary["covered"], summary["partial"], summary["total"]
            )

        gap_rows = conn.execute(text("""
            SELECT
                k.id::text          AS keyword_id,
                k.text              AS keyword,
                k.normalized        AS normalized,
                k.category          AS category,
                k.domain            AS domain,
                k.subdomain         AS subdomain,
                k.frequency         AS frequency,
                k.is_emerging       AS is_emerging,
                cr.status           AS status,
                cr.similarity_score AS score
            FROM coverage_rows cr
            JOIN keywords k ON k.id = cr.keyword_id
            WHERE cr.course_id = :cid
              AND cr.status IN ('missing', 'partial')
            ORDER BY k.frequency DESC
        """), {"cid": course_id}).fetchall()

    frequencies = [r.frequency for r in gap_rows]
    thresholds  = _get_percentile_thresholds(frequencies)

    gaps: Dict[str, List[Dict]] = {"critical": [], "high": [], "medium": [], "low": []}

    for r in gap_rows:
        tier = _tier_from_frequency(r.frequency, thresholds)
        gaps[tier].append({
            "keyword_id":   r.keyword_id,
            "keyword":      r.keyword,
            "normalized":   r.normalized,
            "category":     r.category,
            "domain":       r.domain,
            "subdomain":    r.subdomain,
            "frequency":    r.frequency,
            "is_emerging":  r.is_emerging,
            "status":       r.status,
            "score":        round(r.score, 4),
            "tier":         tier,
        })

    return {
        "course_id":      course_id,
        "coverage_score": round(coverage_score, 2),
        "summary":        summary,
        "thresholds":     thresholds,
        "gaps":           gaps,
        "total_gaps":     len(gap_rows),
    }


def get_coverage_matrix(limit_keywords: int = 50, owner_id: Optional[str] = None) -> Dict[str, Any]:
    with sync_engine.connect() as conn:
        if owner_id:
            course_rows = conn.execute(text("""
                SELECT id::text, title, code, coverage_score, domain
                FROM courses
                WHERE owner_id = :owner_id
                ORDER BY created_at
            """), {"owner_id": owner_id}).fetchall()
        else:
            course_rows = conn.execute(text("""
                SELECT id::text, title, code, coverage_score, domain
                FROM courses
                ORDER BY created_at
            """)).fetchall()

        if not course_rows:
            return {"keywords": [], "courses": [], "cells": {}, "course_details": []}

        all_keyword_ids = set()
        course_keyword_map: Dict[str, List[str]] = {}

        for c in course_rows:
            course_id = c[0]
            course_domain = c[4]

            if not course_domain:
                continue

            kw_rows = conn.execute(text("""
                SELECT k.id::text
                FROM coverage_rows cr
                JOIN keywords k ON k.id = cr.keyword_id
                WHERE cr.course_id = :cid
                ORDER BY k.frequency DESC
                LIMIT :lim
            """), {"cid": course_id, "lim": limit_keywords}).fetchall()

            kw_ids = [r[0] for r in kw_rows]
            course_keyword_map[course_id] = kw_ids
            all_keyword_ids.update(kw_ids)

        keywords_by_id: Dict[str, Dict] = {}
        if all_keyword_ids:
            kw_detail_rows = conn.execute(text("""
                SELECT id::text, text, category, domain, subdomain, frequency
                FROM keywords
                WHERE id::text = ANY(:ids)
            """), {"ids": list(all_keyword_ids)}).fetchall()

            for r in kw_detail_rows:
                keywords_by_id[r[0]] = {
                    "id": r[0], "text": r[1], "category": r[2],
                    "domain": r[3], "subdomain": r[4], "frequency": r[5]
                }

        course_ids = [c[0] for c in course_rows]
        cells: Dict[str, Dict] = {}

        if all_keyword_ids and course_ids:
            cell_rows = conn.execute(text("""
                SELECT
                    cr.course_id::text,
                    cr.keyword_id::text,
                    cr.status,
                    cr.similarity_score
                FROM coverage_rows cr
                WHERE cr.keyword_id::text = ANY(:kw_ids)
                  AND cr.course_id::text  = ANY(:c_ids)
            """), {
                "kw_ids": list(all_keyword_ids),
                "c_ids":  course_ids,
            }).fetchall()

            for r in cell_rows:
                cells[f"{r[0]}_{r[1]}"] = {"status": r[2], "score": round(r[3], 4)}

    course_details = []
    for c in course_rows:
        course_id = c[0]
        kw_ids = course_keyword_map.get(course_id, [])
        course_kws = [keywords_by_id[kid] for kid in kw_ids if kid in keywords_by_id]
        course_kws.sort(key=lambda x: x["frequency"], reverse=True)

        covered = partial = missing = 0
        for kid in kw_ids:
            cell = cells.get(f"{course_id}_{kid}")
            if cell:
                if cell["status"] == "covered":   covered += 1
                elif cell["status"] == "partial":  partial += 1
                else:                              missing += 1

        stored_score = c[3]
        score = stored_score if stored_score is not None else _compute_score(covered, partial, len(kw_ids))

        course_details.append({
            "id":             course_id,
            "title":          c[1],
            "code":           c[2],
            "coverage_score": round(score, 1),
            "domain":         c[4],
            "keywords":       course_kws,
            "summary": {
                "covered": covered,
                "partial": partial,
                "missing": missing,
                "total":   len(kw_ids),
            },
        })

    all_kws_sorted = sorted(keywords_by_id.values(), key=lambda x: x["frequency"], reverse=True)

    return {
        "keywords":       all_kws_sorted[:limit_keywords],
        "courses":        [{"id": c[0], "title": c[1], "code": c[2],
                           "coverage_score": c[3], "domain": c[4]} for c in course_rows],
        "cells":          cells,
        "course_details": course_details,
    }


def get_program_gap_analysis(
    course_ids: List[str],
    job_role: str,
    owner_id: str,
) -> Dict[str, Any]:
    """
    Compare a set of syllabi against keywords found in job postings matching job_role.
    Uses a two-strategy approach:
    1. ID-based match: join job_keywords → coverage_rows via keyword_id
    2. Text-based fallback: if ID match yields nothing, normalize keyword text and match
       coverage_rows keywords against job keywords by normalized text
    """
    with sync_engine.connect() as conn:
        # Verify courses belong to this user
        verified = conn.execute(text("""
            SELECT id::text, title, domain
            FROM courses
            WHERE id::text = ANY(:ids) AND owner_id::text = :owner_id
        """), {"ids": course_ids, "owner_id": owner_id}).fetchall()

        if not verified:
            raise ValueError("No matching courses found for this user")

        verified_ids = [r[0] for r in verified]

        # Find job postings matching the job_role
        job_rows = conn.execute(text("""
            SELECT id::text
            FROM job_postings
            WHERE LOWER(title) LIKE :role
            LIMIT 200
        """), {"role": f"%{job_role.lower()}%"}).fetchall()

        job_ids = [r[0] for r in job_rows]

        if not job_ids:
            # Try broader match — split job_role by space and match any word
            words = [w.strip() for w in job_role.lower().split() if len(w.strip()) > 2]
            if words:
                conditions = " OR ".join(f"LOWER(title) LIKE :w{i}" for i in range(len(words)))
                params = {f"w{i}": f"%{w}%" for i, w in enumerate(words)}
                job_rows = conn.execute(
                    text(f"SELECT id::text FROM job_postings WHERE {conditions} LIMIT 200"),
                    params
                ).fetchall()
                job_ids = [r[0] for r in job_rows]

        if not job_ids:
            return {
                "job_role": job_role,
                "total_required_keywords": 0,
                "total_covered": 0,
                "overall_coverage_pct": 0.0,
                "covered_keywords": [],
                "missing_keywords": [],
                "per_course_breakdown": [],
                "warning": f"No job postings found matching '{job_role}'. Try a broader title like 'engineer' or 'developer'.",
            }

        # Get required keyword IDs from job postings
        jk_rows = conn.execute(text("""
            SELECT DISTINCT keyword_id::text
            FROM job_keywords
            WHERE job_id::text = ANY(:job_ids)
        """), {"job_ids": job_ids}).fetchall()

        required_kw_ids = {r[0] for r in jk_rows}

        if not required_kw_ids:
            return {
                "job_role": job_role,
                "jobs_matched": len(job_ids),
                "total_required_keywords": 0,
                "total_covered": 0,
                "overall_coverage_pct": 0.0,
                "covered_keywords": [],
                "missing_keywords": [],
                "per_course_breakdown": [],
                "warning": "Job postings were found but have no associated keywords. The job keyword index may need to be rebuilt.",
            }

        # Get keyword details for all required keyword IDs
        kw_rows = conn.execute(text("""
            SELECT id::text, text, LOWER(REGEXP_REPLACE(text, '[^a-zA-Z0-9]', '', 'g')) as normalized_text,
                   category, frequency
            FROM keywords
            WHERE id::text = ANY(:ids)
            ORDER BY frequency DESC
        """), {"ids": list(required_kw_ids)}).fetchall()

        # Build maps keyed by id and by normalized text
        kw_map: Dict[str, Dict] = {}
        kw_by_normalized: Dict[str, str] = {}  # normalized_text -> keyword_id
        for r in kw_rows:
            kw_map[r[0]] = {"text": r[1], "category": r[3], "frequency": r[4]}
            kw_by_normalized[r[2]] = r[0]

        # --- Strategy 1: ID-based match ---
        # Check how many coverage_rows exist for these courses × required keyword IDs
        id_match_rows = conn.execute(text("""
            SELECT keyword_id::text, status, course_id::text
            FROM coverage_rows
            WHERE course_id::text = ANY(:cids)
              AND keyword_id::text = ANY(:kw_ids)
        """), {"cids": verified_ids, "kw_ids": list(required_kw_ids)}).fetchall()

        id_match_count = len(id_match_rows)
        logger.info(f"Program gap: ID-based match found {id_match_count} coverage rows "
                    f"for {len(verified_ids)} courses × {len(required_kw_ids)} required keywords")

        # --- Strategy 2: Text-based fallback ---
        # If ID match gives very low coverage, also try matching by normalized keyword text
        # Get all coverage_row keywords for these courses
        course_kw_rows = conn.execute(text("""
            SELECT cr.keyword_id::text, cr.status, cr.course_id::text,
                   LOWER(REGEXP_REPLACE(k.text, '[^a-zA-Z0-9]', '', 'g')) as normalized_text,
                   k.text
            FROM coverage_rows cr
            JOIN keywords k ON k.id = cr.keyword_id
            WHERE cr.course_id::text = ANY(:cids)
        """), {"cids": verified_ids}).fetchall()

        # Build a map of normalized_text -> best status per (course_id, normalized_text)
        # to detect text-based matches
        course_coverage_by_text: Dict[str, Dict[str, str]] = {}  # course_id -> {norm_text -> status}
        for r in course_kw_rows:
            cid = r[2]
            if cid not in course_coverage_by_text:
                course_coverage_by_text[cid] = {}
            norm = r[3]
            existing = course_coverage_by_text[cid].get(norm)
            # covered > partial > missing
            status_rank = {"covered": 2, "partial": 1, "missing": 0}
            if existing is None or status_rank.get(r[1], 0) > status_rank.get(existing, 0):
                course_coverage_by_text[cid][norm] = r[1]

        # For each required keyword, resolve what's covered via text match per course
        # (use this as supplement/fallback to ID matching)
        # Build: for each (course_id, keyword_id) → status (via ID or text match)
        coverage_by_course_kw: Dict[str, Dict[str, str]] = {cid: {} for cid in verified_ids}

        # First populate from ID-based matches
        for r in id_match_rows:
            kid, status, cid = r[0], r[1], r[2]
            existing = coverage_by_course_kw[cid].get(kid)
            status_rank = {"covered": 2, "partial": 1, "missing": 0}
            if existing is None or status_rank.get(status, 0) > status_rank.get(existing, 0):
                coverage_by_course_kw[cid][kid] = status

        # Then fill gaps via text-based match
        text_match_additions = 0
        for kid, kw_info in kw_map.items():
            norm_text = kw_info["text"].lower()
            norm_text_stripped = ''.join(c for c in norm_text if c.isalnum())
            for cid in verified_ids:
                if kid not in coverage_by_course_kw[cid]:
                    # Try text lookup
                    status = course_coverage_by_text.get(cid, {}).get(norm_text_stripped)
                    if status and status in ("covered", "partial"):
                        coverage_by_course_kw[cid][kid] = status
                        text_match_additions += 1

        if text_match_additions > 0:
            logger.info(f"Program gap: text-based fallback added {text_match_additions} additional matches")

        # --- Compute overall coverage ---
        covered_overall: set = set()
        for cid in verified_ids:
            for kid, status in coverage_by_course_kw[cid].items():
                if status in ("covered", "partial"):
                    covered_overall.add(kid)

        missing_overall = required_kw_ids - covered_overall

        # --- Per-course breakdown ---
        per_course = []
        for course_row in verified:
            cid = course_row[0]
            c_covered = {
                kid for kid, status in coverage_by_course_kw[cid].items()
                if status in ("covered", "partial")
            }
            c_pct = round(len(c_covered) / max(len(required_kw_ids), 1) * 100, 1)

            per_course.append({
                "course_id": cid,
                "course_name": course_row[1],
                "domain": course_row[2],
                "covered_count": len(c_covered),
                "total_required": len(required_kw_ids),
                "coverage_pct": c_pct,
                "covered_keywords": [
                    kw_map[kid]["text"] for kid in c_covered if kid in kw_map
                ],
            })

        # Sort missing keywords by frequency
        missing_kw_texts = [
            {"text": kw_map[kid]["text"], "frequency": kw_map[kid]["frequency"]}
            for kid in missing_overall
            if kid in kw_map
        ]
        missing_kw_texts.sort(key=lambda x: -x["frequency"])

        match_method = "id+text" if text_match_additions > 0 else "id"

        return {
            "job_role": job_role,
            "jobs_matched": len(job_ids),
            "total_required_keywords": len(required_kw_ids),
            "total_covered": len(covered_overall),
            "overall_coverage_pct": round(
                len(covered_overall) / max(len(required_kw_ids), 1) * 100, 1
            ),
            "covered_keywords": sorted(
                [kw_map[kid]["text"] for kid in covered_overall if kid in kw_map]
            ),
            "missing_keywords": [k["text"] for k in missing_kw_texts],
            "per_course_breakdown": sorted(per_course, key=lambda x: -x["coverage_pct"]),
            "_debug": {
                "id_match_rows": id_match_count,
                "text_match_additions": text_match_additions,
                "match_method": match_method,
            }
        }
    
