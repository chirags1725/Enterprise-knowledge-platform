import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../lib/api";
import { Badge, EmptyState, ErrorState } from "../components/ui";
import { FusionSpinner } from "../components/FusionMark";
import { cx } from "../lib/utils";

const NODE_COLORS = {
  Document: "#5B8CFF", Section: "#8B5CF6", Paragraph: "#A78BFA", Entity: "#34D399",
  Topic: "#F0B429", Citation: "#F472B6", Author: "#22D3EE", Team: "#FB923C", Project: "#F87171",
};
const NODE_RADIUS = 9;
const EMPTY_GRAPH = { nodes: [], edges: [] };

// Normalizes whatever the graph endpoints return into a {nodes, edges} shape.
// Handles both the {related:[{doc_id,distance}]} shape and a generic
// {nodes|vertices, edges|relationships} shape defensively.
function normalizeGraph(data, seedId) {
  if (data.related) {
    const related = data.related;
    const nodes = [];
    const rootId = data.doc_id || seedId;
    if (rootId) {
      nodes.push({ id: String(rootId), label: String(rootId).slice(0, 10), type: "Document", x: 0.5, y: 0.5, vx: 0, vy: 0 });
    }
    related.forEach((item, index) => {
      const angle = (2 * Math.PI * index) / Math.max(related.length, 1);
      const radius = 0.3;
      nodes.push({
        id: String(item.doc_id),
        label: String(item.doc_id).slice(0, 10),
        type: "Document",
        x: 0.5 + radius * Math.cos(angle),
        y: 0.5 + radius * Math.sin(angle),
        vx: 0, vy: 0,
      });
    });
    const edges = rootId
      ? related.map((item) => ({ source: String(rootId), target: String(item.doc_id), type: `related_${item.distance ?? ""}`.replace(/_$/, "") }))
      : [];
    return { nodes, edges };
  }

  const rawNodes = data.nodes || data.vertices || [];
  const rawEdges = data.edges || data.relationships || [];
  const nodes = rawNodes.map((n, i) => ({
    id: String(n.id ?? i),
    label: n.label ?? n.name ?? String(n.id ?? i),
    type: n.type ?? "Entity",
    x: Math.random(), y: Math.random(), vx: 0, vy: 0,
  }));
  const idSet = new Set(nodes.map((n) => n.id));
  const edges = rawEdges
    .map((e) => ({ source: String(e.source ?? e.from), target: String(e.target ?? e.to), type: e.type ?? "RELATED" }))
    .filter((e) => idSet.has(e.source) && idSet.has(e.target));
  return { nodes, edges };
}

function useForceGraph(canvasRef, graph, onSelect, isDark) {
  const stateRef = useRef({ nodes: [], edges: [], hover: null, drag: null, selected: null });
  const rafRef = useRef(null);

  useEffect(() => {
    stateRef.current.nodes = graph.nodes.map((n) => ({ ...n }));
    stateRef.current.edges = graph.edges;
    stateRef.current.hover = null;
    stateRef.current.selected = null;
    stateRef.current.drag = null;
  }, [graph]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    const ro = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    });
    ro.observe(canvas);
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = canvas.offsetHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    function pointerPos(e) {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function nodeAt(px, py) {
      const W = canvas.offsetWidth, H = canvas.offsetHeight;
      for (const n of stateRef.current.nodes) {
        if (Math.hypot(px - n.x * W, py - n.y * H) < NODE_RADIUS + 4) return n;
      }
      return null;
    }
    function onPointerMove(e) {
      const { x, y } = pointerPos(e);
      const { drag } = stateRef.current;
      if (drag) {
        const W = canvas.offsetWidth, H = canvas.offsetHeight;
        drag.node.x = Math.max(0.03, Math.min(0.97, x / W));
        drag.node.y = Math.max(0.03, Math.min(0.97, y / H));
        drag.node.vx = 0; drag.node.vy = 0;
      }
      stateRef.current.hover = nodeAt(x, y);
      canvas.style.cursor = stateRef.current.hover || drag ? "pointer" : "default";
    }
    function onPointerDown(e) {
      const { x, y } = pointerPos(e);
      const hit = nodeAt(x, y);
      if (hit) { stateRef.current.drag = { node: hit }; canvas.setPointerCapture(e.pointerId); }
    }
    function onPointerUp(e) {
      const { drag } = stateRef.current;
      if (drag) {
        const { x, y } = pointerPos(e);
        const W = canvas.offsetWidth, H = canvas.offsetHeight;
        if (Math.hypot(x - drag.node.x * W, y - drag.node.y * H) < 6) {
          stateRef.current.selected = drag.node;
          onSelect?.(drag.node);
        }
        stateRef.current.drag = null;
        canvas.releasePointerCapture(e.pointerId);
      }
    }
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);

    const DAMPING = 0.9, GRAVITY = 0.002, IDEAL_EDGE_LEN = 0.28, SPRING_K = 0.015, REPEL_K = 0.0008;
    const edgeColor = isDark ? "#243044" : "#dbe0ea";
    const edgeLabelColor = isDark ? "#5f6b80" : "#8d96ab";
    const labelColor = isDark ? "#9aa5b8" : "#5b6478";
    const labelColorActive = isDark ? "#e5e9f0" : "#12161f";
    const strokeIdle = isDark ? "#0b0f17" : "#ffffff";

    function tick() {
      const { nodes, edges, drag } = stateRef.current;
      const W = canvas.offsetWidth, H = canvas.offsetHeight;

      for (let a = 0; a < nodes.length; a++) {
        for (let b = a + 1; b < nodes.length; b++) {
          const na = nodes[a], nb = nodes[b];
          let dx = na.x - nb.x, dy = na.y - nb.y;
          let dist = Math.hypot(dx, dy) || 0.001;
          const f = REPEL_K / (dist * dist);
          dx /= dist; dy /= dist;
          if (na !== drag?.node) { na.vx += dx * f; na.vy += dy * f; }
          if (nb !== drag?.node) { nb.vx -= dx * f; nb.vy -= dy * f; }
        }
      }

      const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
      for (const e of edges) {
        const s = byId[e.source], t = byId[e.target];
        if (!s || !t) continue;
        const dx = t.x - s.x, dy = t.y - s.y;
        const dist = Math.hypot(dx, dy) || 0.001;
        const f = (dist - IDEAL_EDGE_LEN) * SPRING_K;
        const ux = dx / dist, uy = dy / dist;
        if (s !== drag?.node) { s.vx += ux * f; s.vy += uy * f; }
        if (t !== drag?.node) { t.vx -= ux * f; t.vy -= uy * f; }
      }

      for (const n of nodes) {
        if (n === drag?.node) continue;
        n.vx += (0.5 - n.x) * GRAVITY;
        n.vy += (0.5 - n.y) * GRAVITY;
        n.vx *= DAMPING; n.vy *= DAMPING;
        n.x = Math.max(0.06, Math.min(0.97, n.x + n.vx));
        n.y = Math.max(0.06, Math.min(0.97, n.y + n.vy));
      }

      ctx.clearRect(0, 0, W, H);

      for (const e of edges) {
        const s = byId[e.source], t = byId[e.target];
        if (!s || !t) continue;
        ctx.beginPath();
        ctx.moveTo(s.x * W, s.y * H);
        ctx.lineTo(t.x * W, t.y * H);
        ctx.strokeStyle = edgeColor;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        const mx = ((s.x + t.x) / 2) * W, my = ((s.y + t.y) / 2) * H;
        ctx.font = "9px 'JetBrains Mono', monospace";
        ctx.fillStyle = edgeLabelColor;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(e.type, mx, my);
      }

      const { hover, selected } = stateRef.current;
      for (const n of nodes) {
        const cx_ = n.x * W, cy_ = n.y * H;
        const color = NODE_COLORS[n.type] || "#9aa5b8";
        const isHover = n === hover, isSelected = n === selected;
        const r = isHover || isSelected ? NODE_RADIUS + 3 : NODE_RADIUS;
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(cx_, cy_, r + 5, 0, Math.PI * 2);
          ctx.fillStyle = color + "33";
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(cx_, cy_, r, 0, Math.PI * 2);
        ctx.fillStyle = isHover || isSelected ? color : color + "cc";
        ctx.fill();
        ctx.strokeStyle = isSelected ? "#ffffff88" : strokeIdle;
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.stroke();

        ctx.font = `${isHover || isSelected ? "bold " : ""}11px Inter, system-ui, sans-serif`;
        ctx.fillStyle = isHover || isSelected ? labelColorActive : labelColor;
        ctx.textAlign = "center"; ctx.textBaseline = "top";
        const label = n.label.length > 18 ? n.label.slice(0, 16) + "…" : n.label;
        ctx.fillText(label, cx_, cy_ + r + 3);

        if (isHover) {
          const badge = n.type;
          const bw = ctx.measureText(badge).width + 10;
          ctx.fillStyle = color + "dd";
          ctx.beginPath();
          ctx.roundRect(cx_ - bw / 2, cy_ - r - 22, bw, 16, 4);
          ctx.fill();
          ctx.font = "bold 9px Inter, system-ui, sans-serif";
          ctx.fillStyle = "#0b0f17";
          ctx.textBaseline = "middle";
          ctx.fillText(badge, cx_, cy_ - r - 14);
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      ro.disconnect();
    };
  }, [canvasRef, onSelect, isDark]);
}

export default function GraphPage() {
  const canvasRef = useRef(null);
  const [mode, setMode] = useState("doc");
  const [seed, setSeed] = useState("");
  const [hops, setHops] = useState(2);
  const [graph, setGraph] = useState(EMPTY_GRAPH);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [trail, setTrail] = useState([]); // breadcrumb of explored seeds
  const isDark = document.documentElement.classList.contains("dark");

  const handleSelect = useCallback((node) => setSelected(node), []);
  useForceGraph(canvasRef, graph, handleSelect, isDark);

  async function fetchGraph(seedValue, seedMode, pushTrail = true) {
    if (!seedValue.trim()) return;
    setLoading(true); setError(null); setSelected(null);
    try {
      const data = seedMode === "doc"
        ? await api.graphRelated(seedValue.trim(), hops)
        : await api.graphEntity(seedValue.trim(), hops);
      setGraph(normalizeGraph(data, seedValue.trim()));
      if (pushTrail) setTrail((t) => [...t, { seed: seedValue.trim(), mode: seedMode }]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load the graph.");
      setGraph(EMPTY_GRAPH);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    fetchGraph(seed, mode);
  }

  function exploreFrom(node) {
    const nextMode = node.type === "Document" ? "doc" : "entity";
    setSeed(node.id);
    setMode(nextMode);
    fetchGraph(node.id, nextMode);
  }

  function exportPng() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `graph-${seed || "export"}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4 animate-fade-in">
      <div className="kp-panel p-4">
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="flex bg-elevated2 rounded-xl p-1 border border-line shrink-0">
            <button type="button" className={cx("kp-tab", mode === "doc" && "kp-tab-active")}
              onClick={() => { setMode("doc"); setSeed(""); }}>Document</button>
            <button type="button" className={cx("kp-tab", mode === "entity" && "kp-tab-active")}
              onClick={() => { setMode("entity"); setSeed(""); }}>Entity</button>
          </div>
          <input
            className="kp-input flex-1"
            placeholder={mode === "doc" ? "doc_id or filename…" : "Entity name…"}
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
          />
          <div className="flex items-center gap-2 shrink-0">
            <label className="text-xs text-text-muted whitespace-nowrap">Hops</label>
            <select className="kp-input w-20" value={hops} onChange={(e) => setHops(Number(e.target.value))}>
              {[1, 2, 3].map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          <button type="submit" className="kp-btn-primary shrink-0" disabled={loading || !seed.trim()}>
            {loading ? "Loading…" : "Explore"}
          </button>
        </form>

        {trail.length > 0 && (
          <div className="flex items-center flex-wrap gap-1.5 mt-3 pt-3 border-t border-line">
            <span className="text-xs text-text-faint mr-1">Trail:</span>
            {trail.map((t, i) => (
              <button
                key={i}
                onClick={() => { setSeed(t.seed); setMode(t.mode); fetchGraph(t.seed, t.mode, false); setTrail((cur) => cur.slice(0, i + 1)); }}
                className="text-xs font-mono px-2 py-0.5 rounded-full border border-line text-text-muted hover:text-text hover:border-signal/50"
              >
                {t.seed}
              </button>
            ))}
            <button onClick={() => setTrail([])} className="text-xs text-text-faint hover:text-text ml-1">clear</button>
          </div>
        )}
      </div>

      <div className="kp-panel overflow-hidden relative" style={{ height: "540px" }}>
        {graph.nodes.length > 0 && !loading && !error && (
          <button onClick={exportPng} className="kp-btn-secondary !py-1.5 !px-2.5 !text-xs absolute top-3 right-3 z-10">
            ⭳ Export PNG
          </button>
        )}
        {error && <ErrorState message={error} onRetry={() => fetchGraph(seed, mode, false)} />}
        {!error && loading && <FusionSpinner label="Traversing the graph" />}
        {!error && !loading && graph.nodes.length === 0 && (
          <EmptyState icon="⌬" title="No graph loaded" hint="Enter a document ID or entity name above and click Explore." />
        )}
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          style={{ display: graph.nodes.length > 0 && !loading && !error ? "block" : "none" }}
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="kp-panel p-4 flex-1">
          <p className="kp-label mb-3">Node types</p>
          <div className="grid grid-cols-3 gap-x-4 gap-y-2">
            {Object.entries(NODE_COLORS).map(([type, color]) => (
              <div key={type} className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className="text-xs text-text-muted">{type}</span>
              </div>
            ))}
          </div>
        </div>

        {selected && (
          <div className="kp-panel p-4 flex-1 animate-slide-up">
            <p className="kp-label mb-3">Selected node</p>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: NODE_COLORS[selected.type] || "#9aa5b8" }} />
                <span className="text-sm font-medium text-text truncate">{selected.label}</span>
              </div>
              <div className="text-xs text-text-muted font-mono"><span className="text-text-faint">type </span>{selected.type}</div>
              <div className="text-xs text-text-faint font-mono truncate" title={selected.id}><span>id </span>{selected.id}</div>
              <button className="kp-btn-ghost text-xs mt-1 !px-0" onClick={() => exploreFrom(selected)}>
                Explore from here →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
