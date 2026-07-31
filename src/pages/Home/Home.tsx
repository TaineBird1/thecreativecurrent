import { Evolution } from "./sections/Evolution";
import { Expertise } from "./sections/Expertise";
import { Process } from "./sections/Process";
import { Current } from "./sections/Current";
import { Contact } from "./sections/Contact";
import { Calendarbooking } from "./sections/Calendarbooking";
import { FeaturedServices } from "./sections/FeaturedServices";

export function Home() {
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
