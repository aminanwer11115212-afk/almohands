import { createFileRoute } from "@tanstack/react-router";
import { PermissionGate } from "@/components/PermissionGate";
import { useState } from "react";
import { ShieldCheck, ScrollText, Users, Plus, Trash2, UserPlus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMyRoles, useAuditLogs, ROLE_LABELS } from "@/hooks/use-permissions";
import { useRequireAdmin } from "@/hooks/use-require-admin";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listEmployees,
  createEmployee,
  assignRole,
  removeRole,
  deleteEmployee,
} from "@/lib/admin-users.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/permissions")({
  head: () => ({ meta: [{ title: "الصلاحيات — المهندس" }] }),
  component: () => (<PermissionGate perm="permissions.manage"><PermissionsPage /></PermissionGate>),
});

type AppRole = "admin" | "seller" | "accountant" | "warehouse";
const ROLES: AppRole[] = ["admin", "seller"]; // only two roles are actively assignable


function PermissionsPage() {
  const { isChecking, isAdmin } = useRequireAdmin("/");
  const { data: roles = [], isLoading: rolesLoading } = useMyRoles();
  const { data: logs = [], isLoading: logsLoading } = useAuditLogs();

  if (isChecking || !isAdmin) {
    return (
      <AppShell title="الصلاحيات والأمان" showBack>
        <p className="text-center text-muted-foreground py-12">جاري التحقق من الصلاحيات...</p>
      </AppShell>
    );
  }

  return (
    <AppShell title="الصلاحيات والأمان" showBack>
      <Tabs defaultValue="roles" className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="roles" className="flex-1 gap-1"><ShieldCheck className="h-4 w-4" />الأدوار</TabsTrigger>
          <TabsTrigger value="users" className="flex-1 gap-1"><Users className="h-4 w-4" />الموظفون</TabsTrigger>
          <TabsTrigger value="logs" className="flex-1 gap-1"><ScrollText className="h-4 w-4" />السجل</TabsTrigger>
        </TabsList>

        <TabsContent value="roles" className="mt-4 space-y-4">
          {rolesLoading ? (
            <p className="text-center text-muted-foreground py-8">جاري التحميل...</p>
          ) : roles.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <ShieldCheck className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="text-muted-foreground">لم يتم تعيين أدوار لك بعد</p>
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
              <li><strong>مدير:</strong> صلاحية كاملة على النظام — منتجات، فواتير، حسابات، تقارير، إدارة الموظفين.</li>
              <li><strong>كاشير:</strong> بيع من نقطة البيع فقط — يستطيع إنشاء فواتير جديدة وعرض قائمة الفواتير، لكن <span className="text-destructive font-bold">لا يستطيع تعديل أو حذف فواتير</span>، ولا الوصول للتقارير/الحسابات/المنتجات كتابياً. يصلك تنبيه فوري عند أي فاتورة كاشير خاصة عند عدم تحديد عميل.</li>
            </ul>

          </div>
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <AdminUsersPanel />
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

function AdminUsersPanel() {
  const qc = useQueryClient();
  const list = useServerFn(listEmployees);
  const create = useServerFn(createEmployee);
  const addRole = useServerFn(assignRole);
  const rmRole = useServerFn(removeRole);
  const rmUser = useServerFn(deleteEmployee);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AppRole>("seller");

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-employees"],
    queryFn: () => list(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-employees"] });

  const createMut = useMutation({
    mutationFn: () => create({ data: { email: email.trim(), password, role } }),
    onSuccess: () => {
      toast.success("تم إضافة الموظف");
      setEmail(""); setPassword(""); setRole("seller");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "فشل الإضافة"),
  });

  const assignMut = useMutation({
    mutationFn: (v: { userId: string; role: AppRole }) => addRole({ data: v }),
    onSuccess: () => { toast.success("تم تعيين الدور"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeRoleMut = useMutation({
    mutationFn: (roleId: string) => rmRole({ data: { roleId } }),
    onSuccess: () => { invalidate(); },
  });

  const deleteMut = useMutation({
    mutationFn: (userId: string) => rmUser({ data: { userId } }),
    onSuccess: () => { toast.success("تم حذف الموظف"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => { e.preventDefault(); if (email && password) createMut.mutate(); }}
        className="rounded-xl border bg-card p-4 space-y-2"
      >
        <h3 className="text-sm font-bold flex items-center gap-2"><UserPlus className="size-4" /> إضافة موظف</h3>
        <input
          type="email"
          placeholder="البريد الإلكتروني"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border p-2 text-sm"
          required
        />
        <input
          type="password"
          placeholder="كلمة السر (6 أحرف+)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          className="w-full rounded-lg border p-2 text-sm"
          required
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as AppRole)}
          className="w-full rounded-lg border p-2 text-sm bg-background"
        >
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
        <button
          type="submit"
          disabled={createMut.isPending}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-brand text-brand-foreground p-2 text-sm font-bold disabled:opacity-50"
        >
          <Plus className="size-4" /> إضافة
        </button>
      </form>

      <div className="space-y-2">
        <h3 className="text-sm font-bold">الموظفون ({users.length})</h3>
        {isLoading ? (
          <p className="text-center text-muted-foreground py-4 text-sm">جاري التحميل...</p>
        ) : (
          <ul className="space-y-2">
            {users.map((u) => (
              <li key={u.id} className="rounded-xl border bg-card p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-sm truncate">{u.email}</div>
                  <button
                    onClick={() => {
                      if (confirm(`حذف ${u.email}؟`)) deleteMut.mutate(u.id);
                    }}
                    className="p-1.5 rounded-md hover:bg-muted"
                    aria-label="حذف"
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {u.roles.length === 0 ? (
                    <span className="text-xs text-muted-foreground">لا توجد أدوار</span>
                  ) : (
                    u.roles.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => removeRoleMut.mutate(r.id)}
                        className="flex items-center gap-1 text-xs bg-secondary rounded-full px-2 py-1 hover:bg-destructive/10"
                        title="إزالة الدور"
                      >
                        {ROLE_LABELS[r.role]} <span className="text-destructive">×</span>
                      </button>
                    ))
                  )}
                </div>
                <div className="flex gap-1">
                  {ROLES.filter((r) => !u.roles.some((ur) => ur.role === r)).map((r) => (
                    <button
                      key={r}
                      onClick={() => assignMut.mutate({ userId: u.id, role: r })}
                      className="text-[11px] rounded-full border px-2 py-0.5 hover:bg-accent"
                    >
                      + {ROLE_LABELS[r]}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
