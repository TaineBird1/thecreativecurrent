import { useState, type FormEvent } from "react";
import { useLeadSubmit } from "../../../hooks/useLeadSubmit";
import { SubmissionSuccessConfirmation } from "./SubmissionSuccessConfirmation";
import type { LeadSource } from "../../../lib/leads";

const steps = ["Service", "Schedule", "Details", "Confirm"];

const services = [
  {
    value: "Custom Web Design",
    title: "Custom Web Design",
    description: "Bespoke, high-performance websites tailored to your brand identity.",
    icon: (
      <>
        <rect width="20" height="14" x="2" y="3" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </>
    ),
  },
  {
    value: "Site Management",
    title: "Site Management",
    description: "Ongoing maintenance, security updates, and performance optimization.",
    icon: (
      <>
        <path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" />
        <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
      </>
    ),
  },
  {
    value: "Strategy Session",
    title: "Strategy Session",
    description: "Private consultation to map out your digital growth roadmap.",
    icon: (
      <>
        <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
        <path d="M14 2v4a2 2 0 0 0 2 2h4M10 9H8M16 13H8M16 17H8" />
      </>
    ),
  },
];

type FormState = {
  service: string;
  preferred_date: string;
  name: string;
  email: string;
  phone: string;
  company_name: string;
  project_details: string;
  honeypot: string;
};

const initialState: FormState = {
  service: "",
  preferred_date: "",
  name: "",
  email: "",
  phone: "",
  company_name: "",
  project_details: "",
  honeypot: "",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9+\s()-]{7,20}$/;

export function Inquiry({ source = "contact" }: { source?: LeadSource }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(initialState);
  const { submit, isSubmitting, error, success } = useLeadSubmit();

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  const step0Valid = form.service.trim().length > 0;
  const step2Valid =
    form.name.trim().length >= 2 &&
    form.name.trim().length <= 80 &&
    EMAIL_PATTERN.test(form.email) &&
    PHONE_PATTERN.test(form.phone) &&
    form.project_details.trim().length > 0;

  const stepValid = [step0Valid, true, step2Valid, true];

  function goNext() {
    if (stepValid[step]) setStep((s) => Math.min(s + 1, steps.length - 1));
  }

  function goBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!step0Valid || !step2Valid) return;
    await submit({
      source,
      name: form.name,
      email: form.email,
      phone: form.phone,
      company_name: form.company_name,
      project_details: form.project_details,
      preferred_date: form.preferred_date,
      service_type: form.service,
      honeypot: form.honeypot,
    });
  }

  if (success) {
    return <SubmissionSuccessConfirmation />;
  }

  return (
    <section className="bg-background px-6 pb-40 pt-24 text-foreground">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <div className="mb-6 font-sans text-[11px] uppercase tracking-widest text-primary">Get Started</div>
          <h1 className="font-sans text-4xl leading-[1.05] tracking-tight text-foreground md:text-6xl">
            Let's build your digital future
          </h1>
          <p className="mt-6 leading-relaxed text-muted-foreground">
            A simple four-step process to start your project. Our team will review your request
            and reach out within one business day.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mx-auto max-w-3xl space-y-6">
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
          <div className="mx-auto mb-16 flex w-full max-w-2xl items-center justify-between">
            {steps.map((label, i) => (
              <div key={label} className="flex flex-1 items-center last:flex-none">
                <div className="flex shrink-0 flex-col items-center gap-3">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-lg font-sans text-xs transition-colors duration-300 ${
                      i <= step
                        ? "bg-primary text-primary-foreground shadow-lg"
                        : "border border-border bg-transparent text-muted-foreground"
                    }`}
                  >
                    {i + 1}
                  </div>
                  <div className="text-center">
                    <div className={`font-sans text-[10px] tracking-widest ${i <= step ? "text-primary" : "text-muted-foreground"}`}>
                      0{i + 1}
                    </div>
                    <div className={`mt-1 font-sans text-sm ${i <= step ? "text-foreground" : "text-muted-foreground"}`}>
                      {label}
                    </div>
                  </div>
                </div>
                {i < steps.length - 1 && (
                  <div className={`mx-2 mt-[-28px] h-px flex-1 transition-colors duration-300 sm:mx-4 ${i < step ? "bg-primary" : "bg-border"}`} />
                )}
              </div>
            ))}
          </div>

          <div className="relative min-h-[420px]">
            {step === 0 && (
              <div>
                <h2 className="mb-2 font-sans text-3xl tracking-tight text-foreground md:text-5xl">
                  What are you looking for?
                </h2>
                <p className="mb-10 text-muted-foreground">
                  Select the service that aligns with your digital goals. We'll handle the rest.
                </p>
                <div className="space-y-4">
                  {services.map((service) => {
                    const selected = form.service === service.value;
                    return (
                      <button
                        type="button"
                        key={service.value}
                        onClick={() => setForm((prev) => ({ ...prev, service: service.value }))}
                        className={`w-full cursor-pointer rounded-lg border-l-2 p-8 text-left transition-all duration-300 ${
                          selected ? "border-l-primary bg-card" : "border-l-transparent bg-card/40 hover:bg-card/60"
                        }`}
                      >
                        <div className="flex items-start gap-6">
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
                            className={`size-6 shrink-0 ${selected ? "text-primary" : "text-muted-foreground"}`}
                            aria-hidden="true"
                          >
                            {service.icon}
                          </svg>
                          <div className="min-w-0 flex-1">
                            <h3 className="font-sans text-xl font-semibold text-foreground md:text-2xl">
                              {service.title}
                            </h3>
                            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                              {service.description}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 1 && (
              <div>
                <h2 className="mb-2 font-sans text-3xl tracking-tight text-foreground md:text-5xl">
                  When works best?
                </h2>
                <p className="mb-10 text-muted-foreground">
                  Give us a rough target date — this just helps us plan, it's not a hard deadline.
                </p>
                <div className="grid gap-2">
                  <label htmlFor="c-date" className="font-sans text-sm text-muted-foreground">
                    Target start date
                  </label>
                  <input
                    id="c-date"
                    name="preferred_date"
                    type="date"
                    value={form.preferred_date}
                    onChange={handleChange}
                    className="h-12 rounded-lg border border-border bg-card px-4 text-foreground outline-none focus:border-primary"
                  />
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                <h2 className="mb-2 font-sans text-3xl tracking-tight text-foreground md:text-5xl">
                  Tell us about you
                </h2>
                <p className="mb-10 text-muted-foreground">
                  Your details so we can reach out and get the conversation started.
                </p>
                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <label htmlFor="c-name" className="font-sans text-sm text-muted-foreground">Name</label>
                    <input
                      id="c-name"
                      name="name"
                      type="text"
                      required
                      minLength={2}
                      maxLength={80}
                      value={form.name}
                      onChange={handleChange}
                      className="h-12 rounded-lg border border-border bg-card px-4 text-foreground outline-none focus:border-primary"
                    />
                  </div>
                  <div className="grid gap-2">
                    <label htmlFor="c-email" className="font-sans text-sm text-muted-foreground">Email</label>
                    <input
                      id="c-email"
                      name="email"
                      type="email"
                      required
                      pattern={EMAIL_PATTERN.source}
                      value={form.email}
                      onChange={handleChange}
                      className="h-12 rounded-lg border border-border bg-card px-4 text-foreground outline-none focus:border-primary"
                    />
                  </div>
                  <div className="grid gap-2">
                    <label htmlFor="c-phone" className="font-sans text-sm text-muted-foreground">Phone</label>
                    <input
                      id="c-phone"
                      name="phone"
                      type="tel"
                      required
                      pattern={PHONE_PATTERN.source}
                      value={form.phone}
                      onChange={handleChange}
                      className="h-12 rounded-lg border border-border bg-card px-4 text-foreground outline-none focus:border-primary"
                    />
                  </div>
                  <div className="grid gap-2">
                    <label htmlFor="c-company" className="font-sans text-sm text-muted-foreground">Company (optional)</label>
                    <input
                      id="c-company"
                      name="company_name"
                      type="text"
                      value={form.company_name}
                      onChange={handleChange}
                      className="h-12 rounded-lg border border-border bg-card px-4 text-foreground outline-none focus:border-primary"
                    />
                  </div>
                </div>
                <div className="mt-6 grid gap-2">
                  <label htmlFor="c-details" className="font-sans text-sm text-muted-foreground">Project details</label>
                  <textarea
                    id="c-details"
                    name="project_details"
                    required
                    rows={5}
                    value={form.project_details}
                    onChange={handleChange}
                    className="resize-none rounded-lg border border-border bg-card px-4 py-3 text-foreground outline-none focus:border-primary"
                  />
                </div>
              </div>
            )}

            {step === 3 && (
              <div>
                <h2 className="mb-2 font-sans text-3xl tracking-tight text-foreground md:text-5xl">
                  Review &amp; confirm
                </h2>
                <p className="mb-10 text-muted-foreground">
                  Take a last look before you send it through.
                </p>
                <div className="space-y-3 rounded-lg border border-border bg-card p-8 text-sm">
                  <p><span className="text-muted-foreground">Service:</span> {form.service}</p>
                  {form.preferred_date && <p><span className="text-muted-foreground">Target date:</span> {form.preferred_date}</p>}
                  <p><span className="text-muted-foreground">Name:</span> {form.name}</p>
                  <p><span className="text-muted-foreground">Email:</span> {form.email}</p>
                  <p><span className="text-muted-foreground">Phone:</span> {form.phone}</p>
                  {form.company_name && <p><span className="text-muted-foreground">Company:</span> {form.company_name}</p>}
                  <p><span className="text-muted-foreground">Details:</span> {form.project_details}</p>
                </div>
                {error && (
                  <p className="mt-4 font-sans text-sm text-red-500" role="alert">
                    {error}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="mt-12 flex items-center justify-between border-t border-border pt-8">
            <button
              type="button"
              onClick={goBack}
              disabled={step === 0}
              className="inline-flex items-center gap-1 font-sans text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden="true">
                <path d="m12 19-7-7 7-7" />
                <path d="M19 12H5" />
              </svg>
              Back
            </button>

            {step < steps.length - 1 ? (
              <button
                type="button"
                onClick={goNext}
                disabled={!stepValid[step]}
                className="group inline-flex h-11 items-center gap-2 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 px-8 text-sm font-medium text-primary-foreground shadow-xs transition-all hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
              >
                Continue
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-2 size-4 transition-transform group-hover:translate-x-1" aria-hidden="true">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex h-11 items-center gap-2 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 px-8 text-sm font-medium text-primary-foreground shadow-xs transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? "Submitting..." : "Submit"}
              </button>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}
