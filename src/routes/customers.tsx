import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/customers")({
  head: () => ({ meta: [{ title: "العملاء — المهندس" }] }),
  component: () => (
    <ComingSoon
      title="العملاء"
      hint="بيانات العملاء، كشف الحساب، الديون، الحد الائتماني، سجل المشتريات."
      icon={Users}
    />
  ),
});
