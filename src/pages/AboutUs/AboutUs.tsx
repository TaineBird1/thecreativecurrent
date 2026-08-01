import { AboutHero } from "./sections/AboutHero";
import { Mission } from "./sections/Mission";
import { useSEO } from "../../lib/seo";

export function AboutUs() {
  useSEO({
    title: "About Us | The Creative Current",
    description:
      "Meet The Creative Current — a Durban-based web design and management agency helping local businesses grow online.",
  });

  return (
    <>
      <AboutHero />
      <Mission />
    </>
  );
}
