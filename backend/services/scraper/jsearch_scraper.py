"""
JSearch API scraper — gets jobs from LinkedIn, Indeed, Glassdoor via RapidAPI.
Organized by UTD department taxonomy.
"""
import httpx
import asyncio
from datetime import datetime
from core.config import settings

JSEARCH_URL = "https://jsearch.p.rapidapi.com/search"
HEADERS = {
    "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
    "X-RapidAPI-Key":  settings.RAPIDAPI_KEY,
}

# ── UTD Department → Job Roles to scrape ──────────────────────────────────────
# Each department has 2-4 roles scraped (to stay within API limits)
# Priority roles listed first

DEPARTMENT_ROLES = {
    # ── Erik Jonsson School ───────────────────────────────────────────────────

    "Computer Science": [
        "software engineer",
        "machine learning engineer",
        "data scientist",
        "cybersecurity analyst",
        "backend developer",
        "AI engineer",
        "full stack developer",
        "network engineer",
        "DevOps engineer",
        "systems engineer",
    ],

    "Electrical & Computer Engineering": [
        "embedded systems engineer",
        "hardware engineer",
        "FPGA engineer",
        "IoT engineer",
        "firmware engineer",
        "signal processing engineer",
    ],

    "Bioengineering": [
        "biomedical engineer",
        "bioinformatics scientist",
        "clinical data analyst",
        "biomedical data scientist",
    ],

    "Mechanical Engineering": [
        "mechanical engineer",
        "CAD engineer",
        "manufacturing engineer",
        "robotics engineer",
    ],

    "Materials Science & Engineering": [
        "materials scientist",
        "process engineer",
        "R&D engineer",
        "semiconductor engineer",
    ],

    "Systems Engineering": [
        "systems engineer",
        "cloud architect",
        "site reliability engineer",
        "integration engineer",
    ],

    # ── Naveen Jindal School ──────────────────────────────────────────────────

    "Accounting": [
        "accountant",
        "financial analyst",
        "auditor",
        "tax analyst",
        "CPA",
    ],

    "Finance": [
        "financial analyst",
        "investment analyst",
        "risk analyst",
        "quantitative analyst",
        "portfolio manager",
    ],

    "Information Systems": [
        "IT manager",
        "systems analyst",
        "ERP consultant",
        "IT project manager",
        "business systems analyst",
    ],

    "Marketing": [
        "marketing analyst",
        "digital marketing manager",
        "growth analyst",
        "SEO specialist",
        "brand manager",
    ],

    "Operations / Supply Chain": [
        "supply chain analyst",
        "operations manager",
        "logistics analyst",
        "procurement analyst",
        "demand planning analyst",
    ],

    "Organizations, Strategy & Intl Mgmt": [
        "strategy consultant",
        "business analyst",
        "management consultant",
        "organizational development specialist",
    ],
}

# ── Location rotation (weekly) ─────────────────────────────────────────────────
LOCATIONS = {
    "week1": ["Dallas TX", "Austin TX", "Houston TX"],
    "week2": ["New York NY", "San Francisco CA", "Seattle WA"],
    "week3": ["Texas", "California"],
    "week4": ["USA", "Remote"],
}


def get_locations_for_this_week() -> tuple[list[str], str]:
    from datetime import date
    start_date = date(2026, 3, 16)
    days_since_start = (date.today() - start_date).days
    week_number = (days_since_start // 7) % 4 + 1

    week_map = {
        1: (LOCATIONS["week1"], "city — Dallas, Austin, Houston"),
        2: (LOCATIONS["week2"], "city — New York, San Francisco, Seattle"),
        3: (LOCATIONS["week3"], "state — Texas, California"),
        4: (LOCATIONS["week4"], "country/global — USA + Remote"),
    }
    return week_map[week_number]


async def scrape_jsearch(
    departments: list[str] = None,
    locations: list[str] = None,
    max_roles_per_dept: int = 2,
    max_per_query: int = 5,
) -> list[dict]:
    """
    Fetch jobs by UTD department and locations.

    Args:
        departments:        List of department names to scrape. None = all departments.
        locations:          List of location strings. None = this week's rotation.
        max_roles_per_dept: How many roles to scrape per department (to save API calls).
        max_per_query:      Max jobs to take per search query.
    """
    all_jobs = []
    selected_depts = departments or list(DEPARTMENT_ROLES.keys())

    if locations is None:
        locations, label = get_locations_for_this_week()
        print(f"JSearch: using {label}")

    async with httpx.AsyncClient(timeout=30) as client:
        for dept in selected_depts:
            roles = DEPARTMENT_ROLES.get(dept, [dept])
            # Only scrape top N roles per dept to stay within API rate limits
            roles_to_scrape = roles[:max_roles_per_dept]

            for role in roles_to_scrape:
                for location in locations[:1]:   # Max 2 locations per role
                    try:
                        params = {
                            "query":       f"{role} {location}",
                            "page":        "1",
                            "num_pages":   "1",
                            "date_posted": "month",
                        }
                        response = await client.get(
                            JSEARCH_URL, headers=HEADERS, params=params
                        )
                        if response.status_code != 200:
                            print(f"JSearch error {response.status_code} for '{role}' in '{location}'")
                            continue

                        data = response.json()
                        jobs = data.get("data", [])

                        for job in jobs[:max_per_query]:
                            city     = job.get("job_city", "") or ""
                            state    = job.get("job_state", "") or ""
                            location_str = f"{city}, {state}".strip(", ")

                            all_jobs.append({
                                "source":      f"jsearch_{job.get('job_publisher', 'unknown').lower().replace(' ', '_')}",
                                "external_id": job.get("job_id", ""),
                                "title":       (job.get("job_title") or "")[:500],
                                "company":     (job.get("employer_name") or "")[:255],
                                "location":    location_str[:255],
                                "city":        city[:100],
                                "state":       state[:100],
                                "country":     (job.get("job_country") or "US")[:100],
                                "is_remote":   job.get("job_is_remote", False),
                                "role_type":   _infer_role_type(job.get("job_employment_type", "")),
                                "description": (job.get("job_description") or "")[:5000],
                                "url":         (job.get("job_apply_link") or "")[:1000],
                                "posted_at":   _parse_date(job.get("job_posted_at_datetime_utc")),
                                "domain":      dept,   # UTD department
                                "scraped_at":  datetime.utcnow(),
                            })

                        await asyncio.sleep(0.5)
                        print(f"JSearch: {len(jobs)} jobs — '{role}' in '{location}' [{dept}]")

                    except Exception as e:
                        print(f"JSearch error for '{role}' in '{location}': {e}")

    return all_jobs


def _infer_role_type(employment_type: str) -> str:
    t = (employment_type or "").upper()
    if "INTERN"   in t: return "internship"
    if "PART"     in t: return "part-time"
    if "CONTRACT" in t: return "contract"
    if "FULLTIME" in t or "FULL_TIME" in t: return "full-time"
    return "full-time"


def _parse_date(date_str: str):
    if not date_str:
        return None
    try:
        return datetime.fromisoformat(date_str.replace("Z", "+00:00"))
    except Exception:
        return None
    

    