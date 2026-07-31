import { Link } from "react-router-dom";

export function FeaturedServices() {
  return (
    <section className="bg-background py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <div className="mb-14 flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.25em] text-primary">
              Our Expertise
            </p>
            <h2 className="mt-5 font-sans text-5xl font-semibold leading-[1.05] tracking-tight text-foreground md:text-6xl">
              Digital Solutions
            </h2>
            <div className="mt-6 h-px w-16 bg-primary" />
            <p className="mt-6 max-w-xl font-sans text-base leading-relaxed text-muted-foreground">
              Professional web design, management, and optimization services tailored to elevate
              your brand and drive measurable results.
            </p>
          </div>
          <Link to="/pricing" className="hidden lg:inline-flex">
            <span className="group inline-flex items-center gap-2 rounded-lg border border-primary bg-transparent px-4 py-2 font-mono text-xs font-semibold uppercase tracking-widest text-foreground transition-colors hover:bg-primary hover:text-primary-foreground">
              View All Services
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
                className="ml-1 size-3.5 transition-transform group-hover:translate-x-1"
                aria-hidden="true"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </span>
          </Link>
        </div>

        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <p className="font-sans text-base text-muted-foreground">
            No services available at the moment. Check back soon for updates.
          </p>
        </div>

        <div className="mt-12 flex justify-center lg:hidden">
          <Link to="/pricing">
            <span className="group inline-flex items-center gap-2 rounded-lg border border-primary bg-transparent px-4 py-2 font-mono text-xs font-semibold uppercase tracking-widest text-foreground transition-colors hover:bg-primary hover:text-primary-foreground">
              View All Services
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
                className="ml-1 size-3.5 transition-transform group-hover:translate-x-1"
                aria-hidden="true"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}
