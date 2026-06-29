import { createFileRoute } from "@tanstack/react-router";
import { Truck } from "lucide-react";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/suppliers")({
  head: () => ({ meta: [{ title: "الموردين — المهندس" }] }),
  component: () => (
    <ComingSoon
      title="الموردين"
      hint="بيانات المورد، كشف الحساب، المشتريات، الديون، أرشيف الفواتير، ومخزون المورد."
      icon={Truck}
    />
  ),
});
