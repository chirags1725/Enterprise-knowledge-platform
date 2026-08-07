import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cx } from "../lib/utils";

const ROUTES = [
  { label: "Overview", hint: "Dashboard", to: "/", icon: "◈" },
  { label: "Search & Ask", hint: "Hybrid search + local Q&A", to: "/search", icon: "◎" },
  { label: "Graph Explorer", hint: "Multi-hop traversal", to: "/graph", icon: "⌬" },
  { label: "Ingestion", hint: "Upload & job tracking", to: "/ingest", icon: "⇪" },
  { label: "Clusters", hint: "Semantic document clusters", to: "/clusters", icon: "⬡" },
  { label: "Settings", hint: "API endpoint & preferences", to: "/settings", icon: "⚙" },
];

export default function CommandPalette({ open, onClose }) {
  const [q, setQ] = useState("");
  const inputRef = useRef(null);
  const [active, setActive] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const results = useMemo(() => {
    if (!q.trim()) return ROUTES;
    const term = q.toLowerCase();
    const matches = ROUTES.filter(
      (r) => r.label.toLowerCase().includes(term) || r.hint.toLowerCase().includes(term)
    );
    matches.push({
      label: `Search for "${q}"`,
      hint: "Run a hybrid search query",
      to: `/search?q=${encodeURIComponent(q)}`,
      icon: "→",
    });
    return matches;
  }, [q]);

  function go(to) {
    navigate(to);
    onClose();
  }

  function onKeyDown(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (results[active]) go(results[active].to); }
    else if (e.key === "Escape") onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center pt-[14vh] px-4 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="kp-panel w-full max-w-lg overflow-hidden shadow-pop animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 border-b border-line">
          <span className="text-text-faint">⌘</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setActive(0); }}
            onKeyDown={onKeyDown}
            placeholder="Go to a page, or search documents…"
            className="flex-1 bg-transparent py-3.5 text-sm outline-none placeholder:text-text-faint"
          />
          <kbd className="text-[10px] font-mono text-text-faint border border-line rounded px-1.5 py-0.5">esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto py-1.5">
          {results.map((r, i) => (
            <button
              key={r.to + r.label}
              onClick={() => go(r.to)}
              onMouseEnter={() => setActive(i)}
              className={cx(
                "w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors",
                i === active ? "bg-elevated2 text-text" : "text-text-muted"
              )}
            >
              <span className="w-5 text-center text-text-faint">{r.icon}</span>
              <span className="flex-1 truncate">{r.label}</span>
              <span className="text-xs text-text-faint truncate">{r.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
