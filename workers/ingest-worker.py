import json, sys

sys.path.append("../backend")
from kafka import KafkaConsumer
from config import KAFKA_BROKER
from services.extract import route_extract
from services.embeddings import embed_chunks, store_document, chunk_text
from services.entities import extract_entities, write_graph
from db.elasticsearch import index_chunk

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
        metadata = {
            "filename": job["filename"],
            "file_type": job["filename"].split(".")[-1].lower(),
        }


        store_document(
            filename=job["filename"],
            doc_id=job["doc_id"],
            text=text,
            metadata=metadata,
            source_ext="." + job["filename"].split(".")[-1].lower(),
        )


        chunks = chunk_text(text)


        for idx, chunk in enumerate(chunks):
            index_chunk(
                doc_id=job["doc_id"],
                chunk_index=idx,
                text=chunk,
                metadata=metadata,
            )

        extract_entities(text)
        write_graph(doc_id=job["doc_id"], filename=job["filename"], text=text, metadata={"filename": job["filename"],"file_type": job["filename"].split(".")[-1].lower()})
        print(f"Done: {job['filename']}")
    except Exception as e:
        print(f"Failed {job['filename']}: {e}")