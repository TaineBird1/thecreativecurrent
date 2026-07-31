import { siteInfo } from "../../../data/nav";

const cards = [
  {
    label: "Direct Line",
    value: `(+27) ${siteInfo.phone.replace("+27", "").trim()}`,
    href: `tel:${siteInfo.phoneHref}`,
    bullets: ["Mon-Fri: 9am - 6pm SAT", "Priority support for active clients", "Secure encrypted voice channels"],
    icon: (
      <path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384" />
    ),
  },
  {
    label: "Digital Inbox",
    value: siteInfo.email,
    href: `mailto:${siteInfo.email}`,
    bullets: [
      "Response within 4 business hours",
      "Project briefs and partnership requests",
      "Direct access to our lead strategists",
    ],
    icon: (
      <>
        <path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7" />
        <rect x="2" y="4" width="20" height="16" rx="2" />
      </>
    ),
  },
  {
    label: "Studio HQ",
    value: "Durban, KZN",
    href: undefined,
    bullets: ["Global remote operations", "Consultations by appointment", "Virtual tours available upon request"],
    icon: (
      <>
        <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
        <circle cx="12" cy="10" r="3" />
      </>
    ),
  },
];

export function Booking() {
  return (
    <section className="bg-background px-6 pb-32 pt-[200px] text-foreground md:px-12">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-4xl text-center">
          <p className="mb-10 font-mono text-xs uppercase tracking-[0.35em] text-primary">Get In Touch</p>
          <h2 className="mb-10 font-sans text-5xl font-bold leading-[1.05] text-foreground md:text-7xl lg:text-[96px]">
            Ready to Go
          </h2>
          <p className="mx-auto max-w-2xl font-sans text-[17px] text-muted-foreground">
            We build high-performance digital experiences. Connect with our team to discuss your
            goals.
          </p>
        </div>

        <div className="mt-[100px] grid grid-cols-1 gap-6 md:grid-cols-3">
          {cards.map((card) => {
            const Wrapper = card.href ? "a" : "div";
            return (
              <Wrapper
                key={card.label}
                {...(card.href ? { href: card.href } : {})}
                className="group relative flex min-h-[420px] flex-col rounded-2xl border border-white/5 bg-card p-10 shadow-lg transition-all duration-500 hover:border-primary/50 md:p-14"
              >
                <div className="mb-12">
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
                    className="size-8 text-primary transition-transform duration-500 group-hover:rotate-[5deg]"
                    aria-hidden="true"
                  >
                    {card.icon}
                  </svg>
                </div>
                <p className="mb-6 font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
                  {card.label}
                </p>
                <p className="mb-8 break-words font-sans text-2xl font-semibold leading-snug text-foreground">
                  {card.value}
                </p>
                <div className="space-y-2 font-sans text-[13px] leading-relaxed text-muted-foreground">
                  {card.bullets.map((b) => (
                    <p key={b}>{b}</p>
                  ))}
                </div>
                <div className="mt-auto pt-10 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
                  <span className="inline-flex items-center font-mono text-xs uppercase tracking-[0.25em] text-accent">
                    Connect
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
                      className="ml-2 size-3"
                      aria-hidden="true"
                    >
                      <path d="M5 12h14" />
                      <path d="m12 5 7 7-7 7" />
                    </svg>
                  </span>
                </div>
              </Wrapper>
            );
          })}
        </div>

        <div className="mt-32 flex items-center justify-center">
          <div className="h-px flex-1 bg-white/10" />
          <div className="mx-6 size-2 rotate-45 border border-accent" />
          <div className="h-px flex-1 bg-white/10" />
        </div>
      </div>
    </section>
  );
}
