import spacy
from neo4j import GraphDatabase
from config import NEO4J_URI, NEO4J_AUTH

import re
import uuid

from typing import Optional

nlp = spacy.load("en_core_web_sm")
driver =   GraphDatabase.driver(NEO4J_URI, auth=NEO4J_AUTH)

KEEP_LABELS = {"PERSON", "ORG", "GPE", "PRODUCT", "EVENT", "WORK_OF_ART", "LAW", "LANGUAGE", "NORP", "LOC"}
_MAX_CHARS = 100_000
_CITATION_RE = re.compile(r"\[([^\]]{1,120})\]")


def extract_entities(text):
    doc = nlp(text[:100000])
    seen = set()
    entities = []
    for ent in doc.ents:
        if ent.label_ not in KEEP_LABELS:
            continue
        key = (ent.text.strip(), ent.label_)
        if key in seen:
            continue
        seen.add(key)
        entities.append({"name": ent.text.strip(), "type": ent.label_})
    return entities


def extract_citations(text: str) -> list[str]:
    seen = set()
    refs = []
    for match in _CITATION_RE.finditer(text):
        ref = match.group(1).strip()
        if ref and ref not in seen:
            seen.add(ref)
            refs.append(ref)
    return refs


def _parse_sections(text: str) -> list[dict]:

    heading_re = re.compile(r"^#{1,3} .+", re.MULTILINE)
    boundaries = [m.start() for m in heading_re.finditer(text)]

    # Build raw section blocks
    blocks = []
    if not boundaries or boundaries[0] > 0:
        # Text before the first heading
        end = boundaries[0] if boundaries else len(text)
        blocks.append(("Introduction", text[:end]))

    for i, start in enumerate(boundaries):
        end = boundaries[i + 1] if i + 1 < len(boundaries) else len(text)
        block = text[start:end]
        first_line, _, rest = block.partition("\n")
        heading = first_line.lstrip("#").strip()
        blocks.append((heading, rest))

    sections = []
    for sec_order, (heading, body) in enumerate(blocks):
        raw_paras = [p.strip() for p in re.split(r"\n\n+", body) if p.strip()]
        paragraphs = [
            {"text": p, "order": p_order}
            for p_order, p in enumerate(raw_paras)
        ]
        sections.append({
            "heading": heading,
            "order": sec_order,
            "paragraphs": paragraphs,
        })

    return sections



def write_graph(
    doc_id: str,
    filename: str,
    text: str,
    metadata: Optional[dict] = None,
) -> None:

    metadata = metadata or {}
    sections = _parse_sections(text)
    entities = extract_entities(text)
    citations = extract_citations(text)
    tags = metadata.get("tags", [])

    with driver.session() as session:
        session.run(
            """
            MERGE (d:Document {id: $doc_id})
            SET d.filename = $filename,
                d.year     = $year
            """,
            doc_id=doc_id,
            filename=filename,
            year=metadata.get("year"),
        )

        author = metadata.get("author")
        if author and author != "unknown":
            session.run(
                """
                MERGE (a:Author {name: $name})
                WITH a
                MATCH (d:Document {id: $doc_id})
                MERGE (d)-[:WRITTEN_BY]->(a)
                """,
                name=author,
                doc_id=doc_id,
            )

        department = metadata.get("department")
        if department and department != "unassigned":
            session.run(
                """
                MERGE (t:Team {name: $name})
                WITH t
                MATCH (d:Document {id: $doc_id})
                MERGE (d)-[:OWNED_BY]->(t)
                """,
                name=department,
                doc_id=doc_id,
            )

        project = metadata.get("project")
        if project:
            session.run(
                """
                MERGE (p:Project {name: $name})
                WITH p
                MATCH (d:Document {id: $doc_id})
                MERGE (d)-[:PART_OF]->(p)
                """,
                name=project,
                doc_id=doc_id,
            )

        for tag in tags:
            session.run(
                """
                MERGE (tp:Topic {name: $name})
                WITH tp
                MATCH (d:Document {id: $doc_id})
                MERGE (d)-[:ABOUT]->(tp)
                """,
                name=tag,
                doc_id=doc_id,
            )
        for ref in citations:
            cit_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{doc_id}:{ref}"))
            session.run(
                """
                MERGE (c:Citation {id: $cit_id})
                SET c.ref = $ref
                WITH c
                MATCH (d:Document {id: $doc_id})
                MERGE (d)-[:CITES]->(c)
                """,
                cit_id=cit_id,
                ref=ref,
                doc_id=doc_id,
            )

        for section in sections:
            sec_id = str(uuid.uuid5(
                uuid.NAMESPACE_DNS,
                f"{doc_id}:sec:{section['order']}"
            ))

            session.run(
                """
                MERGE (s:Section {id: $sec_id})
                SET s.heading = $heading,
                    s.order   = $order
                WITH s
                MATCH (d:Document {id: $doc_id})
                MERGE (d)-[:HAS_SECTION]->(s)
                """,
                sec_id=sec_id,
                heading=section["heading"],
                order=section["order"],
                doc_id=doc_id,
            )

            for para in section["paragraphs"]:
                para_id = str(uuid.uuid5(
                    uuid.NAMESPACE_DNS,
                    f"{sec_id}:para:{para['order']}"
                ))

                session.run(
                    """
                    MERGE (p:Paragraph {id: $para_id})
                    SET p.order = $order
                    WITH p
                    MATCH (s:Section {id: $sec_id})
                    MERGE (s)-[:HAS_PARAGRAPH]->(p)
                    """,
                    para_id=para_id,
                    order=para["order"],
                    sec_id=sec_id,
                )

                para_entities = extract_entities(para["text"])
                for ent in para_entities:
                    session.run(
                        """
                        MERGE (e:Entity {name: $name, type: $type})
                        WITH e
                        MATCH (p:Paragraph {id: $para_id})
                        MERGE (p)-[:MENTIONS]->(e)
                        """,
                        name=ent["name"],
                        type=ent["type"],
                        para_id=para_id,
                    )

                    for tag in tags:
                        if ent["name"].lower() in tag.lower() or tag.lower() in ent["name"].lower():
                            session.run(
                                """
                                MATCH (e:Entity {name: $name, type: $type})
                                MERGE (tp:Topic {name: $tag})
                                MERGE (e)-[:ABOUT]->(tp)
                                """,
                                name=ent["name"],
                                type=ent["type"],
                                tag=tag,
                            )

        if entities:
            session.run(
                """
                MATCH (d1:Document {id: $doc_id})
                UNWIND $entity_names AS ename
                MATCH (e:Entity {name: ename})
                MATCH (p:Paragraph)-[:MENTIONS]->(e)
                MATCH (s:Section)-[:HAS_PARAGRAPH]->(p)
                MATCH (d2:Document)-[:HAS_SECTION]->(s)
                WHERE d2.id <> $doc_id
                WITH d1, d2, count(e) AS shared
                MERGE (d1)-[r:RELATED]->(d2)
                SET r.shared = shared
                """,
                doc_id=doc_id,
                entity_names=[e["name"] for e in entities],
            )


def process_document(
    doc_id: str,
    filename: str,
    text: str,
    metadata: Optional[dict] = None,
) -> int:
    write_graph(doc_id, filename, text, metadata)
    return len(extract_entities(text))