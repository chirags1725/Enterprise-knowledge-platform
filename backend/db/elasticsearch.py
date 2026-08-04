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
        "similarity": "BM25",
    },

    "filename": {"type": "keyword"},
    "department": {"type": "keyword"},
    "author": {"type": "keyword"},
    "year": {"type": "integer"},
    "language": {"type": "keyword"},
    "tags": {"type": "keyword"},
    "access_level": {"type": "keyword"},
    "file_type": {"type": "keyword"},
}
        },
    )

def index_chunk(
    doc_id: str,
    chunk_index: int,
    text: str,
    metadata=None
):
    """
    Index a single chunk into the permanent BM25 index.

    Call this once per chunk during ingestion — not per query.
    """
    client = get_es_client()
    metadata = metadata or {}
    client.index(
        index=ES_INDEX,
        id=f"{doc_id}:{chunk_index}",

        document={
            "doc_id": doc_id,
            "chunk_index": chunk_index,
            "text": text,

            "filename": metadata.get("filename"),
            "department": metadata.get("department", "unassigned"),
            "author": metadata.get("author", "unknown"),
            "year": metadata.get("year"),
            "language": metadata.get("language", "en"),
            "tags": metadata.get("tags", []),
            "access_level": metadata.get("access_level", "internal"),
            "file_type": metadata.get("file_type", "text"),
        },
    )