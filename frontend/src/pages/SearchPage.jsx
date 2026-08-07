import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useToast } from "../lib/toast";
import { Badge, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { FusionSpinner } from "../components/FusionMark";
import { cx, truncate } from "../lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

const FILTER_FIELDS = [
  { key: "department", label: "Department", placeholder: "e.g. Finance" },
  { key: "year", label: "Year", placeholder: "e.g. 2025" },
  { key: "author", label: "Author", placeholder: "e.g. J. Ortiz" },
  { key: "language", label: "Language", placeholder: "e.g. en" },
  { key: "tags", label: "Tags", placeholder: "e.g. roadmap" },
  { key: "access_level", label: "Access level", placeholder: "e.g. internal" },
  { key: "file_type", label: "File type", placeholder: "e.g. pdf" },
];

function FilterBar({ filters, setFilters, open, setOpen }) {
  const activeCount = Object.values(filters).filter(Boolean).length;
  return (
    <div className="kp-panel">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-text-muted hover:text-text"
      >
        <span>Filters</span>
        {activeCount > 0 && <Badge tone="signal">{activeCount} active</Badge>}
        <div className="flex-1" />
        <span className="text-text-faint">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="border-t border-line p-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3 animate-fade-in">
          {FILTER_FIELDS.map((f) => (
            <div key={f.key}>
              <label className="kp-label block mb-1">{f.label}</label>
              <input
                className="kp-input w-full"
                placeholder={f.placeholder}
                value={filters[f.key] || ""}
                onChange={(e) => setFilters((prev) => ({ ...prev, [f.key]: e.target.value }))}
              />
            </div>
          ))}
          <div className="lg:col-span-4 flex justify-end">
            <button className="kp-btn-ghost" onClick={() => setFilters({})}>Clear all filters</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultCard({ result, index }) {
  const c = result.citation || {};
  const [expanded, setExpanded] = useState(false);
  const snippet = c.snippet || result.text || "";
  const isLong = snippet.length > 260;
  return (
    <div className="kp-panel p-4 animate-slide-up">
      <div className="flex items-start gap-3">
        <span className="kp-card w-7 h-7 flex items-center justify-center text-xs font-mono text-text-faint shrink-0">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1.5">
            <span className="font-medium text-sm text-text truncate max-w-[280px]" title={c.filename}>
              {c.filename || "Untitled source"}
            </span>
            {c.page != null && <Badge>p.{c.page}</Badge>}
            {c.paragraph_index != null && <Badge>¶{c.paragraph_index}</Badge>}
            {c.line_start != null && <Badge>L{c.line_start}</Badge>}
            {typeof c.score === "number" && <Badge tone="signal">{c.score.toFixed(3)}</Badge>}
          </div>
          <p className="text-sm text-text-muted leading-relaxed">
            {expanded || !isLong ? snippet : truncate(snippet, 260)}
          </p>
          {isLong && (
            <button onClick={() => setExpanded((e) => !e)} className="text-xs text-signal font-medium mt-1.5 hover:underline">
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
          {c.doc_id && (
            <p className="text-[11px] font-mono text-text-faint mt-2 truncate" title={c.doc_id}>
              {c.doc_id}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}



function AskAnswer({ data }) {
  const answer = data?.answer || data?.response || data?.text || "";
  const citations = data?.citations || data?.sources || data?.results || [];

  return (
    <div className="space-y-6">
      <div className="kp-card">
        <h2 className="font-semibold text-lg mb-4">Answer</h2>

        <div
  className="
    prose
    prose-slate
    dark:prose-invert
    max-w-none
    prose-headings:text-white
    prose-p:text-gray-300
    prose-strong:text-white
    prose-code:text-cyan-300
    prose-pre:bg-zinc-900
    prose-blockquote:border-cyan-500
  "
>
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    rehypePlugins={[rehypeHighlight]}
  >
    {answer}
  </ReactMarkdown>
  {answer}
</div>
</div>

      {citations.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-text-muted">
            Cited sources
          </h3>

          {citations.map((r, i) => (
            <ResultCard
              key={i}
              result={r.citation ? r : { citation: r }}
              index={i}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { push } = useToast();

  const [mode, setMode] = useState("search"); // "search" | "ask"
  const [q, setQ] = useState(params.get("q") || "");
  const [filters, setFilters] = useState({});
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null); // {query, filters, results:[]}
  const [answer, setAnswer] = useState(null);
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem("kp-search-history")) || []; } catch { return []; }
  });

  const controllerRef = useRef(null);

  const runQuery = useCallback(async (query, activeMode) => {
    if (!query.trim()) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      if (activeMode === "ask") {
        const data = await api.ask(query, filters, controller.signal);
        setAnswer(data);
        setResults(null);
      } else {
        const data = await api.search(query, filters, controller.signal);
        setResults(data);
        setAnswer(null);
      }
      setHistory((h) => {
        const next = [query, ...h.filter((x) => x !== query)].slice(0, 8);
        localStorage.setItem("kp-search-history", JSON.stringify(next));
        return next;
      });
    } catch (err) {
      if (err.name !== "AbortError") {
        setError(err instanceof ApiError ? err.message : "Unexpected error running the query.");
      }
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const initial = params.get("q");
    if (initial) runQuery(initial, mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit(e) {
    e.preventDefault();
    if (!q.trim()) return;
    setParams({ q });
    runQuery(q, mode);
  }

  function switchMode(next) {
    setMode(next);
    if (q.trim() && (results || answer)) runQuery(q, next);
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5 animate-fade-in">
      <div className="flex items-center gap-1 bg-elevated rounded-xl p-1 border border-line w-fit">
        <button className={cx("kp-tab", mode === "search" && "kp-tab-active")} onClick={() => switchMode("search")}>
          Search
        </button>
        <button className={cx("kp-tab", mode === "ask" && "kp-tab-active")} onClick={() => switchMode("ask")}>
          Ask AI
        </button>
      </div>

      <form onSubmit={submit} className="flex gap-2">
        <input
          className="kp-input flex-1 !text-[15px] !py-3"
          placeholder={mode === "ask" ? "Ask a question about your documents…" : "Search by keyword, phrase, or meaning…"}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        <button className="kp-btn-primary !px-5" type="submit" disabled={loading || !q.trim()}>
          {loading ? "Working…" : mode === "ask" ? "Ask" : "Search"}
        </button>
      </form>

      {history.length > 0 && !results && !answer && !loading && (
        <div className="flex flex-wrap gap-1.5">
          {history.map((h) => (
            <button
              key={h}
              onClick={() => { setQ(h); setParams({ q: h }); runQuery(h, mode); }}
              className="text-xs px-2.5 py-1 rounded-full border border-line text-text-muted hover:text-text hover:border-text-faint/50 transition-colors"
            >
              {h}
            </button>
          ))}
        </div>
      )}

      <FilterBar filters={filters} setFilters={setFilters} open={filtersOpen} setOpen={setFiltersOpen} />

      <div>
        {loading && <FusionSpinner label={mode === "ask" ? "Retrieving and generating" : "Fusing vector, keyword, and graph recall"} />}

        {!loading && error && <ErrorState message={error} onRetry={() => runQuery(q, mode)} />}

        {!loading && !error && mode === "search" && results && (
          results.results?.length > 0 ? (
            <div className="space-y-2.5">
              <p className="text-xs text-text-faint">
                {results.results.length} result{results.results.length !== 1 ? "s" : ""} for <span className="font-mono text-text-muted">"{results.query || q}"</span>
              </p>
              {results.results.map((r, i) => <ResultCard key={i} result={r} index={i} />)}
            </div>
          ) : (
            <EmptyState icon="◎" title="No matches" hint="Try loosening filters or rephrasing the query." />
          )
        )}

        {!loading && !error && mode === "ask" && answer && <AskAnswer data={answer} />}

        {!loading && !error && !results && !answer && (
          <EmptyState
            icon={mode === "ask" ? "✦" : "◎"}
            title={mode === "ask" ? "Ask anything about your corpus" : "Search across every ingested document"}
            hint={mode === "ask" ? "Mistral answers locally, with numbered citations back to source paragraphs." : "Hybrid retrieval combines meaning, exact terms, and graph relationships."}
          />
        )}
      </div>
    </div>
  );
}
