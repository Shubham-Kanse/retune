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
    <div className="min-h-screen flex items-start justify-center pt-16 px-6">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#f0ede8] flex items-center justify-center">
              <svg className="w-4 h-4 text-[#b84ed1]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <div>
              <p className="rt-label">Voice & Style</p>
              <h1 className="font-serif text-2xl font-normal text-[#1a1a1a] leading-tight">
                Writing Voice
              </h1>
            </div>
          </div>
          <Link href="/settings" className="text-[#9a9690] hover:text-[#1a1a1a] transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </Link>
        </div>

        <p className="text-sm text-[#6b6b6b] mb-6">
          Your voice fingerprint captures how you naturally write. It&apos;s used to keep
          generated content authentic to your style.
        </p>

        {loading ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <div className="h-5 w-5 border-2 border-[#e5e2dd] border-t-[#2d8a5e] rounded-full animate-spin" />
          </div>
        ) : fingerprint ? (
          <div className="space-y-4">
            <div className="bg-white border border-[#e5e2dd] rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <span className="rt-label">Fingerprint Status</span>
                <span className="text-xs text-[#2d8a5e] bg-[#d4f5e0] px-2 py-0.5 rounded-full">Active</span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-[#6b6b6b] text-xs">Documents analyzed</span>
                  <p className="font-medium text-[#1a1a1a]">{fingerprint.sampleSize}</p>
                </div>
                <div>
                  <span className="text-[#6b6b6b] text-xs">Last updated</span>
                  <p className="font-medium text-[#1a1a1a]">
                    {new Date(fingerprint.updatedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>

            {fingerprint.dimensions && Object.keys(fingerprint.dimensions).length > 0 && (
              <div className="bg-white border border-[#e5e2dd] rounded-2xl p-6">
                <h3 className="rt-label mb-4">Style Characteristics</h3>
                <VoiceFingerprintRadar dimensions={fingerprint.dimensions} className="flex justify-center" />
              </div>
            )}

            <p className="text-xs text-[#6b6b6b]">
              Your voice fingerprint updates automatically as you upload more documents and complete
              more generations. To reset it, contact support.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-[#e5e2dd] rounded-2xl p-8 text-center">
            <p className="text-sm text-[#6b6b6b] mb-4">
              No voice fingerprint yet. It will be created automatically during your first generation.
            </p>
            <Link href="/generate/new" className="rt-btn inline-flex">
              Start a generation
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
