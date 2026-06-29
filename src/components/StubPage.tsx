import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import type { LucideIcon } from "lucide-react";
import { Hammer } from "lucide-react";

function makeStub(path: string, title: string, hint: string) {
  return createFileRoute(path as never)({
    head: () => ({ meta: [{ title: `${title} — المهندس` }] }),
    component: () => <StubPage title={title} hint={hint} icon={Hammer} />,
  });
}

function StubPage({ title, hint, icon: Icon }: { title: string; hint: string; icon: LucideIcon }) {
  return (
    <AppShell title={title} showBack>
      <div className="min-h-[60vh] grid place-items-center">
        <div className="text-center max-w-sm">
          <span className="inline-grid place-items-center size-16 rounded-2xl bg-brand/10 text-brand mb-4">
            <Icon className="size-8" />
          </span>
          <h2 className="text-xl font-extrabold">{title}</h2>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{hint}</p>
          <p className="mt-4 text-xs text-muted-foreground">
            سيتم تفعيل هذه الشاشة بعد تفعيل قاعدة بيانات Lovable Cloud.
          </p>
        </div>
      </div>
    </AppShell>
  );
}

export { makeStub };
