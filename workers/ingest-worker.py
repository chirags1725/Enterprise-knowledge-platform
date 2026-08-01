import json,sys
sys.path.append("../backend")

from kafka import KafkaConsumer
from config import KAFKA_BROKER
from services.extract import route_extract
# from services.embeddings import embed_and_store
# from services.entities import extract_entities

consumer = KafkaConsumer(
    'ingest-jobs',
    bootstrap_servers=KAFKA_BROKER,
    group_id='ingest-worker',
    value_deserializer=lambda x: json.loads(x.decode('utf-8'))
)

print("Ingest worker started. Waiting for jobs...")
for message in consumer:
    job = message.value
    try:
        text = route_extract(job['path'], job['filename'])
        print(text)
        # embed_and_store(job['doc_id'], job['filename'], text)
        # extract_entities(job['doc_id'], text)
        print(f"Successfully processed job for doc_id: {job['doc_id']}")
    except Exception as e:
        print(f"Error processing job: {e}")