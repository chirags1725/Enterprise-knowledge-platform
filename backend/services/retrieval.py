from sentence_transformers import CrossEncoder
from qdrant_client.models import (
    Filter,
    FieldCondition,
    MatchValue,
    MatchAny,
)
from services.embeddings import model, qdrant, COLLECTION
from config import RERANK_MODEL
from db.elasticsearch import get_es_client, ES_INDEX
import re
from services.entities import driver

reranker = CrossEncoder(RERANK_MODEL)
es = get_es_client()

RECALL_LIMIT = 100

# RRF smoothing constant.
RRF_K = 60

VECTOR_WEIGHT = 1.0
BM25_WEIGHT = 1.0

GRAPH_SEED_COUNT = 3
GRAPH_MAX_HOPS = 2
GRAPH_LIMIT = 30
GRAPH_WEIGHT = 2.0


_KEYWORD_FILTERS = ("department", "author", "language", "access_level", "file_type")


def build_filter(filters):
    if not filters:
        return None

    conditions = []
    for key in _KEYWORD_FILTERS:
        value = filters.get(key)

        if value is not None:
            conditions.append(
                FieldCondition(
                    key=key,
                    match=MatchValue(value=value)
                )
            )
    if filters.get("year") is not None:
        conditions.append(
            FieldCondition(
                key="year",
                match=MatchValue(value=filters["year"])
            )
        )

    tags = filters.get("tags")
    if tags:
        tag_list = tags if isinstance(tags, list) else [tags]
        conditions.append(
            FieldCondition(
                key="tags",
                match=MatchAny(any=tag_list)
            )
        )

    if not conditions:
        return None
    return Filter(must=conditions)

def build_es_filter(filters):
    if not filters:
        return []

    clauses = []

    for key in _KEYWORD_FILTERS:
        value = filters.get(key)
        if value is not None:
            clauses.append({"term": {key: value}})

    if filters.get("year") is not None:
        clauses.append({"term": {"year": filters["year"]}})

    tags = filters.get("tags")
    if tags:
        tag_list = tags if isinstance(tags, list) else [tags]
        clauses.append({"terms": {"tags": tag_list}})

    return clauses

def vector_search(query, limit=20, filters=None):
    vec = model.encode(query).tolist()
    hits = qdrant.query_points(COLLECTION, query=vec, limit=limit, query_filter=build_filter(filters)).points
    return [
    {
        "text": h.payload["text"],
        "doc_id": h.payload["doc_id"],
        "chunk_index": h.payload.get("chunk_index"),
        "vector_score": h.score,
    }
    for h in hits if h.payload and "text" in h.payload and "doc_id" in h.payload
    ]

def bm25_search(query, limit=30, filters=None):
    print("Document count:")
    print(es.count(index=ES_INDEX))

    print("Sample documents:")
    print(
        es.search(
            index=ES_INDEX,
            query={"match_all": {}},
            size=2,
        )
    )

    filter_clauses = build_es_filter(filters)
    response = es.search(
    index=ES_INDEX,
    size=limit,
    query={
            "bool": {
                "must": {
                    "match": {
                        "text": {"query": query, "operator": "or"}
                    }
                },
                "filter": filter_clauses,
            }
        },
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


# ---------------------------------------------------------------------------
# Graph expansion (Neo4j) — NEW
# ---------------------------------------------------------------------------

# Cypher walks from a set of seed documents to neighbor documents through:
#   1. Shared entities  (Paragraph -[:MENTIONS]-> Entity <- another document)
#   2. Shared provenance (same Author, Team, Project, or Citation)
# shared_count ranks neighbors by how strongly they connect to the seed set.
_GRAPH_EXPAND_CYPHER = """
UNWIND $seed_ids AS seed_id

MATCH (seed:Document {id: seed_id})

OPTIONAL MATCH 
(seed)-[:HAS_SECTION]->(:Section)
      -[:HAS_PARAGRAPH]->(:Paragraph)
      -[:MENTIONS]->(e:Entity)
<-[:MENTIONS]-(:Paragraph)
<-[:HAS_PARAGRAPH]-(:Section)
<-[:HAS_SECTION]-(nbr:Document)

WHERE nbr.id <> seed_id


WITH seed_id, nbr, count(DISTINCT e) AS entity_score


WITH collect({
    id:nbr.id,
    score:entity_score
}) AS entity_neighbors


UNWIND entity_neighbors AS n


WITH n.id AS doc_id,
     n.score AS shared_count


WHERE doc_id IS NOT NULL
AND NOT doc_id IN $seed_ids


RETURN 
doc_id,
shared_count

ORDER BY shared_count DESC

LIMIT $limit
"""

def _neighbor_doc_ids(seed_ids, limit=GRAPH_LIMIT):
    if not seed_ids:
        return []

    with driver.session() as session:
        result = session.run(
            _GRAPH_EXPAND_CYPHER,
            seed_ids=seed_ids,
            limit=limit,
        )

        scores = {}

        for record in result:
            doc_id = record["doc_id"]
            score = record["shared_count"]

            if doc_id in seed_ids:
                continue

            scores[doc_id] = scores.get(doc_id, 0) + score

        return sorted(
            scores.items(),
            key=lambda x: x[1],
            reverse=True
        )[:limit]

def _best_chunk_for_doc(doc_id, filters=None):

    must = [
        FieldCondition(
            key="doc_id",
            match=MatchValue(value=doc_id)
        )
    ]

    extra = build_filter(filters)

    if extra and extra.must:
        must.extend(extra.must)


    points, _ = qdrant.scroll(
        collection_name=COLLECTION,
        scroll_filter=Filter(
            must=must
        ),
        limit=5,
        with_payload=True,
        with_vectors=False,
    )


    if not points:
        return None


    payload = points[0].payload


    return {
        "text": payload["text"],
        "doc_id": payload["doc_id"],
        "chunk_index": payload.get("chunk_index",0),
    }


def graph_expand(
    query,
    vector_hits,
    filters=None,
    seed_count=GRAPH_SEED_COUNT,
    limit=GRAPH_LIMIT
):

    if not vector_hits:
        return []


    # only top documents seed graph
    seed_ids = []

    for hit in vector_hits[:seed_count]:

        if hit["doc_id"] not in seed_ids:
            seed_ids.append(hit["doc_id"])



    print("GRAPH SEEDS:", seed_ids)


    neighbors = _neighbor_doc_ids(
        seed_ids,
        limit=limit
    )


    print("GRAPH NEIGHBORS:", neighbors)


    graph_hits = []


    for doc_id, shared_count in neighbors:

        chunk = _best_chunk_for_doc(
            doc_id,
            filters
        )


        if chunk:

            chunk["graph_score"] = float(shared_count)

            graph_hits.append(chunk)


    return graph_hits




def reciprocal_rank_fusion(vector_hits, bm25_hits, graph_hits=None, k=RRF_K):
    """
    Merge two or three ranked candidate lists into one pool using RRF.

    Each chunk's fused score is the sum of weight * 1/(k + rank) across every
    list it appears in. Fusing on rank avoids normalizing Qdrant, Elasticsearch,
    and graph scores against each other — three scales with no shared meaning.

    Args:
        vector_hits: Ranked list from vector_search.
        bm25_hits: Ranked list from bm25_search.
        graph_hits: Optional ranked list from graph_expand.
        k: RRF smoothing constant.

    Returns:
        A candidate pool sorted by fused RRF score, best first.
    """
    fused = {}

    def add(hits, weight, score_field):
        for rank, hit in enumerate(hits, start=1):
            key = (hit["doc_id"], hit.get("chunk_index", 0))
            contribution = weight * (1.0 / (k + rank))
            if key not in fused:
                fused[key] = {
                    "text": hit["text"],
                    "doc_id": hit["doc_id"],
                    "chunk_index": hit.get("chunk_index"),
                    "vector_score": 0.0,
                    "bm25_score": 0.0,
                    "graph_score": 0.0,
                    "rrf_score": 0.0,
                }
            fused[key][score_field] = hit.get(score_field, 0.0)
            fused[key]["rrf_score"] += contribution

    add(vector_hits, VECTOR_WEIGHT, "vector_score")
    add(bm25_hits, BM25_WEIGHT, "bm25_score")
    if graph_hits:
        add(graph_hits, GRAPH_WEIGHT, "graph_score")

    return sorted(fused.values(), key=lambda c: c["rrf_score"], reverse=True)


# ---------------------------------------------------------------------------
# Hybrid search — vector + BM25 + graph, fuse, rerank
# ---------------------------------------------------------------------------

def hybrid_search(query, top_k=5, rerank_pool=50, filters=None, use_graph=True):
    """
    Run the full GraphRAG pipeline and return the top_k reranked chunks.

    Steps:
        1. Vector search   -> top RECALL_LIMIT from Qdrant (independent).
        2. BM25 search     -> top RECALL_LIMIT from Elasticsearch (independent).
        3. Graph expansion -> neighbor documents from Neo4j, seeded by the
           top vector hits.
        4. RRF fusion      -> merge all three lists into one pool.
        5. Cross-encoder   -> rerank the top rerank_pool candidates.
        6. Return top_k.

    Args:
        query: The user query string.
        top_k: Number of final results to return.
        rerank_pool: How many fused candidates to send to the cross-encoder.
        filters: Optional dict of metadata filters (Fix #4).
        use_graph: Toggle graph expansion. Defaults to True. Set False to
            run the Fix #3 two-signal pipeline without the graph step.

    Returns:
        The top_k reranked chunks, best first.
    """
    vector_hits = vector_search(query, limit=RECALL_LIMIT, filters=filters)
    bm25_hits = bm25_search(query, limit=RECALL_LIMIT, filters=filters)

    graph_hits = []
    if use_graph:
        graph_hits = graph_expand(
            query,
            vector_hits,
            filters=filters
        )
    print("VECTOR:", len(vector_hits))
    print("BM25:", len(bm25_hits))
    print("GRAPH:", len(graph_hits))


    candidates = reciprocal_rank_fusion(vector_hits, bm25_hits, graph_hits)
    if not candidates:
        return []

    pool = candidates[:rerank_pool]

    pairs = [(query, c["text"]) for c in pool]
    rerank_scores = reranker.predict(pairs)
    for c, r in zip(pool, rerank_scores):
        c["rerank_score"] = float(r)

    ranked = sorted(pool, key=lambda c: c["rerank_score"], reverse=True)
    return ranked[:top_k]