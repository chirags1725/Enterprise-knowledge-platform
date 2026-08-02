import { useState } from "react";
import axios from "axios";

const API = "http://localhost:8000";

export default function Search() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const runSearch = async () => {
    setLoading(true);
    const res = await axios.get(`${API}/search`, { params: { query: query } });
    setResults(res.data.results);
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>Knowledge Search</h1>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runSearch()}
          placeholder="Ask anything..."
          style={{ flex: 1, padding: 12, fontSize: 16 }}
        />
        <button onClick={runSearch} style={{ padding: "12px 20px" }}>
          Search
        </button>
      </div>

      {loading && <p>Searching...</p>}

      {results.map((r, i) => (
        <div key={i} style={{ border: "1px solid #ddd", padding: 16, marginTop: 12 }}>
          <strong>{r.filename || r.doc_id}</strong>
          <p>{r.text.slice(0, 300)}...</p>
          <small>rerank: {r.rerank?.toFixed(3)} · bm25: {r.bm25?.toFixed(2)}</small>
        </div>
      ))}
    </div>
  );
}