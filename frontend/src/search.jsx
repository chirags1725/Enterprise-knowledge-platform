import { useState } from "react";

const LANGUAGES = [
  { code: "", label: "Any language" },
  { code: "en", label: "English" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "es", label: "Spanish" },
];

const FILE_TYPES = ["", "pdf", "code", "image", "audio", "video", "text"];
const ACCESS_LEVELS = ["", "public", "internal", "restricted"];

const EMPTY_FILTERS = {
  department: "",
  year: "",
  author: "",
  language: "",
  tags: "",
  access_level: "",
  file_type: "",
};

/**
 * Build a query string from the search term and any set filters.
 * Empty filters are dropped so an unset field stays unrestricted.
 */
function buildQuery(q, filters, topK) {
  const params = new URLSearchParams({ q, top_k: String(topK) });
  Object.entries(filters).forEach(([key, value]) => {
    if (value === "" || value == null) return;
    if (key === "tags") {
      value
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .forEach((tag) => params.append("tags", tag));
    } else {
      params.append(key, value);
    }
  });
  return params.toString();
}

/**
 * A single result card. Renders the full citation object returned by the
 * backend: filename, page, paragraph, line, chunk, score, and snippet.
 */
function ResultCard({ result, index }) {
  const c = result.citation || {};
  const score = typeof c.score === "number" ? c.score : null;

  return (
    <article className="kp-card p-4">
      <header className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="kp-chip">{index + 1}</span>
          <span
            className="text-sm font-medium text-text truncate"
            title={c.filename}
          >
            {c.filename || c.doc_id || "Untitled"}
          </span>
        </div>
        {score !== null && (
          <span
            className="shrink-0 text-xs font-mono px-2 py-0.5 rounded-lg bg-brand-soft text-brand"
            title="Relevance score"
          >
            {score.toFixed(2)}
          </span>
        )}
      </header>

      <p className="text-sm text-text-muted leading-relaxed">
        {c.snippet || result.text}
      </p>

      {/* Citation location line: filename · p.X · ¶Y · L.Z · #chunk */}
      <footer className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-faint font-mono">
        {c.page != null && <span>p.{c.page}</span>}
        {c.paragraph_index != null && <span>¶{c.paragraph_index}</span>}
        {c.line_start != null && <span>L.{c.line_start}</span>}
        {c.chunk_index != null && <span>#{c.chunk_index}</span>}
        {c.doc_id && (
          <span className="truncate" title={c.doc_id}>
            {c.doc_id.slice(0, 8)}…
          </span>
        )}
      </footer>
    </article>
  );
}

/**
 * Q&A answer with numbered inline citations, ChatGPT-style. The [n] markers
 * in the answer text map to the sources listed below it.
 */
function AnswerPanel({ answer, sources }) {
  if (!answer) return null;

  // Split the answer on [n] markers so each citation renders as a pill.
  const parts = answer.split(/(\[\d+\])/g);

  return (
    <div className="kp-panel p-5 mb-6">
      <h3 className="text-sm font-semibold text-text mb-3">Answer</h3>
      <p className="text-sm text-text leading-relaxed whitespace-pre-wrap">
        {parts.map((part, i) => {
          const match = part.match(/^\[(\d+)\]$/);
          if (match) {
            return (
              <sup
                key={i}
                className="mx-0.5 text-brand font-semibold cursor-help"
                title={sources?.[Number(match[1]) - 1]?.filename || ""}
              >
                {part}
              </sup>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </p>

      {sources?.length > 0 && (
        <div className="mt-4 border-t border-line pt-3 space-y-2">
          <p className="text-xs font-medium text-text-muted">Sources</p>
          {sources.map((s, i) => (
            <div key={i} className="flex items-baseline gap-2 text-xs">
              <span className="text-brand font-semibold">[{i + 1}]</span>
              <span className="text-text truncate">
                {s.filename || s.doc_id}
              </span>
              <span className="text-text-faint font-mono">
                {s.page != null && `p.${s.page} `}
                {s.line_start != null && `L.${s.line_start}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Search({ api }) {
  const [q, setQ] = useState("");
  const [topK, setTopK] = useState(5);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(true);

  const [results, setResults] = useState([]);
  const [answer, setAnswer] = useState(null);
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("search"); // "search" | "ask"

  function update(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function reset() {
    setFilters(EMPTY_FILTERS);
  }

  async function runSearch() {
    if (!q.trim()) return;
    setLoading(true);
    setAnswer(null);
    try {
      const qs = buildQuery(q, filters, topK);
      const res = await fetch(`${api}/search?${qs}`);
      const data = await res.json();
      setResults(data.results || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  async function runAsk() {
    if (!q.trim()) return;
    setLoading(true);
    setResults([]);
    try {
      const res = await fetch(`${api}/ask?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setAnswer(data.answer || "");
      setSources(data.sources || data.citations || []);
    } catch {
      setAnswer("Something went wrong fetching the answer.");
      setSources([]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (mode === "ask") runAsk();
    else runSearch();
  }

  const activeFilters = Object.values(filters).filter((v) => v !== "").length;

  return (
    <div>
      {/* Search bar */}
      <form onSubmit={handleSubmit} className="kp-panel p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            className="kp-input flex-1"
            placeholder="Search your knowledge base…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="flex gap-2">
            <div className="flex bg-bg-card rounded-xl p-1 border border-line">
              <button
                type="button"
                className={`kp-tab ${mode === "search" ? "kp-tab-active" : ""}`}
                onClick={() => setMode("search")}
              >
                Search
              </button>
              <button
                type="button"
                className={`kp-tab ${mode === "ask" ? "kp-tab-active" : ""}`}
                onClick={() => setMode("ask")}
              >
                Ask
              </button>
            </div>
            <button type="submit" className="kp-btn-primary" disabled={loading}>
              {loading ? "…" : mode === "ask" ? "Ask" : "Search"}
            </button>
          </div>
        </div>

        {/* Filter toggle */}
        <div className="flex items-center justify-between mt-3">
          <button
            type="button"
            className="text-xs text-text-muted hover:text-text"
            onClick={() => setShowFilters((s) => !s)}
          >
            {showFilters ? "Hide filters" : "Show filters"}
            {activeFilters > 0 && (
              <span className="kp-chip ml-2">{activeFilters} active</span>
            )}
          </button>
          {activeFilters > 0 && (
            <button
              type="button"
              className="text-xs text-text-faint hover:text-state-failed"
              onClick={reset}
            >
              Clear all
            </button>
          )}
        </div>

        {/* Filter grid — the seven metadata fields */}
        {showFilters && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <div>
              <label className="kp-label">Department</label>
              <input
                className="kp-input"
                placeholder="e.g. Finance"
                value={filters.department}
                onChange={(e) => update("department", e.target.value)}
              />
            </div>
            <div>
              <label className="kp-label">Year</label>
              <input
                className="kp-input"
                type="number"
                placeholder="e.g. 2025"
                value={filters.year}
                onChange={(e) => update("year", e.target.value)}
              />
            </div>
            <div>
              <label className="kp-label">Author</label>
              <input
                className="kp-input"
                placeholder="e.g. J. Doe"
                value={filters.author}
                onChange={(e) => update("author", e.target.value)}
              />
            </div>
            <div>
              <label className="kp-label">Language</label>
              <select
                className="kp-input"
                value={filters.language}
                onChange={(e) => update("language", e.target.value)}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="kp-label">Tags</label>
              <input
                className="kp-input"
                placeholder="comma,separated"
                value={filters.tags}
                onChange={(e) => update("tags", e.target.value)}
              />
            </div>
            <div>
              <label className="kp-label">Access level</label>
              <select
                className="kp-input"
                value={filters.access_level}
                onChange={(e) => update("access_level", e.target.value)}
              >
                {ACCESS_LEVELS.map((a) => (
                  <option key={a} value={a}>
                    {a || "Any"}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="kp-label">File type</label>
              <select
                className="kp-input"
                value={filters.file_type}
                onChange={(e) => update("file_type", e.target.value)}
              >
                {FILE_TYPES.map((f) => (
                  <option key={f} value={f}>
                    {f || "Any"}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="kp-label">Results (top_k)</label>
              <input
                className="kp-input"
                type="number"
                min="1"
                max="50"
                value={topK}
                onChange={(e) => setTopK(Number(e.target.value))}
              />
            </div>
          </div>
        )}
      </form>

      {/* Q&A answer */}
      <AnswerPanel answer={answer} sources={sources} />

      {/* Results */}
      {loading && (
        <div className="text-sm text-text-muted">Working on it…</div>
      )}

      {!loading && mode === "search" && results.length === 0 && q && (
        <div className="kp-panel p-8 text-center text-text-faint text-sm">
          No results. Try loosening a filter.
        </div>
      )}

      <div className="space-y-3">
        {results.map((r, i) => (
          <ResultCard key={i} result={r} index={i} />
        ))}
      </div>
    </div>
  );
}