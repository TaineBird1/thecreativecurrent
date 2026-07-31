import { Pricing as PricingSection } from "./sections/Pricing";
import { Faq } from "./sections/Faq";
import { Contact } from "./sections/Contact";

export function Pricing() {
  return (
    <>
      <PricingSection />
      <Faq />
      <Contact />
    </>
  );
}
