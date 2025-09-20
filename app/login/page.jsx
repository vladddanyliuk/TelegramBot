"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const cardStyle = {
  maxWidth: "420px",
  margin: "120px auto",
  padding: "32px",
  borderRadius: "16px",
  border: "1px solid #e0e0e0",
  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
  background: "#ffffff"
};

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
  cursor: "pointer",
  width: "100%"
};

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const redirectTarget = useMemo(() => {
    const redirect = searchParams?.get("redirect") || "";
    if (!redirect || redirect === "/login") return "/upload";
    return redirect;
  }, [searchParams]);

  function persistToken(token, expiresAt) {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("accessToken", token);
    } catch {}

    try {
      let ttlMs = new Date(expiresAt).getTime() - Date.now();
      if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
        ttlMs = 24 * 60 * 60 * 1000;
      }
      ttlMs = Math.max(ttlMs, 60_000);
      const maxAge = Math.floor(ttlMs / 1000);
      document.cookie = `accessToken=${token}; Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure`;
    } catch {}
  }

  function clearToken() {
    if (typeof document !== "undefined") {
      document.cookie = "accessToken=; Path=/; Max-Age=0; SameSite=Lax; Secure";
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!password) {
      setStatus("Password is required");
      return;
    }

    setIsSubmitting(true);
    setStatus("Authenticating…");

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || "Login failed");
      }

      clearToken();
      persistToken(json.token, json.expiresAt);
      setStatus(`Login successful. Redirecting to ${redirectTarget}…`);
      setPassword("");
      setTimeout(() => {
        router.push(redirectTarget);
      }, 800);
    } catch (error) {
      setStatus(error.message || "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main style={{ padding: "32px" }}>
      <section style={cardStyle}>
        <h1 style={{ marginTop: 0, marginBottom: "16px" }}>Admin Login</h1>
        <p style={{ color: "#4b5563", lineHeight: 1.5 }}>
          Enter the admin password to generate a temporary access token. The token is stored in your
          browser and required for all protected API calls.
        </p>
        <form onSubmit={handleSubmit} style={{ marginTop: "24px" }}>
          <label htmlFor="password" style={{ display: "block", marginBottom: "8px", fontWeight: 600 }}>
            Admin password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            autoComplete="current-password"
            placeholder="Enter admin password"
            style={inputStyle}
            disabled={isSubmitting}
          />
          <button type="submit" style={buttonStyle} disabled={isSubmitting}>
            {isSubmitting ? "Logging in…" : "Log in"}
          </button>
        </form>
        {status && (
          <p style={{ marginTop: "16px", color: status.startsWith("Login successful") ? "#065f46" : "#b91c1c" }}>
            {status}
          </p>
        )}
        <p style={{ marginTop: "24px", fontSize: "0.85rem", color: "#6b7280" }}>
          Need to upload documents after logging in? Go to <a href="/upload">/upload</a> once
          authenticated.
        </p>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main style={{ padding: "32px" }}>Loading…</main>}>
      <LoginPageInner />
    </Suspense>
  );
}
