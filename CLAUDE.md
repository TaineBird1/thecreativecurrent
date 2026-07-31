# The Creative Current — Project Context (CLAUDE.md)

## Business

The Creative Current — a web design and management agency based in Durban, KZN, South Africa.

- Email: thecreativecurrent01@gmail.com
- Phone: +27 61 478 5459
- Location: Durban, KZN, South Africa
- Live site (source of truth for this rebuild): https://thecreativecurrent.co.za/

## Tech Stack

- Frontend: React 19 + TypeScript, Tailwind CSS 4 (CSS-first `@theme` config, no `tailwind.config.js`)
- Routing: react-router-dom (`BrowserRouter`)
- No backend, no CMS. This is a **static clone** of the live WordPress/10Web site's design, copy, and images. There is no WooCommerce, no WordPress forms — everything is a static React SPA.

## How this project came to be

The original live site runs on WordPress + WooCommerce (via 10Web), with an AI-generated "digital lab" design system (giant staggered gradient headlines, numbered/roman-numeral sections, a console-style intake form, a "Tony" chat widget). This project is a from-scratch React+Tailwind rebuild that matches that live site's actual content, copy, and layout as closely as reasonably achievable — built by inspecting the live DOM/computed styles directly (not from a spec doc). All real copy, pricing, and images were pulled from the live site with the user's permission.

## Architecture

- `src/data/nav.ts` — hardcoded nav links (header only shows Appointment Booking + Pricing, matching live site), footer link groups, site contact info, ticker items
- `src/lib/mailto.ts` — builds a `mailto:` link from form field data — no backend, forms open the user's email client with a pre-filled subject/body
- `src/components/WvcLogo.tsx` — renders the user-supplied logo image (`src/assets/logo.jpg`, a circular neon "C" design) — this intentionally **replaces** the live site's own inline SVG monogram logo, per explicit user instruction
- `src/components/Accordion.tsx` — shared accordion (supports roman numerals + bullet lists) used by all 3 FAQ sections
- `src/components/TonyWidget.tsx` — floating chat widget with canned quick-reply buttons (Website Design/Pricing/Time Frames/FAQs/Get Quote), matching the live site's "Tony AI Assistant" — this is scripted/canned responses, not a real LLM backend (the live site's version isn't either)
- `src/hooks/useInViewport.ts` — IntersectionObserver hook for scroll-reveal effects (Process timeline, etc.)
- Sections are composed per page (`src/pages/<Page>/sections/*.tsx`), with `Header` and `Footer` shared from `src/reusable_sections/`
- Real product photos/renders live in `src/assets/site/` (downloaded from the live site with user permission)

## File Structure

```
src/
├── pages/
│   ├── Home/sections/
│   │   ├── Evolution.tsx          # "01 — The Current" hero, staggered gradient headline, photo card
│   │   ├── Expertise.tsx          # "Our Core Services" — 6 staggered numbered cards w/ real images
│   │   ├── Process.tsx            # "Our Workflow" — 6-step alternating timeline, roman numerals I-VI
│   │   ├── Current.tsx            # "Ignite your digital presence" CTA, chart-1/3/4 gradient text
│   │   ├── Contact.tsx            # console-style "TCC.INTAKE" form + Process Next Steps sidebar
│   │   ├── Calendarbooking.tsx    # "03 — Connect" bg-image CTA section
│   │   └── FeaturedServices.tsx   # "Our Expertise" — real WooCommerce-empty-state message
│   ├── AppointmentBooking/sections/
│   │   ├── Appointment.tsx        # split-screen hero, "Digital Growth" headline
│   │   ├── Booking.tsx            # Direct Line / Digital Inbox / Studio HQ cards
│   │   └── Faq.tsx                # 7-item accordion, roman numerals I-VII (real answers)
│   ├── Pricing/sections/
│   │   ├── Pricing.tsx            # REAL tiers: Basic R6,000 / Advanced R8,000 / Premium R15,000 + monthly retainers
│   │   ├── Faq.tsx                # 11-item, 4-category accordion (roman numerals I.-XI.)
│   │   └── Contact.tsx            # "Let's connect" form w/ newsletter checkbox
│   ├── Contact/sections/
│   │   ├── Hero.tsx               # "№ 01 — Vision" giant stacked headline, circled "ambition"
│   │   ├── Inquiry.tsx            # 4-step form: Service (card select) → Schedule → Details → Confirm
│   │   └── SubmissionSuccessConfirmation.tsx
│   └── AboutUs/sections/
│       ├── AboutHero.tsx          # giant letter-by-letter "The Creative Current", filter tabs
│       └── Mission.tsx            # "WE DON'T BUILD WE ENGINEER..." giant "03" watermark section
├── reusable_sections/
│   ├── Header.tsx     # h-24 header, user's logo + "Digital · Lab" wordmark, solid-cyan ticker bar
│   └── Footer.tsx     # Explore/Practice/Connect columns + TonyWidget
├── index.css           # Tailwind v4 @theme design tokens
└── App.tsx             # BrowserRouter + routes
```

## Design System

**Colors (dark mode):**

| Token | Value |
|---|---|
| Background | `#000000` |
| Foreground | `hsl(0 0% 95%)` |
| Primary | `#00D9FF` (cyan) — matches live site's confirmed `rgb(0,217,255)` button color |
| Accent | `#D946EF` (magenta) |
| Muted-foreground | `#9a9a9a` |
| Card | `#0c0c0c` |
| Border | `#262626` |
| Chart-1 / Chart-3 / Chart-4 | cyan / pink / orange — used together as a gradient (`Current.tsx` "digital" text) |

**Typography:** Inter (sans, substituted for "Google Sans" — confirmed via the live site's own stylesheet that no real Google Sans font file is ever served, it silently falls back), Georgia (serif), JetBrains Mono (monospace, used for all-caps mono labels/eyebrows)

**Motifs consistent across pages:** numbered eyebrows (`01 —`, `§ 03 /`), roman numerals in FAQs, uppercase wide-tracking labels, giant clamp()-sized headlines, gradient cyan→purple accent text, corner-bracket decorated image cards.

## Hard Constraints — do not violate

**Allowed:** Tailwind utilities only, CSS variables/theme tokens from `src/index.css`, existing component props/hooks.

**Not allowed:** custom CSS classes/`*.module.css` files, `@apply` with custom selectors, new fonts outside Inter/Georgia/JetBrains Mono.

## Forms

All 3 forms build a `mailto:thecreativecurrent01@gmail.com` link via `src/lib/mailto.ts` — no backend.

1. Home `Contact.tsx` (`get_in_touch_form_home` equivalent) — name, email, phone, service_type, start_date, description
2. Pricing `Contact.tsx` (`get_in_touch_form_pricing` equivalent) — name, email, phone, service_type, message, newsletter
3. Contact `Inquiry.tsx` (`appointment_form_appointment_booking` equivalent, 4-step) — service, preferred_date, name, email, phone, company_name, project_details

Validation: name/email/phone/service/description required where applicable; email/phone pattern-validated; name 2–80 chars. The live site's "Project Files" upload field is rendered but disabled — file attachments aren't possible through a `mailto:` link, so it just tells the user to mention files in their brief instead.

## Fixed vs. the live site (intentional deviations)

The live site has a few real bugs/placeholders that were fixed rather than copied verbatim (per explicit user decision):
- Footer email `href` (`mailto:hello@creativecurrent.com`) → fixed to the real `thecreativecurrent01@gmail.com`
- Footer phone `href` (`tel:5551234567`) → fixed to the real `+27 61 478 5459`
- Dead social icons (LinkedIn/Substack linking to `#`) → removed, kept only the real Instagram link
- Appointment Booking contact cards had no `href` at all (decorative-only) → made them real `tel:`/`mailto:` links
- Pricing tier CTA buttons had no `href` → linked to the pricing page's own contact form anchor
- The "still curious? email us" FAQ link pointed back to its own page → fixed to a real `mailto:` link
- Footer Privacy/Terms/Accessibility linked to `#` (no real pages exist) → rendered as plain non-clickable text instead of dead links

## Explicitly deprioritized (documented, not silently dropped)

- Decorative background flourishes on Contact page hero (hand-drawn botanical SVG, wavy bottom divider) and the diagonal rotated line overlays on the About Us Mission section — skipped for scope, the core layout/copy/imagery is intact
- Per-word staggered slide-up reveal on the submission-success heading — simplified to a single fade-up
- True scroll-linked parallax on hero images — approximated with a simpler treatment

## Current Status

All 5 pages (Home, Appointment Booking, Pricing, Contact, About Us) rebuilt to match the live site's real content, copy, pricing, and images. `npx tsc --noEmit` and `npm run build` both pass clean. All images verified loading (no 404s). Page text content cross-checked directly against the live site for each route.
