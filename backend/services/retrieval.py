from rank_bm25 import BM25Okapi
from sentence_transformers import CrossEncoder
from services.embeddings import model, qdrant, COLLECTION
from config import RERANK_MODEL
from db.elasticsearch import get_es_client, ES_INDEX
import re

reranker = CrossEncoder(RERANK_MODEL)
es = get_es_client()

def vector_search(query, limit=20):
    vec = model.encode(query).tolist()
    hits = qdrant.query_points(COLLECTION, query=vec, limit=limit).points
    return [
    {
        "text": h.payload["text"],
        "doc_id": h.payload["doc_id"],
        "chunk_index": h.payload.get("chunk_index"),
        "vector_score": h.score,
    }
    for h in hits
    ]

def tokenize(text):
    return re.findall(r"\b\w+\b", text.lower())

def bm25_search(query, limit=30):
    response = es.search(
    index=ES_INDEX,
    size=limit,
    query={
        "match": {
            "text": {
                "query": query,
                "operator": "or",
            }
        }
    }
    )

    results= []

    for hit in response['hits']['hits']:
        source = hit['_source']
        results.append({
            "text": source["text"],
            "doc_id": source["doc_id"],
            "chunk_index": source.get("chunk_index"),
            "bm25_score": hit["_score"],
        })
    
    return results

def _merge_candidates(vector_hits, bm25_hits):
    merged = {}
    for hit in vector_hits + bm25_hits:
        key = (hit['doc_id'], hit.get('chunk_index'))
        if key not in merged:
            merged[key] = {
                "text": hit["text"],
                "doc_id": hit["doc_id"],
                "chunk_index": hit.get("chunk_index"),
                "vector_score": hit.get("vector_score", 0.0),
                "bm25_score": hit.get("bm25_score", 0.0),
            }
        else:
            existing = merged[key]
            existing["vector_score"] = max(
                existing["vector_score"], hit.get("vector_score", 0.0)
            )
            existing["bm25_score"] = max(
                existing["bm25_score"], hit.get("bm25_score", 0.0)
            )
    return list(merged.values())

def hybrid_search(query, top_k=5, candidate_limit=30):

    vector_hits = vector_search(query, limit=candidate_limit)
    bm25_hits = bm25_search(query, limit=candidate_limit)

    candidates = _merge_candidates(vector_hits, bm25_hits)
    if not candidates:
        return []

    pairs = [(query, c["text"]) for c in candidates]
    rerank_scores = reranker.predict(pairs)
    for c, r in zip(candidates, rerank_scores):
        c["rerank_score"] = float(r)

    ranked = sorted(candidates, key=lambda x: x["rerank_score"], reverse=True)
    return ranked[:top_k]