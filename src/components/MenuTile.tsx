import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import type { ComponentProps } from "react";

type Props = {
  to: ComponentProps<typeof Link>["to"];
  icon: LucideIcon;
  label: string;
  hint?: string;
  variant?: "default" | "highlight";
  span?: "1" | "2";
};

export function MenuTile({ to, icon: Icon, label, hint, variant = "default", span = "1" }: Props) {
  const isHighlight = variant === "highlight";
  return (
    <Link
      to={to}
      aria-label={hint ? `${label} — ${hint}` : label}
      className={[
        "group relative flex min-h-28 flex-col items-center justify-center gap-2.5 rounded-2xl border p-4 text-center transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "hover:-translate-y-0.5 hover:shadow-elevated active:translate-y-0",
        isHighlight
          ? "border-transparent bg-brand-gradient text-brand-foreground shadow-elevated"
          : "border-border bg-card shadow-card hover:border-brand/40",
        span === "2" ? "col-span-2" : "",
      ].join(" ")}
    >
      <span
        className={[
          "grid size-12 shrink-0 place-items-center rounded-2xl transition",
          isHighlight
            ? "bg-white/15 text-brand-foreground"
            : "bg-brand-soft text-brand group-hover:bg-brand group-hover:text-brand-foreground",
        ].join(" ")}
        aria-hidden="true"
      >
        <Icon className="size-6" />
      </span>
      <span className={["text-[13px] font-bold leading-tight", isHighlight ? "text-brand-foreground" : "text-foreground"].join(" ")}>
        {label}
      </span>
      {hint ? (
        <span className={["text-[11px]", isHighlight ? "text-brand-foreground/80" : "text-muted-foreground"].join(" ")}>
          {hint}
        </span>
      ) : null}
    </Link>
  );
}
