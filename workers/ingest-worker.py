import json, sys
sys.path.append("../backend")
from kafka import KafkaConsumer
from config import KAFKA_BROKER
from services.extract import route_extract
from services.embeddings import embed_chunks, store_document
from services.entities import extract_entities

consumer = KafkaConsumer(
    "ingest-jobs",
    bootstrap_servers=KAFKA_BROKER,
    group_id="ingest-workers",
    value_deserializer=lambda v: json.loads(v.decode())
)

print("Worker ready. Waiting for jobs...")
for msg in consumer:
    job = msg.value
    try:

        text = route_extract(job["path"], job["filename"])

        store_document(
            doc_id=job["doc_id"],
            text=text,
            metadata={
                "filename": job["filename"],
                "file_type": job["filename"].split(".")[-1].lower(),
            },
            source_ext="." + job["filename"].split(".")[-1].lower(),
        )

        extract_entities(job["doc_id"], text)
        print(f"Done: {job['filename']}")
    except Exception as e:
        print(f"Failed {job['filename']}: {e}")