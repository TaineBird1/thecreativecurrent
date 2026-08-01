import { Appointment } from "./sections/Appointment";
import { Booking } from "./sections/Booking";
import { Faq } from "./sections/Faq";
import { useSEO } from "../../lib/seo";

export function AppointmentBooking() {
  useSEO({
    title: "Book a Consultation | The Creative Current",
    description:
      "Book a free consultation with The Creative Current to discuss your website project. Durban-based web design and management.",
  });

  return (
    <>
      <Appointment />
      <Booking />
      <Faq />
    </>
  );
}
