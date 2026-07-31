import { useState } from "react";

export type AccordionItem = {
  question: string;
  answer: string;
  bullets?: string[];
  numeral?: string;
};

export function Accordion({ items }: { items: AccordionItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="divide-y divide-white/10 border-t border-white/10">
      {items.map((item, i) => {
        const isOpen = openIndex === i;
        const panelId = `accordion-panel-${i}`;
        const buttonId = `accordion-button-${i}`;

        return (
          <div key={item.question}>
            <h3 className="flex">
              <button
                type="button"
                id={buttonId}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpenIndex(isOpen ? null : i)}
                className="flex flex-1 items-start gap-6 py-7 text-left transition-colors duration-300 hover:text-primary"
              >
                {item.numeral && (
                  <span className="w-8 shrink-0 pt-1.5 font-mono text-xs uppercase tracking-[0.2em] text-primary">
                    {item.numeral}
                  </span>
                )}
                <span className="flex-1 font-sans text-xl leading-snug text-foreground md:text-[20px]">
                  {item.question}
                </span>
                <span
                  aria-hidden="true"
                  className={`shrink-0 pt-1.5 text-primary transition-transform duration-300 ${
                    isOpen ? "rotate-45" : ""
                  }`}
                >
                  +
                </span>
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              hidden={!isOpen}
              className="pb-7 pl-14 pr-10 text-sm leading-relaxed text-muted-foreground"
            >
              <p>{item.answer}</p>
              {item.bullets && (
                <ul className="mt-3 space-y-1.5">
                  {item.bullets.map((b) => (
                    <li key={b}>— {b}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
