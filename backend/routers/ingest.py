from fastapi import APIRouter,  File, UploadFile
from kafka import KafkaProducer
import json,uuid
from config import KAFKA_BROKER
import os

router = APIRouter()
producer = KafkaProducer(bootstrap_servers=KAFKA_BROKER,
                         value_serializer=lambda v: json.dumps(v).encode('utf-8'))

@router.post("/ingest")
async def ingest_file(file: UploadFile = File(...)):
    doc_id = str(uuid.uuid4())
    os.makedirs('/tmp/Enterprise-knowledge-platform', exist_ok=True)
    path = f"/tmp/Enterprise-knowledge-platform/{doc_id}_{file.filename}"
    with open(path, "wb") as f:
        f.write(await file.read())

    producer.send('ingest-jobs',{
        "doc_id": doc_id,
        "filename": file.filename,
        "path": path
    })

    return {'doc_id': doc_id, 'status': 'queued'}
