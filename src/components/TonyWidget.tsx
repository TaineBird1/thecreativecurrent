import { useState } from "react";
import { siteInfo } from "../data/nav";

const quickReplies: { label: string; response: string }[] = [
  {
    label: "Website Design",
    response:
      "We build custom, mobile-first websites with modern UI/UX — responsive, intuitive, and built to convert.",
  },
  {
    label: "Pricing",
    response:
      "Our plans start at R6,000 once-off (Basic) up to R15,000 (Premium), each with a monthly retainer for ongoing management. Check the Pricing page for full details.",
  },
  {
    label: "Time Frames",
    response:
      "A standard project typically takes 6–12 weeks from discovery to launch, depending on scope.",
  },
  {
    label: "FAQs",
    response:
      "Check the FAQ sections on the Appointment Booking and Pricing pages — most common questions are answered there.",
  },
  {
    label: "Get Quote",
    response: `Head to the Contact page to start a project brief, or email us directly at ${siteInfo.email}.`,
  },
];

type Message = { from: "tony" | "user"; text: string };

export function TonyWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      from: "tony",
      text: "Hi! I'm Tony. Ask me about website design, branding, graphic design, or get a quote!",
    },
  ]);
  const [input, setInput] = useState("");

  function handleQuickReply(reply: (typeof quickReplies)[number]) {
    setMessages((prev) => [
      ...prev,
      { from: "user", text: reply.label },
      { from: "tony", text: reply.response },
    ]);
  }

  function handleSend() {
    const text = input.trim();
    if (!text) return;
    setMessages((prev) => [
      ...prev,
      { from: "user", text },
      {
        from: "tony",
        text: "Thanks! For a detailed answer, head to our Contact page and send through a project brief — we'll get back to you within 24 hours.",
      },
    ]);
    setInput("");
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <div className="relative">
        <button
          type="button"
          aria-label={open ? "Close Tony chat" : "Open Tony chat"}
          onClick={() => setOpen((o) => !o)}
          className="flex size-14 items-center justify-center rounded-lg bg-white text-black shadow-lg transition-transform duration-300 hover:scale-105"
        >
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
            className="size-6"
            aria-hidden="true"
          >
            <path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z" />
          </svg>
        </button>

        {open && (
          <div className="absolute bottom-20 right-0 w-80 animate-fade-up">
            <div className="flex flex-col overflow-hidden rounded-lg border border-white/10 bg-black shadow-2xl">
              <div className="flex flex-row items-center justify-between border-b border-white/10 bg-white/5 p-4">
                <span className="text-sm font-bold">Tony AI Assistant</span>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setOpen(false)}
                  className="flex size-6 items-center justify-center text-white/70 hover:text-white"
                >
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
                    className="size-4"
                    aria-hidden="true"
                  >
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>
              <div className="space-y-4 p-4 text-sm text-white/80">
                <div className="h-60 space-y-2 overflow-y-auto pr-2">
                  {messages.map((m, i) => (
                    <div
                      key={i}
                      className={`rounded-lg p-2 ${
                        m.from === "tony" ? "mr-8 bg-white/10" : "ml-8 bg-primary/20 text-right"
                      }`}
                    >
                      {m.text}
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 py-1">
                  {quickReplies.map((reply) => (
                    <button
                      key={reply.label}
                      type="button"
                      onClick={() => handleQuickReply(reply)}
                      className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-shadow hover:shadow-glow-cyan"
                    >
                      {reply.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSend();
                    }}
                    placeholder="Type your message..."
                    className="h-9 w-full rounded-md border border-white/10 bg-white/5 px-3 text-sm outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    aria-label="Send message"
                    onClick={handleSend}
                    className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
                  >
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
                      className="size-4"
                      aria-hidden="true"
                    >
                      <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
                      <path d="m21.854 2.147-10.94 10.939" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
