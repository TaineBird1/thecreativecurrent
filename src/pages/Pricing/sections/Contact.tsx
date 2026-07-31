import { useState, type FormEvent } from "react";
import { buildMailto } from "../../../lib/mailto";

export function Contact() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    service_type: "",
    message: "",
  });
  const [newsletter, setNewsletter] = useState(false);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    window.location.href = buildMailto(`Pricing inquiry from ${form.name || "website visitor"}`, {
      ...form,
      newsletter: newsletter ? "yes" : "no",
    });
  }

  return (
    <section id="pricing-get-in-touch" className="relative isolate overflow-hidden bg-background py-28 md:py-36">
      <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-24 size-[28rem] bg-chart-3 opacity-[0.1] blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -right-24 size-[32rem] bg-chart-1 opacity-[0.1] blur-3xl" />

      <div className="relative mx-auto max-w-[880px] px-5 md:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-12 md:gap-10">
          <div className="md:col-span-4">
            <div className="flex items-center gap-2 font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
              <span>§</span>
              <span>02 // Contact</span>
            </div>
            <h2 className="mt-5 font-sans font-bold leading-[1.04] tracking-[-0.02em] text-foreground" style={{ fontSize: "clamp(2.25rem, 4.6vw, 4.25rem)" }}>
              Let's <span className="italic text-chart-1">connect</span>
            </h2>
          </div>
          <div className="md:col-span-8 md:pt-2">
            <p className="font-sans leading-[1.6] text-muted-foreground" style={{ fontSize: "clamp(1.0625rem, 1.18vw, 1.25rem)" }}>
              Ready to elevate your digital presence? Reach out to The Creative Current and let's
              build something extraordinary together.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-xs text-muted-foreground">
              <span>Global Digital Agency</span>
              <span>thecreativecurrent01@gmail.com</span>
            </div>
          </div>
        </div>

        <div className="mt-12 border border-white/5 bg-card p-7 shadow-xl md:p-14">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="grid gap-2">
                <label htmlFor="p-name" className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
                  Your Name
                </label>
                <input
                  id="p-name"
                  name="name"
                  type="text"
                  required
                  minLength={2}
                  maxLength={80}
                  placeholder="Jane Doe"
                  value={form.name}
                  onChange={handleChange}
                  className="h-12 border-b-2 border-white/10 bg-black px-4 text-base text-foreground outline-none placeholder:text-muted-foreground focus:border-accent"
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="p-email" className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
                  Email Address
                </label>
                <input
                  id="p-email"
                  name="email"
                  type="email"
                  required
                  pattern="^[^\s@]+@[^\s@]+\.[^\s@]+$"
                  placeholder="jane@example.com"
                  value={form.email}
                  onChange={handleChange}
                  className="h-12 border-b-2 border-white/10 bg-black px-4 text-base text-foreground outline-none placeholder:text-muted-foreground focus:border-accent"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="grid gap-2">
                <label htmlFor="p-phone" className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
                  Phone (optional)
                </label>
                <input
                  id="p-phone"
                  name="phone"
                  type="tel"
                  pattern="^[0-9+\s()-]{7,20}$"
                  placeholder="(555) 000-0000"
                  value={form.phone}
                  onChange={handleChange}
                  className="h-12 border-b-2 border-white/10 bg-black px-4 text-base text-foreground outline-none placeholder:text-muted-foreground focus:border-accent"
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="p-service" className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
                  Project Type
                </label>
                <select
                  id="p-service"
                  name="service_type"
                  required
                  value={form.service_type}
                  onChange={handleChange}
                  className="h-12 border-b-2 border-white/10 bg-black px-4 text-base text-foreground outline-none focus:border-accent"
                >
                  <option value="" className="bg-black">Select a service</option>
                  <option value="Web Design" className="bg-black">Web Design</option>
                  <option value="Site Management" className="bg-black">Site Management</option>
                  <option value="Consultation" className="bg-black">Consultation</option>
                  <option value="Other" className="bg-black">Other</option>
                </select>
              </div>
            </div>

            <div className="grid gap-2">
              <label htmlFor="p-message" className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
                Project Details
              </label>
              <textarea
                id="p-message"
                name="message"
                rows={6}
                placeholder="Tell us about your vision..."
                value={form.message}
                onChange={handleChange}
                className="min-h-40 border-b-2 border-white/10 bg-black px-4 py-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus:border-accent"
              />
            </div>

            <label className="flex flex-row items-center gap-3">
              <input
                type="checkbox"
                checked={newsletter}
                onChange={(e) => setNewsletter(e.target.checked)}
                className="size-5 rounded-md border border-white/20 bg-black accent-primary"
              />
              <span className="cursor-pointer text-sm font-normal text-foreground">
                Subscribe to our digital insights newsletter
              </span>
            </label>

            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-chart-1 to-chart-4 py-6 font-mono text-sm uppercase tracking-[0.14em] text-black shadow-lg transition-all hover:opacity-90"
            >
              Send Request
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-4"
                aria-hidden="true"
              >
                <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
                <path d="m21.854 2.147-10.94 10.939" />
              </svg>
            </button>
          </form>
        </div>

        <p className="mt-6 text-center font-mono text-xs italic text-muted-foreground">
          Your data is secure and handled with care.
        </p>
      </div>
    </section>
  );
}
