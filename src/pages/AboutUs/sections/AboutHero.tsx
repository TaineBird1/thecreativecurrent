import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const title = "The Creative Current";
const filters = ["Web Design", "Management", "Strategy", "Growth"];

export function AboutHero() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <section className="bg-background px-6 pb-16 pt-32 text-foreground md:pb-24 md:pt-40">
      <div className="mx-auto max-w-[1040px]">
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <span className="whitespace-nowrap font-sans text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Est. 2026 · Digital Excellence
          </span>
          <div className="hidden h-px flex-1 bg-border/60 sm:mx-2 sm:block md:mx-6" />
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
              <span className="rounded-lg px-2 py-1 font-sans text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                {filter}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-12 flex justify-center">
          <Link
            to="/contact"
            className="rounded-lg bg-primary px-8 py-4 font-sans text-sm font-semibold uppercase tracking-[0.15em] text-primary-foreground shadow-lg transition-all hover:bg-primary/90 hover:shadow-glow-cyan"
          >
            Enquire Now
          </Link>
        </div>
      </div>
    </section>
  );
}
