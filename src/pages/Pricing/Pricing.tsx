import { Pricing as PricingSection } from "./sections/Pricing";
import { Faq } from "./sections/Faq";
import { Contact } from "./sections/Contact";
import { useSEO } from "../../lib/seo";

export function Pricing() {
  useSEO({
    title: "Pricing — Web Design Packages | The Creative Current",
    description:
      "Transparent web design pricing for Durban businesses, from R6,000. Compare our packages and find the right fit for your business.",
  });

  return (
    <>
      <PricingSection />
      <Faq />
      <Contact />
    </>
  );
}
