import { createFileRoute } from "@tanstack/react-router";
import { ShoppingCart } from "lucide-react";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/cashier")({
  head: () => ({ meta: [{ title: "الكاشير — المهندس" }] }),
  component: () => (
    <ComingSoon
      title="الكاشير"
      hint="نقطة البيع: بيع سريع، باركود، فواتير، آجل ونقدي، خصومات بصلاحية."
      icon={ShoppingCart}
    />
  ),
});
