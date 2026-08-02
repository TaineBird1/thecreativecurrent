import { useState, type FormEvent } from "react";
import { siteInfo } from "../../../data/nav";
import { useLeadSubmit } from "../../../hooks/useLeadSubmit";

const nextSteps = [
  {
    number: "01",
    title: "Human-led review",
    description: "We don't use automated bots. Your project brief is reviewed by our lead designers.",
  },
  {
    number: "02",
    title: "Discovery call",
    description: "We'll reach out to schedule a 30-minute deep dive into your goals and requirements.",
  },
  {
    number: "03",
    title: "Custom proposal",
    description: "Receive a tailored strategy and quote within 3 business days of our initial call.",
  },
];

export function Contact() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    service_type: "",
    start_date: "",
    description: "",
    honeypot: "",
  });
  const { submit, isSubmitting, error, success } = useLeadSubmit();

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await submit({ source: "home", ...form });
  }

  return (
    <section id="get-in-touch" className="relative overflow-hidden bg-black py-24 text-white md:py-36">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 select-none font-sans font-bold leading-none tracking-tight opacity-[0.03]"
        style={{ fontSize: "clamp(12rem, 28vw, 22rem)" }}
      >
        01
      </div>

      <div className="relative mx-auto max-w-[1360px] px-4 sm:px-6 md:px-12">
        <div className="mx-auto mb-16 max-w-[720px] text-center md:mb-20">
          <div className="mb-6 flex items-center justify-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-gray-500">
            <span>TCC.INTAKE</span>
            <span className="inline-block h-2 w-2 bg-cyan-400" />
            <span>Get In Touch</span>
          </div>
          <h2
            className="font-sans font-bold uppercase leading-[0.94] tracking-tight text-white"
            style={{ fontSize: "clamp(2.25rem, 5.4vw, 4.75rem)" }}
          >
            Start your{" "}
            <span className="inline-block bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text px-1 text-transparent">
              digital
            </span>{" "}
            transformation.
          </h2>
          <p className="mx-auto mt-6 max-w-xl font-sans text-base text-gray-400 md:text-lg">
            Ready to elevate your online presence? Fill out the form below and let's build
            something extraordinary.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-7">
            <div className="relative border-[3px] border-white/10 bg-black">
              <span className="absolute left-2.5 top-2.5 z-10 h-1.5 w-1.5 rounded-md bg-white/20" />
              <span className="absolute right-2.5 top-2.5 z-10 h-1.5 w-1.5 rounded-md bg-white/20" />
              <span className="absolute bottom-2.5 left-2.5 z-10 h-1.5 w-1.5 rounded-md bg-white/20" />
              <span className="absolute bottom-2.5 right-2.5 z-10 h-1.5 w-1.5 rounded-md bg-white/20" />

              <div className="flex items-center justify-between gap-3 border-b-2 border-white/10 bg-white/5 px-4 py-3 md:px-6">
                <div className="truncate font-mono text-[0.65rem] uppercase tracking-[0.18em] text-gray-400 md:text-xs">
                  TCC-INTAKE-001{" "}
                  <span className="mx-2 inline-block h-1.5 w-1.5 align-middle bg-white/20" />
                  THE CREATIVE CURRENT{" "}
                  <span className="mx-2 hidden h-1.5 w-1.5 align-middle bg-white/20 md:inline-block" />
                  <span className="hidden md:inline">DIGITAL LAB</span>
                </div>
                <div className="shrink-0 bg-gradient-to-r from-cyan-500 to-purple-600 px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-white md:text-xs">
                  ACTIVE
                </div>
              </div>

              {success ? (
                <div className="space-y-2 p-10 text-center md:p-14">
                  <p className="font-sans text-xl font-semibold text-white">Message received.</p>
                  <p className="font-sans text-sm text-gray-400">
                    Thanks — we'll be in touch within 24 hours.
                  </p>
                </div>
              ) : (
              <form onSubmit={handleSubmit} className="space-y-6 p-6 md:p-8">
                <input
                  type="text"
                  name="honeypot"
                  value={form.honeypot}
                  onChange={handleChange}
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  className="absolute left-[-9999px] h-0 w-0 opacity-0"
                />
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className="grid gap-2">
                    <label htmlFor="home-name" className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-gray-500">
                      Full Name
                    </label>
                    <input
                      id="home-name"
                      name="name"
                      type="text"
                      required
                      minLength={2}
                      maxLength={80}
                      placeholder="Jane Smith"
                      value={form.name}
                      onChange={handleChange}
                      className="h-11 border-0 border-b-2 border-white/20 bg-transparent px-0 text-white outline-none placeholder:text-white/30 focus:border-b-[3px] focus:border-cyan-400"
                    />
                  </div>
                  <div className="grid gap-2">
                    <label htmlFor="home-email" className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-gray-500">
                      Email Address
                    </label>
                    <input
                      id="home-email"
                      name="email"
                      type="email"
                      required
                      pattern="^[^\s@]+@[^\s@]+\.[^\s@]+$"
                      placeholder="jane@company.com"
                      value={form.email}
                      onChange={handleChange}
                      className="h-11 border-0 border-b-2 border-white/20 bg-transparent px-0 text-white outline-none placeholder:text-white/30 focus:border-b-[3px] focus:border-cyan-400"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className="grid gap-2">
                    <label htmlFor="home-phone" className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-gray-500">
                      Phone Number
                    </label>
                    <input
                      id="home-phone"
                      name="phone"
                      type="tel"
                      required
                      pattern="^[0-9+\s()-]{7,20}$"
                      placeholder="(555) 000-0000"
                      value={form.phone}
                      onChange={handleChange}
                      className="h-11 border-0 border-b-2 border-white/20 bg-transparent px-0 text-white outline-none placeholder:text-white/30 focus:border-b-[3px] focus:border-cyan-400"
                    />
                    <p className="mt-1 font-mono text-[0.65rem] uppercase tracking-wider text-gray-600">
                      For project discovery calls.
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <label htmlFor="home-service" className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-gray-500">
                      Service Required
                    </label>
                    <select
                      id="home-service"
                      name="service_type"
                      required
                      value={form.service_type}
                      onChange={handleChange}
                      className="h-11 border-0 border-b-2 border-white/20 bg-transparent px-0 text-white outline-none focus:border-b-[3px] focus:border-cyan-400"
                    >
                      <option value="" className="bg-black">Select a service</option>
                      <option value="Web Design" className="bg-black">Web Design</option>
                      <option value="Web Management" className="bg-black">Web Management</option>
                      <option value="SEO Optimization" className="bg-black">SEO Optimization</option>
                      <option value="Consultation" className="bg-black">Consultation</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className="grid gap-2">
                    <label htmlFor="home-date" className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-gray-500">
                      Target Start Date
                    </label>
                    <input
                      id="home-date"
                      name="start_date"
                      type="date"
                      value={form.start_date}
                      onChange={handleChange}
                      className="h-11 border-0 border-b-2 border-white/20 bg-transparent px-0 text-white outline-none focus:border-b-[3px] focus:border-cyan-400"
                    />
                    <p className="mt-1 font-mono text-[0.65rem] uppercase tracking-wider text-gray-600">
                      Optional timeline.
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-gray-500">
                      Project Files (Optional)
                    </span>
                    <input
                      type="file"
                      disabled
                      title="File attachments aren't supported without a backend — mention your files in the brief below instead."
                      className="h-11 border-0 border-b-2 border-white/20 bg-transparent px-0 text-white/40 outline-none file:mr-3 file:border-0 file:bg-white/10 file:px-2 file:py-1 file:font-mono file:text-xs file:uppercase file:tracking-wider file:text-white"
                    />
                    <p className="mt-1 font-mono text-[0.65rem] uppercase tracking-wider text-gray-600">
                      Mention files in your brief — attachments need email direct.
                    </p>
                  </div>
                </div>

                <div className="grid gap-2">
                  <label htmlFor="home-brief" className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-gray-500">
                    Project Brief
                  </label>
                  <textarea
                    id="home-brief"
                    name="description"
                    required
                    rows={6}
                    placeholder="Tell us about your vision..."
                    value={form.description}
                    onChange={handleChange}
                    className="min-h-[140px] resize-none border-0 border-b-2 border-white/20 bg-transparent px-0 py-2 text-white outline-none placeholder:text-white/30 focus:border-b-[3px] focus:border-cyan-400"
                  />
                </div>

                {error && (
                  <p className="font-mono text-xs text-red-400" role="alert">
                    {error}
                  </p>
                )}

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-purple-600 px-7 py-4 font-sans text-sm font-bold uppercase tracking-[0.06em] text-white transition-all duration-150 hover:shadow-[0_0_20px_rgba(168,85,247,0.4)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSubmitting ? "Sending..." : "Submit Request"}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="ml-2 size-4"
                      aria-hidden="true"
                    >
                      <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
                      <path d="m21.854 2.147-10.94 10.939" />
                    </svg>
                  </button>
                </div>
              </form>
              )}

              <div className="border-t-2 border-white/10 bg-white/5 px-4 py-3 md:px-6">
                <div className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-gray-400 md:text-xs">
                  <span className="mr-2 inline-block h-1.5 w-1.5 align-middle bg-cyan-400" /> Required
                  fields marked
                  <span className="mx-3 inline-block h-1.5 w-1.5 align-middle bg-white/20" /> Response
                  within 24 hours
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-5 lg:col-span-5">
            <div className="border-b-2 border-white/10 pb-3 font-mono text-[0.7rem] uppercase tracking-[0.18em] text-gray-500">
              Process <span className="mx-2 inline-block h-1.5 w-1.5 align-middle bg-cyan-400" /> Next Steps
            </div>

            {nextSteps.map((step) => (
              <div
                key={step.number}
                className="group relative border-[1.5px] border-white/10 bg-black p-6 transition-all duration-200 hover:border-cyan-400/50"
              >
                <div className="flex items-start gap-4">
                  <div className="flex size-12 shrink-0 items-center justify-center border border-white/10 bg-white/5 font-sans text-2xl font-bold text-white">
                    {step.number}
                  </div>
                  <div className="flex-1 pt-1">
                    <h3 className="mb-2 font-sans text-base font-bold uppercase leading-tight tracking-tight text-white md:text-lg">
                      {step.title}
                    </h3>
                    <p className="font-sans text-sm leading-relaxed text-gray-400">{step.description}</p>
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 h-[3px] w-0 bg-gradient-to-r from-cyan-400 to-purple-500 transition-all duration-300 group-hover:w-full" />
              </div>
            ))}

            <div className="relative mt-6 border-2 border-white/10 bg-white/5 p-6 text-white">
              <span className="absolute left-2 top-2 h-1.5 w-1.5 rounded-md bg-cyan-400" />
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-md bg-purple-500" />
              <span className="absolute bottom-2 left-2 h-1.5 w-1.5 rounded-md bg-purple-500" />
              <span className="absolute bottom-2 right-2 h-1.5 w-1.5 rounded-md bg-cyan-400" />
              <div className="mb-3 font-mono text-[0.7rem] uppercase tracking-[0.18em] text-gray-400">
                Direct Contact
              </div>
              <div className="space-y-1.5">
                <div className="font-mono text-sm tracking-wider">{siteInfo.email}</div>
                <div className="font-mono text-sm tracking-wider">{siteInfo.phone}</div>
                <div className="pt-2 font-mono text-xs uppercase tracking-[0.12em] text-gray-500">
                  Mon-Fri <span className="mx-1.5 inline-block h-1 w-1 align-middle bg-cyan-400" /> 9am - 6pm
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        aria-hidden="true"
        className="absolute bottom-0 left-0 right-0 h-3.5 opacity-90"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, rgb(0,212,255) 0px, rgb(0,212,255) 12px, rgb(153,51,255) 12px, rgb(153,51,255) 24px)",
        }}
      />
    </section>
  );
}
