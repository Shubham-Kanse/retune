"use client";

// Floating geometry shapes — same visual language as the landing page.
// Injected into layouts so every page shares the same ambient background.

const SHAPES = [
  { w: 200, h: 1, top: "18%", left: "3%", dur: 22, delay: 0, dx: 14, dy: 7 },
  { w: 1, h: 140, top: "12%", left: "14%", dur: 28, delay: 4, dx: -10, dy: 16 },
  { w: 70, h: 70, top: "58%", left: "6%", dur: 34, delay: 7, dx: 12, dy: -10, hollow: true },
  { w: 260, h: 1, top: "74%", left: "10%", dur: 19, delay: 2, dx: -16, dy: 5 },
  { w: 1, h: 90, top: "42%", left: "90%", dur: 25, delay: 9, dx: 7, dy: -14 },
  { w: 110, h: 110, top: "28%", left: "87%", dur: 38, delay: 5, dx: -12, dy: 9, hollow: true },
  { w: 170, h: 1, top: "82%", left: "76%", dur: 17, delay: 3, dx: 9, dy: -7 },
  { w: 1, h: 100, top: "62%", left: "60%", dur: 30, delay: 11, dx: -7, dy: 12 },
  { w: 45, h: 45, top: "20%", left: "50%", dur: 26, delay: 6, dx: 16, dy: -11, hollow: true },
  { w: 130, h: 1, top: "48%", left: "72%", dur: 21, delay: 1, dx: -11, dy: 8 },
];

export function PageBackground() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden text-foreground"
      aria-hidden="true"
    >
      {SHAPES.map((s, i) => {
        const style: React.CSSProperties = {
          position: "absolute",
          top: s.top,
          left: s.left,
          width: s.w,
          height: s.h,
          opacity: 0.04,
          animation: `floatDrift ${s.dur}s ease-in-out ${s.delay}s infinite alternate`,
        } as React.CSSProperties;
        (style as Record<string, unknown>)["--dx"] = `${s.dx}px`;
        (style as Record<string, unknown>)["--dy"] = `${s.dy}px`;
        if (s.hollow) {
          (style as Record<string, unknown>).border = "1px solid currentColor";
          (style as Record<string, unknown>).background = "transparent";
        } else {
          (style as Record<string, unknown>).background = "currentColor";
        }
        return <div key={i} style={style} />;
      })}
    </div>
  );
}
