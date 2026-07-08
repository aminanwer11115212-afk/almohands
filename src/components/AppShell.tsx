import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { AppSidebar } from "@/components/AppSidebar";

type Props = {
  title: string;
  children: ReactNode;
  showBack?: boolean;
  rightAction?: ReactNode;
  subtitle?: string;
  /** When true, remove the max-width cap and use the full workspace width (dashboards). */
  wide?: boolean;
};

export function AppShell({ title, children, showBack = false, rightAction, subtitle, wide = false }: Props) {
  return (
    <div className="min-h-dvh bg-background flex overflow-x-clip" dir="rtl">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:right-2 focus:z-50 focus:rounded-md focus:bg-brand focus:px-3 focus:py-2 focus:text-sm focus:text-brand-foreground focus:shadow-elevated"
      >
        تخطي إلى المحتوى
      </a>

      <AppSidebar />

      <div className="flex-1 min-w-0 flex flex-col">
        <header
          className="sticky top-0 z-30 bg-header text-header-foreground shadow-elevated backdrop-blur supports-[backdrop-filter]:bg-header/95 lg:bg-background lg:text-foreground lg:shadow-none lg:border-b lg:border-border lg:supports-[backdrop-filter]:bg-background/80"
          role="banner"
        >
          <div
            className={
              "mx-auto grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 lg:px-8 h-14 lg:h-16 " +
              (wide ? "max-w-none" : "max-w-3xl lg:max-w-6xl")
            }
          >
            {showBack ? (
              <Link
                to="/"
                className="grid size-10 place-items-center rounded-full hover:bg-white/10 lg:hover:bg-muted focus-visible:bg-white/10 lg:focus-visible:bg-muted transition"
                aria-label="رجوع للرئيسية"
              >
                <ArrowRight className="size-5" aria-hidden="true" />
              </Link>
            ) : (
              <span className="size-10 lg:hidden" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold leading-tight sm:text-lg lg:text-xl font-display">
                {title}
              </h1>
              {subtitle ? (
                <p className="truncate text-[11px] lg:text-xs opacity-75 lg:opacity-100 lg:text-muted-foreground">
                  {subtitle}
                </p>
              ) : null}
            </div>
            <div className="shrink-0">{rightAction}</div>
          </div>
        </header>

        <main
          id="main-content"
          className={
            "flex-1 mx-auto w-full min-w-0 overflow-x-clip px-4 lg:px-8 py-5 sm:py-7 lg:py-8 " +
            (wide ? "max-w-none" : "max-w-3xl lg:max-w-6xl")
          }
          tabIndex={-1}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
