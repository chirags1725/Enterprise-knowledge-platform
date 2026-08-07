export function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function timeAgo(ts) {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function debounce(fn, ms = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function truncate(str, n) {
  if (!str) return "";
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

const FILE_ICON_BY_EXT = {
  pdf: "📄", md: "📝", markdown: "📝", py: "🐍", js: "📜", jsx: "📜",
  ts: "📘", tsx: "📘", java: "☕", go: "🐹", png: "🖼️", jpg: "🖼️",
  jpeg: "🖼️", gif: "🖼️", mp3: "🎵", wav: "🎵", mp4: "🎬", mov: "🎬",
};
export function iconForFilename(name = "") {
  const ext = name.split(".").pop()?.toLowerCase();
  return FILE_ICON_BY_EXT[ext] || "📁";
}
