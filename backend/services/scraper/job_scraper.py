"""
Scrapes job postings from job boards using httpx + BeautifulSoup.
Playwright will be added in Phase 3b for JS-heavy sites.
"""
import httpx
import re
from bs4 import BeautifulSoup
from datetime import datetime


HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}


async def scrape_indeed(query: str = "software engineer intern", location: str = "Dallas, TX", max_results: int = 50) -> list[dict]:
    """Scrape Indeed job listings."""
    jobs = []
    try:
        url = f"https://www.indeed.com/jobs?q={query.replace(' ', '+')}&l={location.replace(' ', '+')}&limit=50"
        async with httpx.AsyncClient(timeout=30, headers=HEADERS, follow_redirects=True) as client:
            response = await client.get(url)
            if response.status_code != 200:
                return jobs

            soup = BeautifulSoup(response.text, "html.parser")
            cards = soup.find_all("div", class_=re.compile(r"job_seen_beacon|jobsearch-ResultsList"))

            for card in cards[:max_results]:
                title_el = card.find(["h2", "a"], class_=re.compile(r"jobTitle|title"))
                company_el = card.find(["span", "div"], class_=re.compile(r"companyName|company"))
                location_el = card.find(["div", "span"], class_=re.compile(r"companyLocation|location"))

                if not title_el:
                    continue

                title = title_el.get_text(strip=True)
                company = company_el.get_text(strip=True) if company_el else ""
                location = location_el.get_text(strip=True) if location_el else ""

                link = title_el.find("a")
                job_url = f"https://www.indeed.com{link['href']}" if link and link.get("href") else ""

                jobs.append({
                    "source": "indeed",
                    "title": title[:500],
                    "company": company[:255],
                    "location": location[:255],
                    "url": job_url[:1000],
                    "role_type": _infer_role_type(title),
                    "is_remote": "remote" in location.lower(),
                    "scraped_at": datetime.utcnow(),
                })

    except Exception as e:
        print(f"Indeed scrape error: {e}")

    return jobs


async def scrape_usajobs(query: str = "software engineer", max_results: int = 50) -> list[dict]:
    """Scrape USA Jobs via their public API."""
    jobs = []
    try:
        url = "https://data.usajobs.gov/api/search"
        params = {"Keyword": query, "ResultsPerPage": max_results, "WhoMayApply": "public"}
        headers_usajobs = {**HEADERS, "Host": "data.usajobs.gov", "User-Agent": "kate@syllacheck.com"}

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(url, params=params, headers=headers_usajobs)
            if response.status_code != 200:
                return jobs

            data = response.json()
            results = data.get("SearchResult", {}).get("SearchResultItems", [])

            for item in results:
                pos = item.get("MatchedObjectDescriptor", {})
                title = pos.get("PositionTitle", "")
                org = pos.get("OrganizationName", "")
                locations = pos.get("PositionLocation", [{}])
                location = locations[0].get("LocationName", "") if locations else ""
                apply_url = pos.get("ApplyURI", [""])[0] if pos.get("ApplyURI") else ""

                jobs.append({
                    "source": "usajobs",
                    "title": title[:500],
                    "company": org[:255],
                    "location": location[:255],
                    "url": apply_url[:1000],
                    "role_type": _infer_role_type(title),
                    "is_remote": "remote" in location.lower(),
                    "scraped_at": datetime.utcnow(),
                })

    except Exception as e:
        print(f"USAJobs scrape error: {e}")

    return jobs


async def scrape_remotive(query: str = "software engineer", max_results: int = 50) -> list[dict]:
    """Scrape Remotive public API — remote tech jobs."""
    jobs = []
    try:
        url = "https://remotive.com/api/remote-jobs"
        params = {"search": query, "limit": max_results}

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(url, params=params)
            if response.status_code != 200:
                return jobs

            data = response.json()
            for item in data.get("jobs", []):
                jobs.append({
                    "source": "remotive",
                    "title": item.get("title", "")[:500],
                    "company": item.get("company_name", "")[:255],
                    "location": item.get("candidate_required_location", "Remote")[:255],
                    "url": item.get("url", "")[:1000],
                    "description": item.get("description", "")[:5000],
                    "role_type": _infer_role_type(item.get("title", "")),
                    "is_remote": True,
                    "scraped_at": datetime.utcnow(),
                })

    except Exception as e:
        print(f"Remotive scrape error: {e}")

    return jobs


async def scrape_arbeitnow(max_results: int = 50) -> list[dict]:
    """Scrape Arbeitnow public API — tech jobs."""
    jobs = []
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get("https://www.arbeitnow.com/api/job-board-api")
            if response.status_code != 200:
                return jobs

            data = response.json()
            for item in data.get("data", [])[:max_results]:
                jobs.append({
                    "source": "arbeitnow",
                    "title": item.get("title", "")[:500],
                    "company": item.get("company_name", "")[:255],
                    "location": item.get("location", "")[:255],
                    "url": item.get("url", "")[:1000],
                    "description": item.get("description", "")[:5000],
                    "role_type": _infer_role_type(item.get("title", "")),
                    "is_remote": item.get("remote", False),
                    "scraped_at": datetime.utcnow(),
                })

    except Exception as e:
        print(f"Arbeitnow scrape error: {e}")

    return jobs


def _infer_role_type(title: str) -> str:
    """Infer role type from job title."""
    title_lower = title.lower()
    if any(w in title_lower for w in ["intern", "internship", "co-op", "coop"]):
        return "internship"
    if any(w in title_lower for w in ["senior", "sr.", "lead", "principal", "staff"]):
        return "senior"
    if any(w in title_lower for w in ["junior", "jr.", "entry", "associate"]):
        return "entry"
    if any(w in title_lower for w in ["contract", "freelance", "consultant"]):
        return "contract"
    return "full-time"

