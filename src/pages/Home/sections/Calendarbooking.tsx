import { Link } from "react-router-dom";
import calendarBg from "../../../assets/site/calendarbooking-bg.webp";

export function Calendarbooking() {
  return (
    <section className="relative w-full overflow-hidden bg-background text-foreground">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${calendarBg})` }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.7) 50%, rgba(0,0,0,0.85) 100%)",
        }}
      />

      <div className="relative z-10 mx-auto flex max-w-[800px] flex-col items-center px-6 py-32 text-center md:py-44 lg:py-[180px]">
        <div className="mb-12 md:mb-16">
          <span className="font-mono text-xs uppercase tracking-[0.25em] text-primary">03 — Connect</span>
        </div>

        <h2
          className="font-sans font-bold leading-[0.95] tracking-tight text-foreground"
          style={{ fontSize: "clamp(3.5rem, 10vw, 8.75rem)" }}
        >
          Start your
          <span className="inline-flex items-center px-3 align-middle md:px-5">
            <span
              className="inline-block h-[1px] bg-gradient-to-r from-cyan-400 to-purple-500"
              style={{ width: "clamp(2.5rem, 6vw, 5rem)", transform: "rotate(-20deg)" }}
            />
          </span>
          evolution.
        </h2>

        <p className="mt-10 max-w-[560px] font-sans text-base leading-relaxed text-muted-foreground md:text-xl">
          Every digital project begins with a discovery call. Tell us about your vision, your
          goals, and your brand identity — we will provide a tailored strategy within 24 hours.
        </p>

        <div className="mt-12 flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
          <Link
            to="/appointment-booking"
            className="group inline-flex items-center gap-2 rounded-lg bg-primary px-8 py-4 font-sans text-base font-bold text-primary-foreground shadow-lg transition-all duration-300 hover:bg-primary/90"
          >
            Book Your Strategy Session
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
              className="ml-1 size-4 transition-transform duration-300 group-hover:translate-x-1"
              aria-hidden="true"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </Link>
          <Link
            to="/pricing"
            className="group inline-flex items-center gap-2 border-b border-muted-foreground/40 pb-1 font-sans text-sm font-bold tracking-wide text-foreground transition-colors hover:border-foreground"
          >
            View Pricing
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
              className="size-4 transition-transform duration-300 group-hover:translate-x-1"
              aria-hidden="true"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </Link>
        </div>

        <p className="mt-16 font-sans text-[11px] uppercase tracking-[0.2em] text-muted-foreground md:text-xs">
          Fast Response — 24 Hours / Global Digital Agency
        </p>
      </div>
    </section>
  );
}
