from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import ingest

app = FastAPI(title="Knowledge Intelligence Platform")
app.include_router(ingest.router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "ok"}