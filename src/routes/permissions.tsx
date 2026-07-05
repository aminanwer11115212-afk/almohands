import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ShieldCheck, ScrollText } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMyRoles, useAuditLogs, ROLE_LABELS } from "@/hooks/use-permissions";

export const Route = createFileRoute("/permissions")({
  head: () => ({ meta: [{ title: "الصلاحيات — المهندس" }] }),
  component: PermissionsPage,
});

function PermissionsPage() {
  const { data: roles = [], isLoading: rolesLoading } = useMyRoles();
  const { data: logs = [], isLoading: logsLoading } = useAuditLogs();

  return (
    <AppShell title="الصلاحيات والأمان" showBack>
      <Tabs defaultValue="roles" className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="roles" className="flex-1 gap-1"><ShieldCheck className="h-4 w-4" />الأدوار</TabsTrigger>
          <TabsTrigger value="logs" className="flex-1 gap-1"><ScrollText className="h-4 w-4" />سجل العمليات</TabsTrigger>
        </TabsList>

        <TabsContent value="roles" className="mt-4 space-y-4">
          {rolesLoading ? (
            <p className="text-center text-muted-foreground py-8">جاري التحميل...</p>
          ) : roles.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <ShieldCheck className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="text-muted-foreground">لم يتم تعيين أدوار لك بعد</p>
              <p className="text-xs text-muted-foreground">تواصل مع المدير لتعيين صلاحياتك</p>
            </div>
          ) : (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">أدوارك الحالية</h3>
              <div className="flex flex-wrap gap-2">
                {roles.map((r) => (
                  <Badge key={r.id} variant="secondary" className="text-base px-4 py-2">
                    {ROLE_LABELS[r.role]}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border bg-card p-4 space-y-2 mt-6">
            <h3 className="font-semibold text-sm">الأدوار المتاحة</h3>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li><strong>مدير:</strong> صلاحيات كاملة وإدارة المستخدمين</li>
              <li><strong>بائع:</strong> نقطة البيع والفواتير</li>
              <li><strong>محاسب:</strong> التقارير المالية والعملاء</li>
              <li><strong>أمين مخزن:</strong> إدارة المخزون والمرتجعات</li>
            </ul>
          </div>
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          {logsLoading ? (
            <p className="text-center text-muted-foreground py-8">جاري التحميل...</p>
          ) : logs.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">لا توجد عمليات مسجلة</p>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div key={log.id} className="rounded-lg border p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{log.action}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleString("ar-SD")}
                    </span>
                  </div>
                  {log.table_name && (
                    <span className="text-xs text-muted-foreground">الجدول: {log.table_name}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
