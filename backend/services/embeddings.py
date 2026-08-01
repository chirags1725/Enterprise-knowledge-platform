from sentence_transformers import SentenceTransformer
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from config import QDRANT_URL, EMBED_MODEL
import uuid

model = SentenceTransformer(EMBED_MODEL)
qdrant = QdrantClient(url=QDRANT_URL)
COLLECTION = "documents"

def ensure_collection():
    if not qdrant.collection_exists(COLLECTION):
        qdrant.create_collection(
            COLLECTION,
            vectors_config=VectorParams(size=384, distance=Distance.COSINE)
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

    points = [
        PointStruct(
            id=str(uuid.uuid4()),
            vector=vec.tolist(),
            payload={
                "doc_id": doc_id,
                "filename": filename,
                "text": chunk
            }
        )
        for chunk, vec in zip(chunks, vectors)
    ]

    print("POINTS:", len(points))

    qdrant.upsert(
        collection_name=COLLECTION,
        points=points
    )

    print("QDRANT STORED")