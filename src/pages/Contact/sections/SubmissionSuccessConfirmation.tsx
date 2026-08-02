import { Link } from "react-router-dom";
import { siteInfo } from "../../../data/nav";

export function SubmissionSuccessConfirmation() {
  return (
    <section className="relative flex min-h-[80vh] flex-col justify-center overflow-hidden bg-background px-6 py-24 text-foreground md:px-10 md:py-32 lg:px-16">
      <div className="mx-auto grid w-full max-w-[1400px] grid-cols-12 gap-6">
        <div className="col-span-12 mb-16 flex items-center gap-4 md:col-span-7 md:col-start-2 md:mb-24">
          <div className="h-px flex-1 bg-border" />
          <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground md:text-xs">
            <span className="mr-2 text-chart-1">/ 05</span>status update
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <div className="col-span-12 md:col-span-7 md:col-start-2">
          <h1
            className="mb-0 font-sans font-light leading-[1.02] tracking-tight text-foreground animate-fade-up"
            style={{ fontSize: "clamp(2rem, 8vw, 7rem)" }}
          >
            <span className="block">Message received. We're</span>
            <span className="block">
              building your <span className="italic text-chart-1">vision.</span>
            </span>
          </h1>
          <p className="mt-10 max-w-xl font-sans text-base leading-relaxed text-muted-foreground md:mt-14 md:text-lg">
            Thank you for reaching out to The Creative Current. Our team is reviewing your
            project details and will contact you within 24 hours.
          </p>
          <div className="mt-10 flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:gap-8 md:mt-12">
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-lg bg-primary px-8 py-4 font-sans text-sm tracking-wide text-primary-foreground shadow-lg transition-colors hover:bg-primary/90"
            >
              Return Home
            </Link>
            <Link to="/pricing" className="group inline-flex items-center font-sans text-sm tracking-wide text-foreground">
              <span className="border-b border-foreground/40 pb-1 transition-colors group-hover:border-foreground">
                View Our Services
              </span>
            </Link>
          </div>
        </div>

        <div className="col-span-12 mt-12 flex md:col-span-3 md:col-start-10 md:mt-0 md:items-center">
          <div className="w-full">
            <div className="mb-6 h-px w-full bg-border" />
            <div className="space-y-5 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              <div>
                <div className="mb-1.5 text-[9px] text-chart-1/80">Studio</div>
                <div className="normal-case tracking-wide text-foreground/90">Creative Current HQ</div>
                <div className="mt-5 h-px w-full bg-border" />
              </div>
              <div>
                <div className="mb-1.5 text-[9px] text-chart-1/80">Support</div>
                <div className="normal-case tracking-wide text-foreground/90">{siteInfo.email}</div>
                <div className="mt-5 h-px w-full bg-border" />
              </div>
              <div>
                <div className="mb-1.5 text-[9px] text-chart-1/80">Status</div>
                <div className="normal-case tracking-wide text-foreground/90">Request Received</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
