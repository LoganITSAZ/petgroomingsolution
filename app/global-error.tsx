"use client";

import { useEffect } from "react";

/**
 * Last resort: catches errors thrown by the root layout itself, where the
 * normal error boundary cannot render. It has to supply its own <html> and
 * <body> because the failing layout never produced them.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f5f5f4",
          color: "#1c1917",
          margin: 0,
        }}
      >
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 800, margin: 0 }}>
            The application is temporarily unavailable
          </h1>
          <p style={{ color: "#78716c", marginTop: "0.5rem" }}>
            The application failed to start rendering.
          </p>
          {error.digest && (
            <p style={{ color: "#a8a29e", fontSize: "0.75rem", fontFamily: "monospace" }}>
              Reference: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              marginTop: "1.25rem",
              background: "#b45309",
              color: "white",
              border: 0,
              borderRadius: "0.5rem",
              padding: "0.5rem 1.25rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
