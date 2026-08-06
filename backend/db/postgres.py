import enum

from datetime import datetime, timezone

import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2.pool import SimpleConnectionPool

from typing import Optional

from config import POSTGRES_URL

_pool = SimpleConnectionPool(minconn=1, maxconn=10, dsn=POSTGRES_URL)

class IngestionState(str, enum.Enum):
    UPLOADED = "UPLOADED"
    QUEUED="QUEUED"
    EXTRACTING="EXTRACTING"
    OCR="OCR"
    EMBEDDING="EMBEDDING"
    NER="NER"
    GRAPH="GRAPH"
    COMPLETED="COMPLETED"
    FAILED="FAILED"


_STATE_ORDER = [
    IngestionState.UPLOADED,
    IngestionState.QUEUED,
    IngestionState.EXTRACTING,
    IngestionState.OCR,
    IngestionState.EMBEDDING,
    IngestionState.NER,
    IngestionState.GRAPH,
    IngestionState.COMPLETED,
]

def _get_conn():
    """Borrow a connection from the pool."""
    return _pool.getconn()


def _put_conn(conn) -> None:
    """Return a connection to the pool."""
    _pool.putconn(conn)


def init_ingestion_table() -> None:
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS ingestion_jobs(
                    doc_id TEXT PRIMARY KEY,
                    filename TEXT NOT NULL,
                    state TEXT NOT NULL,
                    error TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
                );
                """
            )

            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_state
                ON ingestion_jobs (state);
                """
            )

        conn.commit()
    finally:
        _put_conn(conn)


def create_job(doc_id:str, filename: str) -> None:
    now = datetime.now(timezone.utc)
    conn = _get_conn()

    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO ingestion_jobs (doc_id, filename, state,error, created_at, updated_at)
                VALUES (%s, %s, %s,NULL,%s,%s)
                ON CONFLICT (doc_id) DO UPDATE SET
                    filename = EXCLUDED.filename,
                    state = EXCLUDED.state,
                    error=NULL,
                    updated_at=EXCLUDED.updated_at
                """,
                (doc_id,filename,IngestionState.UPLOADED.value,now, now)
            )
        conn.commit()
    finally:
        _put_conn(conn)

def update_state(doc_id, state: IngestionState, error: Optional[str] = None):
    now = datetime.now(timezone.utc)
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE ingestion_jobs
                SET state = %s,
                    error = %s,
                    updated_at= %s
                where doc_id = %s
                """,
                (state.value, error, now, doc_id),
            )
        conn.commit()
    finally:
        _put_conn(conn)

def mark_failed(doc_id,error):
    update_state(doc_id=doc_id, state = IngestionState.FAILED,error=error)

def get_job(doc_id):
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT doc_id, filename,state,error,created_at, updated_at
                FROM ingestion_jobs
                WHERE doc_id=%s
                """,
                (doc_id,),
            )
            row = cur.fetchone()
        return dict(row) if row else None
    finally:
        _put_conn(conn)