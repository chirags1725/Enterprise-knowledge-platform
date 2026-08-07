# Enterprise Knowledge Intelligence Platform
![License](https://img.shields.io/badge/License-MIT-green)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![Ollamma](https://img.shields.io/badge/Ollama-901339?logo=Ollama&logoColor=white)
![Apache Kafka](https://img.shields.io/badge/Apache%20Kafka-231F20?logo=apachekafka&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?logo=redis&logoColor=white)
![Qdrant](https://img.shields.io/badge/Qdrant-FF6B6B?logo=qdrant&logoColor=white)
![Neo4j](https://img.shields.io/badge/Neo4j-4581C3?logo=neo4j&logoColor=white)
![Elasticsearch](https://img.shields.io/badge/Elasticsearch-005571?logo=elasticsearch&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-20232A?logo=vite)

A self-hosted enterprise search engine that ingests any file type, retrieves with true hybrid search, links everything in a rich knowledge graph, and answers questions locally with verifiable citations — all offline, zero API cost.

![Home Page](images/Home%20Page.png)

---

## Feature Highlights

- **Hierarchical semantic chunking.** Text is split along document structure — headings, paragraphs, sentences, and code boundaries — using LangChain's `RecursiveCharacterTextSplitter`. Code blocks and paragraphs stay whole. This replaces the old word-count sliding window that tore documents mid-thought.
- **Distributed ingestion.** Kafka spreads jobs across a worker pool. Add workers, add throughput.
- **Persistent BM25 index.** Keyword search runs against a permanent Elasticsearch inverted index. Chunks are indexed once at ingestion and queried in milliseconds — no per-query rebuild, no O(n) cost at scale.
- **True hybrid retrieval.** Vector search (Qdrant) and BM25 (Elasticsearch) each pull their own top 100 from the full corpus, independently. The two lists merge via Reciprocal Rank Fusion (RRF), then a cross-encoder reranks the pool. Neither signal is trapped inside the other.
- **GraphRAG.** Neo4j multi-hop traversal feeds candidates into the same fusion pool, so answers can draw on documents connected by a chain of relationships — not just direct text matches.
- **Metadata filtering.** Scope any search by department, year, author, language, tags, access level, or file type. Filters apply server-side, before scoring.
- **Rich knowledge graph.** Nine node types and eight relationship types capture full provenance — from document down to the exact paragraph, and out to authors, teams, and projects.
- **ChatGPT-style citations.** Every result and every answer carries a citation: filename, page, paragraph, line, chunk, a relevance score, and a snippet. You can trace any claim back to its source.
- **Redis caching.** Query results and embeddings are cached, so repeated searches and re-embeddings return instantly.
- **Ingestion job state tracking.** Every upload moves through tracked states — queued, processing, done, failed — so you always know where a file stands.
- **Semantic clustering.** Group similar documents automatically. Spot themes at a glance.
- **Local LLM Q\&A.** Fully offline retrieval-augmented generation using Ollama + gpt-oss-20b (or any other) . No data leaves your hardware.
- **Any file type.** PDFs, code repositories, images, audio, and video all flow through one unified pipeline.

---

<!-- ## Project Architecture & Folder Structure

### Directory Layout

The folder structure is unchanged. The new Elasticsearch client lives alongside the existing database clients in `db/`.

```
knowledge-platform/
├── backend/
│   ├── main.py                 # FastAPI entry point
│   ├── config.py               # Central config
│   ├── requirements.txt
│   ├── db/
│   │   ├── postgres.py
│   │   ├── qdrant.py           # Collection + payload indexes for filtering
│   │   ├── neo4j.py
│   │   ├── elasticsearch.py    # Persistent BM25 index client
│   │   └── redis.py            # Cache + job state
│   ├── routers/
│   │   ├── ingest.py           # Upload + queue + job state
│   │   ├── search.py           # Hybrid search + metadata filters
│   │   ├── qa.py               # RAG Q&A with citations
│   │   ├── graph.py            # Multi-hop queries
│   │   └── clusters.py         # Semantic clustering
│   └── services/
│       ├── extract.py          # PDF / image / audio / video / repo
│       ├── embeddings.py       # Semantic chunk + embed + store + index
│       ├── retrieval.py        # Vector + BM25 + graph + RRF + rerank
│       └── entities.py         # spaCy NER + graph writer + auto-tagging
├── workers/
│   └── ingest_worker.py        # Kafka consumer
├── frontend/
│   └── src/
│       ├── App.jsx
│       ├── Search.jsx
│       └── GraphExplorer.jsx
├── infra/
│   └── docker-compose.yml      # All services, now including Elasticsearch
└── README.md
``` -->

## Architecture

Frontend talks to the API. The API talks to services. Services read and write storage. Kafka feeds the workers. Here's the whole picture:

```
┌────────────────────────────────────────────────────────────┐
│                     FRONTEND (React)                       │
│         Search · Q&A · Graph Explorer · Clusters           │
└───────────────────────────┬────────────────────────────────┘
                            │  HTTP / JSON
┌───────────────────────────▼────────────────────────────────┐
│                       API (FastAPI)                        │
│   /ingest  /search  /ask  /graph  /clusters  /health       │
└───────────────────────────┬────────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────────┐
│                        SERVICES                            │
│  Extract · Embeddings · Hybrid Retrieval · Entities · Q&A  │
└──────┬─────────────┬─────────────┬──────────────┬──────────┘
       │             │             │              │
┌──────▼───┐  ┌──────▼────┐  ┌─────▼─────┐  ┌─────▼─────┐
│PostgreSQL│  │  Qdrant   │  │   Neo4j   │  │   Redis   │
│ metadata │  │  vectors  │  │   graph   │  │  cache /  │
│  users   │  │  chunks   │  │ entities  │  │ job state │
└──────────┘  └───────────┘  └───────────┘  └───────────┘

┌────────────────────────────────────────────────────────────┐
│               INGESTION PIPELINE (async)                   │
│                                                            │
│   Upload → API → ┌─────────────┐ → Worker Pool → Storage   │
│                  │    Kafka     │   ┌───┐ ┌───┐ ┌───┐      │
│                  │ ingest-jobs  │   │ W │ │ W │ │ W │  ... │
│                  │ 6 partitions │   └───┘ └───┘ └───┘      │
│                  └─────────────┘   extract · embed · link  │
└────────────────────────────────────────────────────────────┘

        LOCAL LLM: Ollama + gpt-oss-20b (Q&A + tagging)
```

The upload endpoint returns instantly. Workers do the heavy lifting in parallel. That parallelism is the throughput.

---

### Tech Stack

| Layer         | Technology                      | Role                                    |
| ------------- | ------------------------------- | --------------------------------------- |
| API           | FastAPI                         | Async, Python-native API                |
| Frontend      | React + Vite                    | Search and graph UI                     |
| Relational DB | PostgreSQL                      | Metadata, users, audit                  |
| Vector DB     | Qdrant                          | Similarity search + payload filtering   |
| Keyword Index | **Elasticsearch**               | Persistent BM25 inverted index          |
| Graph DB      | Neo4j Community                 | 9-node knowledge graph, multi-hop       |
| Message Queue | Apache Kafka                    | Distributed ingestion, 6 partitions     |
| Cache / State | Redis                           | Query cache, embedding cache, job state |
| Chunking      | LangChain text splitters        | Hierarchical semantic chunking          |
| Embeddings    | sentence-transformers           | Local vectors, no API cost              |
| Reranking     | cross-encoder (ms-marco-MiniLM) | Relevance boost                         |
| Entities      | spaCy (en\_core\_web\_sm)       | Named entity extraction                 |
| LLM           | Ollama + OpenAI gpt-oss-20b (any other can be used)                | Local Q\&A, zero cost                   |
| Transcription | Faster-Whisper                  | Audio and video to text                 |
| OCR | PyTesseract                  | Extracting text from images                 |
| PDF Extraction | PdfReader                  | Extracting text from PDF                 |

---

## Quick Start

###  Prerequisites

Install Python 3.9+, Node.js 20+, Docker + Docker Compose, and Git.

### 1. Clone and enter

```
git clone https://github.com/chirags1725/Enterprise-knowledge-platform.git
cd Enterprise-knowledge-platform
```

### 2. Start the infrastructure

Spin up every service, including the new Elasticsearch container:

```
cd infra
docker compose up -d
docker compose ps   # every service should say "Up"
```
This boots up PostgreSQL, Redis, Qdrant, Neo4j, ElasticSearch, Zookeeper and Kafka.


### 3. Install Ollama and pull the models

Download Ollama from [ollama.com](https://ollama.com). Then:

```
ollama pull gpt-oss-20b
ollama pull nomic-embed-text
```

Both run locally. No key required.
> Note - Choose model as per your hardware configurations and change the model name in ```backend/routers/qa.py```

### 4. Start the backend

```
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
python -m spacy download en_core_web_sm
uvicorn main:app --reload
```

### 5. Create a Kafka topic

```
docker exec -it infra-kafka-1 kafka-topics --create \
  --topic ingest-jobs --bootstrap-server localhost:9092 \
  --partitions 6 --replication-factor 1
```

### 6. Start the Workers

Run `ingest_worker.py` in up to six separate terminals for parallel ingestion:

```
cd workers && python ingest_worker.py
```

### 7. Start the Frontend

```
cd frontend
npm install
npm run dev
```

---

## API Reference

| Endpoint                  | Method | Description                                                          |
| ------------------------- | ------ | -------------------------------------------------------------------- |
| `/health`                 | GET    | Health check                                                         |
| `/ingest`                 | POST   | Upload a file, queue it to Kafka, return a job ID and state          |
| `/ingest/status/{job_id}` | GET    | Current ingestion state: queued, processing, done, failed            |
| `/search`                 | GET    | Hybrid search with optional metadata filters, returns full citations |
| `/ask`                    | GET    | Local RAG Q\&A via Ollama + Mistral, answers with numbered citations |
| `/graph/related/{doc_id}` | GET    | Multi-hop related documents from Neo4j                               |
| `/graph/entity/{name}`    | GET    | Entity-centered multi-hop query                                      |
| `/clusters`               | GET    | KMeans document clustering over Qdrant vectors                       |

**Example — ingest a file:**

```
curl -F "file=@report.pdf" http://localhost:8000/ingest
# → {"doc_id": "…", "status": "queued"}
```

![Search Query](images/Ingestion%20Page.png)

**Example — ask a question:**

```
curl "http://localhost:8000/ask?q=What+were+the+Q3+revenue+drivers"
# → {"answer": "…", "sources": ["…"]}
```

![Cited AI Query](images/Cited%20AI%20query.png)


**Search without filters:**

```
/search?q=Q3+forecast
```

**Search with filters:**

```
/search?q=Q3+forecast&department=Finance&year=2025&language=en&access_level=internal
```

Only the filters you pass are applied. Omit a filter to leave that dimension open.

![Search Query](images/Search%20Query-2.png)

**Search response shape** — every result carries a citation:

```
{
  "query": "Q3 forecast",
  "filters": {"department": "Finance", "year": 2025},
  "results": [
    {
      "text": "…",
      "citation": {
        "doc_id": "3f2a8c1e-…",
        "filename": "finance-2025-q3.pdf",
        "page": 4,
        "paragraph_index": 12,
        "chunk_index": 37,
        "line_start": 210,
        "score": 0.94,
        "snippet": "Projected Q3 revenue rises 8%…"
      }
    }
  ]
}
```

**Explore the Graph** — Explore relationship between Documents or entities as nodes.

```
/graph/related/{doc_id}
```
or
```
/graph/entity/{name}
```
\
![Graph Explorer](images/Graph%20explorer.png)

---

## Data Flow

### Write Path (Ingestion)

```
File upload
   ↓
POST /ingest  → job written to Redis (state: queued) → Kafka ingest-jobs
   ↓
Worker pulls job (state: processing)
   ↓
extract.py       → pull text by file type (page markers preserved for PDFs)
   ↓
embeddings.py    → hierarchical semantic chunk → embed → store in Qdrant
                   (full metadata + citation payload per chunk)
                 → index each chunk in Elasticsearch (BM25)
   ↓
entities.py      → spaCy NER → write 9-node graph to Neo4j
                 → LLM auto-tags document
   ↓
Job complete (state: done, or failed on error)
```

### Read Path (Search & Q\&A)

```
Query + optional filters
   ↓
Redis cache check → hit returns instantly
   ↓ (miss)
Vector (Qdrant)      BM25 (Elasticsearch)      Graph (Neo4j multi-hop)
top 100, filtered    top 100, filtered         seed + hop candidates
   └──────────────────────┬──────────────────────┘
                          ↓
             Reciprocal Rank Fusion (RRF)
                          ↓
             Cross-encoder rerank (ms-marco-MiniLM)
                          ↓
             Top-k results, each with a full citation
                          ↓
   For Q&A → chunks fed to Mistral (Ollama) → answer with numbered citations
                          ↓
             Result cached in Redis
```



---

## Contributing

Contributions welcome. Keep it simple:

1. Fork the repo.
2. Create a branch: `git checkout -b feature/your-feature`.
3. Commit with a clear message.
4. Open a pull request describing what changed and why.

Rules that keep the project clean:

- Keep every dependency free and open-source. No paid APIs. No trial keys.
- Add or update tests for new features.
- Run the linter before you push.
- One feature per pull request.

Found a bug? Open an issue with steps to reproduce.

---

## License

Released under the MIT License. Use it, fork it, ship it.