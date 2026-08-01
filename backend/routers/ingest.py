import json, uuid
from fastapi import APIRouter, UploadFile, File
from kafka import KafkaProducer
from config import KAFKA_BROKER

router = APIRouter()
producer = KafkaProducer(
    bootstrap_servers=KAFKA_BROKER,
    value_serializer=lambda v: json.dumps(v).encode()
)

@router.post("/ingest")
async def ingest(file: UploadFile = File(...)):
    doc_id = str(uuid.uuid4())
    path = f"/tmp/{doc_id}_{file.filename}"
    with open(path, "wb") as f:
        f.write(await file.read())

    producer.send("ingest-jobs", {
        "doc_id": doc_id,
        "path": path,
        "filename": file.filename
    })
    return {"doc_id": doc_id, "status": "queued"}