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
# covered = 1.0 point  (skill is fully taught)
# partial = 0.5 point  (skill is partially taught — half credit)
# Score is computed against top 50 keywords by frequency (most in-demand skills)
# so both Coverage Matrix and Gap Analysis always show the same number.
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
        # Fetch course — optionally scope to owner for security
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

        # ── Summary: count from top N keywords only (matches Coverage Matrix) ──
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

        # ── Gap rows: show ALL missing/partial so professors see full picture ──
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
    """
    Returns per-course coverage data scoped to the given owner.
    For each course, fetches top N keywords FROM THAT COURSE'S OWN DOMAIN.
    """
    with sync_engine.connect() as conn:
        # All courses with domain info — filtered to owner if provided
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

        # For each course, fetch its top N keywords by frequency
        all_keyword_ids = set()
        course_keyword_map: Dict[str, List[str]] = {}  # course_id -> [keyword_ids]

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

        # Fetch full keyword details for all collected keyword IDs
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

        # Fetch all coverage cells
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

    # Build per-course detail objects with their own keyword lists
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
    Compare a set of the user's syllabi against all keywords found in jobs
    matching the given job_role string. Returns overall + per-course breakdown.
    """
    with sync_engine.connect() as conn:
        # Verify all courses belong to this user
        verified = conn.execute(text("""
            SELECT id::text, title, domain
            FROM courses
            WHERE id::text = ANY(:ids) AND owner_id = :owner_id
        """), {"ids": course_ids, "owner_id": owner_id}).fetchall()

        if not verified:
            raise ValueError("No matching courses found for this user")

        verified_ids = [r[0] for r in verified]

        # Find job postings matching the job_role (title contains the string)
        job_rows = conn.execute(text("""
            SELECT id::text
            FROM job_postings
            WHERE LOWER(title) LIKE :role
            LIMIT 200
        """), {"role": f"%{job_role.lower()}%"}).fetchall()

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
                "warning": f"No job postings found matching '{job_role}'. Try a broader title.",
            }

        # Get all keyword IDs required by those jobs
        jk_rows = conn.execute(text("""
            SELECT DISTINCT keyword_id::text
            FROM job_keywords
            WHERE job_id::text = ANY(:job_ids)
        """), {"job_ids": job_ids}).fetchall()

        required_kw_ids = {r[0] for r in jk_rows}

        if not required_kw_ids:
            return {
                "job_role": job_role,
                "total_required_keywords": 0,
                "total_covered": 0,
                "overall_coverage_pct": 0.0,
                "covered_keywords": [],
                "missing_keywords": [],
                "per_course_breakdown": [],
            }

        # Get keyword text map
        kw_rows = conn.execute(text("""
            SELECT id::text, text, category, frequency
            FROM keywords
            WHERE id::text = ANY(:ids)
            ORDER BY frequency DESC
        """), {"ids": list(required_kw_ids)}).fetchall()

        # Build map keyed by id AND by text for fast lookup in both directions
        kw_map: Dict[str, Dict] = {}
        kw_freq_by_text: Dict[str, int] = {}
        for r in kw_rows:
            kw_map[r[0]] = {"text": r[1], "category": r[2], "frequency": r[3]}
            kw_freq_by_text[r[1]] = r[3]

        # Overall: which required keywords are covered/partial across ALL selected courses?
        all_cr_rows = conn.execute(text("""
            SELECT keyword_id::text, status
            FROM coverage_rows
            WHERE course_id::text = ANY(:cids)
              AND keyword_id::text = ANY(:kw_ids)
        """), {"cids": verified_ids, "kw_ids": list(required_kw_ids)}).fetchall()

        # A keyword is "covered" overall if ANY of the selected courses covers/partials it
        covered_overall: set = set()
        for r in all_cr_rows:
            if r[1] in ("covered", "partial"):
                covered_overall.add(r[0])

        missing_overall = required_kw_ids - covered_overall

        # Per-course breakdown
        per_course = []
        for course_row in verified:
            cid = course_row[0]
            cr_rows = conn.execute(text("""
                SELECT keyword_id::text, status
                FROM coverage_rows
                WHERE course_id = :cid
                  AND keyword_id::text = ANY(:kw_ids)
            """), {"cid": cid, "kw_ids": list(required_kw_ids)}).fetchall()

            c_covered = {r[0] for r in cr_rows if r[1] in ("covered", "partial")}
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

        # ── FIX: sort missing keywords by frequency using the id-keyed map ──
        missing_kw_texts = [
            {"text": kw_map[kid]["text"], "frequency": kw_map[kid]["frequency"]}
            for kid in missing_overall
            if kid in kw_map
        ]
        missing_kw_texts.sort(key=lambda x: -x["frequency"])

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
        }
    
    