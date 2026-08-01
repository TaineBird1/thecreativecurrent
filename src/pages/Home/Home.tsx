import { Evolution } from "./sections/Evolution";
import { Expertise } from "./sections/Expertise";
import { Process } from "./sections/Process";
import { Current } from "./sections/Current";
import { Contact } from "./sections/Contact";
import { Calendarbooking } from "./sections/Calendarbooking";
import { FeaturedServices } from "./sections/FeaturedServices";
import { useSEO } from "../../lib/seo";

export function Home() {
  useSEO({
    title: "The Creative Current — Web Design & Management, Durban",
    description:
      "The Creative Current builds and manages websites for Durban businesses — web design, hosting, and ongoing support so you never have to think about your website again.",
  });

  return (
    <>
      <Evolution />
      <Expertise />
      <Process />
      <Current />
      <Contact />
      <Calendarbooking />
      <FeaturedServices />
    </>
  );
}
