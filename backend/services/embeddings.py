import os

from sentence_transformers import SentenceTransformer
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, PayloadSchemaType
from config import QDRANT_URL, EMBED_MODEL
import uuid

from datetime import datetime

model = SentenceTransformer(EMBED_MODEL)
qdrant = QdrantClient(url=QDRANT_URL)
COLLECTION = "documents"

def ensure_collection():
    if not qdrant.collection_exists(COLLECTION):
        qdrant.create_collection(
            COLLECTION,
            vectors_config=VectorParams(size=384, distance=Distance.COSINE)
        )
        qdrant.create_payload_index(
            collection_name=COLLECTION,
            field_name="doc_id",
            field_schema=PayloadSchemaType.KEYWORD,
        )

        qdrant.create_payload_index(
            collection_name=COLLECTION,
            field_name="filename",
            field_schema=PayloadSchemaType.KEYWORD,
        )

        qdrant.create_payload_index(
            collection_name=COLLECTION,
            field_name="file_type",
            field_schema=PayloadSchemaType.KEYWORD,
        )

def chunk_text(text, size=500, overlap=50):
    words = text.split()
    chunks = []
    for i in range(0, len(words), size - overlap):
        chunks.append(" ".join(words[i:i + size]))
    return chunks

def embed_and_store(doc_id, filename, text):
    print("START EMBEDDING")

    ensure_collection()
    print("COLLECTION READY")

    if not text or not text.strip():
        print("Skipping empty text")
        return

    chunks = chunk_text(text)

    print("CHUNKS:", chunks)

    if not chunks:
        print("No chunks generated")
        return

    print("CREATING VECTORS")

    vectors = model.encode(
        chunks,
        show_progress_bar=True
    )

    print("VECTORS CREATED")

    file_type = os.path.splitext(filename)[1].replace(".", "").lower()

    created_at = datetime.utcnow().isoformat()

    points = [
        PointStruct(
            id=str(uuid.uuid4()),
            vector=vec.tolist(),
            payload={
                "doc_id": doc_id,
                "filename": filename,
                "chunk_id": idx,
                "file_type": file_type,
                "created_at": created_at,
                "text": chunk,
            },
        )
        for idx, (chunk, vec) in enumerate(zip(chunks, vectors))
    ]

    print("POINTS:", len(points))

    qdrant.upsert(
        collection_name=COLLECTION,
        points=points
    )

    print("QDRANT STORED")