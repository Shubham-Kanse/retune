"use client";

interface LiveNarrativeStreamProps {
  paragraphs: string[];
  className?: string;
}

export function LiveNarrativeStream({ paragraphs, className }: LiveNarrativeStreamProps) {
  if (paragraphs.length === 0) return null;

  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      {paragraphs.map((text, i) => (
        <p
          key={text.slice(0, 40)}
          className="text-sm text-muted-foreground leading-relaxed animate-in fade-in slide-in-from-bottom-2 duration-300"
          style={{ animationDelay: `${i * 50}ms` }}
        >
          {text}
        </p>
      ))}
    </div>
  );
}
