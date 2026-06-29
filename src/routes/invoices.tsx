import { createFileRoute } from "@tanstack/react-router";
import { Receipt } from "lucide-react";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/invoices")({
  head: () => ({ meta: [{ title: "الفواتير — المهندس" }] }),
  component: () => (
    <ComingSoon
      title="الفواتير"
      hint="عرض وطباعة الفواتير بصيغة A4 وحرارية، QR Code، إرسال عبر واتساب."
      icon={Receipt}
    />
  ),
});
