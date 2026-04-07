"""
Uses Claude to segment syllabus into sections, then extract topics.
"""
import json
import anthropic
from core.config import settings

SEGMENT_PROMPT = """You are an expert at analyzing university course syllabi.
First, identify and extract these sections from the syllabus text:
- course_title: the course name
- objectives: course learning objectives
- weekly_topics: list of weekly or unit topics
- tools_used: specific tools, languages, frameworks mentioned
- prerequisites: required prior knowledge

Then extract all skills and technologies as a flat topic list.

Return ONLY this JSON, nothing else:
{
  "course_title": "...",
  "sections": {
    "objectives": "...",
    "weekly_topics": ["week 1: ...", "week 2: ..."],
    "tools_used": ["Python", "Docker", ...],
    "prerequisites": "..."
  },
  "topics": ["Python", "REST APIs", "Docker", ...]
}

Extract 10-30 specific topics. Be precise — prefer "Docker" over "containerization"."""


async def extract_topics(raw_text: str) -> dict:
    """Segment syllabus into sections then extract topics."""
    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    message = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1500,
        messages=[{
            "role": "user",
            "content": f"{SEGMENT_PROMPT}\n\nSyllabus text:\n\n{raw_text[:12000]}"
        }]
    )

    text = message.content[0].text.strip()
    text = text.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    result = json.loads(text)

    return {
        "course_title": result.get("course_title", ""),
        "topics": result.get("topics", []),
        "sections": result.get("sections", {})
    }



