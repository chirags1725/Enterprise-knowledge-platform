import { useState } from "react";
import axios from "axios";

const API = "http://localhost:8000";

export default function GraphExplorer() {
  const [docId, setDocId] = useState("");
  const [related, setRelated] = useState([]);

  const explore = async () => {
    const res = await axios.get(`${API}/graph/related/${docId}?hops=2`);
    setRelated(res.data.related);
  };

  return (
    <div style={{ maxWidth: 720, margin: "40px auto" }}>
      <h2>Citation Explorer</h2>
      <input value={docId} onChange={(e) => setDocId(e.target.value)}
             placeholder="Document ID" style={{ padding: 10, width: "70%" }} />
      <button onClick={explore}>Explore</button>
      <ul>
        {related.map((r, i) => (
          <li key={i}>{r.doc_id} — {r.distance} hop(s) away</li>
        ))}
      </ul>
    </div>
  );
}