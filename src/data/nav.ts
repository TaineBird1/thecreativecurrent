const phoneHref = "+27614785459";

export const siteInfo = {
  name: "The Creative Current",
  email: "thecreativecurrent01@gmail.com",
  phone: "+27 61 478 5459",
  phoneHref,
  // wa.me requires international format with no "+", spaces, or leading zero.
  whatsappHref: `https://wa.me/${phoneHref.replace("+", "")}`,
  location: "Durban, KZN, South Africa",
};

export type NavLink = {
  label: string;
  to: string;
};

export const headerNavLinks: NavLink[] = [
  { label: "Appointment booking", to: "/appointment-booking" },
  { label: "Pricing", to: "/pricing" },
];

export const footerExploreLinks: NavLink[] = [
  { label: "Home", to: "/" },
  { label: "Our Services", to: "/pricing" },
  { label: "Book a Consultation", to: "/appointment-booking" },
  { label: "About Us", to: "/about-us" },
];

export const footerPracticeLinks: NavLink[] = [{ label: "Pricing", to: "/pricing" }];

export const tickerItems: string[] = [
  "WEB DESIGN",
  "DIGITAL STRATEGY",
  "MANAGEMENT",
  "MODERN SOLUTIONS",
  "THE CREATIVE CURRENT",
];
