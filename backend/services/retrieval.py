from rank_bm25 import BM25Okapi
from sentence_transformers import CrossEncoder
from services.embeddings import model, qdrant, COLLECTION
from config import RERANK_MODEL
import re

reranker = CrossEncoder(RERANK_MODEL)

def vector_search(query, limit=20):
    vec = model.encode(query).tolist()
    hits = qdrant.query_points(COLLECTION, query=vec, limit=limit).points
    return [{"text": h.payload["text"],
             "doc_id": h.payload["doc_id"],
             "score": h.score} for h in hits]

def tokenize(text):
    return re.findall(r"\b\w+\b", text.lower())

def bm25_search(query, candidates):
    corpus = [tokenize(c["text"]) for c in candidates]
    bm25 = BM25Okapi(corpus)
    scores = bm25.get_scores(tokenize(query))
    for c,r in zip(candidates, scores):
        c['bm25'] = float(r)
    return candidates

def hybrid_search(query,top_k=5):
    candidates = vector_search(query, limit=30)
    candidates = bm25_search(query, candidates)

    candidates = sorted(candidates, key=lambda x: x['bm25'], reverse=True)[:15]  

    pairs = [(query, c['text']) for c in candidates]
    rerank_scores = reranker.predict(pairs)
    for c,r in zip(candidates, rerank_scores):
        c['rerank'] = float(r)

    ranked = sorted(candidates, key=lambda x: x['rerank'], reverse=True)[:top_k]
    return ranked