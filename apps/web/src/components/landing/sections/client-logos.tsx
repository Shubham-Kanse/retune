"use client";

const clients = ["Google", "Stripe", "Airbnb", "Spotify", "Notion", "Figma", "Vercel", "Linear"];

export function ClientLogos() {
  return (
    <section className="py-20 overflow-hidden">
      <div className="max-w-[1280px] mx-auto px-6 md:px-12 mb-8">
        <p className="text-sm text-muted-foreground text-center">Trusted by professionals at leading companies</p>
      </div>
      <div className="relative">
        <div className="flex animate-marquee hover:[animation-play-state:paused]">
          {[...clients, ...clients].map((client, index) => (
            <div key={`${client}-${index}`} className="flex items-center justify-center min-w-[200px] px-8">
              <span className="font-serif text-2xl md:text-3xl text-muted-foreground/40 whitespace-nowrap">{client}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
