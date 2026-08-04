const tiers = [
  {
    name: "Basic",
    audience: "For new ventures",
    price: "R4000",
    terms: "Once off fee with a monthly retainer of R1000",
    features: [
      "Get your website up and running",
      "Basic SEO optimization",
      "Contact form integration",
      "Mobile-first design",
      "One month of support",
    ],
    cta: "Get Started",
    featured: false,
  },
  {
    name: "Advanced",
    audience: "For scaling brands",
    price: "R8000",
    terms: "Once off fee with a month retainer fee of R3000",
    features: [
      "Full website development",
      "Custom Landing Page",
      "Content management system",
      "Performance optimization",
      "Social media integration",
      "Three months of maintenance",
      "Priority email support",
    ],
    cta: "Scale Your Presence",
    featured: true,
  },
  {
    name: "Premium",
    audience: "For established brands",
    price: "R12000",
    terms: "Once off fee with monthly retainer of R5000 a month",
    features: [
      "Bespoke web architecture",
      "Unlimited page templates",
      "Content management",
      "Enterprise security suite",
      "Ongoing strategic growth",
      "24/7 priority assistance",
    ],
    cta: "Contact Sales",
    featured: false,
  },
];

export function Pricing() {
  return (
    <section className="bg-background px-6 py-24 text-foreground md:px-10 md:py-32 lg:px-16 lg:py-40">
      <div className="mx-auto max-w-3xl text-center">
        <p className="mb-6 font-mono text-xs uppercase tracking-[0.25em] text-primary">— Investment</p>
        <h2 className="font-sans text-4xl font-bold leading-[1.05] tracking-tight text-foreground md:text-5xl lg:text-6xl">
          Digital solutions. <span className="italic text-primary">Modern impact.</span>
        </h2>
      </div>

      <div className="mt-20 grid grid-cols-1 gap-8 md:mt-24 lg:grid-cols-12 lg:gap-6">
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className={`relative lg:col-span-4 ${tier.featured ? "lg:-translate-y-10" : ""}`}
          >
            <div className="relative flex h-full flex-col rounded-lg border border-border/40 bg-card p-8 shadow-lg md:p-10">
              {tier.featured && (
                <span className="absolute -top-3 right-6 rounded-lg bg-primary px-3 py-1 font-sans text-[0.65rem] uppercase tracking-[0.18em] text-primary-foreground shadow-sm">
                  Most Popular
                </span>
              )}
              <div className="mb-2">
                <h3 className="font-sans text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                  {tier.name}
                </h3>
                <p className="mt-3 font-sans text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">
                  {tier.audience}
                </p>
              </div>
              <div className="mt-8 flex items-baseline gap-1">
                <span className="font-sans text-5xl font-bold italic tracking-tight text-foreground md:text-6xl">
                  {tier.price}
                </span>
              </div>
              <p className="mt-2 font-sans text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {tier.terms}
              </p>
              <div className="my-8 h-px w-full bg-border" />
              <ul className="flex-1 space-y-4">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <span className="font-sans text-lg leading-snug text-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-10">
                <a
                  href="#pricing-get-in-touch"
                  className={`flex h-12 w-full items-center justify-center rounded-lg px-6 font-sans text-xs uppercase tracking-[0.2em] transition-colors ${
                    tier.featured
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "border border-primary/30 bg-transparent text-foreground hover:bg-primary hover:text-primary-foreground"
                  }`}
                >
                  {tier.cta}
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-12 flex justify-center">
        <a
          href="#pricing-get-in-touch"
          className="inline-flex h-12 items-center justify-center rounded-lg bg-primary px-8 font-sans text-xs uppercase tracking-[0.2em] text-primary-foreground hover:bg-primary/90"
        >
          Find My Package
        </a>
      </div>

      <p className="mx-auto mt-20 max-w-2xl text-center font-sans text-base italic text-muted-foreground md:mt-24 md:text-lg">
        All packages include a complimentary strategy session to align with your business goals.
      </p>
    </section>
  );
}
