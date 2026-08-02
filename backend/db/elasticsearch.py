from elasticsearch import Elasticsearch

from config import ES_URL, ES_INDEX

_client = None

def get_es_client():
    global _client
    if _client is None:
        _client = Elasticsearch(ES_URL)
        _ensure_index(_client)
    return _client

def _ensure_index(client):
    if client.indices.exists(index=ES_INDEX):
        return

    client.indices.create(
        index=ES_INDEX,
        mappings={
            "properties": {
                "doc_id": {"type": "keyword"},
                "chunk_index": {"type": "integer"},
                "text": {
                    "type": "text",
                    "similarity": "BM25",   # BM25 is the default ranking function
                },
            }
        },
    )


def index_chunk(doc_id: str, chunk_index: int, text: str) -> None:
    """
    Index a single chunk into the permanent BM25 index.

    Call this once per chunk during ingestion — not per query.
    """
    client = get_es_client()
    client.index(
        index=ES_INDEX,
        id=f"{doc_id}:{chunk_index}",
        document={
            "doc_id": doc_id,
            "chunk_index": chunk_index,
            "text": text,
        },
    )