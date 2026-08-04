import { DayPicker, type DayButtonProps } from "react-day-picker";

// Overriding DayButton entirely (rather than relying on DayPicker's
// classNames-per-modifier merging) gives full control over which Tailwind
// classes apply to which state via plain JS conditionals -- no reliance on
// CSS class order/specificity between "day" and modifier classes like
// "selected"/"today", which isn't guaranteed by className string order alone.
function CalendarDayButton({ day: _day, modifiers, className: _className, ...props }: DayButtonProps) {
  const stateClasses = modifiers.selected
    ? "bg-primary text-primary-foreground font-semibold shadow-glow-cyan"
    : modifiers.disabled
      ? "cursor-not-allowed text-muted-foreground/30"
      : modifiers.today
        ? "border border-accent text-accent font-semibold hover:bg-white/5"
        : modifiers.outside
          ? "text-muted-foreground/40 hover:bg-white/5 hover:text-foreground"
          : "text-foreground hover:bg-white/5 hover:text-primary";

  return (
    <button
      {...props}
      className={`flex h-9 w-9 items-center justify-center rounded-lg text-sm transition-colors ${stateClasses}`}
    />
  );
}

// "YYYY-MM-DD" using local date parts -- avoids the UTC-shift bug that
// toISOString()/`new Date(dateString)` can introduce near midnight.
export function formatDateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateValue(value: string): Date | undefined {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

type InquiryCalendarProps = {
  selected: Date | undefined;
  onSelect: (date: Date | undefined) => void;
};

export function InquiryCalendar({ selected, onSelect }: InquiryCalendarProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <DayPicker
      mode="single"
      selected={selected}
      onSelect={onSelect}
      disabled={{ before: today }}
      showOutsideDays
      classNames={{
        months: "relative",
        month: "space-y-2",
        month_caption: "flex h-9 items-center justify-center",
        caption_label: "font-sans text-sm font-semibold text-foreground",
        nav: "absolute inset-x-0 top-0 flex h-9 items-center justify-between",
        button_previous:
          "flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-30",
        button_next:
          "flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-30",
        chevron: "h-4 w-4 fill-current",
        month_grid: "mt-2 w-full border-collapse",
        weekday: "pb-2 text-center font-mono text-[10px] uppercase tracking-wider text-muted-foreground",
        day: "p-0.5 text-center align-middle",
      }}
      components={{ DayButton: CalendarDayButton }}
    />
  );
}
