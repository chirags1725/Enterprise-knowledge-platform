import { cx } from "../lib/utils";

// The platform's core idea is three independent recall paths (vector, BM25,
// graph) fusing into one ranked list via RRF. This mark makes that literal:
// three colored strands converge into a single amber line. Used as the brand
// icon (static) and as the app's loading indicator (animated).
export default function FusionMark({ size = 28, animated = false, className }) {
  const s = size;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 48 48"
      fill="none"
      className={cx(className)}
      role="img"
      aria-label="Knowledge Platform"
    >
      <path
        d="M4 10 C 16 10, 20 22, 24 24"
        stroke="#5B8CFF"
        strokeWidth="2.75"
        strokeLinecap="round"
        pathLength="100"
        className={animated ? "animate-draw" : ""}
        style={animated ? { strokeDasharray: 100 } : undefined}
      />
      <path
        d="M4 24 C 14 24, 18 24, 24 24"
        stroke="#34D399"
        strokeWidth="2.75"
        strokeLinecap="round"
        pathLength="100"
        className={animated ? "animate-draw" : ""}
        style={animated ? { strokeDasharray: 100, animationDelay: "120ms" } : undefined}
      />
      <path
        d="M4 38 C 16 38, 20 26, 24 24"
        stroke="#C084FC"
        strokeWidth="2.75"
        strokeLinecap="round"
        pathLength="100"
        className={animated ? "animate-draw" : ""}
        style={animated ? { strokeDasharray: 100, animationDelay: "240ms" } : undefined}
      />
      <path
        d="M24 24 C 30 24, 36 24, 44 24"
        stroke="rgb(var(--signal))"
        strokeWidth="3.5"
        strokeLinecap="round"
        pathLength="100"
        className={animated ? "animate-draw" : ""}
        style={animated ? { strokeDasharray: 100, animationDelay: "380ms" } : undefined}
      />
      <circle cx="24" cy="24" r="3" fill="rgb(var(--signal))" />
    </svg>
  );
}

export function FusionSpinner({ label = "Loading" }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-text-muted">
      <FusionMark size={40} animated />
      <span className="text-xs font-mono tracking-wide animate-pulse-soft">{label}…</span>
    </div>
  );
}
