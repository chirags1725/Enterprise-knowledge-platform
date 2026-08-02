import spacy
from neo4j import GraphDatabase
from config import NEO4J_URI, NEO4J_AUTH

nlp = spacy.load("en_core_web_sm")
driver = GraphDatabase.driver(NEO4J_URI, auth=NEO4J_AUTH)

def extract_entities(doc_id, text):
    doc = nlp(text[:100000])
    print(f"Extracted {len(doc.ents)} entities from document {doc_id}")
    entities = {(e.text.strip(), e.label_) for e in doc.ents if e.label_ in {"PERSON", "ORG", "GPE", "LOC", "PRODUCT", "EVENT"}}
    with driver.session() as s:
        s.run("MERGE (d:Document {id: $id})", id=doc_id)
        for name, label in entities:
            s.run("""MERGE (e:Entity {name: $name})
                SET e.type = $label
                WITH e
                MATCH (d:Document {id: $doc_id})
                MERGE (d)-[:MENTIONS]->(e)
            """, name=name, label=label, doc_id=doc_id)
    print(f"Stored {len(entities)} entities for document {doc_id}")

def link_citations():
    with driver.session() as s:
        s.run("""
            MATCH (d1:Document)-[:MENTIONS]->(e:Entity)<-[:MENTIONS]-(d2:Document)
            WHERE d1.id < d2.id
            MERGE (d1)-[r:RELATED]->(d2)
            SET r.shared = coalesce(r.shared, 0) + 1
        """)