import { useEffect, useState } from "react";

const title = "The Creative Current";
const filters = ["All", "Web Design", "Management", "Strategy", "Growth"];

export function AboutHero() {
  const [visible, setVisible] = useState(false);
  const [activeFilter, setActiveFilter] = useState("All");

  useEffect(() => {
    const timeout = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <section className="bg-background px-6 pb-16 pt-32 text-foreground md:pb-24 md:pt-40">
      <div className="mx-auto max-w-[1040px]">
        <div className="flex items-center justify-between gap-4">
          <span className="whitespace-nowrap font-sans text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Est. 2026 · Digital Excellence
          </span>
          <div className="mx-2 h-px flex-1 bg-border/60 md:mx-6" />
          <span className="whitespace-nowrap font-sans text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            — The Creative Current
          </span>
        </div>

        <h1 className="mt-12 text-center font-sans font-bold leading-[0.95] tracking-tight text-foreground text-[64px] sm:text-[96px] md:text-[140px] lg:text-[180px] xl:text-[200px]">
          {title.split("").map((char, i) => (
            <span
              key={i}
              className={`inline-block transition-all duration-700 ease-out ${
                visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
              }`}
              style={{ transitionDelay: `${i * 25}ms` }}
            >
              {char === " " ? " " : char}
            </span>
          ))}
        </h1>

        <p className="mt-6 text-center font-serif text-xl italic leading-snug text-foreground/75 md:text-2xl lg:text-[28px]">
          Modern web design and management for brands that move with the tide.
        </p>

        <div className="mt-12 flex justify-center">
          <div className="h-px w-full max-w-[480px] bg-gradient-to-r from-cyan-500 via-purple-500 to-orange-500" />
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-2 gap-y-3">
          {filters.map((filter, i) => (
            <div key={filter} className="flex items-center">
              {i > 0 && <span className="mx-1 font-sans text-[11px] text-muted-foreground/60 md:mx-2">·</span>}
              <button
                type="button"
                onClick={() => setActiveFilter(filter)}
                className={`rounded-lg px-2 py-1 font-sans text-[11px] uppercase tracking-[0.2em] transition-colors ${
                  activeFilter === filter
                    ? "border-b border-primary pb-0.5 text-primary"
                    : "text-muted-foreground hover:text-primary"
                }`}
              >
                {filter}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
