import json, uuid
from fastapi import APIRouter, UploadFile, File, HTTPException
from kafka import KafkaProducer
from config import KAFKA_BROKER
import os
from db.postgres import (
    IngestionState,
    create_job,
    update_state,
    get_job,
)

router = APIRouter()
producer = KafkaProducer(
    bootstrap_servers=KAFKA_BROKER,
    value_serializer=lambda v: json.dumps(v).encode()
)

@router.post("/ingest")
async def ingest(file: UploadFile = File(...)):
    doc_id = str(uuid.uuid4())
    filename = file.filename or f"{doc_id}.bin"
    path = f"/tmp/{doc_id}_{file.filename}"
    with open(path, "wb") as f:
        f.write(await file.read())

    create_job(doc_id, filename)

    try:
        producer.send("ingest-jobs", {
            "doc_id": doc_id,
            "path": path,
            "filename": file.filename
        })
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f'Failed to queue job: {e}'
        )

    update_state(doc_id, IngestionState.QUEUED, None)
    return {"doc_id": doc_id, "status": "queued"}

@router.get('/ingest/status/{doc_id}')
def ingest_status(doc_id):
    job = get_job(doc_id)

    if job is None:
        raise HTTPException(status_code=404, detail="Unknown doc_id")

    return {
        "doc_id": job["doc_id"],
        "filename": job["filename"],
        "state": job["state"],
        "error": job["error"],
        "created_at": job["created_at"].isoformat() if job["created_at"] else None,
        "updated_at": job["updated_at"].isoformat() if job["updated_at"] else None,
    }