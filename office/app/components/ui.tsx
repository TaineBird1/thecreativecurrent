"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
}) {
  return (
    <Tag className={`rounded-2xl border border-edge bg-panel ${className}`}>{children}</Tag>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad" | "info";
}) {
  const tones = {
    neutral: "bg-edge text-muted",
    good: "bg-lime/15 text-lime",
    warn: "bg-lamp/15 text-lamp",
    bad: "bg-rust/15 text-rust",
    info: "bg-cyan/15 text-cyan",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  tone = "default",
  disabled,
  type = "button",
  className = "",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: "default" | "primary" | "danger" | "ghost";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
  title?: string;
}) {
  const tones = {
    default: "bg-panel-2 text-cream hover:bg-edge border border-edge",
    primary: "bg-lamp text-ink hover:brightness-110 font-semibold",
    danger: "bg-rust text-white hover:brightness-110 font-semibold",
    ghost: "text-muted hover:text-cream hover:bg-panel-2",
  } as const;
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-3 py-1.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-40 ${tones[tone]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-edge px-5 py-8 text-center text-sm text-faint">
      {children}
    </div>
  );
}

/**
 * A capability that genuinely cannot be free. Shown, never hidden — the brief's
 * rule is "stub it and mark it clearly", not "quietly do less".
 */
export function PaidStub({ what, why }: { what: string; why: string }) {
  return (
    <div className="rounded-xl border border-dashed border-edge-2 bg-panel-2/50 p-4">
      <div className="mb-1.5 flex items-center gap-2">
        <Pill tone="warn">needs a paid service</Pill>
        <span className="text-sm font-medium text-cream">{what}</span>
      </div>
      <p className="text-xs leading-relaxed text-faint">{why}</p>
    </div>
  );
}

const NAV = [
  { href: "/", label: "Office" },
  { href: "/inbox", label: "Boss inbox" },
  { href: "/goals", label: "Goals" },
  { href: "/leads", label: "Leads" },
  { href: "/clients", label: "Clients" },
  { href: "/library", label: "Library" },
  { href: "/logs", label: "Logs" },
  { href: "/settings", label: "Settings" },
];

export function Nav({ approvals, escalations }: { approvals: number; escalations: number }) {
  const path = usePathname();
  return (
    <nav className="flex items-center gap-0.5 overflow-x-auto">
      {NAV.map((item) => {
        const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
        const badge =
          item.href === "/inbox" ? approvals + escalations : undefined;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`relative whitespace-nowrap rounded-lg px-3 py-1.5 text-xs transition ${
              active ? "bg-panel-2 text-cream" : "text-faint hover:text-cream"
            }`}
          >
            {item.label}
            {badge ? (
              <span className="ml-1.5 rounded-full bg-rust px-1.5 py-0.5 text-[10px] font-bold text-white">
                {badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function relativeTime(at: number): string {
  const diff = Date.now() - at;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function rand(n: number): string {
  // en-ZA groups with a space ("R1 100"), which in a tight KPI strip reads as
  // two separate numbers. Comma grouping keeps one number looking like one.
  return `R${n.toLocaleString("en-US")}`;
}
