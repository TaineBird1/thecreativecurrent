import { Link } from "react-router-dom";

export function Current() {
  return (
    <section className="relative w-full overflow-hidden bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-6 py-32 md:py-40 lg:py-[200px]">
        <div className="flex flex-col items-center text-center">
          <div className="mb-12 md:mb-16" aria-hidden="true">
            <span className="font-sans text-2xl text-primary md:text-3xl">//</span>
          </div>

          <h2
            className="font-sans font-bold tracking-tighter text-foreground"
            style={{ fontSize: "clamp(3.5rem, 10vw, 7.5rem)", lineHeight: 1 }}
          >
            <span>Ignite your </span>
            <span className="relative inline-block">
              <span className="relative z-10 bg-gradient-to-r from-chart-1 via-chart-3 to-chart-4 bg-clip-text text-transparent">
                digital
              </span>
            </span>
            <span> presence.</span>
          </h2>

          <p className="mt-12 max-w-[580px] font-sans text-base leading-relaxed text-muted-foreground md:mt-16 md:text-lg">
            The Creative Current transforms your vision into high-performance digital experiences.
            We build, manage, and scale websites designed to capture attention and drive results in
            an ever-evolving digital landscape.
          </p>

          <div className="mt-12 flex flex-col items-center justify-center gap-6 sm:flex-row md:mt-14">
            <Link
              to="/contact"
              className="rounded-lg bg-primary px-8 py-4 font-sans text-sm uppercase tracking-wider text-primary-foreground shadow-xs transition-all hover:bg-primary/90 hover:shadow-glow-cyan"
            >
              Book a Consultation
            </Link>
            <Link
              to="/contact"
              className="group inline-flex items-center gap-2 font-sans text-sm uppercase tracking-wider text-foreground transition-colors hover:text-primary"
            >
              <span>View Our Services</span>
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

          <div className="mt-24 flex w-full max-w-2xl items-center justify-center gap-6 md:mt-32" aria-hidden="true">
            <span className="h-px flex-1 bg-border" />
            <span className="font-sans text-xl text-primary">+</span>
            <span className="h-px flex-1 bg-border" />
          </div>
        </div>
      </div>
    </section>
  );
}
