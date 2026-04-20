"""
Adzuna job scraper — free API, location-specific, real full-time job postings.
Sign up at https://developer.adzuna.com to get app_id and app_key.
"""
import httpx
from datetime import datetime
from core.config import settings


ADZUNA_BASE_URL = "https://api.adzuna.com/v1/api/jobs/us/search/1"

ADZUNA_QUERIES = {
    "Computer Science": ["software engineer", "AI engineer", "machine learning engineer"],
    "Finance": ["financial analyst", "investment analyst"],
    "Information Systems": ["IT manager", "business systems analyst"],
    "Accounting": ["accountant", "auditor"],
    "Operations / Supply Chain": ["supply chain analyst", "logistics coordinator"],
    "Marketing": ["digital marketing manager", "marketing analyst"],
    "Organizations, Strategy & Intl Mgmt": ["business analyst", "strategy consultant"],
}

ADZUNA_LOCATIONS = ["Dallas, TX", "Austin, TX", "Houston, TX"]


def _infer_domain(title: str) -> str:
    t = title.lower()
    if any(w in t for w in ["software", "engineer", "developer", "data scientist",
                             "ml", "ai", "machine learning", "backend", "frontend",
                             "devops", "cloud", "cybersecurity", "python", "java"]):
        return "Computer Science"
    if any(w in t for w in ["financial", "investment", "risk", "banking"]):
        return "Finance"
    if any(w in t for w in ["accountant", "auditor", "tax", "cpa"]):
        return "Accounting"
    if any(w in t for w in ["supply chain", "logistics", "procurement"]):
        return "Operations / Supply Chain"
    if any(w in t for w in ["marketing", "seo", "brand", "growth"]):
        return "Marketing"
    if any(w in t for w in ["it manager", "erp", "systems analyst"]):
        return "Information Systems"
    if any(w in t for w in ["strategy", "consultant", "business analyst"]):
        return "Organizations, Strategy & Intl Mgmt"
    return "Computer Science"


async def scrape_adzuna(
    max_per_query: int = 10,
    departments: list[str] = None,
    locations: list[str] = None,
) -> list[dict]:
    """Scrape full-time jobs from Adzuna API."""
    if not settings.ADZUNA_APP_ID or not settings.ADZUNA_APP_KEY:
        print("Adzuna: no credentials set, skipping")
        return []

    departments = departments or list(ADZUNA_QUERIES.keys())
    locations = locations or ADZUNA_LOCATIONS
    all_jobs = []

    async with httpx.AsyncClient(timeout=30) as client:
        for dept in departments:
            queries = ADZUNA_QUERIES.get(dept, [])
            for query in queries[:1]:           # 1 query per dept to save API budget
                for location in locations[:1]:  # 1 location per query
                    try:
                        params = {
                            "app_id": settings.ADZUNA_APP_ID,
                            "app_key": settings.ADZUNA_APP_KEY,
                            "results_per_page": max_per_query,
                            "what": query,
                            "where": location,
                            "content-type": "application/json",
                            "full_time": 1,
                            "sort_by": "date",
                        }

                        response = await client.get(ADZUNA_BASE_URL, params=params)

                        if response.status_code != 200:
                            print(f"Adzuna: {response.status_code} for '{query}' in '{location}'")
                            continue

                        data = response.json()
                        results = data.get("results", [])

                        for job in results:
                            title = job.get("title", "").strip()
                            company = job.get("company", {}).get("display_name", "").strip()
                            location_str = job.get("location", {}).get("display_name", "").strip()
                            description = job.get("description", "").strip()
                            url = job.get("redirect_url", "").strip()

                            if not title:
                                continue

                            all_jobs.append({
                                "source": "adzuna",
                                "title": title[:500],
                                "company": company[:255],
                                "location": location_str[:255],
                                "description": description[:5000],
                                "url": url[:1000],
                                "role_type": "full-time",
                                "is_remote": "remote" in location_str.lower(),
                                "domain": _infer_domain(title),
                                "country": "USA",
                                "scraped_at": datetime.utcnow(),
                            })

                        print(f"Adzuna: {len(results)} jobs — '{query}' in '{location}' [{dept}]")

                    except Exception as e:
                        print(f"Adzuna error for '{query}' in '{location}': {e}")
                        continue

    print(f"Adzuna scrape complete — {len(all_jobs)} total jobs")
    return all_jobs

