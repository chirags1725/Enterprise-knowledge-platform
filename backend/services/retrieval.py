from rank_bm25 import BM25Okapi
from sentence_transformers import CrossEncoder
from services.embeddings import model, qdrant, COLLECTION
from config import RERANK_MODEL
from db.elasticsearch import get_es_client, ES_INDEX
import re

reranker = CrossEncoder(RERANK_MODEL)
es = get_es_client()

RECALL_LIMIT = 100

# RRF smoothing constant.
RRF_K = 60

VECTOR_WEIGHT = 1.0
BM25_WEIGHT = 1.0

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

def reciprocal_rank_fusion(vector_hits, bm25_hits, k=RRF_K):
    fused = {}

    def add(hits, weight, score_field):
        for rank, hit in enumerate(hits, start=1):
            key = (hit["doc_id"], hit.get("chunk_index"))
            contribution = weight * (1.0 / (k + rank))
            if key not in fused:
                fused[key] = {
                    "text": hit["text"],
                    "doc_id": hit["doc_id"],
                    "chunk_index": hit.get("chunk_index"),
                    "vector_score": 0.0,
                    "bm25_score": 0.0,
                    "rrf_score": 0.0,
                }
            fused[key][score_field] = hit.get(score_field, 0.0)
            fused[key]["rrf_score"] += contribution

    add(vector_hits, VECTOR_WEIGHT, "vector_score")
    add(bm25_hits, BM25_WEIGHT, "bm25_score")

    return sorted(fused.values(), key=lambda c: c["rrf_score"], reverse=True)

def hybrid_search(query, top_k=5, candidate_limit=30, rerank_pool=50):

    vector_hits = vector_search(query, limit=RECALL_LIMIT)
    bm25_hits = bm25_search(query, limit=RECALL_LIMIT)

    candidates = reciprocal_rank_fusion(vector_hits, bm25_hits)
    if not candidates:
        return []

    # Rerank only the strongest fused candidates. The cross-encoder is the
    # most expensive stage, so cap it rather than scoring every fused chunk.
    pool = candidates[:rerank_pool]

    pairs = [(query, c["text"]) for c in pool]
    rerank_scores = reranker.predict(pairs)
    for c, r in zip(pool, rerank_scores):
        c["rerank_score"] = float(r)

    ranked = sorted(pool, key=lambda c: c["rerank_score"], reverse=True)
    return ranked[:top_k]