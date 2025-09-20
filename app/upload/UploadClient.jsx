"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const cardStyle = {
  maxWidth: "720px",
  margin: "48px auto",
  padding: "32px",
  borderRadius: "16px",
  border: "1px solid #e0e0e0",
  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
  background: "#ffffff"
};

const labelStyle = { display: "block", marginBottom: "8px", fontWeight: 600 };
const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "8px",
  border: "1px solid #cbd5f5",
  fontSize: "14px",
  marginBottom: "16px"
};

const buttonStyle = {
  padding: "10px 16px",
  borderRadius: "8px",
  border: "none",
  background: "#2563eb",
  color: "#ffffff",
  fontWeight: 600,
  cursor: "pointer"
};

function formatSize(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getStoredToken() {
  if (typeof window === "undefined") return "";
  const localToken = window.localStorage.getItem("accessToken");
  if (localToken) {
    return localToken;
  }

  const cookieMatch = document.cookie.match(/(?:^|; )accessToken=([^;]+)/);
  return cookieMatch ? decodeURIComponent(cookieMatch[1]) : "";
}

export default function UploadClient({ initialNamespace, supabaseConfigured }) {
  const router = useRouter();
  const [namespace, setNamespace] = useState(initialNamespace || "");
  const [status, setStatus] = useState("");
  const [files, setFiles] = useState([]);
  const [loadError, setLoadError] = useState(
    supabaseConfigured
      ? "Enter a namespace above to view recent files."
      : "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
  );
  const [token, setToken] = useState("");
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setNamespace(initialNamespace || "");
  }, [initialNamespace]);

  useEffect(() => {
    const stored = getStoredToken();
    if (stored) {
      setToken(stored);
      setLoadError("Enter a namespace above to view recent files.");
    } else if (supabaseConfigured) {
      setLoadError("Login required. Visit /login to obtain an access token.");
    }
  }, [supabaseConfigured]);

  const authHeaders = useMemo(() => {
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }, [token]);

  async function refreshFiles(ns) {
    if (!supabaseConfigured) {
      setLoadError("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
      return;
    }
    if (!token) {
      setLoadError("Login required. Visit /login to obtain an access token.");
      return;
    }
    if (!ns) {
      setLoadError("Enter a namespace above to view recent files.");
      setFiles([]);
      return;
    }

    setIsLoadingFiles(true);
    setLoadError("");
    try {
      const response = await fetch(`/api/files?namespace=${encodeURIComponent(ns)}`, {
        headers: {
          ...authHeaders
        }
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || "Failed to load files");
      }
      const list = Array.isArray(json.files) ? json.files : [];
      setFiles(list);
      setStatus(`Loaded ${list.length} files for ${ns}.`);
    } catch (error) {
      setFiles([]);
      setLoadError(error.message || "Failed to load files");
    } finally {
      setIsLoadingFiles(false);
    }
  }

  useEffect(() => {
    if (!supabaseConfigured) return;
    if (!token || !namespace) return;
    refreshFiles(namespace);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, namespace, supabaseConfigured]);

  async function handleSubmit(event) {
    event.preventDefault();
    const trimmedNamespace = namespace.trim();
    if (!trimmedNamespace) {
      setStatus("Namespace is required");
      return;
    }
    if (!token) {
      setStatus("Access token missing. Log in at /login first.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set("namespace", trimmedNamespace);

    setStatus("Uploading and embedding…");

    try {
      const response = await fetch("/api/files", {
        method: "POST",
        headers: {
          ...authHeaders
        },
        body: formData
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || "Upload failed");
      }

      setStatus(
        `Stored ${json.chunkCount} chunks for ${json.file.file_name}. Remember to run /namespace ${trimmedNamespace} in Telegram before asking questions.`
      );
      form.reset();
      startTransition(() => {
        const params = new URLSearchParams({ namespace: trimmedNamespace });
        router.replace(`/upload?${params.toString()}`);
      });
      await refreshFiles(trimmedNamespace);
    } catch (error) {
      setStatus(error.message || "Upload failed");
    }
  }

  function handleLoadNamespace() {
    const trimmedNamespace = namespace.trim();
    if (!trimmedNamespace) {
      setStatus("Namespace is required");
      return;
    }
    startTransition(() => {
      const params = new URLSearchParams({ namespace: trimmedNamespace });
      router.replace(`/upload?${params.toString()}`);
    });
    refreshFiles(trimmedNamespace);
  }

  function handleLogout() {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("accessToken");
    }
    if (typeof document !== "undefined") {
      document.cookie = "accessToken=; Path=/; Max-Age=0; SameSite=Lax; Secure";
    }
    setToken("");
    setFiles([]);
    setStatus("Access token cleared. Log in again to continue.");
    setLoadError("Login required. Visit /login to obtain an access token.");
  }

  return (
    <main style={{ padding: "32px" }}>
      <section style={cardStyle}>
        <h1 style={{ marginTop: 0 }}>Knowledge Base Uploader</h1>
        <p style={{ color: "#4b5563", lineHeight: 1.5 }}>
          Upload plain-text or markdown documents to the Supabase-backed knowledge base. Files are
          chunked, embedded with OpenAI, and become available to the Telegram bot via RAG search for
          the namespace you choose. Use the same namespace inside Telegram with
          {" "}
          <code>/namespace &lt;name&gt;</code> so the bot answers from the correct document.
        </p>

        <div
          style={{
            marginBottom: "16px",
            padding: "12px 16px",
            borderRadius: "12px",
            background: "#f1f5f9",
            border: "1px solid #e2e8f0"
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: "4px" }}>Authentication</div>
          {token ? (
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "0.85rem", color: "#334155" }}>
                Access token loaded (ending …{token.slice(-6)}).
              </span>
              <button
                type="button"
                style={{ ...buttonStyle, background: "#ef4444" }}
                onClick={handleLogout}
              >
                Log out
              </button>
            </div>
          ) : (
            <div style={{ fontSize: "0.85rem", color: "#b91c1c" }}>
              No access token found. Visit <a href="/login">/login</a>, authenticate, and the token
              will be stored in your browser.
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} encType="multipart/form-data">
          <label style={labelStyle} htmlFor="namespace">
            Namespace (must match your /namespace value in Telegram)
          </label>
          <input
            id="namespace"
            name="namespace"
            value={namespace}
            onChange={event => setNamespace(event.target.value)}
            placeholder="Planen, Vorbereiten und Durchführen von Arbeitsaufgaben"
            style={inputStyle}
            required
          />

          <label style={labelStyle} htmlFor="file">
            File (text/markdown)
          </label>
          <input
            id="file"
            name="file"
            type="file"
            accept=".txt,.md,text/plain,text/markdown,application/json"
            style={inputStyle}
            required
          />

          <label style={labelStyle} htmlFor="sourceUrl">
            Source URL (optional)
          </label>
          <input
            id="sourceUrl"
            name="sourceUrl"
            placeholder="https://example.com"
            style={inputStyle}
          />

          <button type="submit" style={buttonStyle} disabled={isPending}>
            {isPending ? "Processing…" : "Upload & Embed"}
          </button>
          <button
            type="button"
            style={{ ...buttonStyle, marginLeft: "12px", background: "#10b981" }}
            onClick={handleLoadNamespace}
            disabled={isPending}
          >
            Load Files
          </button>
        </form>

        {status && (
          <p
            style={{
              marginTop: "16px",
              color: status.startsWith("Stored") ? "#065f46" : "#1f2937",
              whiteSpace: "pre-wrap"
            }}
          >
            {status}
          </p>
        )}

        {loadError ? (
          <p
            style={{
              marginTop: "24px",
              color: "#b91c1c"
            }}
          >
            {loadError}
          </p>
        ) : (
          <div style={{ marginTop: "32px" }}>
            <h2 style={{ fontSize: "1rem", marginBottom: "12px" }}>Recent files</h2>
            {isLoadingFiles ? (
              <p style={{ color: "#6b7280" }}>Loading files…</p>
            ) : files.length === 0 ? (
              <p style={{ color: "#6b7280" }}>No files yet for this namespace.</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {files.map(file => (
                  <li
                    key={file.id}
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: "12px",
                      padding: "12px 16px",
                      marginBottom: "12px",
                      background: "#f9fafb"
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{file.file_name}</div>
                    <div style={{ fontSize: "0.85rem", color: "#4b5563" }}>
                      {new Date(file.created_at).toLocaleString()} · {formatSize(file.size_bytes)} ·
                      {" "}
                      {file.tokens ? `${file.tokens} tokens` : "unknown tokens"}
                    </div>
                    {file.source_url && (
                      <div style={{ fontSize: "0.85rem", color: "#2563eb" }}>
                        Source: <a href={file.source_url}>{file.source_url}</a>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
