import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import FusionMark from "./FusionMark";
import CommandPalette from "./CommandPalette";
import { useTheme } from "../lib/theme";
import { api } from "../lib/api";
import { cx } from "../lib/utils";

const NAV = [
  { to: "/", label: "Overview", icon: "◈", end: true },
  { to: "/search", label: "Search & Ask", icon: "◎" },
  { to: "/graph", label: "Graph Explorer", icon: "⌬" },
  { to: "/ingest", label: "Ingestion", icon: "⇪" },
  { to: "/clusters", label: "Clusters", icon: "⬡" },
];

const TITLES = {
  "/": "Overview",
  "/search": "Search & Ask",
  "/graph": "Graph Explorer",
  "/ingest": "Ingestion",
  "/clusters": "Clusters",
  "/settings": "Settings",
};

function useConnectionStatus() {
  const [status, setStatus] = useState("checking"); // checking | online | offline
  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        await api.health();
        if (!cancelled) setStatus("online");
      } catch {
        if (!cancelled) setStatus("offline");
      }
    }
    check();
    const id = setInterval(check, 20000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);
  return status;
}

export default function Layout() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("kp-sidebar-collapsed") === "1");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { theme, toggle } = useTheme();
  const status = useConnectionStatus();
  const location = useLocation();

  useEffect(() => {
    localStorage.setItem("kp-sidebar-collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => setMobileOpen(false), [location.pathname]);

  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const title = TITLES[location.pathname] || "Knowledge Platform";

  return (
    <div className="min-h-screen bg-bg text-text font-body flex">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={cx(
          "fixed lg:sticky top-0 h-screen z-40 flex flex-col bg-surface border-r border-line transition-all duration-200 shrink-0",
          collapsed ? "lg:w-[72px]" : "lg:w-64",
          "w-64",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="h-16 flex items-center gap-2.5 px-4 border-b border-line shrink-0">
          <FusionMark size={26} />
          {!collapsed && (
            <div className="min-w-0">
              <p className="font-display font-semibold text-sm leading-tight truncate">Knowledge Platform</p>
              <p className="text-[10px] text-text-faint font-mono leading-tight">hybrid · graph · local</p>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-0.5">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cx(
                  "flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors group relative",
                  isActive ? "bg-elevated2 text-text" : "text-text-muted hover:text-text hover:bg-elevated2/60"
                )
              }
              title={collapsed ? item.label : undefined}
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-signal" />}
                  <span className="w-5 text-center text-base shrink-0">{item.icon}</span>
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="p-2.5 border-t border-line space-y-0.5">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              cx(
                "flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                isActive ? "bg-elevated2 text-text" : "text-text-muted hover:text-text hover:bg-elevated2/60"
              )
            }
          >
            <span className="w-5 text-center text-base">⚙</span>
            {!collapsed && <span>Settings</span>}
          </NavLink>
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="hidden lg:flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium text-text-muted hover:text-text hover:bg-elevated2/60 transition-colors"
          >
            <span className="w-5 text-center text-base">{collapsed ? "»" : "«"}</span>
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 sticky top-0 z-20 flex items-center gap-3 px-4 lg:px-6 border-b border-line bg-bg/80 backdrop-blur-md shrink-0">
          <button className="lg:hidden kp-btn-ghost !px-2" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            ☰
          </button>
          <h1 className="font-display font-semibold text-base tracking-tight">{title}</h1>

          <div className="flex-1" />

          <button
            onClick={() => setPaletteOpen(true)}
            className="hidden sm:flex items-center gap-2 kp-input !py-1.5 text-text-faint w-56 text-left"
          >
            <span>◎</span>
            <span className="flex-1">Search or jump to…</span>
            <kbd className="text-[10px] font-mono border border-line rounded px-1 py-0.5">⌘K</kbd>
          </button>

          <div
            className="hidden sm:flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-full border border-line"
            title={`API: ${status}`}
          >
            <span
              className={cx(
                "h-1.5 w-1.5 rounded-full",
                status === "online" && "bg-state-done",
                status === "offline" && "bg-state-failed",
                status === "checking" && "bg-state-queued animate-pulse-soft"
              )}
            />
            <span className="text-text-muted">{status}</span>
          </div>

          <button onClick={toggle} className="kp-btn-ghost !px-2" aria-label="Toggle theme">
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </header>

        <main className="flex-1 min-w-0 px-4 lg:px-6 py-5 lg:py-6">
          <Outlet context={{ connectionStatus: status }} />
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
