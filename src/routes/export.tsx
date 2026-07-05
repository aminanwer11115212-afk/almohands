import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { PermissionGate } from "@/components/PermissionGate";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Download, FileText, Database, Trash2, FileSpreadsheet } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const Route = createFileRoute("/export")({
  head: () => ({ meta: [{ title: "تصدير البيانات — المهندس" }] }),
  component: ExportPageGuarded,
});

const TABLES = [
  { key: "products", label: "المنتجات" },
  { key: "customers", label: "العملاء" },
  { key: "suppliers", label: "الموردين" },
  { key: "invoices", label: "الفواتير" },
  { key: "invoice_items", label: "بنود الفواتير" },
  { key: "expenses", label: "المصروفات" },
  { key: "returns", label: "المرتجعات" },
] as const;

type TableKey = typeof TABLES[number]["key"];

function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

function download(filename: string, content: string | Blob, mime = "text/csv;charset=utf-8") {
  const blob = content instanceof Blob ? content : new Blob(["\ufeff" + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function fetchTable(name: TableKey) {
  const { data, error } = await supabase.from(name).select("*");
  if (error) throw error;
  return data ?? [];
}

function ExportPageGuarded() {
  return (
    <PermissionGate perm="import_export">
      <ExportPage />
    </PermissionGate>
  );
}

function ExportPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<TableKey>>(new Set(["products"]));

  const { data: logs = [] } = useQuery({
    queryKey: ["export_logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("export_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const logMut = useMutation({
    mutationFn: async (entry: { export_type: string; format: string; tables: string[]; row_count: number; notes?: string }) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("no user");
      const { error } = await supabase.from("export_logs").insert({ ...entry, user_id: u.user.id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["export_logs"] }),
  });

  const deleteLog = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("export_logs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["export_logs"] }),
  });

  const toggle = (k: TableKey) => {
    const s = new Set(selected);
    s.has(k) ? s.delete(k) : s.add(k);
    setSelected(s);
  };

  const exportCSV = async () => {
    if (selected.size === 0) return toast.error("اختر جدولاً واحداً على الأقل");
    try {
      let total = 0;
      for (const key of selected) {
        const rows = await fetchTable(key);
        total += rows.length;
        download(`${key}-${Date.now()}.csv`, toCSV(rows as Record<string, unknown>[]));
      }
      await logMut.mutateAsync({
        export_type: "partial",
        format: "csv",
        tables: [...selected],
        row_count: total,
      });
      toast.success(`تم تصدير ${total} سجل`);
    } catch (e) {
      toast.error("فشل التصدير");
    }
  };

  const exportPDF = async () => {
    if (selected.size === 0) return toast.error("اختر جدولاً واحداً على الأقل");
    try {
      const doc = new jsPDF();
      let total = 0;
      let first = true;
      for (const key of selected) {
        const rows = (await fetchTable(key)) as Record<string, unknown>[];
        total += rows.length;
        if (!first) doc.addPage();
        first = false;
        doc.setFontSize(14);
        doc.text(key, 14, 15);
        if (rows.length > 0) {
          const headers = Object.keys(rows[0]);
          autoTable(doc, {
            startY: 20,
            head: [headers],
            body: rows.map((r) => headers.map((h) => String(r[h] ?? ""))),
            styles: { fontSize: 7 },
          });
        }
      }
      doc.save(`export-${Date.now()}.pdf`);
      await logMut.mutateAsync({
        export_type: "partial",
        format: "pdf",
        tables: [...selected],
        row_count: total,
      });
      toast.success(`تم تصدير ${total} سجل`);
    } catch (e) {
      toast.error("فشل التصدير");
    }
  };

  const fullBackup = async () => {
    try {
      const backup: Record<string, unknown> = { exported_at: new Date().toISOString() };
      let total = 0;
      for (const t of TABLES) {
        const rows = await fetchTable(t.key);
        backup[t.key] = rows;
        total += rows.length;
      }
      download(`backup-${Date.now()}.json`, JSON.stringify(backup, null, 2), "application/json");
      await logMut.mutateAsync({
        export_type: "full_backup",
        format: "json",
        tables: TABLES.map((t) => t.key),
        row_count: total,
        notes: "نسخة احتياطية كاملة",
      });
      toast.success(`نسخة احتياطية: ${total} سجل`);
    } catch {
      toast.error("فشل النسخ الاحتياطي");
    }
  };

  return (
    <AppShell title="تصدير البيانات" showBack>
      <section className="rounded-2xl bg-card border p-4 shadow-card mb-4">
        <h2 className="text-sm font-bold mb-3">اختر الجداول</h2>
        <div className="grid grid-cols-2 gap-2">
          {TABLES.map((t) => (
            <label
              key={t.key}
              className="flex items-center gap-2 rounded-lg border p-2 text-sm cursor-pointer hover:bg-muted/50"
            >
              <input
                type="checkbox"
                checked={selected.has(t.key)}
                onChange={() => toggle(t.key)}
                className="size-4"
              />
              {t.label}
            </label>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={exportCSV}
            className="flex items-center justify-center gap-2 rounded-lg bg-brand text-brand-foreground px-3 py-2 text-sm font-bold"
          >
            <FileSpreadsheet className="size-4" /> CSV
          </button>
          <button
            onClick={exportPDF}
            className="flex items-center justify-center gap-2 rounded-lg bg-brand text-brand-foreground px-3 py-2 text-sm font-bold"
          >
            <FileText className="size-4" /> PDF
          </button>
        </div>
      </section>

      <section className="rounded-2xl bg-card border p-4 shadow-card mb-4">
        <h2 className="text-sm font-bold mb-2 flex items-center gap-2">
          <Database className="size-4" /> نسخة احتياطية كاملة
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          يشمل جميع الجداول بصيغة JSON قابلة للاستيراد لاحقاً.
        </p>
        <button
          onClick={fullBackup}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-header text-header-foreground px-3 py-2 text-sm font-bold"
        >
          <Download className="size-4" /> تنزيل النسخة الكاملة
        </button>
      </section>

      <section className="rounded-2xl bg-card border p-4 shadow-card">
        <h2 className="text-sm font-bold mb-3">سجل عمليات التصدير</h2>
        {logs.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">لا توجد عمليات بعد</p>
        ) : (
          <ul className="space-y-2">
            {logs.map((l) => (
              <li key={l.id} className="flex items-center justify-between rounded-lg border p-2 text-xs">
                <div className="flex-1">
                  <div className="font-bold">
                    {l.export_type === "full_backup" ? "نسخة احتياطية" : "تصدير"} · {l.format.toUpperCase()}
                  </div>
                  <div className="text-muted-foreground">
                    {(l.tables ?? []).join(", ")} — {l.row_count} سجل
                  </div>
                  <div className="text-muted-foreground nums">
                    {new Date(l.created_at).toLocaleString("ar")}
                  </div>
                </div>
                <button
                  onClick={() => deleteLog.mutate(l.id)}
                  className="p-2 rounded-md hover:bg-muted"
                  aria-label="حذف"
                >
                  <Trash2 className="size-4 text-destructive" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
