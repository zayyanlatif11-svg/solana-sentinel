import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "neutral",
  children,
}: {
  className?: string;
  tone?: "neutral" | "good" | "warn" | "bad" | "demo";
  children: React.ReactNode;
}) {
  const colors = {
    neutral: "border-[var(--line)] text-[var(--muted)]",
    good: "border-[var(--good)] text-[var(--good)]",
    warn: "border-[var(--warn)] text-[var(--warn)]",
    bad: "border-[var(--bad)] text-[var(--bad)]",
    demo: "border-[var(--demo)] text-[var(--demo)]",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex border px-2 py-0.5 text-[11px] uppercase tracking-wide",
        colors,
        className,
      )}
    >
      {children}
    </span>
  );
}
