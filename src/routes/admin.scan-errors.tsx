import { createFileRoute } from "@tanstack/react-router";
import { PermissionGate } from "@/components/PermissionGate";
import { AppShell } from "@/components/AppShell";
import { useEffect, useState } from "react";
import { Trash2, RefreshCw, Camera } from "lucide-react";
import { readScanErrors, clearScanErrors, type ScanErrorEntry } from "@/lib/scan-error-log";

export const Route = createFileRoute("/admin/scan-errors")({
  head: () => ({ meta: [{ title: "سجل أخطاء الماسح — المهندس" }] }),
  component: () => (
    <PermissionGate perm="permissions.manage">
      <ScanErrorsPage />
    </PermissionGate>
  ),
});

function ScanErrorsPage() {
  const [entries, setEntries] = useState<ScanErrorEntry[]>([]);
  const refresh = () => setEntries(readScanErrors());
  useEffect(() => { refresh(); }, []);

  return (
    <AppShell title="سجل أخطاء الماسح" subtitle="سجل صامت لأخطاء مسح الباركود (بدون إزعاج الكاشير)" showBack>
      <div className="p-4 space-y-4 max-w-4xl mx-auto">
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            className="h-9 px-3 rounded-lg border border-border bg-card hover:bg-muted text-xs font-bold flex items-center gap-1.5"
          >
            <RefreshCw className="size-3.5" /> تحديث
          </button>
          <button
            onClick={() => { clearScanErrors(); refresh(); }}
            className="h-9 px-3 rounded-lg border border-border bg-card hover:bg-muted text-xs font-bold flex items-center gap-1.5 text-red-500"
          >
            <Trash2 className="size-3.5" /> مسح السجل
          </button>
          <div className="mr-auto text-xs text-muted-foreground">
            آخر {entries.length} خطأ
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            <Camera className="size-8 mx-auto mb-2 opacity-40" />
            لا توجد أخطاء مسجّلة.
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-[11px]">
                <tr>
                  <th className="text-right px-3 py-2 font-bold">الوقت</th>
                  <th className="text-right px-3 py-2 font-bold">النوع</th>
                  <th className="text-right px-3 py-2 font-bold">السبب</th>
                  <th className="text-right px-3 py-2 font-bold">السياق</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={i} className="border-t border-border align-top">
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                      {new Date(e.ts).toLocaleString("ar-EG")}
                    </td>
                    <td className="px-3 py-2 font-bold text-red-500">{e.name}</td>
                    <td className="px-3 py-2">
                      <div>{e.friendly}</div>
                      {e.message && e.message !== e.friendly && (
                        <div className="text-[10px] text-muted-foreground mt-1 font-mono ltr:text-left rtl:text-right" dir="ltr">
                          {e.message}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[10px] text-muted-foreground font-mono" dir="ltr">
                      {e.context ? JSON.stringify(e.context) : "—"}
                      <div className="mt-1 opacity-60 truncate max-w-[220px]">{e.userAgent}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
