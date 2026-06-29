import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "الإعدادات — المهندس" }] }),
  component: () => (
    <ComingSoon
      title="الإعدادات"
      hint="بيانات المحل، شكل الفاتورة، النسخ الاحتياطي، المزامنة السحابية، الطباعة."
      icon={Settings}
    />
  ),
});
