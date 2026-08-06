import json, sys

sys.path.append("../backend")

import os
from kafka import KafkaConsumer
from config import KAFKA_BROKER
from services.extract import route_extract
from services.embeddings import store_document, chunk_text
from services.entities import extract_entities, write_graph
from db.elasticsearch import index_chunk
from db.postgres import (
    IngestionState,
    init_ingestion_table,
    update_state,
    mark_failed
)

def _build_consumer() -> KafkaConsumer:
    consumer = KafkaConsumer(
        "ingest-jobs",
        bootstrap_servers=KAFKA_BROKER,
        group_id="ingest-workers",
        value_deserializer=lambda v: json.loads(v.decode()),
        auto_offset_reset='earliest',
        enable_auto_commit=True
    )
    return consumer

print("Worker ready. Waiting for jobs...")
# for msg in consumer:
#     job = msg.value
#     try:

#         text = route_extract(job["path"], job["filename"])
        # metadata = {
        #     "filename": job["filename"],
        #     "file_type": job["filename"].split(".")[-1].lower(),
        # }


#         store_document(
#             filename=job["filename"],
#             doc_id=job["doc_id"],
#             text=text,
#             metadata=metadata,
#             source_ext="." + job["filename"].split(".")[-1].lower(),
#         )


#         chunks = chunk_text(text)


#         for idx, chunk in enumerate(chunks):
#             index_chunk(
#                 doc_id=job["doc_id"],
#                 chunk_index=idx,
#                 text=chunk,
#                 metadata=metadata,
#             )

#         extract_entities(text)
#         write_graph(doc_id=job["doc_id"], filename=job["filename"], text=text, metadata={"filename": job["filename"],"file_type": job["filename"].split(".")[-1].lower()})
#         print(f"Done: {job['filename']}")
#     except Exception as e:
#         print(f"Failed {job['filename']}: {e}")


def process_job(job: dict):
    doc_id = job["doc_id"]
    path = job['path']
    filename = job['filename']
    source_ext = os.path.splitext(filename)[1].lower()

    metadata = {
        "filename":filename,
        "file_type":source_ext,
    }
    try:
        print('Working on: ',doc_id)
        update_state(doc_id, IngestionState.EXTRACTING)
        text = route_extract(path, filename)

        update_state(doc_id,IngestionState.EMBEDDING)
        store_document(doc_id,text,filename,metadata=metadata,source_ext=source_ext)

        chunks = chunk_text(text)

        for idx, chunk in enumerate(chunks):
            index_chunk(
                doc_id=doc_id,
                chunk_index=idx,
                text=chunk,
                metadata=metadata,
            )

        update_state(doc_id,IngestionState.NER)
        extract_entities(text)

        update_state(doc_id,IngestionState.GRAPH)
        write_graph(doc_id, filename, text=text, metadata=metadata)


        update_state(doc_id,IngestionState.COMPLETED)
        print('Done: ', doc_id)
    except Exception as exc:
        mark_failed(doc_id, error=f"{type(exc).__name__}: {exc}")

def run():
    init_ingestion_table()
    consumer = _build_consumer()

    for message in consumer:
        process_job(message.value)

if __name__ == "__main__":
    run()