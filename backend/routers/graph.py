from fastapi import APIRouter
from services.entities import driver

router = APIRouter()

@router.get("/graph/related/{doc_id}")
def related(doc_id: str, hops: int = 2):
    query = f"""
        MATCH path = (d:Document {{id: $id}})-[:RELATED*1..{hops}]-(other:Document)
        RETURN DISTINCT other.id AS doc_id, length(path) AS distance
        ORDER BY distance LIMIT 20
    """
    with driver.session() as s:
        result = s.run(query, id=doc_id)
        return {"related": [dict(r) for r in result]}

@router.get("/graph/entity/{name}")
def entity_docs(name: str):
    with driver.session() as s:
        result = s.run("""
            MATCH (e:Entity {name: $name})<-[:MENTIONS]-(d:Document)
            RETURN d.id AS doc_id
        """, name=name)
        return {"documents": [dict(r) for r in result]}