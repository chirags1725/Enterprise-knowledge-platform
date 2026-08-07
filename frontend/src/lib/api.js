// Central API client. Every request the UI makes goes through here so the
// endpoint list and parameter names stay in one place and match the backend
// exactly: /health, /ingest, /ingest/status/{id}, /search, /ask,
// /graph/related/{doc_id}, /graph/entity/{name}, /clusters.

export function getApiUrl() {
  return (
    localStorage.getItem("kp-api-url") ||
    import.meta.env.VITE_API_URL ||
    "http://localhost:8000"
  );
}

export function setApiUrl(url) {
  localStorage.setItem("kp-api-url", url);
}

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = "GET", params, body, signal } = {}) {
  const base = getApiUrl().replace(/\/$/, "");
  const url = new URL(base + path);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === null || v === "") return;
      url.searchParams.set(k, v);
    });
  }

  const opts = { method, signal };
  if (body instanceof FormData) {
    opts.body = body;
  } else if (body) {
    opts.headers = { "Content-Type": "application/json" };
    opts.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(url.toString(), opts);
  } catch (err) {
    throw new ApiError(`Cannot reach the API at ${base}. Is the backend running?`, 0);
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = data.detail || data.message || detail;
    } catch {
      /* body wasn't JSON */
    }
    throw new ApiError(detail, res.status);
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return res.json();
  return res.text();
}

export const api = {
  health: (signal) => request("/health", { signal }),

  ingest: (file, onProgress) => {
    // Uses XHR instead of fetch so we can report upload progress.
    const base = getApiUrl().replace(/\/$/, "");
    const form = new FormData();
    form.append("file", file);
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${base}/ingest`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            reject(new ApiError("Backend returned a response that wasn't JSON.", xhr.status));
          }
        } else {
          reject(new ApiError(`Upload failed (${xhr.status})`, xhr.status));
        }
      };
      xhr.onerror = () => reject(new ApiError(`Cannot reach the API at ${base}.`, 0));
      xhr.send(form);
    });
  },

  ingestStatus: (jobId, signal) => request(`/ingest/status/${encodeURIComponent(jobId)}`, { signal }),

  // filters: department, year, author, language, tags, access_level, file_type
  search: (q, filters = {}, signal) =>
    request("/search", { params: { q, ...filters }, signal }),

  ask: (q, filters = {}, signal) =>
    request("/ask", { params: { q, ...filters }, signal }),

  graphRelated: (docId, hops = 2, signal) =>
    request(`/graph/related/${encodeURIComponent(docId)}`, { params: { hops }, signal }),

  graphEntity: (name, hops = 2, signal) =>
    request(`/graph/entity/${encodeURIComponent(name)}`, { params: { hops }, signal }),

  clusters: (signal) => request("/clusters", { signal }),
};

export { ApiError };
