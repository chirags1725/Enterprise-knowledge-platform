import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api } from "./api";

const JobsContext = createContext(null);
const STORAGE_KEY = "kp-ingest-jobs";
const POLL_MS = 1500;

function load() {
  try {
    const jobs = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    // A "pending-*" jobId is a client-side placeholder used only until the
    // upload response returns a real doc_id. If the tab closed before that
    // happened, there's nothing left to poll — mark it interrupted.
    return jobs.map((j) =>
      j.jobId?.startsWith("pending-") && j.state !== "done" && j.state !== "failed"
        ? { ...j, state: "failed", error: "Upload was interrupted." }
        : j
    );
  } catch {
    return [];
  }
}

export function JobsProvider({ children }) {
  const [jobs, setJobs] = useState(load);
  const pollers = useRef({});

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs.slice(0, 100)));
  }, [jobs]);

  const patchJob = useCallback((jobId, patch) => {
    setJobs((prev) => prev.map((j) => (j.jobId === jobId ? { ...j, ...patch } : j)));
  }, []);

  const stopPolling = useCallback((jobId) => {
    clearTimeout(pollers.current[jobId]);
    delete pollers.current[jobId];
  }, []);

  // Only ever call with a real backend job id — never a client-side temp id.
  const trackJob = useCallback((jobId) => {
    if (!jobId || pollers.current[jobId]) return;
    const tick = async () => {
      try {
        const data = await api.ingestStatus(jobId);
        patchJob(jobId, { state: data.state, error: data.error });
        if (data.state === "done" || data.state === "failed") {
          stopPolling(jobId);
          return;
        }
      } catch {
        // Transient network hiccup — keep polling rather than flipping to failed.
      }
      pollers.current[jobId] = setTimeout(tick, POLL_MS);
    };
    pollers.current[jobId] = setTimeout(tick, 0);
  }, [patchJob, stopPolling]);

  // Resume polling for any real (non-placeholder) job left in-flight.
  useEffect(() => {
    jobs.forEach((j) => {
      if (j.state !== "done" && j.state !== "failed" && !j.jobId?.startsWith("pending-")) trackJob(j.jobId);
    });
    return () => Object.values(pollers.current).forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addJob = useCallback((job) => {
    setJobs((prev) => [{ ...job, createdAt: Date.now() }, ...prev]);
  }, []);

  // Renames a placeholder job to its real backend id and starts polling it.
  const rekeyJob = useCallback((tempId, realId, patch = {}) => {
    setJobs((prev) => prev.map((j) => (j.jobId === tempId ? { ...j, ...patch, jobId: realId } : j)));
    trackJob(realId);
  }, [trackJob]);

  const clearFinished = useCallback(() => {
    setJobs((prev) => prev.filter((j) => j.state !== "done" && j.state !== "failed"));
  }, []);

  return (
    <JobsContext.Provider value={{ jobs, addJob, patchJob, rekeyJob, trackJob, clearFinished }}>
      {children}
    </JobsContext.Provider>
  );
}

export function useJobs() {
  const ctx = useContext(JobsContext);
  if (!ctx) throw new Error("useJobs must be used within JobsProvider");
  return ctx;
}
