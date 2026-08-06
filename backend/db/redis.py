"""
Redis cache client for the platform's four-level caching layer.

Wraps a single Redis connection with typed get/set helpers for each cache
level: query embeddings, search results, reranker scores, and LLM answers.
Every value carries a TTL so stale entries expire on their own. Keys are
namespaced and versioned so a model change invalidates everything with a
single version bump.

Redis is already in the stack (job state). This module adds caching on the
same instance — no new infrastructure.
"""

import hashlib
import json

import redis

from config import REDIS_URL
from typing import List, Optional

# ---------------------------------------------------------------------------
# Client (single connection, reused)
# ---------------------------------------------------------------------------

# decode_responses=True so keys and values come back as str, not bytes.
_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)

# ---------------------------------------------------------------------------
# Key namespacing + versioning
# ---------------------------------------------------------------------------
CACHE_VERSION = "v1"
_PREFIX = "kp"

# ---------------------------------------------------------------------------
# TTLs per cache level (seconds)
# ---------------------------------------------------------------------------

TTL_EMBEDDING = 604800   # 7 days  — vectors are stable until the model changes
TTL_SEARCH = 3600        # 1 hour  — results shift as new docs are ingested
TTL_RERANK = 86400       # 24 hours — (query, chunk) scores are deterministic
TTL_ANSWER = 21600       # 6 hours — answers depend on question + context


# ---------------------------------------------------------------------------
# Key builders
# ---------------------------------------------------------------------------

def _hash(*parts: str) -> str:
    """
    Build a stable 16-char hash from the given string parts.

    SHA-256 keeps keys fixed-length and collision-safe. Truncating to 16 hex
    chars is enough headroom for a single-corpus cache while keeping keys
    short and scannable in redis-cli.
    """
    joined = "\x1f".join(parts)  # unit separator — safe against text collisions
    digest = hashlib.sha256(joined.encode("utf-8")).hexdigest()
    return digest[:16]


def _key(level: str, hash_body: str) -> str:
    """Assemble a namespaced, versioned cache key."""
    return f"{_PREFIX}:{CACHE_VERSION}:{level}:{hash_body}"


def embedding_key(query: str) -> str:
    """Key for a cached query embedding."""
    return _key("emb", _hash(query))


def search_key(query: str, filters: Optional[dict], use_graph: bool, top_k: int) -> str:
    """
    Key for a cached search result.

    Filters are sorted before hashing so equivalent filter dicts in any order
    produce the same key — otherwise the same search caches twice.
    """
    filters_str = json.dumps(filters or {}, sort_keys=True)
    return _key("search", _hash(query, filters_str, str(use_graph), str(top_k)))


def rerank_key(query: str, chunk_text: str) -> str:
    """Key for a cached cross-encoder score on one (query, chunk) pair."""
    return _key("rerank", _hash(query, chunk_text))


def answer_key(query: str, context_ids: List[str]) -> str:
    """
    Key for a cached LLM answer.

    Context IDs are joined in order — same question against the same context
    returns the same answer.
    """
    return _key("answer", _hash(query, "|".join(context_ids)))


# ---------------------------------------------------------------------------
# Typed get/set helpers
# ---------------------------------------------------------------------------

def get_json(key: str):
    """Return a deserialized JSON value, or None on cache miss."""
    raw = _client.get(key)
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        # Corrupt entry — drop it so the next write is clean.
        _client.delete(key)
        return None


def set_json(key: str, value, ttl: int) -> None:
    """Store a JSON-serializable value with a TTL in seconds."""
    _client.set(key, json.dumps(value), ex=ttl)


def get_text(key: str) -> Optional[str]:
    """Return a raw string value, or None on cache miss."""
    return _client.get(key)


def set_text(key: str, value: str, ttl: int) -> None:
    """Store a raw string value with a TTL in seconds."""
    _client.set(key, value, ex=ttl)


# ---------------------------------------------------------------------------
# Maintenance
# ---------------------------------------------------------------------------

def invalidate_level(level: str) -> int:
    """
    Delete every cached key for one level at the current version.

    Use after re-ingesting content that should drop cached search results or
    answers. Scans instead of KEYS so it stays safe on large keyspaces.

    Returns the number of keys deleted.
    """
    pattern = f"{_PREFIX}:{CACHE_VERSION}:{level}:*"
    deleted = 0
    for key in _client.scan_iter(match=pattern, count=500):
        _client.delete(key)
        deleted += 1
    return deleted


def get_client() -> redis.Redis:
    """Return the shared Redis client for job-state or direct use."""
    return _client