import { useOutletContext, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useJobs } from "../lib/jobs";
import { Badge, StatCard, EmptyState } from "../components/ui";
import { timeAgo, iconForFilename } from "../lib/utils";

const PIPELINE = [
  { key: "vector", label: "Vector · Qdrant", tone: "vector", detail: "meaning, synonyms, paraphrase — top 100" },
  { key: "keyword", label: "BM25 · Elasticsearch", tone: "keyword", detail: "exact terms, names, codes — top 100" },
  { key: "graph", label: "Graph · Neo4j", tone: "graph", detail: "multi-hop related documents" },
];

const ACTIONS = [
  { to: "/search", icon: "◎", title: "Search & Ask", desc: "Run a hybrid query or ask Mistral a question with cited sources." },
  { to: "/ingest", icon: "⇪", title: "Ingest a file", desc: "Upload a PDF, repo, image, audio, or video for processing." },
  { to: "/graph", icon: "⌬", title: "Explore the graph", desc: "Walk multi-hop relationships from a document or entity." },
  { to: "/clusters", icon: "⬡", title: "View clusters", desc: "Browse KMeans clusters computed over the corpus." },
];

export default function Dashboard() {
  const { connectionStatus } = useOutletContext();
  const { jobs } = useJobs();
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  const recent = jobs.slice(0, 5);
  const active = jobs.filter((j) => j.state === "queued" || j.state === "processing").length;
  const done = jobs.filter((j) => j.state === "done").length;
  const failed = jobs.filter((j) => j.state === "failed").length;

  function submitSearch(e) {
    e.preventDefault();
    if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Hero / quick ask */}
      <div className="kp-panel p-6 lg:p-8 relative overflow-hidden">
        <div className="relative max-w-2xl">
          <p className="kp-label mb-2">Self-hosted · offline · zero per-query cost</p>
          <h2 className="font-display text-2xl lg:text-[28px] font-bold tracking-tight leading-tight">
            Every answer traces back to a real filename, page, and paragraph.
          </h2>
          <p className="text-sm text-text-muted mt-2.5 max-w-xl">
            Three independent recall paths — vector, keyword, and graph — fuse into one ranked list,
            then a cross-encoder reranks it before Mistral writes a cited answer.
          </p>
          <form onSubmit={submitSearch} className="mt-5 flex gap-2 max-w-xl">
            <input
              className="kp-input flex-1"
              placeholder="Ask a question or search your documents…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button className="kp-btn-primary shrink-0" type="submit">Search</button>
          </form>
        </div>
      </div>

      {connectionStatus === "offline" && (
        <div className="kp-panel border-state-failed/40 bg-state-failed/5 p-4 text-sm flex items-center gap-3">
          <span className="text-state-failed text-lg">⚠</span>
          <div className="flex-1">
            <p className="font-medium text-text">Can't reach the backend</p>
            <p className="text-text-muted text-xs mt-0.5">Check that the API is running and the URL is correct in Settings.</p>
          </div>
          <a href="/settings" className="kp-btn-secondary shrink-0">Open settings</a>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="API status" value={connectionStatus === "online" ? "Online" : connectionStatus === "offline" ? "Offline" : "Checking"} tone={connectionStatus === "online" ? "text-state-done" : connectionStatus === "offline" ? "text-state-failed" : "text-state-queued"} />
        <StatCard label="Jobs in flight" value={active} hint="queued or processing" />
        <StatCard label="Ingested" value={done} hint="completed this session" />
        <StatCard label="Failed" value={failed} tone={failed > 0 ? "text-state-failed" : undefined} hint="need a retry" />
      </div>

      <div className="grid lg:grid-cols-[1.3fr_1fr] gap-6">
        {/* Pipeline explainer — signature visual */}
        <div className="kp-panel p-5 lg:p-6">
          <p className="kp-label mb-4">Retrieval pipeline</p>
          <div className="flex flex-col gap-2">
            {PIPELINE.map((p) => (
              <div key={p.key} className="flex items-center gap-3">
                <Badge tone={p.tone} className="w-[168px] shrink-0 justify-start">{p.label}</Badge>
                <div className="flex-1 h-px bg-line" />
                <span className="text-xs text-text-faint hidden sm:block shrink-0">{p.detail}</span>
              </div>
            ))}
            <div className="flex items-center gap-3 pl-4 mt-1">
              <span className="text-text-faint">↘</span>
              <Badge tone="signal">Reciprocal Rank Fusion</Badge>
              <div className="flex-1 h-px bg-line" />
              <span className="text-xs text-text-faint hidden sm:block">fuses on rank, not raw score</span>
            </div>
            <div className="flex items-center gap-3 pl-8">
              <span className="text-text-faint">↘</span>
              <Badge tone="signal">Cross-encoder rerank</Badge>
              <div className="flex-1 h-px bg-line" />
              <span className="text-xs text-text-faint hidden sm:block">ms-marco-MiniLM, precise relevance</span>
            </div>
            <div className="flex items-center gap-3 pl-12">
              <span className="text-text-faint">↘</span>
              <Badge tone="done">Cited results</Badge>
            </div>
          </div>
        </div>

        {/* Recent ingestion */}
        <div className="kp-panel p-5 lg:p-6">
          <div className="flex items-center justify-between mb-3">
            <p className="kp-label">Recent ingestion</p>
            <a href="/ingest" className="text-xs text-signal font-medium hover:underline">View all</a>
          </div>
          {recent.length === 0 ? (
            <EmptyState icon="⇪" title="No uploads yet" hint="Ingest a file to see its job state here." />
          ) : (
            <div className="space-y-2">
              {recent.map((j) => (
                <div key={j.jobId} className="flex items-center gap-2.5 text-sm">
                  <span>{iconForFilename(j.filename)}</span>
                  <span className="flex-1 truncate text-text">{j.filename}</span>
                  <Badge tone={j.state}>{j.state}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <p className="kp-label mb-3">Quick actions</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {ACTIONS.map((a) => (
            <button
              key={a.to}
              onClick={() => navigate(a.to)}
              className="kp-panel p-4 text-left hover:border-signal/50 hover:-translate-y-0.5 transition-all group"
            >
              <span className="text-xl">{a.icon}</span>
              <p className="font-display font-semibold text-sm mt-2 group-hover:text-signal transition-colors">{a.title}</p>
              <p className="text-xs text-text-faint mt-1 leading-snug">{a.desc}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
