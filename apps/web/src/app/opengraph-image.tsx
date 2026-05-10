import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Retuned — AI Resume Builder";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    <div
      style={{
        background: "#ffffff",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "flex-end",
        padding: "80px",
        fontFamily: "sans-serif",
      }}
    >
      {/* Top accent bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "6px",
          background: "oklch(0.42 0.13 155)",
        }}
      />

      {/* Logo wordmark */}
      <div
        style={{
          position: "absolute",
          top: "72px",
          left: "80px",
          fontSize: "28px",
          fontWeight: 600,
          letterSpacing: "-0.02em",
          color: "#111111",
        }}
      >
        Retuned
      </div>

      {/* Main headline */}
      <div
        style={{
          fontSize: "72px",
          fontWeight: 400,
          lineHeight: 1.05,
          letterSpacing: "-0.03em",
          color: "#111111",
          maxWidth: "800px",
          marginBottom: "32px",
        }}
      >
        The resume builder for every application
      </div>

      {/* Subline */}
      <div
        style={{
          fontSize: "24px",
          color: "#666666",
          maxWidth: "640px",
          lineHeight: 1.5,
          marginBottom: "48px",
        }}
      >
        Paste a job description. Get a tailored resume, cover letter, and application strategy in
        under 2 minutes.
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: "48px" }}>
        {[
          { value: "85%+", label: "ATS score" },
          { value: "2 min", label: "Generation time" },
          { value: "0 edits", label: "Needed" },
        ].map((stat) => (
          <div key={stat.label} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontSize: "32px", fontWeight: 600, color: "#111111" }}>
              {stat.value}
            </span>
            <span style={{ fontSize: "16px", color: "#888888" }}>{stat.label}</span>
          </div>
        ))}
      </div>
    </div>,
    { ...size },
  );
}
