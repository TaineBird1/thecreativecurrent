import { Accordion, type AccordionItem } from "../../../components/Accordion";

const categories: { title: string; items: AccordionItem[] }[] = [
  {
    title: "Web Development",
    items: [
      {
        numeral: "I.",
        question: "How do you approach the web development process?",
        answer:
          "We follow a rigorous, agile methodology. Every project begins with a deep-dive discovery phase to map your business goals, followed by iterative design sprints, clean-code development, and comprehensive performance testing to ensure your site is fast, secure, and scalable.",
      },
      {
        numeral: "II.",
        question: "Do you provide ongoing website management?",
        answer:
          "Yes. We offer comprehensive maintenance packages that include security monitoring, performance optimization, regular content updates, and technical support to ensure your digital presence remains current and effective.",
      },
      {
        numeral: "III.",
        question: "What technologies do you specialize in?",
        answer:
          "Our stack is built for modern performance. We specialize in React, Next.js, and Tailwind CSS for high-speed, responsive front-end experiences, paired with robust headless CMS solutions to give you full control over your content.",
      },
    ],
  },
  {
    title: "Strategy & Growth",
    items: [
      {
        numeral: "IV.",
        question: "How do you ensure my site ranks well?",
        answer:
          "SEO is baked into our development process from day one. We focus on semantic HTML, lightning-fast load times, mobile-first responsiveness, and structured data implementation to ensure search engines can easily crawl and index your content.",
      },
      {
        numeral: "V.",
        question: "What if I need to scale my website later?",
        answer:
          "Our architecture is modular by design. Whether you need to add e-commerce functionality, integrate third-party APIs, or expand your content library, our systems are built to grow alongside your business without requiring a complete rebuild.",
      },
    ],
  },
  {
    title: "Project Timeline",
    items: [
      {
        numeral: "VI.",
        question: "How long does a typical project take?",
        answer:
          "A standard custom website project typically spans six to twelve weeks. This includes discovery, design, development, and quality assurance. We provide a detailed project roadmap at the start so you know exactly what to expect at every milestone.",
      },
      {
        numeral: "VII.",
        question: "Can you expedite a project?",
        answer:
          "We prioritize quality and stability, but we understand that business needs can be urgent. We offer accelerated timelines for specific projects when capacity allows, ensuring we never compromise on the integrity of your site's performance.",
      },
      {
        numeral: "VIII.",
        question: "How do we communicate during the build?",
        answer:
          "Transparency is key. You will have access to a dedicated project dashboard where you can track progress, review design iterations, and provide feedback in real-time. We also hold weekly sync meetings to keep everyone aligned.",
      },
    ],
  },
  {
    title: "Commercial",
    items: [
      {
        numeral: "IX.",
        question: "How is pricing structured?",
        answer:
          "We provide transparent, fixed-fee proposals based on the scope of your project. After an initial consultation, we outline all deliverables, timelines, and costs so there are no surprises. We believe in clear value for every investment.",
      },
      {
        numeral: "X.",
        question: "Do you offer payment plans?",
        answer:
          "For larger projects, we offer a milestone-based payment schedule. This typically includes an initial deposit to secure your spot, followed by payments at key delivery stages. We are happy to discuss flexible arrangements for long-term partnerships.",
      },
      {
        numeral: "XI.",
        question: "What is your support guarantee?",
        answer:
          "Every site we build comes with a 90-day post-launch support period to ensure everything runs perfectly. We stand by our code and are committed to your long-term success as a digital partner.",
      },
    ],
  },
];

export function Faq() {
  return (
    <section className="bg-black px-6 py-24 text-white md:px-10 md:py-32 lg:px-16">
      <div className="mx-auto max-w-4xl">
        <div className="mb-16 text-center md:mb-20">
          <p className="mb-6 font-mono text-xs uppercase tracking-[0.25em] text-primary">— Frequently Asked</p>
          <h2 className="font-sans text-4xl font-bold leading-[1.05] tracking-tight text-white md:text-5xl">
            Questions, <span className="italic text-primary">answered</span> with clarity.
          </h2>
          <p className="mx-auto mt-6 max-w-2xl font-sans text-base leading-relaxed text-gray-400">
            Common inquiries regarding our development process, management services, and project
            timelines. If you have a specific question not covered here, our team is ready to
            assist.
          </p>
        </div>

        <div className="space-y-12">
          {categories.map((category) => (
            <div key={category.title}>
              <h3 className="mb-2 font-mono text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                {category.title}
              </h3>
              <Accordion items={category.items} />
            </div>
          ))}
        </div>

        <div className="mt-16 text-center">
          <p className="mb-4 font-sans text-lg text-gray-400">Still have questions?</p>
          <a
            href="#pricing-get-in-touch"
            className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-primary transition-colors hover:opacity-80"
          >
            Contact Our Team →
          </a>
        </div>
      </div>
    </section>
  );
}
