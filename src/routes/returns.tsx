import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Search, CheckCircle, XCircle, Clock } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useReturns, useAddReturn, useUpdateReturnStatus, type ReturnStatus } from "@/hooks/use-returns";
import { toast } from "sonner";

export const Route = createFileRoute("/returns")({
  head: () => ({ meta: [{ title: "المرتجعات — المهندس" }] }),
  component: ReturnsPage,
});

function ReturnsPage() {
  const { data: returns = [], isLoading } = useReturns();
  const addReturn = useAddReturn();
  const updateStatus = useUpdateReturnStatus();
  
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ product_name: "", quantity: "1", reason: "" });

  const filtered = returns.filter((r) =>
    r.product_name.toLowerCase().includes(search.toLowerCase())
  );

  const handleAdd = () => {
    if (!form.product_name.trim()) return;
    addReturn.mutate(
      { product_name: form.product_name, quantity: Number(form.quantity) || 1, reason: form.reason },
      {
        onSuccess: () => {
          setOpen(false);
          setForm({ product_name: "", quantity: "1", reason: "" });
          toast({ title: "تم تسجيل المرتجع بنجاح" });
        },
        onError: () => toast({ title: "حدث خطأ", variant: "destructive" }),
      }
    );
  };

  const handleStatus = (id: string, status: ReturnStatus) => {
    updateStatus.mutate(
      { id, status },
      {
        onSuccess: () => toast({ title: status === "accepted" ? "تم قبول المرتجع وإعادة المخزون" : "تم رفض المرتجع" }),
        onError: () => toast({ title: "حدث خطأ", variant: "destructive" }),
      }
    );
  };

  const statusBadge = (status: ReturnStatus) => {
    switch (status) {
      case "pending": return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />معلق</Badge>;
      case "accepted": return <Badge className="gap-1 bg-green-600"><CheckCircle className="h-3 w-3" />مقبول</Badge>;
      case "rejected": return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />مرفوض</Badge>;
    }
  };

  return (
    <AppShell title="المرتجعات" showBack>
      <div className="space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="بحث بالمنتج..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9" />
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="icon"><Plus className="h-4 w-4" /></Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>تسجيل مرتجع جديد</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>اسم المنتج *</Label><Input value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} /></div>
                <div><Label>الكمية</Label><Input type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div>
                <div><Label>السبب</Label><Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
                <Button className="w-full" onClick={handleAdd} disabled={addReturn.isPending}>تسجيل المرتجع</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <p className="text-center text-muted-foreground py-8">جاري التحميل...</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">لا توجد مرتجعات</p>
        ) : (
          <div className="space-y-3">
            {filtered.map((r) => (
              <div key={r.id} className="rounded-xl border bg-card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{r.product_name}</span>
                  {statusBadge(r.status)}
                </div>
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <span>الكمية: {r.quantity}</span>
                  {r.reason && <span>السبب: {r.reason}</span>}
                </div>
                <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("ar-SD")}</div>
                {r.status === "pending" && (
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="outline" className="text-green-600" onClick={() => handleStatus(r.id, "accepted")}>
                      <CheckCircle className="h-3 w-3 ml-1" />قبول
                    </Button>
                    <Button size="sm" variant="outline" className="text-red-600" onClick={() => handleStatus(r.id, "rejected")}>
                      <XCircle className="h-3 w-3 ml-1" />رفض
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
