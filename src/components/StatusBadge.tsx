type Tone = "neutral" | "primary" | "success" | "warning";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-white/5 text-muted-foreground border-border",
  primary: "bg-primary/10 text-primary border-primary/30",
  success: "bg-green-500/10 text-green-500 border-green-500/30",
  warning: "bg-orange-400/10 text-orange-400 border-orange-400/30",
};

export function StatusBadge({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide ${toneClasses[tone]}`}
    >
      {label}
    </span>
  );
}
