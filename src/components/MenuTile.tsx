import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import type { ComponentProps } from "react";

type Props = {
  to: ComponentProps<typeof Link>["to"];
  icon: LucideIcon;
  label: string;
  hint?: string;
};

export function MenuTile({ to, icon: Icon, label, hint }: Props) {
  return (
    <Link
      to={to}
      className="group flex flex-col items-center justify-center gap-3 rounded-2xl bg-card p-5 shadow-card border border-border hover:border-brand/40 hover:shadow-md transition"
    >
      <span className="grid place-items-center size-14 rounded-2xl bg-brand/10 text-brand group-hover:bg-brand group-hover:text-brand-foreground transition">
        <Icon className="size-7" />
      </span>
      <span className="text-sm font-bold text-foreground text-center leading-tight">{label}</span>
      {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
    </Link>
  );
}
