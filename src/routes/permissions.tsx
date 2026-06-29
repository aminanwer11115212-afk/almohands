import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/permissions")({
  head: () => ({ meta: [{ title: "الصلاحيات — المهندس" }] }),
  component: () => (
    <ComingSoon
      title="الصلاحيات"
      hint="مدير، بائع، محاسب، أمين مخزن — مع OTP وسجل عمليات لكل تعديل حساس."
      icon={ShieldCheck}
    />
  ),
});
