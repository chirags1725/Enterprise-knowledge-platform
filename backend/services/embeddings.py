import os
import re

from sentence_transformers import SentenceTransformer
from db.qdrant import get_qdrant_client
from qdrant_client.models import Distance, VectorParams, PointStruct, PayloadSchemaType
from config import EMBED_MODEL

from langchain_text_splitters import (
    RecursiveCharacterTextSplitter,
    Language,
)
import uuid
from typing import Optional

from datetime import datetime

model = SentenceTransformer(EMBED_MODEL)
qdrant = get_qdrant_client()
COLLECTION = "documents"


CHUNK_SIZE = 2000        # characters, not words
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

_METADATA_DEFAULTS = {
    "department": "unassigned",
    "year": None,
    "author": "unknown",
    "language": "en",
    "tags": [],
    "access_level": "internal",   # default to internal, never public
    "file_type": "text",
}


def _build_metadata(meta) -> dict:
    """Merge caller-supplied metadata over the defaults."""
    resolved = dict(_METADATA_DEFAULTS)
    if meta:
        for key in _METADATA_DEFAULTS:
            if key in meta and meta[key] is not None:
                resolved[key] = meta[key]
    return resolved

def store_document(
    doc_id,
    text,
    filename,
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
    meta = _build_metadata(metadata)

    points = [
        PointStruct(
            id=str(uuid.uuid4()),
            vector=vec,
            payload={
                "doc_id": doc_id,
                "filename": filename,
                "chunk_index": idx,
                "text": chunk,
                "department": meta["department"],
                "year": meta["year"],
                "author": meta["author"],
                "language": meta["language"],
                "tags": meta["tags"],
                "access_level": meta["access_level"],
                "file_type": meta["file_type"],
            },
        )
        for idx, (chunk, vec) in enumerate(zip(chunks, vectors))
    ]

    qdrant.upsert(
        collection_name=COLLECTION,
        points=points,
    )
    return len(points)