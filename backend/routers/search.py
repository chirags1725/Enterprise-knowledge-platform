from fastapi import APIRouter
from services.retrieval import hybrid_search

router = APIRouter()

@router.get("/search")
def search(query: str, top_k: int = 5):
    return {'query': query, 'results': hybrid_search(query, top_k=top_k)}