import { Link } from "react-router-dom";
import appointmentHero from "../../../assets/site/appointment-hero.png";

export function Appointment() {
  return (
    <section className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      <div className="hidden min-h-screen grid-cols-12 lg:grid">
        <div className="relative col-span-7 overflow-hidden">
          <img
            src={appointmentHero}
            alt="Modern digital agency workspace with neon lighting"
            loading="eager"
            className="h-full w-full object-cover"
          />
        </div>
        <div className="col-span-5 flex flex-col justify-between">
          <div className="flex justify-end pr-12 pt-12">
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Available for New Projects
            </span>
          </div>
          <div className="max-w-xl pb-16 pl-12 pr-12">
            <div className="mb-8">
              <span className="font-mono text-xs uppercase tracking-[0.22em] text-chart-1">
                01 / Book Your Session
              </span>
            </div>
            <h1
              className="font-sans font-bold leading-[1.02] tracking-[-0.03em] text-foreground"
              style={{ fontSize: "clamp(4.5rem, 6.5vw, 7rem)" }}
            >
              Digital Growth
              <span className="block font-light italic text-foreground/85">
                Managed by The Creative Current
              </span>
            </h1>
            <div className="mb-8 mt-10 h-px w-16 bg-foreground/40" />
            <p className="max-w-md font-sans text-base leading-relaxed text-muted-foreground">
              Transform your online presence with high-performance web solutions. We build,
              manage, and scale digital experiences that drive results for modern businesses.
            </p>
            <div className="mt-10 flex items-center gap-8">
              <Link
                to="/contact"
                className="inline-flex h-12 items-center gap-2 rounded-lg bg-primary px-7 font-sans text-sm tracking-wide text-primary-foreground shadow-lg transition-colors hover:bg-primary/90"
              >
                Enquire now
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-4"
                  aria-hidden="true"
                >
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </Link>
              <Link
                to="/pricing"
                className="border-b border-foreground/40 pb-1 font-sans text-sm text-foreground transition-colors hover:border-foreground"
              >
                View Pricing Plans
              </Link>
            </div>
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-8 left-1/2 flex -translate-x-1/2 flex-col items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Scroll</span>
          <div className="relative h-12 w-px overflow-hidden bg-foreground/20">
            <div className="absolute left-0 top-0 h-6 w-px animate-pulse bg-foreground/70" />
          </div>
        </div>
      </div>

      <div className="flex min-h-screen flex-col lg:hidden">
        <div className="relative h-[70vh] w-full overflow-hidden">
          <img
            src={appointmentHero}
            alt="Modern digital agency workspace with neon lighting"
            loading="eager"
            className="h-full w-full object-cover"
          />
          <div className="absolute right-6 top-6">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/90">
              Available for New Projects
            </span>
          </div>
        </div>
        <div className="flex-1 px-6 pb-16 pt-10 sm:px-10">
          <div className="mb-6">
            <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-chart-1">
              01 / Book Your Session
            </span>
          </div>
          <h1
            className="font-sans font-bold leading-[1.04] tracking-[-0.03em] text-foreground"
            style={{ fontSize: "clamp(2.75rem, 9vw, 3.75rem)" }}
          >
            Digital Growth
            <span className="block font-light italic text-foreground/85">
              Managed by The Creative Current
            </span>
          </h1>
          <div className="mb-6 mt-7 h-px w-12 bg-foreground/40" />
          <p className="max-w-md font-sans text-[15px] leading-relaxed text-muted-foreground">
            Transform your online presence with high-performance web solutions. We build, manage,
            and scale digital experiences that drive results for modern businesses.
          </p>
          <div className="mt-8 flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-7">
            <Link
              to="/contact"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 font-sans text-sm tracking-wide text-primary-foreground shadow-lg transition-colors hover:bg-primary/90 sm:w-auto"
            >
              Enquire now
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-4"
                aria-hidden="true"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </Link>
            <Link
              to="/pricing"
              className="self-start border-b border-foreground/40 pb-1 font-sans text-sm text-foreground transition-colors hover:border-foreground sm:self-auto"
            >
              View Pricing Plans
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
