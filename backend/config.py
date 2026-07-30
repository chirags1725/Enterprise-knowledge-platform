import os

POSTGRES_URL = "postgresql://kp:kp@localhost:5432/knowledge"
REDIS_URL = "redis://localhost:6379"
QDRANT_URL = "http://localhost:6333"
NEO4J_URI = "bolt://localhost:7687"
NEO4J_AUTH = ("neo4j", "password123")
KAFKA_BROKER = "localhost:9092"
OLLAMA_URL = "http://localhost:11434"
EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
RERANK_MODEL = "cross-encoder/ms-marco-MiniLM-L-6-v2"