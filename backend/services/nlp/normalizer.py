"""
Skill normalization using rapidfuzz — collapses variants into canonical forms.
ML = Machine Learning = machine-learning = ml
"""
from rapidfuzz import fuzz, process

# Canonical skill names — the "correct" version we store
CANONICAL_SKILLS = [
    # AI/ML
    "Machine Learning", "Deep Learning", "Neural Networks", "Computer Vision",
    "Natural Language Processing", "Reinforcement Learning", "Transfer Learning",
    "Model Evaluation", "Feature Engineering", "Hyperparameter Tuning",
    "MLOps", "Model Deployment", "A/B Testing",
    # GenAI
    "Large Language Models", "Prompt Engineering", "RAG", "Fine-tuning",
    "LLM Agents", "Vector Databases", "Embeddings", "Generative AI",
    "LangChain", "LlamaIndex", "Hugging Face", "OpenAI API", "Anthropic API",
    # Languages
    "Python", "R", "SQL", "Java", "JavaScript", "TypeScript", "C++", "C#",
    "Scala", "Go", "Rust", "MATLAB", "Bash", "Shell Scripting",
    # ML Frameworks
    "PyTorch", "TensorFlow", "Keras", "Scikit-learn", "XGBoost", "LightGBM",
    "JAX", "Transformers", "ONNX",
    # Data
    "Pandas", "NumPy", "Spark", "Hadoop", "Kafka", "Airflow", "dbt",
    "Tableau", "Power BI", "Looker", "Excel", "Snowflake", "Databricks",
    # Databases
    "PostgreSQL", "MySQL", "MongoDB", "Redis", "Elasticsearch",
    "Pinecone", "Weaviate", "ChromaDB", "Neo4j",
    # Cloud
    "AWS", "Azure", "Google Cloud", "Docker", "Kubernetes",
    "Terraform", "Jenkins", "GitHub Actions", "CI/CD",
    # Web
    "React", "Angular", "Vue.js", "Node.js", "FastAPI", "Django", "Flask",
    "REST API", "GraphQL", "Microservices",
    # General CS
    "Git", "Linux", "Agile", "Scrum", "Statistics", "Probability",
    "Data Structures", "Algorithms", "Object-Oriented Programming",
    "System Design", "Data Analysis", "Data Visualization",
]

# Build lowercase lookup for fast matching
_canonical_lower = {s.lower(): s for s in CANONICAL_SKILLS}


def normalize_skill(raw_skill: str, threshold: int = 85) -> str:
    """
    Normalize a raw skill string to its canonical form.
    Returns canonical form if match found above threshold, else title-cases the input.
    """
    if not raw_skill:
        return ""

    raw_lower = raw_skill.lower().strip()

    # Exact match first (fastest)
    if raw_lower in _canonical_lower:
        return _canonical_lower[raw_lower]

    # Common abbreviation mappings
    abbrev_map = {
        "ml": "Machine Learning",
        "dl": "Deep Learning",
        "nlp": "Natural Language Processing",
        "cv": "Computer Vision",
        "rl": "Reinforcement Learning",
        "llm": "Large Language Models",
        "llms": "Large Language Models",
        "rag": "RAG",
        "genai": "Generative AI",
        "gen ai": "Generative AI",
        "gcp": "Google Cloud",
        "k8s": "Kubernetes",
        "tf": "TensorFlow",
        "sklearn": "Scikit-learn",
        "scikit learn": "Scikit-learn",
        "oop": "Object-Oriented Programming",
        "ds": "Data Structures",
        "algo": "Algorithms",
        "sql server": "SQL",
        "nosql": "MongoDB",
        "ci/cd": "CI/CD",
        "ci cd": "CI/CD",
        "rest": "REST API",
        "rest apis": "REST API",
        "nodejs": "Node.js",
        "node": "Node.js",
        "reactjs": "React",
        "vuejs": "Vue.js",
        "postgres": "PostgreSQL",
        "psql": "PostgreSQL",
        "mongo": "MongoDB",
        "elastic": "Elasticsearch",
        "hf": "Hugging Face",
        "openai": "OpenAI API",
        "langchain": "LangChain",
        "llamaindex": "LlamaIndex",
        "xgb": "XGBoost",
        "lgbm": "LightGBM",
    }

    if raw_lower in abbrev_map:
        return abbrev_map[raw_lower]

    # Fuzzy match against canonical skills
    match = process.extractOne(
        raw_lower,
        _canonical_lower.keys(),
        scorer=fuzz.token_sort_ratio,
        score_cutoff=threshold,
    )

    if match:
        matched_lower, score, _ = match
        return _canonical_lower[matched_lower]

    # No match — return cleaned up version
    return raw_skill.strip().title()


def normalize_skills_list(skills: list[str]) -> list[str]:
    """Normalize a list of skills and deduplicate."""
    normalized = [normalize_skill(s) for s in skills if s]
    # Deduplicate while preserving order
    seen = set()
    result = []
    for skill in normalized:
        key = skill.lower()
        if key not in seen:
            seen.add(key)
            result.append(skill)
    return result

