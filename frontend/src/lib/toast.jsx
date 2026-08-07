import { createContext, useCallback, useContext, useRef, useState } from "react";
import { cx } from "./utils";

const ToastContext = createContext(null);
let idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  const push = useCallback((message, { type = "info", duration = 4500 } = {}) => {
    const id = ++idCounter;
    setToasts((t) => [...t, { id, message, type }]);
    timers.current[id] = setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ push, dismiss }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cx(
              "kp-panel px-4 py-3 text-sm shadow-pop animate-slide-up flex items-start gap-2.5 border-l-4",
              t.type === "error" && "border-l-state-failed",
              t.type === "success" && "border-l-state-done",
              t.type === "info" && "border-l-signal"
            )}
          >
            <span className="flex-1 text-text leading-snug">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="text-text-faint hover:text-text shrink-0 leading-none text-lg"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
