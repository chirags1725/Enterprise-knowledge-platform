import { useState } from "react";
import { getApiUrl, setApiUrl, api, ApiError } from "../lib/api";
import { useTheme } from "../lib/theme";
import { useToast } from "../lib/toast";
import { useJobs } from "../lib/jobs";
import { cx } from "../lib/utils";

export default function SettingsPage() {
  const [url, setUrl] = useState(getApiUrl());
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // "ok" | "fail" | null
  const { theme, setTheme } = useTheme();
  const { push } = useToast();
  const { clearFinished, jobs } = useJobs();

  function save() {
    setApiUrl(url.trim().replace(/\/$/, ""));
    push("API endpoint saved", { type: "success" });
  }

  async function test() {
    setTesting(true);
    setTestResult(null);
    const prev = getApiUrl();
    setApiUrl(url.trim().replace(/\/$/, ""));
    try {
      await api.health();
      setTestResult("ok");
    } catch (err) {
      setTestResult("fail");
      setApiUrl(prev);
    } finally {
      setTesting(false);
    }
  }

  function clearHistory() {
    localStorage.removeItem("kp-search-history");
    push("Search history cleared", { type: "success" });
  }

  function clearAllJobs() {
    localStorage.removeItem("kp-ingest-jobs");
    push("Ingestion history cleared — reload to refresh the list", { type: "success" });
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div className="kp-panel p-5 lg:p-6">
        <p className="kp-label mb-1">API endpoint</p>
        <p className="text-xs text-text-faint mb-3">Where the FastAPI backend is running. No authentication is required.</p>
        <div className="flex gap-2">
          <input className="kp-input flex-1 font-mono text-sm" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://localhost:8000" />
          <button className="kp-btn-secondary shrink-0" onClick={test} disabled={testing}>{testing ? "Testing…" : "Test"}</button>
          <button className="kp-btn-primary shrink-0" onClick={save}>Save</button>
        </div>
        {testResult === "ok" && <p className="text-xs text-state-done mt-2">✓ Connected — /health responded.</p>}
        {testResult === "fail" && <p className="text-xs text-state-failed mt-2">✕ Couldn't reach that URL.</p>}
      </div>

      <div className="kp-panel p-5 lg:p-6">
        <p className="kp-label mb-3">Appearance</p>
        <div className="flex items-center gap-2">
          {["light", "dark"].map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={cx(
                "flex-1 kp-card py-3 text-sm font-medium capitalize transition-colors",
                theme === t ? "border-signal text-signal bg-signal/5" : "text-text-muted hover:text-text"
              )}
            >
              {t === "dark" ? "☾ Dark" : "☀ Light"}
            </button>
          ))}
        </div>
      </div>

      <div className="kp-panel p-5 lg:p-6">
        <p className="kp-label mb-3">Local data</p>
        <p className="text-xs text-text-faint mb-4">
          Search history and ingestion job history are stored only in this browser, never sent anywhere but the API.
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="kp-btn-secondary" onClick={clearHistory}>Clear search history</button>
          <button className="kp-btn-secondary" onClick={clearAllJobs}>Clear ingestion history ({jobs.length})</button>
        </div>
      </div>

      <div className="kp-panel p-5 lg:p-6">
        <p className="kp-label mb-2">About</p>
        <p className="text-xs text-text-muted leading-relaxed">
          Knowledge Platform is a self-hosted enterprise search engine: hierarchical semantic chunking,
          hybrid retrieval (vector + BM25 + GraphRAG) fused via Reciprocal Rank Fusion, cross-encoder
          reranking, a nine-node knowledge graph, and fully offline Q&A through Ollama + Mistral.
        </p>
      </div>
    </div>
  );
}
