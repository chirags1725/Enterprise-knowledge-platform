import { useState } from "react";
import Search from "./Search";
import GraphExplorer from "./GraphExplorer";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const STATE_STYLES = {
  queued: "text-state-queued",
  processing: "text-state-processing",
  done: "text-state-done",
  failed: "text-state-failed",
};

const STATE_DOT = {
  queued: "bg-state-queued",
  processing: "bg-state-processing animate-pulse",
  done: "bg-state-done",
  failed: "bg-state-failed",
};

/**
 * Ingestion panel — upload a file, then poll its job state until it
 * settles on done or failed. Reflects the Redis-backed state tracking
 * added in the ingestion-states fix.
 */
function IngestionPanel() {
  const [jobs, setJobs] = useState([]);
  const [busy, setBusy] = useState(false);

  async function pollStatus(jobId, filename) {
    // Poll /ingest/status until the job reaches a terminal state.
    const tick = async () => {
      try {
        const res = await fetch(`${API}/ingest/status/${jobId}`);
        const data = await res.json();
        setJobs((prev) =>
          prev.map((j) =>
            j.jobId === jobId ? { ...j, state: data.state } : j
          )
        );
        if (data.state !== "done" && data.state !== "failed") {
          setTimeout(tick, 1500);
        }
      } catch {
        setJobs((prev) =>
          prev.map((j) =>
            j.jobId === jobId ? { ...j, state: "failed" } : j
          )
        );
      }
    };
    tick();
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setBusy(true);
    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch(`${API}/ingest`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      const job = {
        jobId: data.doc_id,
        filename: file.name,
        state: data.state || "queued",
      };
      setJobs((prev) => [job, ...prev]);
      pollStatus(job.jobId, file.name);
    } catch {
      setJobs((prev) => [
        { jobId: crypto.randomUUID(), filename: file.name, state: "failed" },
        ...prev,
      ]);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  return (
    <div className="kp-panel p-4">
      <h2 className="text-sm font-semibold text-text mb-3">Ingestion</h2>

      <label className="kp-btn-primary w-full cursor-pointer">
        {busy ? "Uploading…" : "Upload a file"}
        <input
          type="file"
          className="hidden"
          onChange={handleUpload}
          disabled={busy}
        />
      </label>

      <p className="text-xs text-text-faint mt-2">
        PDF, code, image, audio, or video. Jobs run through Kafka workers.
      </p>

      <div className="mt-4 space-y-2 max-h-72 overflow-y-auto">
        {jobs.length === 0 && (
          <p className="text-xs text-text-faint">No jobs yet.</p>
        )}
        {jobs.map((job) => (
          <div
            key={job.jobId}
            className="kp-card p-3 flex items-center justify-between gap-2"
          >
            <span className="text-xs text-text truncate" title={job.filename}>
              {job.filename}
            </span>
            <span
              className={`flex items-center gap-1.5 text-xs font-medium ${
                STATE_STYLES[job.state] || "text-text-muted"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  STATE_DOT[job.state] || "bg-text-faint"
                }`}
              />
              {job.state}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState("search");

  return (
    <div className="min-h-screen bg-bg text-text">
      {/* Top bar */}
      <header className="border-b border-line bg-bg-soft/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-brand flex items-center justify-center text-white font-bold">
              K
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight">
                Knowledge Platform
              </h1>
              <p className="text-xs text-text-faint leading-tight">
                Hybrid search · GraphRAG · local Q&amp;A
              </p>
            </div>
          </div>

          <nav className="flex items-center gap-1 bg-bg-card rounded-xl p-1 border border-line">
            <button
              className={`kp-tab ${tab === "search" ? "kp-tab-active" : ""}`}
              onClick={() => setTab("search")}
            >
              Search &amp; Q&amp;A
            </button>
            <button
              className={`kp-tab ${tab === "graph" ? "kp-tab-active" : ""}`}
              onClick={() => setTab("graph")}
            >
              Graph Explorer
            </button>
          </nav>
        </div>
      </header>

      {/* Body */}
      <main className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
        <aside className="space-y-6">
          <IngestionPanel />
        </aside>

        <section>
          {tab === "search" ? <Search api={API} /> : <GraphExplorer api={API} />}
        </section>
      </main>
    </div>
  );
}