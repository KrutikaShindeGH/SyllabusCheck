"""
Scrapes live internship/job listings from GitHub markdown repos.
Updated to handle HTML table format used by SimplifyJobs.
"""
import httpx
import re
from bs4 import BeautifulSoup
from datetime import datetime


GITHUB_SOURCES = [
    {
        "name": "SimplifyJobs Summer 2026",
        "url": "https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/dev/README.md",
        "source": "github_simplify",
        "format": "html",
    },
    {
        "name": "SpeedyApply AI Jobs 2026",
        "url": "https://raw.githubusercontent.com/speedyapply/2026-AI-College-Jobs/main/INTERN_INTL.md",
        "source": "github_speedyapply",
        "format": "markdown",
    },
    {
        "name": "Vanshb03 Summer 2026",
        "url": "https://raw.githubusercontent.com/vanshb03/Summer2026-Internships/main/README.md",
        "source": "github_vanshb03",
        "format": "markdown",
    },
]


def _infer_domain(title: str) -> str:
    """Infer UTD department domain from job title keywords."""
    t = title.lower()

    if any(w in t for w in [
        "machine learning", "ml engineer", "ai engineer", "deep learning",
        "nlp", "llm", "data scientist", "artificial intelligence",
        "software engineer", "software developer", "backend", "frontend",
        "full stack", "fullstack", "web developer", "swe", "devops",
        "cloud engineer", "cybersecurity", "network engineer",
        "systems engineer", "database", "computer vision", "python developer",
        "java developer", "mobile developer", "android", "ios developer",
        "security engineer", "infrastructure", "platform engineer",
        "reliability engineer", "site reliability", "sre",
    ]):
        return "Computer Science"

    if any(w in t for w in [
        "embedded", "hardware", "fpga", "firmware", "iot", "electrical",
        "circuit", "vlsi", "semiconductor", "signal processing",
        "rf engineer", "power electronics", "asic", "pcb",
    ]):
        return "Electrical & Computer Engineering"

    if any(w in t for w in [
        "mechanical", "cad", "manufacturing", "robotics", "thermal",
        "fluid", "aerospace", "automotive", "solidworks", "ansys",
        "mechanical design", "product design engineer",
    ]):
        return "Mechanical Engineering"

    if any(w in t for w in [
        "biomedical", "bioinformatics", "clinical", "biotech",
        "pharmaceutical", "medical device", "healthcare data",
        "computational biology", "genomics", "bio engineer",
    ]):
        return "Bioengineering"

    if any(w in t for w in [
        "materials", "process engineer", "r&d", "chemical engineer",
        "metallurg", "polymer", "nanotechnology", "thin film",
    ]):
        return "Materials Science & Engineering"

    if any(w in t for w in [
        "accountant", "auditor", "tax", "cpa", "bookkeep",
        "financial reporting", "general ledger", "accounts payable",
    ]):
        return "Accounting"

    if any(w in t for w in [
        "financial analyst", "investment", "risk analyst", "quantitative",
        "portfolio", "banking", "investment banking", "equity research",
        "wealth management", "actuar", "trading", "finance intern",
    ]):
        return "Finance"

    if any(w in t for w in [
        "it manager", "systems analyst", "erp", "it project",
        "business systems", "information systems", "enterprise systems",
        "sap consultant", "oracle consultant", "it analyst",
    ]):
        return "Information Systems"

    if any(w in t for w in [
        "marketing", "digital marketing", "seo", "brand", "growth",
        "content strategist", "social media", "market research",
        "product marketing", "performance marketing",
    ]):
        return "Marketing"

    if any(w in t for w in [
        "supply chain", "logistics", "procurement", "operations manager",
        "demand planning", "warehouse", "inventory", "fulfillment",
        "sourcing", "purchasing analyst",
    ]):
        return "Operations / Supply Chain"

    if any(w in t for w in [
        "strategy consultant", "management consultant", "business analyst",
        "organizational", "corporate strategy", "strategic planning",
        "business development", "strategy intern",
    ]):
        return "Organizations, Strategy & Intl Mgmt"

    if any(w in t for w in [
        "data analyst", "data engineer", "analytics", "business intelligence",
        "bi analyst", "tableau", "power bi", "data warehouse",
    ]):
        return "Information Systems"

    # Default — GitHub sources are overwhelmingly tech/CS roles
    return "Computer Science"


def parse_html_table(text: str) -> list[dict]:
    """Parse HTML table rows into job dicts (SimplifyJobs format)."""
    jobs = []
    soup = BeautifulSoup(text, "html.parser")
    last_company = ""

    for row in soup.find_all("tr"):
        cols = row.find_all("td")
        if len(cols) < 3:
            continue

        company_text = cols[0].get_text(strip=True)
        company_text = re.sub(r'[🔥👀]', '', company_text).strip()

        if company_text == "↳" or company_text == "":
            company = last_company
        else:
            company = company_text
            last_company = company

        title = cols[1].get_text(strip=True)
        location = cols[2].get_text(strip=True)

        url = ""
        apply_links = cols[3].find_all("a") if len(cols) > 3 else []
        for link in apply_links:
            href = link.get("href", "")
            if href and "simplify" not in href.lower():
                url = href
                break
        if not url and apply_links:
            url = apply_links[0].get("href", "")

        if company and title and len(title) > 2:
            jobs.append({
                "company":   company[:255],
                "title":     title[:500],
                "location":  location[:255],
                "url":       url[:1000],
                "role_type": "internship",
                "is_remote": "remote" in location.lower(),
                "domain":    _infer_domain(title),
            })

    return jobs


def parse_markdown_table(text: str) -> list[dict]:
    """Parse markdown table rows into job dicts."""
    jobs = []
    lines = text.split("\n")

    for line in lines:
        if not line.startswith("|") or "---" in line:
            continue

        cols = [c.strip() for c in line.split("|") if c.strip()]
        if len(cols) < 3:
            continue

        company = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', cols[0]).strip()
        company = re.sub(r'[*_`]', '', company).strip()
        if not company or company.lower() in ['company', 'name']:
            continue

        title = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', cols[1]).strip()
        title = re.sub(r'[*_`]', '', title).strip()

        location = cols[2].strip() if len(cols) > 2 else ""
        location = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', location)
        location = re.sub(r'[*_`<>]', '', location).strip()

        url_match = re.search(r'\(([^)]+(?:job|apply|career|lever|greenhouse|workday)[^)]*)\)', line)
        url = url_match.group(1) if url_match else ""

        if company and title and len(title) > 2:
            jobs.append({
                "company":   company[:255],
                "title":     title[:500],
                "location":  location[:255],
                "url":       url[:1000],
                "role_type": "internship",
                "is_remote": "remote" in location.lower(),
                "domain":    _infer_domain(title),
            })

    return jobs


async def scrape_github_sources() -> list[dict]:
    """Fetch and parse all GitHub job sources."""
    all_jobs = []

    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        for source in GITHUB_SOURCES:
            try:
                response = await client.get(source["url"])
                if response.status_code != 200:
                    print(f"Failed to fetch {source['name']}: {response.status_code}")
                    continue

                fmt = source.get("format", "markdown")
                if fmt == "html":
                    jobs = parse_html_table(response.text)
                else:
                    jobs = parse_markdown_table(response.text)

                for job in jobs:
                    job["source"] = source["source"]
                    job["scraped_at"] = datetime.utcnow()

                all_jobs.extend(jobs)
                print(f"Scraped {len(jobs)} jobs from {source['name']}")

            except Exception as e:
                print(f"Error scraping {source['name']}: {e}")

    return all_jobs

