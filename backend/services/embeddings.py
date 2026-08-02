import os
import re

from sentence_transformers import SentenceTransformer
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, PayloadSchemaType
from config import QDRANT_URL, EMBED_MODEL

from langchain_text_splitters import (
    RecursiveCharacterTextSplitter,
    Language,
)
import uuid
from typing import Optional

from datetime import datetime

model = SentenceTransformer(EMBED_MODEL)
qdrant = QdrantClient(url=QDRANT_URL)
COLLECTION = "documents"


CHUNK_SIZE = 1000        # characters, not words
CHUNK_OVERLAP = 150      # characters of overlap to preserve context across chunks

_TEXT_SEPARATORS = [
    "\n# ",      # chapter-level heading
    "\n## ",     # section-level heading
    "\n### ",    # sub-section heading
    "\n```",     # code fence boundary
    "\n\n",      # paragraph
    "\n",        # line
    ". ",        # sentence
    "? ",
    "! ",
    " ",         # word
    "",          # character
]

_CODE_LANGUAGES = {
    ".py": Language.PYTHON,
    ".js": Language.JS,
    ".ts": Language.TS,
    ".java": Language.JAVA,
    ".go": Language.GO,
    ".md": Language.MARKDOWN,
}

_text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=CHUNK_SIZE,
    chunk_overlap=CHUNK_OVERLAP,
    separators=_TEXT_SEPARATORS,
    length_function=len,
    keep_separator=True,
)

def _code_splitter(language: Language) -> RecursiveCharacterTextSplitter:
    """Return a splitter that breaks code on function/class boundaries."""
    return RecursiveCharacterTextSplitter.from_language(
        language=language,
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
    )

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

def chunk_text(text: str, source_ext: Optional[str] = None) -> list[str]:
    if not text or not text.strip():
        return []

    if source_ext and source_ext.lower() in _CODE_LANGUAGES:
        splitter = _code_splitter(_CODE_LANGUAGES[source_ext.lower()])
        chunks = splitter.split_text(text)
    else:
        chunks = _text_splitter.split_text(text)

    # Drop empties and collapse stray whitespace without touching structure.
    cleaned = []
    for chunk in chunks:
        stripped = chunk.strip()
        if stripped:
            cleaned.append(re.sub(r"[ \t]+\n", "\n", stripped))
    return cleaned

# def embed_and_store(doc_id, filename, text):
#     print("START EMBEDDING")

#     ensure_collection()
#     print("COLLECTION READY")

#     if not text or not text.strip():
#         print("Skipping empty text")
#         return

#     chunks = chunk_text(text)

#     print("CHUNKS:", chunks)

#     if not chunks:
#         print("No chunks generated")
#         return

#     print("CREATING VECTORS")

#     vectors = model.encode(
#         chunks,
#         show_progress_bar=True
#     )

#     print("VECTORS CREATED")

#     file_type = os.path.splitext(filename)[1].replace(".", "").lower()

#     created_at = datetime.utcnow().isoformat()

#     points = [
#         PointStruct(
#             id=str(uuid.uuid4()),
#             vector=vec.tolist(),
#             payload={
#                 "doc_id": doc_id,
#                 "filename": filename,
#                 "chunk_id": idx,
#                 "file_type": file_type,
#                 "created_at": created_at,
#                 "text": chunk,
#             },
#         )
#         for idx, (chunk, vec) in enumerate(zip(chunks, vectors))
#     ]

#     print("POINTS:", len(points))

#     qdrant.upsert(
#         collection_name=COLLECTION,
#         points=points
#     )

#     print("QDRANT STORED")


def embed_chunks(chunks):
    """Generate local embeddings for a list of chunks."""
    if not chunks:
        return []
    vectors = model.encode(chunks, show_progress_bar=False)
    return [v.tolist() for v in vectors]


def store_document(
    doc_id,
    text,
    metadata = None,
    source_ext = None,
):
    """
    Chunk, embed, and store a document's text in Qdrant.

    Args:
        doc_id: Parent document identifier.
        text: Raw extracted text.
        metadata: Optional metadata attached to every chunk payload.
        source_ext: Optional file extension for code-aware chunking.

    Returns:
        The number of chunks stored.
    """
    metadata = metadata or {}

    chunks = chunk_text(text, source_ext=source_ext)
    if not chunks:
        return 0

    vectors = embed_chunks(chunks)

    points = [
        PointStruct(
            id=str(uuid.uuid4()),
            vector=vec,
            payload={
                "doc_id": doc_id,
                "chunk_id": idx,
                "text": chunk,
                **metadata
            },
        )
        for idx, (chunk, vec) in enumerate(zip(chunks, vectors))
    ]

    qdrant.upsert(
        collection_name=COLLECTION,
        points=points,
    )
    return len(points)