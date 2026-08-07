import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { EmptyState, ErrorState, Badge } from "../components/ui";
import { FusionSpinner } from "../components/FusionMark";
import { iconForFilename, cx } from "../lib/utils";

const PALETTE = ["#5B8CFF", "#34D399", "#C084FC", "#F0B429", "#F472B6", "#22D3EE", "#FB923C", "#F87171"];

// The /clusters response shape isn't documented, so normalize a handful of
// plausible shapes into a consistent { id, size, keywords, documents } list.
function normalizeClusters(data) {
  const raw = data?.clusters || data?.groups || (Array.isArray(data) ? data : []);
  return raw.map((c, i) => {
    const documents = c.documents || c.docs || c.items || [];
    return {
      id: c.cluster_id ?? c.id ?? i,
      size: c.size ?? documents.length ?? 0,
      keywords: c.keywords || c.top_terms || c.terms || [],
      documents: documents.map((d, j) =>
        typeof d === "string" ? { filename: d, doc_id: d } : { filename: d.filename || d.name || d.doc_id || `document ${j + 1}`, doc_id: d.doc_id || d.id }
      ),
    };
  });
}

function ClusterCard({ cluster, color }) {
  const [open, setOpen] = useState(false);
  const shown = open ? cluster.documents : cluster.documents.slice(0, 5);
  return (
    <div className="kp-panel p-4 animate-slide-up">
      <div className="flex items-center gap-2.5 mb-2">
        <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <p className="font-display font-semibold text-sm">Cluster {cluster.id}</p>
        <Badge className="ml-auto">{cluster.size} doc{cluster.size !== 1 ? "s" : ""}</Badge>
      </div>
      {cluster.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {cluster.keywords.slice(0, 8).map((k, i) => (
            <span key={i} className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-elevated2 text-text-muted">{k}</span>
          ))}
        </div>
      )}
      {cluster.documents.length === 0 ? (
        <p className="text-xs text-text-faint">No document list returned for this cluster.</p>
      ) : (
        <div className="space-y-1.5">
          {shown.map((d, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-text-muted">
              <span>{iconForFilename(d.filename)}</span>
              <span className="truncate">{d.filename}</span>
            </div>
          ))}
          {cluster.documents.length > 5 && (
            <button onClick={() => setOpen((o) => !o)} className="text-xs text-signal font-medium hover:underline">
              {open ? "Show fewer" : `Show ${cluster.documents.length - 5} more`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function ClustersPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [clusters, setClusters] = useState([]);

  async function load() {
    setLoading(true); setError(null);
    try {
      const data = await api.clusters();
      setClusters(normalizeClusters(data));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load clusters.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-muted">KMeans clustering over corpus embeddings in Qdrant.</p>
        <button className="kp-btn-secondary" onClick={load} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
      </div>

      {loading && <FusionSpinner label="Computing clusters" />}
      {!loading && error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && clusters.length === 0 && (
        <EmptyState icon="⬡" title="No clusters yet" hint="Ingest more documents, then refresh — clustering needs enough embeddings to form meaningful groups." />
      )}
      {!loading && !error && clusters.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {clusters.map((c, i) => <ClusterCard key={c.id} cluster={c} color={PALETTE[i % PALETTE.length]} />)}
        </div>
      )}
    </div>
  );
}
