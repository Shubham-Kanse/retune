"use client";
import Link from "next/link";

// Inlined from @retune/ui/cognitive (package not yet built)
function VoiceFingerprintRadar({
  dimensions,
  className,
}: { dimensions: Record<string, number>; className?: string }) {
  const entries = Object.entries(dimensions).slice(0, 12);
  if (entries.length === 0) return null;
  const size = 200,
    cx = 100,
    cy = 100,
    radius = 76,
    n = entries.length;
  const points = entries.map(([, v], i) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return { x: cx + radius * v * Math.cos(a), y: cy + radius * v * Math.sin(a) };
  });
  return (
    <div className={className}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <title>Voice fingerprint</title>
        {[0.25, 0.5, 0.75, 1].map((l) => (
          <circle
            key={l}
            cx={cx}
            cy={cy}
            r={radius * l}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.08}
            strokeWidth={0.5}
          />
        ))}
        {entries.map(([k], i) => {
          const a = (Math.PI * 2 * i) / n - Math.PI / 2;
          return (
            <line
              key={k}
              x1={cx}
              y1={cy}
              x2={cx + radius * Math.cos(a)}
              y2={cy + radius * Math.sin(a)}
              stroke="currentColor"
              strokeOpacity={0.08}
              strokeWidth={0.5}
            />
          );
        })}
        <polygon
          points={points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="rgba(27,48,40,0.12)"
          stroke="#1B3028"
          strokeWidth={1.5}
        />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="#1B3028" />
        ))}
        {entries.map(([k], i) => {
          const a = (Math.PI * 2 * i) / n - Math.PI / 2;
          return (
            <text
              key={k}
              x={cx + (radius + 16) * Math.cos(a)}
              y={cy + (radius + 16) * Math.sin(a)}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={8}
              fill="currentColor"
              opacity={0.5}
            >
              {k.replace(/_/g, " ").slice(0, 10)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
import { useEffect, useState } from "react";

interface VoiceFingerprint {
  sampleSize: number;
  updatedAt: string;
  dimensions: Record<string, number>;
}

export default function VoiceFingerprintSettingsPage() {
  const [fingerprint, setFingerprint] = useState<VoiceFingerprint | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/profile/voice-fingerprint")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setFingerprint(d as VoiceFingerprint | null))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-6 py-6 animate-in fade-in slide-in-from-bottom-2 duration-400">
      <Link
        href="/settings"
        className="text-xs text-muted-foreground hover:text-foreground mb-6 inline-block"
      >
        ← Settings
      </Link>

      <div className="page-header">
        <div>
          <h1 className="page-title">Writing Voice</h1>
          <p className="page-subtitle">
            Your voice fingerprint captures how you naturally write. It&apos;s used to keep
            generated content authentic to your style.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="h-5 w-5 border-2 border-border border-t-brand rounded-full animate-spin" />
        </div>
      ) : fingerprint ? (
        <div className="space-y-6">
          <div className="border border-border p-4">
            <div className="flex items-center justify-between mb-4">
              <span className="rt-label">Fingerprint Status</span>
              <span className="text-xs text-brand bg-brand/10 px-2 py-0.5">Active</span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Documents analyzed</span>
                <p className="font-medium">{fingerprint.sampleSize}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Last updated</span>
                <p className="font-medium">
                  {new Date(fingerprint.updatedAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>

          {fingerprint.dimensions && Object.keys(fingerprint.dimensions).length > 0 && (
            <div className="border border-border p-4">
              <h3 className="rt-label mb-3">Style Characteristics</h3>
              <VoiceFingerprintRadar dimensions={fingerprint.dimensions} className="mt-2" />
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Your voice fingerprint updates automatically as you upload more documents and complete
            more generations. To reset it, contact support.
          </p>
        </div>
      ) : (
        <div className="border border-border p-6 text-center">
          <p className="text-sm text-muted-foreground mb-3">
            No voice fingerprint yet. It will be created automatically during your first generation.
          </p>
          <Link href="/generate/new" className="rt-btn inline-flex px-4 py-2 text-sm">
            Start a generation
          </Link>
        </div>
      )}
    </div>
  );
}
