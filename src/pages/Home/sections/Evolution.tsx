import { Link } from "react-router-dom";
import heroWorkspace from "../../../assets/site/hero-workspace.jpeg";

export function Evolution() {
  return (
    <section className="relative min-h-[720px] w-full overflow-hidden bg-background text-foreground">
      <div className="mx-auto w-full max-w-[1440px] px-6 py-16 md:px-10 md:py-20 lg:px-16 lg:py-24">
        <div className="mb-12 flex items-center gap-4 md:mb-16">
          <span className="font-mono text-xs uppercase tracking-[0.25em] text-primary">
            01 — The Current
          </span>
          <span className="h-px max-w-[120px] flex-1 bg-gradient-to-r from-cyan-500 to-purple-600" />
        </div>

        <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-7">
            <h1 className="font-sans font-extrabold leading-[0.92] tracking-tight text-foreground text-[40px] sm:text-[80px] md:text-[100px] lg:text-[120px]">
              <span className="block">Building the</span>
              <span className="block bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text pl-[8%] text-transparent">
                digital future
              </span>
              <span className="block pl-[16%]">of your brand.</span>
            </h1>
            <p className="mt-10 max-w-[460px] font-sans text-lg leading-relaxed text-muted-foreground md:mt-12 md:text-xl">
              The Creative Current transforms your vision into high-performance web experiences,
              managed with precision and modern design.
            </p>
            <div className="mt-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8 md:mt-12">
              <Link
                to="/appointment-booking"
                className="inline-flex h-14 items-center justify-center rounded-lg bg-white px-8 font-sans text-sm font-semibold uppercase tracking-[0.15em] text-black shadow-2xl transition-colors hover:bg-white/90"
              >
                Start Your Project
              </Link>
              <Link
                to="/pricing"
                className="group inline-flex items-center gap-2 font-sans text-sm font-medium uppercase tracking-[0.15em] text-foreground"
              >
                <span className="border-b border-cyan-500 pb-1">View Pricing</span>
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
                  className="h-4 w-4 text-cyan-500 transition-transform group-hover:translate-y-0.5"
                  aria-hidden="true"
                >
                  <path d="M12 5v14" />
                  <path d="m19 12-7 7-7-7" />
                </svg>
              </Link>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="relative w-full rounded-2xl border border-white/10 bg-card p-5 shadow-2xl backdrop-blur-2xl md:p-6">
              <div className="mb-5 flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Digital Lab / Est. 2026
                </span>
                <span className="h-1.5 w-1.5 bg-purple-500" />
              </div>
              <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg">
                <img
                  src={heroWorkspace}
                  alt="Modern web design studio workspace with glowing monitors"
                  loading="eager"
                  fetchPriority="high"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              </div>
              <p className="mt-5 font-sans text-sm leading-relaxed text-muted-foreground">
                Crafting high-velocity digital experiences.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
