import { createFileRoute } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/returns")({
  head: () => ({ meta: [{ title: "المرتجعات — المهندس" }] }),
  component: () => (
    <ComingSoon
      title="المرتجعات"
      hint="تسجيل المرتجع، تتبع الحالة، إعادة المخزون تلقائياً، وربطه بالفاتورة الأصلية."
      icon={RotateCcw}
    />
  ),
});
