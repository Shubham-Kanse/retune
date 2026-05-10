"use client";

import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

export function StrategyView({ content }: { content: string }) {
  return (
    <div className="rt-card">
      <div className="mx-auto max-w-3xl px-6 py-8 md:px-10 md:py-10">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkBreaks]}
          components={{
            h1: ({ children }) => (
              <h1 className="text-xl font-semibold tracking-tight text-foreground mb-1">
                {children}
              </h1>
            ),
            h2: ({ children }) => {
              const text = String(children);
              // Render date/focus lines as subtle metadata, not full headings
              if (/^(Generated|Role Focus)/i.test(text)) {
                return (
                  <p className="text-[11px] uppercase tracking-widest text-muted-foreground/60 mb-1">
                    {children}
                  </p>
                );
              }
              return (
                <h2 className="mt-10 mb-4 text-[11px] font-medium uppercase tracking-widest text-muted-foreground border-b border-border pb-3">
                  {children}
                </h2>
              );
            },
            h3: ({ children }) => (
              <h3 className="mt-6 mb-2 text-sm font-semibold text-foreground">{children}</h3>
            ),
            h4: ({ children }) => (
              <h4 className="mt-4 mb-1.5 text-xs font-semibold text-foreground">{children}</h4>
            ),
            p: ({ children }) => (
              <p className="my-2 text-sm leading-[1.7] text-muted-foreground">{children}</p>
            ),
            ul: ({ children }) => (
              <ul className="my-2 ml-4 space-y-1.5 list-disc marker:text-border">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="my-2 ml-4 space-y-2 list-decimal marker:text-muted-foreground/40 marker:font-mono marker:text-xs">
                {children}
              </ol>
            ),
            li: ({ children }) => (
              <li className="text-sm leading-[1.7] text-muted-foreground pl-1">{children}</li>
            ),
            strong: ({ children }) => (
              <strong className="font-semibold text-foreground">{children}</strong>
            ),
            em: ({ children }) => <em className="text-muted-foreground/80">{children}</em>,
            code: ({ children, className, ...props }) => {
              if (className?.includes("language-")) {
                return (
                  <code className={className} {...props}>
                    {children}
                  </code>
                );
              }
              return (
                <code
                  className="bg-muted px-1.5 py-0.5 text-[12px] font-mono text-foreground"
                  {...props}
                >
                  {children}
                </code>
              );
            },
            pre: ({ children }) => (
              <pre className="my-4 overflow-x-auto border border-border bg-muted/50 p-4 text-[12px] font-mono leading-relaxed whitespace-pre-wrap">
                {children}
              </pre>
            ),
            blockquote: ({ children }) => (
              <blockquote className="my-4 border-l-2 border-foreground/20 pl-4 text-sm italic text-muted-foreground/80">
                {children}
              </blockquote>
            ),
            hr: () => <hr className="my-8 border-border" />,
            a: ({ href, children }) => (
              <a
                href={href}
                className="text-foreground underline decoration-border underline-offset-[3px] hover:decoration-foreground transition-colors"
                target="_blank"
                rel="noopener noreferrer"
              >
                {children}
              </a>
            ),
            table: ({ children }) => (
              <div className="my-4 overflow-x-auto">
                <table className="w-full text-xs">{children}</table>
              </div>
            ),
            thead: ({ children }) => <thead className="border-b border-border">{children}</thead>,
            th: ({ children }) => (
              <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="border-b border-border/50 px-3 py-2 text-sm text-muted-foreground">
                {children}
              </td>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
