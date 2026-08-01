import { Link } from "react-router-dom";
import { WvcLogo } from "../components/WvcLogo";
import { TonyWidget } from "../components/TonyWidget";
import { footerExploreLinks, footerPracticeLinks, siteInfo } from "../data/nav";

export function Footer() {
  return (
    <footer className="relative overflow-hidden bg-black text-white">
      <div className="relative mx-auto max-w-7xl px-6 pt-24 pb-12 md:px-10">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-12 md:gap-10">
          <div className="space-y-6 md:col-span-4">
            <Link to="/" className="inline-block">
              <WvcLogo className="h-10 w-10 rounded-full" />
            </Link>
            <p className="max-w-sm font-serif text-[18px] italic leading-relaxed text-white/85">
              Building digital experiences that flow with the current of modern innovation.
            </p>
            <p className="text-[11px] uppercase tracking-[0.18em] text-white/60">
              Web Design · Digital Management
            </p>
          </div>

          <div className="space-y-5 md:col-span-2">
            <h2 className="font-sans text-[12px] uppercase tracking-[0.2em] text-white">Explore</h2>
            <ul className="space-y-3">
              {footerExploreLinks.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="text-[14px] text-white/85 transition-colors duration-300 hover:text-primary"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-5 md:col-span-2">
            <h2 className="font-sans text-[12px] uppercase tracking-[0.2em] text-white">Practice</h2>
            <ul className="space-y-3">
              {footerPracticeLinks.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="text-[14px] text-white/85 transition-colors duration-300 hover:text-primary"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-5 md:col-span-4">
            <h2 className="font-sans text-[12px] uppercase tracking-[0.2em] text-white">Connect</h2>
            <ul className="space-y-3 text-[14px] text-white/85">
              <li className="flex items-start gap-3">
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
                  className="mt-0.5 size-4 shrink-0 text-white/60"
                  aria-hidden="true"
                >
                  <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <span>{siteInfo.location}</span>
              </li>
              <li className="flex items-start gap-3">
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
                  className="mt-0.5 size-4 shrink-0 text-white/60"
                  aria-hidden="true"
                >
                  <path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7" />
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                </svg>
                <a href={`mailto:${siteInfo.email}`} className="transition-colors duration-300 hover:text-primary">
                  {siteInfo.email}
                </a>
              </li>
              <li className="flex items-start gap-3">
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
                  className="mt-0.5 size-4 shrink-0 text-white/60"
                  aria-hidden="true"
                >
                  <path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384" />
                </svg>
                <a href={`tel:${siteInfo.phoneHref}`} className="transition-colors duration-300 hover:text-primary">
                  {siteInfo.phone}
                </a>
              </li>
            </ul>
            <div className="flex items-center gap-3 pt-2">
              <a
                href="https://www.instagram.com/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="inline-flex size-10 items-center justify-center rounded-lg border border-white/25 text-white transition-all duration-300 hover:border-accent hover:bg-accent"
              >
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
                  <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                  <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
                </svg>
              </a>
            </div>
          </div>
        </div>

        <div className="mt-16 mb-8 h-px w-full bg-white/15" />

        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <p className="text-[13px] text-white/65">
            © {new Date().getFullYear()} {siteInfo.name} · All rights reserved
          </p>
          <ul className="flex flex-wrap items-center gap-6">
            <li>
              <Link to="/privacy" className="text-[13px] text-white/65 transition-colors duration-300 hover:text-primary">
                Privacy
              </Link>
            </li>
            <li>
              <Link to="/terms" className="text-[13px] text-white/65 transition-colors duration-300 hover:text-primary">
                Terms
              </Link>
            </li>
            <li>
              <span className="text-[13px] text-white/40">Accessibility</span>
            </li>
          </ul>
        </div>

        <p className="mt-12 text-center font-serif text-[16px] italic text-white/90">Stay current.</p>
      </div>

      <TonyWidget />
    </footer>
  );
}
