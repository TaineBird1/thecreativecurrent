import type { ReactNode } from "react";

type LegalLayoutProps = {
  title: string;
  lastUpdated: string;
  intro: string;
  children: ReactNode;
};

export function LegalLayout({ title, lastUpdated, intro, children }: LegalLayoutProps) {
  return (
    <section className="bg-background px-6 py-24 text-foreground md:py-32">
      <div className="mx-auto max-w-3xl">
        <p className="mb-4 font-mono text-xs uppercase tracking-[0.2em] text-primary">Legal</p>
        <h1 className="font-sans text-4xl font-bold tracking-tight text-foreground md:text-5xl">{title}</h1>
        <p className="mt-3 font-mono text-xs uppercase tracking-wide text-muted-foreground">
          Last updated: {lastUpdated}
        </p>
        <p className="mt-8 text-base leading-relaxed text-muted-foreground">{intro}</p>

        <div className="mt-12 space-y-10">{children}</div>
      </div>
    </section>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="font-sans text-xl font-semibold text-foreground">{heading}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-foreground/80">{children}</div>
    </div>
  );
}
