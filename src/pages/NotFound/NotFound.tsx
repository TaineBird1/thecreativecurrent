import { Link } from "react-router-dom";
import { useSEO } from "../../lib/seo";

export function NotFound() {
  useSEO({
    title: "Page Not Found | The Creative Current",
    description: "The page you're looking for doesn't exist.",
    noindex: true,
  });

  return (
    <section className="flex min-h-[70vh] flex-col items-center justify-center bg-background px-6 text-center text-foreground">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">404</p>
      <h1 className="mt-4 font-sans text-4xl font-bold tracking-tight text-foreground md:text-5xl">
        Page not found
      </h1>
      <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
        The page you're looking for doesn't exist or may have moved.
      </p>
      <Link
        to="/"
        className="mt-8 inline-flex h-12 items-center justify-center rounded-lg bg-primary px-7 font-sans text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Back to Home
      </Link>
    </section>
  );
}
