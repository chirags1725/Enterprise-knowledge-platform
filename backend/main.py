from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import qa
from routers import clusters
from routers import search
from routers import ingest
from routers import graph

app = FastAPI(title="Knowledge Intelligence Platform")
app.include_router(ingest.router)
app.include_router(search.router)
app.include_router(graph.router)
app.include_router(clusters.router)
app.include_router(qa.router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "ok"}