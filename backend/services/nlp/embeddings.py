"""
Vector embeddings — uses a simple sentence-transformer approach locally.
No extra API keys needed, runs inside the Docker container.
"""
from typing import Optional


def get_embedding(text: str) -> list[float]:
    """
    Get vector embedding using a local sentence transformer model.
    Returns 384-dimensional vector (all-MiniLM-L6-v2).
    Free, fast, runs locally inside Docker.
    """
    if not text or not text.strip():
        return []

    try:
        from sentence_transformers import SentenceTransformer
        model = _get_model()
        embedding = model.encode(text, convert_to_numpy=True)
        return embedding.tolist()
    except Exception as e:
        print(f"Embedding failed for '{text[:30]}': {e}")
        return []


def get_embeddings_batch(texts: list[str]) -> list[list[float]]:
    """Get embeddings for multiple texts in one batch — much faster."""
    if not texts:
        return []
    try:
        model = _get_model()
        embeddings = model.encode(texts, convert_to_numpy=True, batch_size=64)
        return [e.tolist() for e in embeddings]
    except Exception as e:
        print(f"Batch embedding failed: {e}")
        return [[] for _ in texts]


_model_instance = None

def _get_model():
    """Lazy load model — only downloaded once, cached in memory."""
    global _model_instance
    if _model_instance is None:
        from sentence_transformers import SentenceTransformer
        _model_instance = SentenceTransformer('all-MiniLM-L6-v2')
    return _model_instance
