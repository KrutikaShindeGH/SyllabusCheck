"""
Intelligent keyword extraction using Claude — understands context,
categorizes by UTD department taxonomy, handles emerging technologies.
"""
import re
import json
import anthropic
from core.config import settings

client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

SYSTEM_PROMPT = """You are an expert technical recruiter and skill taxonomy specialist.
Extract and categorize ALL skills, technologies, and competencies from job postings.

RULES:
1. Extract from ALL sections — qualifications, responsibilities, requirements, nice-to-haves
2. Categorize each skill based on its USE CASE in this specific role
3. Normalize variants — "ML" and "Machine Learning" → ONE entry: "Machine Learning"
4. Never miss a skill — extract even if you have never seen it before
5. For common skills (Python, SQL, Git) — assign to the PRIMARY department of the job

DEPARTMENTS (use EXACTLY these strings):
Erik Jonsson School of Engineering & Computer Science:
- "Computer Science"               → programming, algorithms, data structures, AI/ML, cybersecurity, networking, systems, web dev, software engineering, data science roles
  CS SUBDOMAINS — return "subdomain" field for ALL Computer Science keywords:
  * "AI/ML"                → machine learning, deep learning, neural networks, NLP, LLM, PyTorch, TensorFlow, computer vision, MLOps, embeddings, transformers, generative AI
  * "Cybersecurity"        → security, penetration testing, encryption, SOC, SIEM, firewalls, vulnerability assessment, incident response, cryptography, zero trust
  * "Data Science"         → statistics, pandas, SQL, data visualization, ETL, data pipelines, BI tools, Tableau, Power BI, Spark, data warehousing, analytics
  * "Software Engineering" → APIs, unit testing, Git, CI/CD, design patterns, web dev, mobile dev, frameworks, Docker, Kubernetes, agile, microservices
  * "Networking"           → TCP/IP, DNS, routing, protocols, network administration, Cisco, VPN, firewalls, bandwidth, SDN
  * "General CS"           → algorithms, data structures, compilers, discrete math, operating systems, theory (doesn't fit above subdomains)

- "Electrical & Computer Engineering" → embedded systems, hardware, FPGA, circuit design, signal processing, IoT, firmware
- "Bioengineering"                 → biomedical devices, biomechanics, tissue engineering, clinical instrumentation, bioinformatics
- "Mechanical Engineering"         → CAD, thermodynamics, fluid mechanics, manufacturing, robotics, FEA, HVAC
- "Materials Science & Engineering" → materials characterization, polymers, semiconductors, nanotechnology, metallurgy
- "Systems Engineering"            → systems integration, DevOps, cloud infrastructure, reliability engineering, architecture

Naveen Jindal School of Management:
- "Accounting"                     → financial reporting, GAAP, auditing, tax, bookkeeping, accounts payable/receivable, CPA
- "Finance"                        → financial analysis, investment, risk management, quantitative finance, banking, valuation, portfolio
- "Information Systems"            → IT management, ERP, enterprise systems, IT strategy, business systems analysis, MIS
- "Marketing"                      → digital marketing, SEO, brand management, market research, growth hacking, CRM
- "Operations / Supply Chain"      → supply chain, logistics, procurement, inventory, lean manufacturing, Six Sigma, demand planning
- "Organizations, Strategy & Intl Mgmt" → strategy consulting, organizational behavior, change management, international business, leadership

SUBDOMAIN EXAMPLES:
- Python in an ML Engineer role       → category: "Computer Science", subdomain: "AI/ML"
- Python in a Backend Engineer role   → category: "Computer Science", subdomain: "Software Engineering"
- SQL in a Data Scientist role        → category: "Computer Science", subdomain: "Data Science"
- Git in any CS role                  → category: "Computer Science", subdomain: "Software Engineering"
- Docker in a DevOps/backend role     → category: "Computer Science", subdomain: "Software Engineering"
- Firewall in a Security role         → category: "Computer Science", subdomain: "Cybersecurity"
- TCP/IP in a Network Engineer role   → category: "Computer Science", subdomain: "Networking"

CRITICAL: Every "Computer Science" keyword MUST have a subdomain. Never leave subdomain empty for CS keywords.
Non-CS keywords (Finance, Accounting, etc.) should NOT have a subdomain field.

Return ONLY this JSON:
{
  "role_domain": "primary department of this job (use exact department string from above)",
  "keywords": [
    {
      "skill": "exact skill name normalized",
      "category": "one of the department strings above",
      "subdomain": "for CS keywords only: AI/ML|Cybersecurity|Data Science|Software Engineering|Networking|General CS",
      "importance": "required|preferred|nice-to-have",
      "is_emerging": true/false
    }
  ]
}"""


def extract_keywords_with_claude(
    title: str,
    description: str = "",
    max_tokens: int = 1500,
) -> dict:
    """
    Use Claude Haiku to extract and categorize keywords from a job posting.
    """
    if description and len(description) > 100:
        content = f"Job Title: {title}\n\nJob Description:\n{description[:6000]}"
    else:
        content = f"""Job Title: {title}

No description available. Based on this job title, extract the most likely required skills
and technologies for this type of role. Mark all as 'preferred' importance."""

    try:
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=max_tokens,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": content}]
        )

        text = message.content[0].text.strip()
        text = text.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        json_match = re.search(r'\{.*\}', text, re.DOTALL)
        if not json_match:
            return {"role_domain": "", "keywords": []}
        json_str = json_match.group()

        try:
            result = json.loads(json_str)
        except json.JSONDecodeError:
            # Truncated response — cut at last complete keyword entry
            last_brace = json_str.rfind('},')
            if last_brace > 0:
                json_str = json_str[:last_brace+1] + ']}'
                try:
                    result = json.loads(json_str)
                except Exception:
                    return {"role_domain": "", "keywords": []}
            else:
                return {"role_domain": "", "keywords": []}

        return {
            "role_domain": result.get("role_domain", ""),
            "keywords":    result.get("keywords", []),
        }

    except Exception as e:
        print(f"Claude extraction failed for '{title}': {e}")
        return {"role_domain": "", "keywords": []}


def extract_keywords_batch(jobs: list[dict], batch_size: int = 10) -> list[dict]:
    """Process a batch of jobs — returns list of extraction results."""
    results = []
    total = len(jobs)

    for i, job in enumerate(jobs):
        print(f"Extracting keywords: {i+1}/{total} — {job.get('title', '')[:50]}")
        result = extract_keywords_with_claude(
            title=job.get("title", ""),
            description=job.get("description", ""),
        )
        results.append({
            "job_id":      job.get("id"),
            "role_domain": result["role_domain"],
            "keywords":    result["keywords"],
        })

    return results


