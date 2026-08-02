import { useInViewport } from "../../../hooks/useInViewport";
import processDiscovery from "../../../assets/site/process-discovery.webp";
import processVisualStrategy from "../../../assets/site/process-visual-strategy.webp";
import processDevelopment from "../../../assets/site/process-development.webp";
import processContent from "../../../assets/site/process-content.webp";
import processQa from "../../../assets/site/process-qa.webp";
import processLaunch from "../../../assets/site/process-launch.webp";

const stages = [
  {
    numeral: "I",
    title: "Discovery Phase",
    tagline: "Defining your digital goals",
    description:
      "We start by diving deep into your brand identity, target audience, and business objectives to ensure every line of code serves your growth.",
    duration: "Avg. 1–2 weeks",
    image: processDiscovery,
    alt: "Strategic planning session for web development",
  },
  {
    numeral: "II",
    title: "Visual Strategy",
    tagline: "Crafting the aesthetic",
    description:
      "Our designers translate your vision into high-fidelity wireframes and mood boards, establishing a unique visual language that resonates with your users.",
    duration: "Avg. 2–3 weeks",
    image: processVisualStrategy,
    alt: "Modern web design mood board and UI concepts",
  },
  {
    numeral: "III",
    title: "Development",
    tagline: "Building the foundation",
    description:
      "We engineer robust, scalable websites using modern frameworks, ensuring lightning-fast performance and seamless responsiveness across all devices.",
    duration: "Avg. 3–5 weeks",
    image: processDevelopment,
    alt: "Clean code editor and responsive web development",
  },
  {
    numeral: "IV",
    title: "Content Integration",
    tagline: "Refining the narrative",
    description:
      "We curate and optimize your digital assets, ensuring your messaging is clear, compelling, and perfectly aligned with your brand's voice.",
    duration: "Avg. 4–6 weeks",
    image: processContent,
    alt: "Content management and digital asset optimization",
  },
  {
    numeral: "V",
    title: "Quality Assurance",
    tagline: "Testing for perfection",
    description:
      "Before launch, we conduct rigorous testing to ensure every interaction is flawless, secure, and optimized for the best possible user experience.",
    duration: "Avg. 2–4 weeks",
    image: processQa,
    alt: "Performance testing and quality assurance dashboard",
  },
  {
    numeral: "VI",
    title: "Launch & Growth",
    tagline: "Going live with impact",
    description:
      "We deploy your site and provide ongoing management, ensuring your digital presence remains current, secure, and ready to scale with your business.",
    duration: "Avg. 1 week",
    image: processLaunch,
    alt: "Successful website launch and growth analytics",
  },
];

function Step({ stage, index }: { stage: (typeof stages)[number]; index: number }) {
  const { ref, inView } = useInViewport<HTMLDivElement>(0.15);
  const reversed = index % 2 === 1;

  return (
    <div
      ref={ref}
      className={`relative transition-all duration-1000 ${
        inView ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"
      }`}
    >
      {/* Mobile layout */}
      <div className="relative pl-20 md:hidden">
        <div className="absolute left-0 top-0 flex h-16 w-16 -translate-x-4 items-center justify-center rounded-lg border border-border bg-card shadow-lg">
          <span className="font-sans text-2xl font-bold text-primary">{stage.numeral}</span>
        </div>
        <div className="space-y-4">
          <div>
            <h3 className="font-sans text-3xl font-semibold leading-tight text-foreground">{stage.title}</h3>
            <p className="mt-1 font-sans text-lg italic text-primary">{stage.tagline}</p>
          </div>
          <div className="w-full overflow-hidden rounded-lg border border-border shadow-md">
            <img src={stage.image} alt={stage.alt} loading="lazy" className="aspect-[4/3] w-full object-cover" />
          </div>
          <p className="font-sans leading-relaxed text-muted-foreground">{stage.description}</p>
          <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            <span>{stage.duration}</span>
          </div>
        </div>
      </div>

      {/* Desktop layout */}
      <div className="hidden md:grid md:grid-cols-2 md:items-center md:gap-12">
        {!reversed ? (
          <>
            <div className="relative flex items-start justify-end gap-6 pr-12">
              <div className="max-w-md space-y-3 text-right">
                <h3 className="font-sans text-4xl font-semibold leading-tight text-foreground lg:text-5xl">
                  {stage.title}
                </h3>
                <p className="font-sans text-xl italic text-primary">{stage.tagline}</p>
                <p className="font-sans leading-relaxed text-muted-foreground">{stage.description}</p>
              </div>
              <div className="absolute right-0 top-2 z-10 flex h-[60px] w-[60px] translate-x-1/2 items-center justify-center rounded-lg border border-border bg-card shadow-xl">
                <span className="font-sans text-2xl font-bold text-primary">{stage.numeral}</span>
              </div>
            </div>
            <div className="pl-12">
              <div className="w-[320px] overflow-hidden rounded-lg border border-border shadow-2xl">
                <img src={stage.image} alt={stage.alt} loading="lazy" className="aspect-[4/3] w-full object-cover" />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex justify-end pr-12">
              <div className="w-[320px] overflow-hidden rounded-lg border border-border shadow-2xl">
                <img src={stage.image} alt={stage.alt} loading="lazy" className="aspect-[4/3] w-full object-cover" />
              </div>
            </div>
            <div className="relative flex items-start gap-6 pl-12">
              <div className="absolute left-0 top-2 z-10 flex h-[60px] w-[60px] -translate-x-1/2 items-center justify-center rounded-lg border border-border bg-card shadow-xl">
                <span className="font-sans text-2xl font-bold text-primary">{stage.numeral}</span>
              </div>
              <div className="max-w-md space-y-3">
                <h3 className="font-sans text-4xl font-semibold leading-tight text-foreground lg:text-5xl">
                  {stage.title}
                </h3>
                <p className="font-sans text-xl italic text-primary">{stage.tagline}</p>
                <p className="font-sans leading-relaxed text-muted-foreground">{stage.description}</p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function Process() {
  return (
    <section className="overflow-hidden bg-background px-6 py-24 text-foreground md:px-12 md:py-[180px]">
      <div className="mx-auto max-w-7xl">
        <div className="mb-20 max-w-4xl md:mb-32">
          <div className="mb-8 flex items-center gap-3">
            <span className="h-px w-8 bg-primary" />
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-primary">Our Workflow</span>
          </div>
          <h2 className="font-sans text-4xl font-bold leading-[1.05] text-foreground md:text-6xl lg:text-7xl">
            From initial concept
            <br />
            <span className="italic text-muted-foreground">to digital reality.</span>
          </h2>
        </div>

        <div className="relative">
          <div className="absolute bottom-0 left-8 top-0 hidden w-px bg-gradient-to-b from-chart-1 to-chart-4 md:left-1/2 md:block md:-translate-x-1/2" />
          <div className="space-y-24 md:space-y-32">
            {stages.map((stage, i) => (
              <Step key={stage.numeral} stage={stage} index={i} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
