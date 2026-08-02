from __future__ import annotations
from fastapi import APIRouter, Query
from services.retrieval import hybrid_search

router = APIRouter()

@router.get("/search")
def search(
    q: str,
    top_k: int = 5,
    department: str | None = Query(default=None),
    year: int | None = Query(default=None),
    author: str | None = Query(default=None),
    language: str | None = Query(default=None),
    tags: list[str] | None = Query(default=None),
    access_level: str | None = Query(default=None),
    file_type: str | None = Query(default=None),
):    
    filters = {
        "department": department,
        "year": year,
        "author": author,
        "language": language,
        "tags": tags,
        "access_level": access_level,
        "file_type": file_type,
    }
    filters = {k: v for k, v in filters.items() if v is not None}

    results = hybrid_search(q, top_k=top_k, filters=filters or None)
    return {"query": q, "filters": filters, "results": results}