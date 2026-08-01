import { Link } from "react-router-dom";
import contactHero from "../../../assets/site/contact-hero.webp";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-background py-32 md:py-44">
      <div className="mx-auto max-w-[1320px] px-8 md:px-12 lg:px-16">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="order-2 lg:col-span-7 lg:order-1">
            <div className="mb-8 flex items-center gap-3 md:mb-10">
              <span className="font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-foreground md:text-[13px]">
                № 01 — Vision
              </span>
              <span className="inline-block h-2 w-2 rotate-45 bg-primary" aria-hidden="true" />
            </div>
            <h1
              className="mb-10 font-sans font-bold text-foreground"
              style={{ fontSize: "clamp(3.25rem, 7vw, 6.5rem)", letterSpacing: "-0.025em", lineHeight: 0.95 }}
            >
              <span className="block">Building digital</span>
              <span className="block">experiences that</span>
              <span className="block">flow with</span>
              <span className="block">
                your{" "}
                <span className="relative inline-block">
                  <span className="relative z-10 px-2 italic text-primary">ambition</span>
                  <svg
                    className="pointer-events-none absolute inset-0 h-full w-full"
                    viewBox="0 0 280 120"
                    preserveAspectRatio="none"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M 30 60 Q 20 20, 80 15 Q 160 8, 230 18 Q 270 28, 260 65 Q 252 100, 180 108 Q 90 115, 40 100 Q 12 85, 30 60 Z"
                      stroke="var(--color-primary)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      fill="none"
                    />
                  </svg>
                </span>
                .
              </span>
            </h1>
            <p
              className="mb-10 max-w-xl font-sans text-foreground/85"
              style={{ fontSize: "clamp(1.125rem, 1.3vw, 1.375rem)", lineHeight: 1.55 }}
            >
              The Creative Current transforms your digital presence into a high-performance
              asset, managing your web infrastructure with precision and modern design.
            </p>
            <div className="mb-12 flex flex-col gap-4 sm:flex-row">
              <Link
                to="/appointment-booking"
                className="inline-flex items-center justify-center rounded-lg bg-primary px-7 py-4 font-sans text-xs font-bold uppercase tracking-[0.05em] text-primary-foreground shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-xl md:text-sm"
              >
                Start Your Project
              </Link>
              <Link
                to="/pricing"
                className="inline-flex items-center justify-center rounded-lg border border-foreground bg-transparent px-7 py-4 font-sans text-xs font-bold uppercase tracking-[0.05em] text-foreground transition-colors duration-200 hover:bg-foreground hover:text-background md:text-sm"
              >
                View Our Services
              </Link>
            </div>
            <div className="mb-6 flex max-w-md items-center gap-0">
              <span className="h-px flex-1 bg-border" />
              <span className="h-1.5 w-1.5 rounded-lg bg-primary" aria-hidden="true" />
            </div>
            <p className="font-sans text-sm text-foreground/70 md:text-base">
              — powering digital growth since 2024
            </p>
          </div>

          <div className="order-1 lg:col-span-5 lg:order-2">
            <div className="relative mx-auto w-full max-w-md lg:max-w-none">
              <span className="absolute -left-3 -top-3 z-10 h-4 w-4 border-l-2 border-t-2 border-primary" aria-hidden="true" />
              <span className="absolute -right-3 -top-3 z-10 h-4 w-4 border-r-2 border-t-2 border-primary" aria-hidden="true" />
              <span className="absolute -bottom-3 -left-3 z-10 h-4 w-4 border-b-2 border-l-2 border-primary" aria-hidden="true" />
              <span className="absolute -bottom-3 -right-3 z-10 h-4 w-4 border-b-2 border-r-2 border-primary" aria-hidden="true" />
              <div className="relative overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
                <img
                  src={contactHero}
                  alt="Abstract digital interface showing modern web design and management dashboard"
                  loading="eager"
                  fetchPriority="high"
                  className="aspect-[4/5] w-full object-cover"
                />
              </div>
              <p className="mt-5 text-right font-sans text-xs text-foreground/70 md:text-sm">
                — crafted by The Creative Current
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
