import { useState } from "react";
import { Link, NavLink as RouterNavLink } from "react-router-dom";
import { WvcLogo } from "../components/WvcLogo";
import { headerNavLinks, tickerItems } from "../data/nav";

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const tickerText = tickerItems.join("  ·  ") + "  ·  ";

  return (
    <header className="sticky top-0 left-0 right-0 z-50 w-full border-b border-border bg-background text-foreground">
      <div className="mx-auto flex h-24 w-full max-w-[1400px] items-center justify-between gap-6 px-5 md:px-8 lg:grid lg:grid-cols-[1fr_auto_1fr]">
        <div className="flex items-center justify-start">
          <Link to="/" className="group flex flex-col leading-none" onClick={() => setMenuOpen(false)}>
            <WvcLogo className="h-9 w-9 rounded-full" />
            <span className="mt-1.5 font-mono text-[12px] font-medium uppercase tracking-[0.15em] text-primary">
              Digital · Lab
            </span>
          </Link>
        </div>

        <nav className="hidden items-center justify-center lg:flex">
          <ul className="flex flex-1 list-none items-center justify-center gap-6 lg:gap-8">
            {headerNavLinks.map((link) => (
              <li key={link.to} className="relative">
                <RouterNavLink
                  to={link.to}
                  className={({ isActive }) =>
                    `group relative font-sans text-[12px] font-medium uppercase tracking-[0.15em] transition-colors duration-200 ${
                      isActive ? "text-primary" : "text-foreground"
                    }`
                  }
                >
                  <span className="relative">
                    {link.label}
                    <span className="absolute -bottom-1 left-0 h-px w-0 bg-primary transition-all duration-300 group-hover:w-full" />
                  </span>
                </RouterNavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center justify-end gap-5">
          <span className="hidden font-mono text-[10px] font-medium uppercase tracking-[0.25em] text-muted-foreground xl:inline-block">
            Est. 2024
          </span>
          <Link
            to="/#get-in-touch"
            className="hidden h-11 items-center justify-center rounded-lg bg-primary px-6 font-sans text-[11px] font-bold uppercase tracking-[0.18em] text-primary-foreground shadow-lg transition-colors hover:bg-primary/90 md:inline-flex"
          >
            Enquire Now
          </Link>
          <button
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-border text-foreground lg:hidden"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="flex flex-col items-center justify-center gap-1.5">
              <span
                className={`block h-0.5 w-5 bg-foreground transition-transform duration-300 ${
                  menuOpen ? "translate-y-2 rotate-45" : ""
                }`}
              />
              <span
                className={`block h-0.5 w-5 bg-foreground transition-opacity duration-300 ${
                  menuOpen ? "opacity-0" : ""
                }`}
              />
              <span
                className={`block h-0.5 w-5 bg-foreground transition-transform duration-300 ${
                  menuOpen ? "-translate-y-2 -rotate-45" : ""
                }`}
              />
            </span>
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="flex flex-col gap-1 border-t border-border px-5 py-4 lg:hidden">
          {headerNavLinks.map((link) => (
            <RouterNavLink
              key={link.to}
              to={link.to}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 font-sans text-[12px] font-medium uppercase tracking-[0.15em] ${
                  isActive ? "bg-primary/10 text-primary" : "text-foreground hover:bg-white/5"
                }`
              }
            >
              {link.label}
            </RouterNavLink>
          ))}
          <Link
            to="/#get-in-touch"
            onClick={() => setMenuOpen(false)}
            className="mt-2 rounded-lg bg-primary px-3 py-2.5 text-center font-sans text-[11px] font-bold uppercase tracking-[0.18em] text-primary-foreground"
          >
            Enquire Now
          </Link>
        </nav>
      )}

      <div className="relative h-6 w-full overflow-hidden border-t border-border bg-primary">
        <div className="flex h-full w-max items-center whitespace-nowrap animate-ticker">
          <span className="inline-block px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-primary-foreground">
            {tickerText}
            {tickerText}
            {tickerText}
          </span>
          <span className="inline-block px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-primary-foreground">
            {tickerText}
            {tickerText}
            {tickerText}
          </span>
        </div>
      </div>
    </header>
  );
}
