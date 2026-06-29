import { Link, useRouterState } from "@tanstack/react-router";
import { MoreVertical, ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  title: string;
  children: ReactNode;
  showBack?: boolean;
  rightAction?: ReactNode;
};

export function AppShell({ title, children, showBack = false, rightAction }: Props) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-header text-header-foreground shadow-sm sticky top-0 z-30">
        <div className="mx-auto max-w-2xl px-4 h-14 flex items-center gap-3">
          {showBack ? (
            <Link to="/" className="-mx-1 p-2 rounded-md hover:bg-white/10 transition" aria-label="رجوع">
              <ArrowRight className="size-5" />
            </Link>
          ) : null}
          <h1 className="text-lg font-bold flex-1">{title}</h1>
          {rightAction ?? (
            <button className="p-2 rounded-md hover:bg-white/10 transition" aria-label="المزيد">
              <MoreVertical className="size-5" />
            </button>
          )}
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-2xl px-4 py-4">{children}</main>
    </div>
  );
}
