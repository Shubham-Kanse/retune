"use client";

export function TypingIndicator() {
  return (
    <div className="flex items-center gap-1" aria-label="Processing" aria-busy="true">
      <span className="h-2 w-2 rounded-full bg-stone-500 animate-[bounce_1.4s_ease-in-out_infinite]" />
      <span className="h-2 w-2 rounded-full bg-stone-500 animate-[bounce_1.4s_ease-in-out_0.2s_infinite]" />
      <span className="h-2 w-2 rounded-full bg-stone-500 animate-[bounce_1.4s_ease-in-out_0.4s_infinite]" />
    </div>
  );
}
