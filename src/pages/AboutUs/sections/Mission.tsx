import { Link } from "react-router-dom";
import missionImage from "../../../assets/site/about-hero.webp";

export function Mission() {
  return (
    <section className="relative overflow-hidden bg-background px-6 py-32 text-foreground md:px-12 md:py-44">
      <div className="relative mx-auto max-w-[1600px]">
        <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-12 md:gap-8">
          <div className="relative md:col-span-7">
            <div className="mb-10 flex items-center gap-4">
              <span className="font-sans text-xs font-medium uppercase tracking-[0.18em] text-primary md:text-sm">
                § 03 / Mission
              </span>
              <div className="h-px w-10 bg-border" />
            </div>

            <div
              className="pointer-events-none absolute -left-4 -top-16 -z-0 select-none md:-left-8 md:-top-24"
              aria-hidden="true"
            >
              <span
                className="font-sans font-normal uppercase leading-none text-foreground opacity-[0.06]"
                style={{ fontSize: "clamp(18rem, 32vw, 36rem)", letterSpacing: "-0.02em" }}
              >
                03
              </span>
            </div>

            <h2
              className="relative z-10 font-sans font-normal uppercase"
              style={{ fontSize: "clamp(3rem, 8vw, 7.5rem)", lineHeight: 0.86, letterSpacing: "-0.015em" }}
            >
              <span className="text-foreground">WE DON'T </span>
              <span className="relative inline-block text-[0.85em] italic text-primary" style={{ letterSpacing: "0.01em" }}>
                build
                <span className="absolute -bottom-1 left-0 right-0 h-px rotate-[-6deg] bg-primary" aria-hidden="true" />
              </span>
              <span className="text-foreground"> WE ENGINEER DIGITAL MOMENTUM.</span>
            </h2>

            <p className="relative z-10 mt-10 max-w-xl font-sans text-base text-muted-foreground md:text-lg" style={{ lineHeight: 1.55 }}>
              The Creative Current isn't just a design agency. We are your digital engine,
              crafting high-performance websites and managing your online presence to ensure you
              stay ahead of the curve.
            </p>

            <div className="relative z-10 mt-12">
              <Link
                to="/contact"
                className="group inline-flex items-center gap-2 rounded-lg border-[1.5px] border-primary bg-transparent px-9 py-5 font-sans text-base uppercase tracking-[0.04em] text-foreground shadow-md transition-all duration-150 ease-out hover:-translate-y-1 hover:translate-x-1"
              >
                <span>Start Your Project</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-5 transition-transform duration-150 ease-out group-hover:translate-x-1"
                  aria-hidden="true"
                >
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>

          <div className="relative md:col-span-5">
            <div
              className="relative aspect-[4/5] w-full overflow-hidden rounded-lg shadow-lg md:aspect-[3/4]"
              style={{ clipPath: "polygon(0% 6%, 100% 0%, 100% 94%, 0% 100%)" }}
            >
              <img
                src={missionImage}
                alt="Modern web design interface glowing with neon gradient accents"
                loading="lazy"
                className="absolute inset-0 size-full object-cover contrast-125"
              />
              <span className="pointer-events-none absolute left-3 top-3 size-3 border-l-[1.5px] border-t-[1.5px] border-primary" aria-hidden="true" />
              <span className="pointer-events-none absolute bottom-3 right-3 size-3 border-b-[1.5px] border-r-[1.5px] border-primary" aria-hidden="true" />
            </div>
            <div className="mt-6 flex items-center gap-3">
              <span className="size-1.5 bg-primary" aria-hidden="true" />
              <span className="font-sans text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Frame 03 / Current / 24:7
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
