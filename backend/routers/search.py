from fastapi import APIRouter, Query
from services.retrieval import hybrid_search
from typing import Optional, List

router = APIRouter()

@router.get("/search")
def search(
    q: str,
    top_k: int = 5,
    department: Optional[str] = Query(default=None),
    year: Optional[int] = Query(default=None),
    author: Optional[str] = Query(default=None),
    language: Optional[str] = Query(default=None),
    tags: Optional[List[str]] = Query(default=None),
    access_level: Optional[str] = Query(default=None),
    file_type: Optional[str] = Query(default=None),
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