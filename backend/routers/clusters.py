from fastapi import APIRouter
from sklearn.cluster import KMeans
from services.embeddings import qdrant, COLLECTION
import numpy as np

router = APIRouter()

@router.get("/clusters")
def clusters(k: int = 5):
    points = qdrant.scroll(COLLECTION, limit=1000, with_vectors=True)[0]
    vectors = np.array([p.vector for p in points])
    labels = KMeans(n_clusters=k, n_init=10).fit_predict(vectors)

    grouped = {}
    for p, label in zip(points, labels):
        grouped.setdefault(int(label), []).append(p.payload["filename"])
    return {"clusters": grouped}