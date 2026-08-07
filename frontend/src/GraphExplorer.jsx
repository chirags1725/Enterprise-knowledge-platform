import { useEffect, useRef, useState, useCallback } from "react";

// Color per node type — mirrors the 9-node schema from the graph fix.
const NODE_COLORS = {
  Document: "#5b8cff",
  Section: "#8b5cf6",
  Paragraph: "#a78bfa",
  Entity: "#34d399",
  Topic: "#f0b429",
  Citation: "#f472b6",
  Author: "#22d3ee",
  Team: "#fb923c",
  Project: "#f87171",
};

const NODE_RADIUS = 10;

/**
 * Normalize whatever the graph endpoints return into a { nodes, edges }
 * shape the canvas can draw. Handles both /graph/related/{doc_id} and
 * /graph/entity/{name} response variants defensively.
 */
function normalizeGraph(data) {

  console.log("RAW GRAPH RESPONSE:", data);


  // Backend returns:
  // {
  //   related:[
  //     {doc_id:"abc", distance:1}
  //   ]
  // }

  if (data.related) {

    const related = data.related;


    const nodes = [];


    // Add root document
    if(data.doc_id){

      nodes.push({
        id: String(data.doc_id),
        label: String(data.doc_id).slice(0,8),
        type:"Document",
        x:0.5,
        y:0.5,
        vx:0,
        vy:0
      });

    }

    related.forEach((item,index)=>{
          const angle =
  (2 * Math.PI * index) / related.length;

    const radius = 0.28;

      nodes.push({

        id:String(item.doc_id),

        label:
          String(item.doc_id)
          .slice(0,8),

        type:"Document",

        x: 0.5 + radius * Math.cos(angle),
        y: 0.5 + radius * Math.sin(angle),
        vx:0,
        vy:0
      });

    });



    const edges = [];


    if(data.doc_id){

      related.forEach(item=>{

        edges.push({

          source:String(data.doc_id),

          target:String(item.doc_id),

          type:
            `RELATED_${item.distance}`

        });

      });

    }


    console.log(
      "CONVERTED GRAPH",
      {
        nodes,
        edges
      }
    );


    return {
      nodes,
      edges
    };

  }



  // fallback for normal graph response

  const rawNodes =
    data.nodes ||
    data.vertices ||
    [];


  const rawEdges =
    data.edges ||
    data.relationships ||
    [];


  const nodes =
    rawNodes.map((n,i)=>({

      id:String(n.id ?? i),

      label:
        n.label ??
        n.name ??
        String(n.id),

      type:
        n.type ??
        "Entity",

      x:
        Math.random(),

      y:
        Math.random(),

      vx:0,
      vy:0

    }));



  const idSet =
    new Set(nodes.map(n=>n.id));


  const edges =
    rawEdges
    .map(e=>({

      source:String(
        e.source ??
        e.from
      ),

      target:String(
        e.target ??
        e.to
      ),

      type:
        e.type ??
        "RELATED"

    }))
    .filter(
      e =>
      idSet.has(e.source) &&
      idSet.has(e.target)
    );


  return {
    nodes,
    edges
  };

}
const EMPTY_GRAPH = { nodes: [], edges: [] };

/**
 * Force-directed graph simulation + canvas renderer.
 *
 * Physics per frame:
 *   - Node–node repulsion (inverse-square)
 *   - Edge spring attraction (Hooke)
 *   - Center gravity (weak pull toward canvas center)
 *   - Velocity damping
 *
 * Interaction:
 *   - Hover highlights a node and shows its label + type
 *   - Click selects a node and calls onSelect(node)
 *   - Drag moves a node; releasing resumes simulation
 */
function useForceGraph(canvasRef, graph, onSelect) {
  const stateRef = useRef({ nodes: [], edges: [], hover: null, drag: null, selected: null });
  const rafRef = useRef(null);

  // Sync graph data into stateRef whenever graph changes.
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

    // --- Resize observer: keep canvas pixels in sync with CSS size ---
    const ro = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth * devicePixelRatio;
      canvas.height = canvas.offsetHeight * devicePixelRatio;
      ctx.scale(devicePixelRatio, devicePixelRatio);
    });
    ro.observe(canvas);
    canvas.width = canvas.offsetWidth * devicePixelRatio;
    canvas.height = canvas.offsetHeight * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);

    // --- Pointer helpers (normalized to CSS pixels) ---
    function pointerPos(e) {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    // Find a node under a CSS-pixel position.
    function nodeAt(px, py) {
      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;
      for (const n of stateRef.current.nodes) {
        const nx = n.x * W;
        const ny = n.y * H;
        if (Math.hypot(px - nx, py - ny) < NODE_RADIUS + 4) return n;
      }
      return null;
    }

    // --- Pointer event handlers ---
    function onPointerMove(e) {
      const { x, y } = pointerPos(e);
      const { drag } = stateRef.current;
      if (drag) {
        const W = canvas.offsetWidth;
        const H = canvas.offsetHeight;
        drag.node.x = Math.max(0.02, Math.min(0.98, x / W));
        drag.node.y = Math.max(0.02, Math.min(0.98, y / H));
        drag.node.vx = 0;
        drag.node.vy = 0;
      }
      stateRef.current.hover = nodeAt(x, y);
      canvas.style.cursor = stateRef.current.hover || drag ? "pointer" : "default";
    }

    function onPointerDown(e) {
      const { x, y } = pointerPos(e);
      const hit = nodeAt(x, y);
      if (hit) {
        stateRef.current.drag = { node: hit };
        canvas.setPointerCapture(e.pointerId);
      }
    }

    function onPointerUp(e) {
      const { drag } = stateRef.current;
      if (drag) {
        // If the pointer barely moved, treat it as a click/select.
        const { x, y } = pointerPos(e);
        const W = canvas.offsetWidth;
        const H = canvas.offsetHeight;
        const nx = drag.node.x * W;
        const ny = drag.node.y * H;
        if (Math.hypot(x - nx, y - ny) < 6) {
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

    // --- Animation loop ---
    const DAMPING = 0.90;

    const GRAVITY = 0.002;

    const IDEAL_EDGE_LEN = 0.28;

    const SPRING_K = 0.015;

    const REPEL_K = 0.0008;

    function tick() {
      const { nodes, edges, drag } = stateRef.current;
      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;

      // Repulsion
      for (let a = 0; a < nodes.length; a++) {
        for (let b = a + 1; b < nodes.length; b++) {
          const na = nodes[a];
          const nb = nodes[b];
          let dx = na.x - nb.x;
          let dy = na.y - nb.y;
          let dist = Math.hypot(dx, dy) || 0.001;
          const f = REPEL_K / (dist * dist);
          dx /= dist;
          dy /= dist;
          if (na !== drag?.node) { na.vx += dx * f; na.vy += dy * f; }
          if (nb !== drag?.node) { nb.vx -= dx * f; nb.vy -= dy * f; }
        }
      }

      // Spring attraction along edges
      const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
      for (const e of edges) {
        const s = byId[e.source];
        const t = byId[e.target];
        if (!s || !t) continue;
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const dist = Math.hypot(dx, dy) || 0.001;
        const f = (dist - IDEAL_EDGE_LEN) * SPRING_K;
        const ux = dx / dist;
        const uy = dy / dist;
        if (s !== drag?.node) { s.vx += ux * f; s.vy += uy * f; }
        if (t !== drag?.node) { t.vx -= ux * f; t.vy -= uy * f; }
      }

      // Center gravity + integrate + clamp
      for (const n of nodes) {
        if (n === drag?.node) continue;
        n.vx += (0.5 - n.x) * GRAVITY;
        n.vy += (0.5 - n.y) * GRAVITY;
        n.vx *= DAMPING;
        n.vy *= DAMPING;
        n.x = Math.max(0.08, Math.min(0.98, n.x + n.vx));
        n.y = Math.max( 0.08, Math.min(0.98, n.y + n.vy));
      }

      // --- Draw ---
      ctx.clearRect(0, 0, W, H);

      // Edges
      for (const e of edges) {
        const s = byId[e.source];
        const t = byId[e.target];
        if (!s || !t) continue;
        ctx.beginPath();
        ctx.moveTo(s.x * W, s.y * H);
        ctx.lineTo(t.x * W, t.y * H);
        ctx.strokeStyle = "#243044";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Edge label at midpoint
        const mx = ((s.x + t.x) / 2) * W;
        const my = ((s.y + t.y) / 2) * H;
        ctx.font = "9px JetBrains Mono, monospace";
        ctx.fillStyle = "#5f6b80";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(e.type, mx, my);
      }

      // Nodes
      const { hover, selected } = stateRef.current;
      for (const n of nodes) {
        const cx = n.x * W;
        const cy = n.y * H;
        const color = NODE_COLORS[n.type] || "#9aa5b8";
        const isHover = n === hover;
        const isSelected = n === selected;
        const r = isHover || isSelected ? NODE_RADIUS + 3 : NODE_RADIUS;

        // Glow for selected
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
          ctx.fillStyle = color + "33";
          ctx.fill();
        }

        // Node circle
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = isHover || isSelected ? color : color + "cc";
        ctx.fill();
        ctx.strokeStyle = isSelected ? "#ffffff55" : "#0b0f17";
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.stroke();

        // Label
        ctx.font = `${isHover || isSelected ? "bold " : ""}11px Inter, system-ui, sans-serif`;
        ctx.fillStyle = isHover || isSelected ? "#e5e9f0" : "#9aa5b8";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const label = n.label.length > 18 ? n.label.slice(0, 16) + "…" : n.label;
        ctx.fillText(label, cx, cy + r + 3);

        // Type badge on hover
        if (isHover) {
          const badge = n.type;
          const bw = ctx.measureText(badge).width + 10;
          ctx.fillStyle = color + "dd";
          ctx.beginPath();
          ctx.roundRect(cx - bw / 2, cy - r - 22, bw, 16, 4);
          ctx.fill();
          ctx.font = "bold 9px Inter, system-ui, sans-serif";
          ctx.fillStyle = "#0b0f17";
          ctx.textBaseline = "middle";
          ctx.fillText(badge, cx, cy - r - 14);
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
  }, [canvasRef, onSelect]);
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function GraphExplorer({ api }) {
  const canvasRef = useRef(null);

  const [mode, setMode] = useState("doc");   // "doc" | "entity"
  const [seed, setSeed] = useState("");
  const [hops, setHops] = useState(2);

  const [graph, setGraph] = useState(EMPTY_GRAPH);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSelect = useCallback((node) => {
    setSelected(node);
  }, []);

  useForceGraph(canvasRef, graph, handleSelect);

  async function fetchGraph() {
    if (!seed.trim()) return;
    setLoading(true);
    setError(null);
    setSelected(null);
    try {
      const endpoint =
        mode === "doc"
          ? `${api}/graph/related/${encodeURIComponent(seed.trim())}?hops=${hops}`
          : `${api}/graph/entity/${encodeURIComponent(seed.trim())}?hops=${hops}`;
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      setGraph(normalizeGraph(data));
    } catch (err) {
      setError(err.message || "Failed to load graph.");
      setGraph(EMPTY_GRAPH);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    fetchGraph();
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="kp-panel p-4">
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
          {/* Mode toggle */}
          <div className="flex bg-bg-card rounded-xl p-1 border border-line shrink-0">
            <button
              type="button"
              className={`kp-tab ${mode === "doc" ? "kp-tab-active" : ""}`}
              onClick={() => { setMode("doc"); setSeed(""); setGraph(EMPTY_GRAPH); }}
            >
              Document
            </button>
            <button
              type="button"
              className={`kp-tab ${mode === "entity" ? "kp-tab-active" : ""}`}
              onClick={() => { setMode("entity"); setSeed(""); setGraph(EMPTY_GRAPH); }}
            >
              Entity
            </button>
          </div>

          <input
            className="kp-input flex-1"
            placeholder={mode === "doc" ? "doc_id or filename…" : "Entity name…"}
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
          />

          <div className="flex items-center gap-2 shrink-0">
            <label className="text-xs text-text-muted whitespace-nowrap">Hops</label>
            <select
              className="kp-input w-20"
              value={hops}
              onChange={(e) => setHops(Number(e.target.value))}
            >
              {[1, 2, 3].map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </div>

          <button type="submit" className="kp-btn-primary shrink-0" disabled={loading || !seed.trim()}>
            {loading ? "Loading…" : "Explore"}
          </button>
        </form>
      </div>

      {/* Canvas area */}
      <div className="kp-panel overflow-hidden" style={{ height: "520px" }}>
        {error && (
          <div className="h-full flex items-center justify-center text-sm text-state-failed p-8 text-center">
            {error}
          </div>
        )}
        {!error && graph.nodes.length === 0 && !loading && (
          <div className="h-full flex flex-col items-center justify-center text-text-faint text-sm gap-2">
            <span className="text-3xl">◎</span>
            <p>Enter a document ID or entity name above and click Explore.</p>
          </div>
        )}
        {loading && (
          <div className="h-full flex items-center justify-center text-text-muted text-sm">
            Traversing the graph…
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          style={{ display: graph.nodes.length > 0 && !loading && !error ? "block" : "none" }}
        />
      </div>

      {/* Legend + selected node info */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Legend */}
        <div className="kp-panel p-4 flex-1">
          <p className="text-xs font-medium text-text-muted mb-3">Node types</p>
          <div className="grid grid-cols-3 gap-x-4 gap-y-2">
            {Object.entries(NODE_COLORS).map(([type, color]) => (
              <div key={type} className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="text-xs text-text-muted">{type}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Selected node detail */}
        {selected && (
          <div className="kp-panel p-4 flex-1">
            <p className="text-xs font-medium text-text-muted mb-3">Selected node</p>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full shrink-0"
                  style={{ backgroundColor: NODE_COLORS[selected.type] || "#9aa5b8" }}
                />
                <span className="text-sm font-medium text-text truncate">
                  {selected.label}
                </span>
              </div>
              <div className="text-xs text-text-muted font-mono">
                <span className="text-text-faint">type </span>{selected.type}
              </div>
              <div className="text-xs text-text-faint font-mono truncate" title={selected.id}>
                <span>id </span>{selected.id}
              </div>
              {/* Quick drill-in: click to explore this node as a new seed */}
              <button
                className="kp-btn-ghost text-xs mt-1"
                onClick={() => {
                  setSeed(selected.id);
                  setMode(selected.type === "Document" ? "doc" : "entity");
                }}
              >
                Explore from here →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}