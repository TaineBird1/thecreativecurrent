import { Link } from "react-router-dom";
import serviceWebDesign from "../../../assets/site/service-web-design.webp";
import serviceManagement from "../../../assets/site/service-management.webp";
import serviceStrategy from "../../../assets/site/service-strategy.webp";
import serviceDevelopment from "../../../assets/site/service-development.webp";
import serviceBranding from "../../../assets/site/service-branding.webp";
import serviceSupport from "../../../assets/site/service-support.webp";

const services = [
  {
    number: "01",
    category: "Web Design",
    title: "Custom UI/UX",
    tags: "Responsive · Intuitive · High-Conversion",
    image: serviceWebDesign,
    aspect: "aspect-[4/5]",
    tint: "rgba(0, 212, 255, 0.08)",
    position: "lg:col-start-1 lg:col-end-6 lg:mt-0",
  },
  {
    number: "02",
    category: "Management",
    title: "Site Maintenance",
    tags: "Security · Updates · Performance",
    image: serviceManagement,
    aspect: "aspect-[3/4]",
    tint: "rgba(153, 51, 255, 0.08)",
    position: "lg:col-start-7 lg:col-end-11 lg:mt-32",
  },
  {
    number: "03",
    category: "Strategy",
    title: "Digital Growth",
    tags: "SEO · Analytics · Strategy",
    image: serviceStrategy,
    aspect: "aspect-[4/5]",
    tint: "rgba(255, 153, 51, 0.08)",
    position: "lg:col-start-2 lg:col-end-7 lg:mt-20",
  },
  {
    number: "04",
    category: "Development",
    title: "Full-Stack Dev",
    tags: "Scalable · Robust · Modern",
    image: serviceDevelopment,
    aspect: "aspect-[3/4]",
    tint: "rgba(255, 102, 51, 0.08)",
    position: "lg:col-start-8 lg:col-end-13 lg:-mt-16",
  },
  {
    number: "05",
    category: "Branding",
    title: "Visual Identity",
    tags: "Logo · Assets · Style",
    image: serviceBranding,
    aspect: "aspect-[4/5]",
    tint: "rgba(255, 102, 204, 0.08)",
    position: "lg:col-start-1 lg:col-end-5 lg:mt-24",
  },
  {
    number: "06",
    category: "Support",
    title: "Client Success",
    tags: "Consulting · Training · Support",
    image: serviceSupport,
    aspect: "aspect-[3/4]",
    tint: "rgba(0, 255, 255, 0.08)",
    position: "lg:col-start-7 lg:col-end-12 lg:mt-8",
  },
];

export function Expertise() {
  return (
    <section className="relative overflow-hidden bg-background px-6 py-24 text-foreground md:px-12 md:py-32 lg:px-20">
      <div className="mb-20 grid grid-cols-1 gap-8 lg:mb-28 lg:grid-cols-12 lg:gap-12">
        <div className="flex flex-col justify-between lg:col-span-5">
          <span className="mb-6 block font-mono text-xs uppercase tracking-[0.25em] text-primary">
            Our Core Services
          </span>
          <h2 className="font-sans text-5xl font-bold leading-[1.05] tracking-tight text-foreground md:text-6xl lg:text-[60px]">
            The current <em className="font-normal italic text-primary">expertise</em>
          </h2>
        </div>
        <div className="flex flex-col justify-end lg:col-span-7 lg:pl-12">
          <p className="mb-6 max-w-xl font-sans text-base leading-relaxed text-muted-foreground md:text-lg">
            We build and manage high-performance digital experiences. From initial design to
            ongoing maintenance, we ensure your business stays ahead in the current digital
            landscape.
          </p>
          <div className="flex justify-end">
            <Link
              to="/pricing"
              className="group inline-flex items-center gap-2 font-sans text-[12px] uppercase tracking-[0.16em] text-foreground transition-colors duration-300 hover:text-primary"
            >
              View Pricing
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
        </div>
      </div>

      <div className="grid grid-cols-1 gap-x-6 gap-y-16 md:grid-cols-2 lg:grid-cols-12 lg:gap-x-8">
        {services.map((service) => (
          <div key={service.number} className={`group ${service.position}`}>
            <article
              className="relative rounded-2xl border border-white/5 p-5 transition-all duration-700 ease-out group-hover:-translate-y-1.5 md:p-6"
              style={{ backgroundColor: service.tint }}
            >
              <div className={`relative overflow-hidden rounded-xl bg-white/5 ${service.aspect}`}>
                <img
                  src={service.image}
                  alt={service.title}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                />
              </div>
              <div className="mt-6 flex items-center gap-2 font-sans text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                <span className="tabular-nums">{service.number}</span>
                <span aria-hidden="true">·</span>
                <span>{service.category}</span>
              </div>
              <h3 className="relative mt-3 inline-block font-sans text-2xl font-semibold leading-tight text-foreground md:text-[32px]">
                <span className="relative">
                  {service.title}
                  <span className="absolute -bottom-1 left-0 h-px w-0 bg-foreground transition-all duration-500 ease-out group-hover:w-full" />
                </span>
              </h3>
              <p className="mt-2 font-sans text-sm italic text-muted-foreground">{service.tags}</p>
              <div className="mt-6 flex justify-end">
                <span
                  className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-transform duration-300 group-hover:-rotate-12"
                  aria-hidden="true"
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
                  >
                    <path d="M7 7h10v10" />
                    <path d="M7 17 17 7" />
                  </svg>
                </span>
              </div>
            </article>
          </div>
        ))}
      </div>
    </section>
  );
}
