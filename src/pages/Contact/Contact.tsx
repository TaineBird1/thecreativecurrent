import { Hero } from "./sections/Hero";
import { Inquiry } from "./sections/Inquiry";
import { useSEO } from "../../lib/seo";

export function Contact() {
  useSEO({
    title: "Contact Us | The Creative Current",
    description:
      "Get in touch with The Creative Current for a new website, a redesign, or ongoing website management in Durban, KZN.",
  });

  return (
    <>
      <Hero />
      <Inquiry />
    </>
  );
}
