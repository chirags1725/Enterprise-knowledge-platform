import { cx } from "../lib/utils";

export function Badge({ children, tone = "default", className }) {
  const tones = {
    default: "bg-elevated2 text-text-muted border-line",
    queued: "bg-state-queued/10 text-state-queued border-state-queued/30",
    processing: "bg-state-processing/10 text-state-processing border-state-processing/30",
    done: "bg-state-done/10 text-state-done border-state-done/30",
    failed: "bg-state-failed/10 text-state-failed border-state-failed/30",
    vector: "bg-vector/10 text-vector border-vector/30",
    keyword: "bg-keyword/10 text-keyword border-keyword/30",
    graph: "bg-graph/10 text-graph border-graph/30",
    signal: "bg-signal/10 text-signal border-signal/30",
  };
  return <span className={cx("kp-badge", tones[tone] || tones.default, className)}>{children}</span>;
}

export function EmptyState({ icon = "◎", title, hint, action }) {
  return (
    <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center gap-2 py-14 px-6">
      <span className="text-3xl opacity-60">{icon}</span>
      <p className="text-sm font-medium text-text">{title}</p>
      {hint && <p className="text-xs text-text-faint max-w-sm">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center gap-2 py-14 px-6">
      <span className="text-3xl">⚠</span>
      <p className="text-sm font-medium text-state-failed">Something went wrong</p>
      <p className="text-xs text-text-faint max-w-sm font-mono">{message}</p>
      {onRetry && (
        <button className="kp-btn-secondary mt-2" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function StatCard({ label, value, hint, tone }) {
  return (
    <div className="kp-panel p-4">
      <p className="kp-label">{label}</p>
      <p className={cx("text-2xl font-display font-semibold mt-1.5", tone)}>{value}</p>
      {hint && <p className="text-xs text-text-faint mt-1">{hint}</p>}
    </div>
  );
}

export function Skeleton({ className }) {
  return <div className={cx("animate-pulse-soft rounded-md bg-elevated2", className)} />;
}
