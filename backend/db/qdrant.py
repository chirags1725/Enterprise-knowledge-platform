from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    VectorParams,
    PayloadSchemaType,
)

from config import QDRANT_URL

_client = None
COLLECTION = 'documents'
# Payload fields that become filterable indexes, mapped to their schema type.
# text is intentionally excluded — it is searched, not filtered.
_PAYLOAD_INDEXES = {
    "doc_id": PayloadSchemaType.KEYWORD,
    "filename": PayloadSchemaType.KEYWORD,
    "chunk_index": PayloadSchemaType.INTEGER,
    "department": PayloadSchemaType.KEYWORD,
    "year": PayloadSchemaType.INTEGER,
    "author": PayloadSchemaType.KEYWORD,
    "language": PayloadSchemaType.KEYWORD,
    "tags": PayloadSchemaType.KEYWORD,        # list of keywords
    "access_level": PayloadSchemaType.KEYWORD,
    "file_type": PayloadSchemaType.KEYWORD,
}


def get_qdrant_client() -> QdrantClient:
    """Return a singleton Qdrant client and ensure the collection exists."""
    global _client
    if _client is None:
        _client = QdrantClient(url=QDRANT_URL)
        ensure_collection(_client)
        _ensure_payload_indexes(_client)
    return _client


def ensure_collection(client):
    if not client.collection_exists(COLLECTION):
        client.create_collection(
            COLLECTION,
            vectors_config=VectorParams(size=384, distance=Distance.COSINE)
        )
        client.create_payload_index(
            collection_name=COLLECTION,
            field_name="doc_id",
            field_schema=PayloadSchemaType.KEYWORD,
        )

        client.create_payload_index(
            collection_name=COLLECTION,
            field_name="filename",
            field_schema=PayloadSchemaType.KEYWORD,
        )

        client.create_payload_index(
            collection_name=COLLECTION,
            field_name="file_type",
            field_schema=PayloadSchemaType.KEYWORD,
        )

def _ensure_payload_indexes(client: QdrantClient) -> None:
    """
    Create a payload index for every filterable metadata field.

    Indexes let Qdrant filter server-side, before scoring, so the reranker
    only ever sees chunks that pass the filter. Creating an index that
    already exists is a no-op, so this is safe to call on every startup.
    """
    for field, schema in _PAYLOAD_INDEXES.items():
        try:
            client.create_payload_index(
                collection_name=COLLECTION,
                field_name=field,
                field_schema=schema,
            )
        except Exception:
            # Index already exists — safe to ignore.
            pass