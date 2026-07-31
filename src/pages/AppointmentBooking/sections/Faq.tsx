import { Accordion, type AccordionItem } from "../../../components/Accordion";

const faqItems: AccordionItem[] = [
  {
    numeral: "I",
    question: "How do we begin our web development project?",
    answer:
      "We start with a discovery phase to understand your brand identity and technical requirements. This ensures our design strategy aligns perfectly with your business goals.",
    bullets: [
      "Initial discovery call to define project scope",
      "Strategic roadmap creation and milestone planning",
      "Complimentary audit of your current digital presence",
    ],
  },
  {
    numeral: "II",
    question: "How is your data and intellectual property secured?",
    answer:
      "Security is foundational to our workflow. We utilize encrypted development environments and strict access controls to ensure your proprietary information remains protected throughout the build.",
    bullets: [
      "End-to-end encrypted communication channels",
      "Secure cloud-based staging environments",
      "Strict internal access protocols for all team members",
    ],
  },
  {
    numeral: "III",
    question: "What assets should I provide before we start?",
    answer:
      "To accelerate the development process, we recommend gathering your brand guidelines, high-resolution imagery, and any existing content you wish to migrate to the new platform.",
    bullets: [
      "Brand style guides, logos, and color palettes",
      "High-quality photography and graphic assets",
      "Existing website content and functional requirements",
    ],
  },
  {
    numeral: "IV",
    question: "When do we sign a non-disclosure agreement?",
    answer:
      "We prioritize your privacy. A standard mutual non-disclosure agreement is available for signature before we discuss any sensitive technical details or business strategies.",
    bullets: [
      "Mutual NDA provided upon request",
      "Customized terms for enterprise-level partnerships",
      "Digital signature process for rapid execution",
    ],
  },
  {
    numeral: "V",
    question: "What is included in the initial consultation?",
    answer:
      "Our initial consultation is a collaborative session where we assess your current digital challenges, explore design possibilities, and outline a clear path toward your new website.",
    bullets: [
      "Comprehensive digital performance assessment",
      "Strategic design and technology recommendations",
      "Detailed project timeline and investment overview",
    ],
  },
  {
    numeral: "VI",
    question: "Do you support clients outside of the local area?",
    answer:
      "The Creative Current operates as a global digital agency. We manage remote projects for clients across various time zones, ensuring seamless communication and delivery.",
    bullets: [
      "Remote-first project management workflows",
      "Global collaboration tools for real-time updates",
      "Experience working with international brands",
    ],
  },
  {
    numeral: "VII",
    question: "Can you handle urgent website updates or launches?",
    answer:
      "We understand that digital needs can be time-sensitive. We offer expedited development services for urgent launches, subject to current capacity and project complexity.",
    bullets: [
      "Priority development tracks for urgent launches",
      "Rapid deployment of critical site updates",
      "After-hours support for time-sensitive releases",
    ],
  },
];

export function Faq() {
  return (
    <section className="bg-black px-6 py-24 text-white md:px-10 md:py-32 lg:px-16 lg:py-[120px]">
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-24">
              <p className="mb-8 font-mono text-xs uppercase tracking-[0.25em] text-primary">
                — Frequently Asked
              </p>
              <h2 className="mb-8 font-sans text-4xl leading-[1.05] tracking-tight text-white md:text-5xl">
                Before You
                <br />
                <em className="font-light not-italic italic">Start Your Build.</em>
              </h2>
              <p className="mb-10 max-w-md font-sans text-base leading-relaxed text-gray-400">
                A clear overview of the questions most frequently raised by clients preparing to
                partner with The Creative Current. Should further clarification be required, our
                team is ready to assist.
              </p>
              <a
                href={`mailto:thecreativecurrent01@gmail.com`}
                className="inline-flex items-center gap-2 border-b border-primary pb-1 font-mono text-xs uppercase tracking-[0.2em] text-primary transition-colors duration-300 hover:opacity-80"
              >
                Still curious? Email us
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
                  className="size-3.5"
                  aria-hidden="true"
                >
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </a>
            </div>
          </div>

          <div className="lg:col-span-7">
            <Accordion items={faqItems} />
          </div>
        </div>
      </div>
    </section>
  );
}
