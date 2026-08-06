import requests
from fastapi import APIRouter
from services.retrieval import hybrid_search
from config import OLLAMA_URL

router = APIRouter()

@router.get("/ask")
def ask(q: str):
    chunks = hybrid_search(q, top_k=5)
    context = "\n\n".join(c["text"] for c in chunks)
    prompt = f"""Answer the question using only the context below.
Cite the source filenames you used.

Context:
{context}

Question: {q}
Answer:"""

    res = requests.post(f"{OLLAMA_URL}/api/generate", json={
        "model": "gpt-oss:120b-cloud",
        "prompt": prompt,
        "stream": False
    })
    return {
        "answer": res.json()["response"],
        "sources": [c["doc_id"] for c in chunks]
    }