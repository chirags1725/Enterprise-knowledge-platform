import { useCallback, useRef, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useJobs } from "../lib/jobs";
import { useToast } from "../lib/toast";
import { Badge, EmptyState } from "../components/ui";
import { cx, iconForFilename, timeAgo, formatBytes } from "../lib/utils";

const ACCEPTED_HINT = "PDF, code repositories, images, audio, or video — routed through Kafka workers.";

function Dropzone({ onFiles, busy }) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) onFiles(Array.from(e.dataTransfer.files));
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={cx(
        "kp-panel border-2 border-dashed p-10 flex flex-col items-center justify-center gap-3 text-center cursor-pointer transition-colors",
        dragOver ? "border-signal bg-signal/5" : "border-line hover:border-text-faint/50"
      )}
    >
      <span className="text-3xl">⇪</span>
      <p className="text-sm font-medium text-text">
        {busy ? "Uploading…" : "Drop files here, or click to browse"}
      </p>
      <p className="text-xs text-text-faint max-w-sm">{ACCEPTED_HINT}</p>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
    </div>
  );
}

function JobRow({ job, onRetry }) {
  return (
    <div className="kp-card p-3 flex items-center gap-3 animate-slide-up">
      <span className="text-lg shrink-0">{iconForFilename(job.filename)}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text truncate" title={job.filename}>{job.filename}</p>
        <p className="text-[11px] text-text-faint font-mono flex items-center gap-2 mt-0.5">
          {job.size != null && <span>{formatBytes(job.size)}</span>}
          <span>{timeAgo(job.createdAt)}</span>
          {job.jobId && <span className="truncate max-w-[140px]" title={job.jobId}>#{job.jobId.slice(0, 8)}</span>}
        </p>
        {job.state === "failed" && job.error && (
          <p className="text-[11px] text-state-failed mt-1">{job.error}</p>
        )}
      </div>
      {typeof job.progress === "number" && job.progress < 100 && job.state === "queued" && (
        <div className="w-16 h-1.5 rounded-full bg-elevated2 overflow-hidden shrink-0">
          <div className="h-full bg-signal transition-all" style={{ width: `${job.progress}%` }} />
        </div>
      )}
      <Badge tone={job.state} className="shrink-0">
        <span className={cx("h-1.5 w-1.5 rounded-full mr-0.5", job.state === "processing" && "animate-pulse-soft",
          job.state === "queued" && "bg-state-queued", job.state === "processing" && "bg-state-processing",
          job.state === "done" && "bg-state-done", job.state === "failed" && "bg-state-failed")}
          style={{ backgroundColor: "currentColor" }}
        />
        {job.state}
      </Badge>
      {job.state === "failed" && (
        <button className="kp-btn-ghost !px-2 shrink-0" onClick={() => onRetry(job)}>Retry</button>
      )}
    </div>
  );
}

export default function IngestPage() {
  const { jobs, addJob, patchJob, rekeyJob, clearFinished } = useJobs();
  const { push } = useToast();
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const filesRef = useRef({}); // jobId -> File, for retry

  const uploadOne = useCallback(async (file) => {
    const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    addJob({ jobId: tempId, filename: file.name, size: file.size, state: "queued", progress: 0 });
    try {
      const data = await api.ingest(file, (pct) => patchJob(tempId, { progress: pct }));
      const realId = data.doc_id;
      if (realId) {
        filesRef.current[realId] = file;
        rekeyJob(tempId, realId, { state: data.state || "queued", progress: 100 });
      } else {
        // Backend didn't return a doc_id — nothing to poll, but the upload succeeded.
        patchJob(tempId, { state: data.state || "done", progress: 100 });
      }
    } catch (err) {
      patchJob(tempId, { state: "failed", error: err instanceof ApiError ? err.message : "Upload failed." });
      push(`${file.name} failed to upload`, { type: "error" });
    }
  }, [addJob, patchJob, push]);

  const onFiles = useCallback(async (files) => {
    setBusy(true);
    await Promise.all(files.map(uploadOne));
    setBusy(false);
    push(`${files.length} file${files.length > 1 ? "s" : ""} queued for ingestion`, { type: "success" });
  }, [uploadOne, push]);

  function retry(job) {
    const file = filesRef.current[job.jobId];
    if (file) {
      uploadOne(file);
    } else {
      push("Original file isn't available anymore — re-upload it to retry.", { type: "info" });
    }
  }

  const filtered = jobs.filter((j) => {
    if (filter !== "all" && j.state !== filter) return false;
    if (query && !j.filename?.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const counts = jobs.reduce((acc, j) => ({ ...acc, [j.state]: (acc[j.state] || 0) + 1 }), {});

  return (
    <div className="max-w-4xl mx-auto space-y-5 animate-fade-in">
      <Dropzone onFiles={onFiles} busy={busy} />

      <div className="flex flex-wrap items-center gap-2">
        {["all", "queued", "processing", "done", "failed"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cx(
              "text-xs px-2.5 py-1 rounded-full border transition-colors capitalize",
              filter === f ? "border-signal text-signal bg-signal/10" : "border-line text-text-muted hover:text-text"
            )}
          >
            {f} {f !== "all" && counts[f] ? `· ${counts[f]}` : ""}
          </button>
        ))}
        <div className="flex-1" />
        <input
          className="kp-input !py-1.5 w-48"
          placeholder="Filter by filename…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="kp-btn-ghost !py-1.5" onClick={clearFinished}>Clear finished</button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="⇪" title="No jobs to show" hint="Upload a file above, or adjust the filter." />
      ) : (
        <div className="space-y-2">
          {filtered.map((j) => <JobRow key={j.jobId} job={j} onRetry={retry} />)}
        </div>
      )}
    </div>
  );
}
