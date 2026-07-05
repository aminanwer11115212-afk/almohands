import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  title: string;
  children: ReactNode;
  showBack?: boolean;
  rightAction?: ReactNode;
  subtitle?: string;
};

export function AppShell({ title, children, showBack = false, rightAction, subtitle }: Props) {
  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:right-2 focus:z-50 focus:rounded-md focus:bg-brand focus:px-3 focus:py-2 focus:text-sm focus:text-brand-foreground focus:shadow-elevated"
      >
        تخطي إلى المحتوى
      </a>
      <header
        className="sticky top-0 z-30 bg-header text-header-foreground shadow-elevated backdrop-blur supports-[backdrop-filter]:bg-header/95"
        role="banner"
      >
        <div className="mx-auto grid max-w-3xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 h-14">
          {showBack ? (
            <Link
              to="/"
              className="grid size-10 place-items-center rounded-full hover:bg-white/10 focus-visible:bg-white/10 transition"
              aria-label="رجوع للرئيسية"
            >
              <ArrowRight className="size-5" aria-hidden="true" />
            </Link>
          ) : (
            <span className="size-10" aria-hidden="true" />
          )}
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold leading-tight sm:text-lg">{title}</h1>
            {subtitle ? (
              <p className="truncate text-[11px] opacity-75">{subtitle}</p>
            ) : null}
          </div>
          <div className="shrink-0">{rightAction}</div>
        </div>
      </header>
      <main
        id="main-content"
        className="flex-1 mx-auto w-full max-w-3xl px-4 py-5 sm:py-7"
        tabIndex={-1}
      >
        {children}
      </main>
    </div>
  );
}
