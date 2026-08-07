import requests
from fastapi import APIRouter, Query
from services.retrieval import hybrid_search,build_qa_context
from config import OLLAMA_URL
import http
from typing import Optional

router = APIRouter()

_CONTEXT_CHUNKS = 5

_SYSTEM_PROMPT = (
    "You are a detailed research assistant. "
    "Answer using only the numbered sources provided. "
    "Cite each claim with its [n] reference number. "
    "If the sources don't contain enough information, say so."
)

@router.get("/ask")
def ask(
    q: str,
    department: Optional[str] = None,
    year: Optional[int] = None,
    author: Optional[str] = None,
    language: Optional[str] = None,
    tags: Optional[list[str]] = Query(None),
    access_level: Optional[str] = None,
    file_type: Optional[str] = None,
):
    filters = {
        "department":department,
        "year": year,
        "author": author,
        "language": language,
        "tags": tags,
        "access_level": access_level,
        "file_type": file_type,
    }
    filters = {k: v for k, v in filters.items() if v is not None} or None

    results = hybrid_search(q, top_k=_CONTEXT_CHUNKS, filters=filters)
    if not results:
        return {
            "answer": "No relevant sources found for your query.",
            "sources": [],
        }

    context_str, citations = build_qa_context(results)

    prompt = f"""Answer the question in detail using only the context below.
    Cite the source filenames you used. Return the answer in markdown format

    Context:
    {context_str}

    Question: {q}
    Answer:"""

    res = requests.post(f"{OLLAMA_URL}/api/generate", json={
        "model": "nemotron-3-nano:30b-cloud",
        "prompt": prompt,
        "stream": False
    })
    ans = res.json().get("response", "").strip()

    return {
        "answer": ans,
        "sources": citations
    }