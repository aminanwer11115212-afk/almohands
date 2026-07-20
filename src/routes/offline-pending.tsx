import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PermissionGate } from "@/components/PermissionGate";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  CloudOff,
  RefreshCw,
  Trash2,
  AlertTriangle,
  Plus,
  Pencil,
  X,
  Database,
  Radio,
  CheckCircle2,
  Filter,
} from "lucide-react";
import { toast } from "sonner";
import { formatNumber } from "@/lib/format";

export const Route = createFileRoute("/offline-pending")({
  head: () => ({
    meta: [
      { title: "التعديلات المعلّقة أوفلاين — المهندس" },
      {
        name: "description",
        content:
          "عرض جميع العمليات المحلية التي لم تُزامَن بعد مع الخادم، مع إمكانية إعادة المزامنة اليدوية.",
      },
    ],
  }),
  component: () => (
    <PermissionGate perm="reports.view">
      <OfflinePendingPage />
    </PermissionGate>
  ),
});

// Runtime import — module is browser-only.
const usePowerSyncSafe = () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@powersync/react") as typeof import("@powersync/react");
    return { usePowerSync: mod.usePowerSync, useStatus: mod.useStatus };
  } catch {
    return null;
  }
};

type OpKind = "PUT" | "PATCH" | "DELETE";

interface CrudRow {
  id: number;
  tx_id: number | null;
  op: OpKind | string;
  table: string;
  rowId: string;
  data: Record<string, unknown> | null;
  raw: string;
}

const OP_LABELS: Record<string, { label: string; color: string; icon: typeof Plus }> = {
  PUT: { label: "إضافة/تحديث", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: Plus },
  PATCH: { label: "تعديل", color: "bg-sky-100 text-sky-700 border-sky-200", icon: Pencil },
  DELETE: { label: "حذف", color: "bg-rose-100 text-rose-700 border-rose-200", icon: X },
};

const TABLE_LABELS_AR: Record<string, string> = {
  products: "المنتجات",
  customers: "العملاء",
  suppliers: "الموردين",
  invoices: "الفواتير",
  invoice_items: "أصناف الفواتير",
  payments: "المدفوعات",
  purchases: "المشتريات",
  purchase_items: "أصناف المشتريات",
  price_history: "سجل الأسعار",
  expenses: "المصروفات",
  payment_methods: "طرق الدفع",
  returns: "المرتجعات",
  special_orders: "طلبات النظام",
  special_order_history: "سجل الطلبات",
  notifications: "الإشعارات",
  audit_logs: "سجل التدقيق",
  import_logs: "سجل الاستيراد",
  export_logs: "سجل التصدير",
  user_roles: "الأدوار",
  store_profile: "بيانات المحل",
};

function OfflinePendingPage() {
  return (
    <AppShell title="التعديلات المعلّقة أوفلاين">
      <ClientOnlyWrapper />
    </AppShell>
  );
}

function ClientOnlyWrapper() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <Database className="mx-auto size-10 mb-3 opacity-40" />
        جاري تحميل قاعدة البيانات المحلية…
      </div>
    );
  }
  return <PendingContent />;
}

function PendingContent() {
  const hooks = usePowerSyncSafe();
  if (!hooks) return <NotConfiguredCard />;
  return <PendingList hooks={hooks} />;
}

function NotConfiguredCard() {
  return (
    <div className="p-6">
      <div className="max-w-xl mx-auto rounded-2xl border border-amber-200 bg-amber-50/60 p-6 text-center">
        <CloudOff className="mx-auto size-10 text-amber-600 mb-3" />
        <h2 className="font-bold text-lg text-amber-900 mb-1">
          المزامنة المحلية غير مفعّلة
        </h2>
        <p className="text-sm text-amber-800">
          لم يتم ضبط عنوان PowerSync بعد. سيعمل النظام بالوضع العادي (متصل بالإنترنت
          مباشرةً) ولا توجد عمليات معلّقة محلياً.
        </p>
      </div>
    </div>
  );
}

function PendingList({ hooks }: { hooks: NonNullable<ReturnType<typeof usePowerSyncSafe>> }) {
  const { usePowerSync, useStatus } = hooks;
  const ps = usePowerSync();
  const status = useStatus();

  const [rows, setRows] = useState<CrudRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTable, setFilterTable] = useState<string>("all");
  const [filterOp, setFilterOp] = useState<string>("all");
  const [detail, setDetail] = useState<CrudRow | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    if (!ps) return;
    setLoading(true);
    try {
      const raw = await ps.getAll<{ id: number; tx_id: number | null; data: string }>(
        "SELECT id, tx_id, data FROM ps_crud ORDER BY id ASC",
      );
      const parsed: CrudRow[] = raw.map((r) => {
        let data: Record<string, unknown> | null = null;
        let op = "PUT";
        let table = "";
        let rowId = "";
        try {
          const j = JSON.parse(r.data) as {
            op?: string;
            type?: string;
            id?: string;
            data?: Record<string, unknown>;
          };
          op = j.op ?? "PUT";
          table = j.type ?? "";
          rowId = j.id ?? "";
          data = j.data ?? null;
        } catch {
          /* corrupt row */
        }
        return {
          id: r.id,
          tx_id: r.tx_id,
          op,
          table,
          rowId,
          data,
          raw: r.data,
        };
      });
      setRows(parsed);
    } catch (err) {
      console.error("Failed to read ps_crud:", err);
      toast.error("تعذّر قراءة الطابور المحلي");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ps]);

  const tables = useMemo(() => {
    const s = new Set(rows.map((r) => r.table).filter(Boolean));
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (filterTable === "all" || r.table === filterTable) &&
          (filterOp === "all" || r.op === filterOp),
      ),
    [rows, filterTable, filterOp],
  );

  const groupCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r.op] = (c[r.op] ?? 0) + 1;
    return c;
  }, [rows]);

  const triggerSync = async () => {
    if (!ps) return;
    setSyncing(true);
    try {
      await (ps as any).triggerCrudUpload?.();
      toast.success("تم بدء المزامنة…");
      setTimeout(load, 800);
    } catch (err) {
      toast.error("فشل بدء المزامنة");
      console.error(err);
    } finally {
      setSyncing(false);
    }
  };

  const clearAll = async () => {
    if (!ps) return;
    try {
      await ps.execute("DELETE FROM ps_crud");
      toast.success("تم حذف جميع العمليات المعلّقة");
      setConfirmClear(false);
      void load();
    } catch (err) {
      toast.error("فشل الحذف");
      console.error(err);
    }
  };

  const connected = status?.connected ?? false;

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={<Database className="size-4" />}
          label="إجمالي المعلّق"
          value={rows.length}
          tone={rows.length > 0 ? "amber" : "emerald"}
        />
        <StatCard
          icon={<Plus className="size-4" />}
          label="إضافة/تحديث"
          value={groupCounts.PUT ?? 0}
          tone="emerald"
        />
        <StatCard
          icon={<Pencil className="size-4" />}
          label="تعديل"
          value={groupCounts.PATCH ?? 0}
          tone="sky"
        />
        <StatCard
          icon={<X className="size-4" />}
          label="حذف"
          value={groupCounts.DELETE ?? 0}
          tone="rose"
        />
      </div>

      {/* Connection banner */}
      <div
        className={
          "rounded-xl border p-3 flex items-center justify-between gap-3 text-sm " +
          (connected
            ? "bg-emerald-50/60 border-emerald-200"
            : "bg-amber-50/60 border-amber-200")
        }
      >
        <div className="flex items-center gap-2">
          {connected ? (
            <>
              <CheckCircle2 className="size-4 text-emerald-600" />
              <span className="text-emerald-800">
                متصل بالخادم — سيتم رفع العمليات تلقائياً.
              </span>
            </>
          ) : (
            <>
              <Radio className="size-4 text-amber-600" />
              <span className="text-amber-800">
                غير متصل — العمليات محفوظة محلياً وسترفع عند عودة الاتصال.
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={load} disabled={loading}>
            <RefreshCw className={"size-3.5 ml-1 " + (loading ? "animate-spin" : "")} />
            تحديث
          </Button>
          <Button
            size="sm"
            onClick={triggerSync}
            disabled={rows.length === 0 || syncing || !connected}
          >
            <RefreshCw className={"size-3.5 ml-1 " + (syncing ? "animate-spin" : "")} />
            مزامنة الآن
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Filter className="size-4 text-muted-foreground" />
        <select
          value={filterTable}
          onChange={(e) => setFilterTable(e.target.value)}
          className="rounded-md border px-2 py-1.5 text-sm bg-background"
        >
          <option value="all">جميع الجداول</option>
          {tables.map((t) => (
            <option key={t} value={t}>
              {TABLE_LABELS_AR[t] ?? t}
            </option>
          ))}
        </select>
        <select
          value={filterOp}
          onChange={(e) => setFilterOp(e.target.value)}
          className="rounded-md border px-2 py-1.5 text-sm bg-background"
        >
          <option value="all">جميع العمليات</option>
          <option value="PUT">إضافة/تحديث</option>
          <option value="PATCH">تعديل</option>
          <option value="DELETE">حذف</option>
        </select>
        <div className="ms-auto">
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setConfirmClear(true)}
            disabled={rows.length === 0}
          >
            <Trash2 className="size-3.5 ml-1" />
            إفراغ الطابور
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">#</TableHead>
              <TableHead>العملية</TableHead>
              <TableHead>الجدول</TableHead>
              <TableHead>معرّف السجل</TableHead>
              <TableHead>الحقول</TableHead>
              <TableHead className="w-24 text-center">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                  {rows.length === 0 ? (
                    <>
                      <CheckCircle2 className="size-8 mx-auto mb-2 text-emerald-500" />
                      لا توجد عمليات معلّقة — كل شيء متزامن.
                    </>
                  ) : (
                    "لا توجد نتائج مطابقة للفلاتر."
                  )}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => {
                const meta = OP_LABELS[r.op] ?? OP_LABELS.PUT;
                const Icon = meta.icon;
                const fieldCount = r.data ? Object.keys(r.data).length : 0;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground text-xs">{r.id}</TableCell>
                    <TableCell>
                      <Badge className={"gap-1 " + meta.color} variant="outline">
                        <Icon className="size-3" />
                        {meta.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {TABLE_LABELS_AR[r.table] ?? r.table}
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-muted-foreground">
                      {r.rowId ? r.rowId.slice(0, 8) + "…" : "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {fieldCount > 0 ? `${formatNumber(fieldCount)} حقل` : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button size="sm" variant="ghost" onClick={() => setDetail(r)}>
                        عرض
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="text-xs text-muted-foreground text-center">
        يتم التحديث تلقائياً كل 3 ثوانٍ • رجوع إلى{" "}
        <Link to="/activity-log" className="text-primary underline">
          سجل النشاط
        </Link>
      </div>

      {/* Detail dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent dir="rtl" className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>تفاصيل العملية #{detail?.id}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <InfoRow label="نوع العملية" value={OP_LABELS[detail.op]?.label ?? detail.op} />
                <InfoRow label="الجدول" value={TABLE_LABELS_AR[detail.table] ?? detail.table} />
                <InfoRow label="معرّف السجل" value={detail.rowId || "—"} mono />
                <InfoRow label="رقم المعاملة" value={String(detail.tx_id ?? "—")} />
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">البيانات:</div>
                <pre className="bg-muted rounded-lg p-3 text-[11px] overflow-auto max-h-80 font-mono" dir="ltr">
                  {JSON.stringify(detail.data ?? {}, null, 2)}
                </pre>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDetail(null)}>
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm clear */}
      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-rose-600" />
              تأكيد إفراغ الطابور
            </DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            سيتم حذف جميع العمليات المعلّقة محلياً ({formatNumber(rows.length)} عملية) نهائياً
            دون رفعها للخادم. لا يمكن التراجع عن هذا الإجراء.
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmClear(false)}>
              إلغاء
            </Button>
            <Button variant="destructive" onClick={clearAll}>
              <Trash2 className="size-4 ml-1" />
              حذف نهائي
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "amber" | "emerald" | "sky" | "rose";
}) {
  const tones: Record<string, string> = {
    amber: "bg-amber-50 border-amber-200 text-amber-800",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-800",
    sky: "bg-sky-50 border-sky-200 text-sky-800",
    rose: "bg-rose-50 border-rose-200 text-rose-800",
  };
  return (
    <div className={"rounded-xl border p-3 " + tones[tone]}>
      <div className="flex items-center gap-2 text-xs opacity-80">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-2xl font-bold nums mt-1">{formatNumber(value)}</div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={"font-medium " + (mono ? "font-mono text-xs" : "")}>{value}</div>
    </div>
  );
}
