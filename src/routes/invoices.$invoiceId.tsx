import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { PermissionGate } from "@/components/PermissionGate";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef, useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { formatSDG, formatSDGShort } from "@/lib/format";
import { Printer, ArrowRight, FileText, Receipt, Share2, Loader2, Eye, EyeOff, Edit3, Save, X, AlertTriangle, RotateCw, RotateCcw, ZoomIn, ZoomOut, Maximize2, Plus, Trash2, Wallet, Landmark, CreditCard, Search } from "lucide-react";
import logo from "@/assets/logo.png";
import { useStoreProfile, useSaveStoreProfile } from "@/hooks/use-store-profile";
import { buildInvoiceText, downloadElementAsPdf, sharePdfFileNative, openWhatsAppShare } from "@/lib/invoice-share";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { WhatsAppCustomerPickerDialog } from "@/components/WhatsAppCustomerPickerDialog";
import { toast } from "sonner";
import { handleError } from "@/lib/errors";
import { logger, newRequestId } from "@/lib/logger";
import { invoiceEditRowsSchema, validateItemField } from "@/lib/schemas";
import { useProducts } from "@/hooks/use-products";
import { usePaymentMethods, type PaymentMethodType } from "@/hooks/use-payment-methods";

export const Route = createFileRoute("/invoices/$invoiceId")({
  head: () => ({ meta: [{ title: "فاتورة — المهندس" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    autoprint: s.autoprint === "1" || s.autoprint === 1 || s.autoprint === true ? 1 : 0,
    autopdf: s.autopdf === "1" || s.autopdf === 1 || s.autopdf === true ? 1 : 0,
    autoshare: s.autoshare === "1" || s.autoshare === 1 || s.autoshare === true ? 1 : 0,
  }),
  component: () => (<PermissionGate perm="invoices.view"><InvoiceDetailPage /></PermissionGate>),
  errorComponent: InvoiceDetailError,
  notFoundComponent: InvoiceNotFound,
});

function InvoiceDetailError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    logger.error("invoice_detail_render_error", {
      message: error?.message,
      context: { stack: error?.stack?.slice(0, 500) },
    });
  }, [error]);
  return (
    <AppShell title="خطأ في الفاتورة" showBack>
      <div className="mx-auto max-w-lg rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center space-y-3">
        <AlertTriangle className="mx-auto size-10 text-destructive" />
        <h2 className="text-lg font-bold">تعذّر عرض هذه الفاتورة</h2>
        <p className="text-sm text-muted-foreground">
          حدث خطأ أثناء تحميل بيانات الفاتورة. قد يكون الاتصال ضعيفاً أو أن الفاتورة تم تعديلها من جهاز آخر.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { reset(); router.invalidate(); }}
            className="px-4 h-9 rounded-md bg-primary text-primary-foreground text-sm font-bold inline-flex items-center gap-1"
          >
            <RotateCw className="size-4" /> إعادة المحاولة
          </button>
          <Link to="/invoices" search={{ q: "", status: "all", from: "", to: "" }}
            className="px-4 h-9 rounded-md border border-input bg-background text-sm inline-flex items-center">
            رجوع للفواتير
          </Link>
        </div>
      </div>
    </AppShell>
  );
}

function InvoiceNotFound() {
  return (
    <AppShell title="فاتورة غير موجودة" showBack>
      <div className="mx-auto max-w-lg rounded-xl border border-border bg-card p-6 text-center space-y-3">
        <Receipt className="mx-auto size-10 text-muted-foreground" />
        <h2 className="text-lg font-bold">الفاتورة غير موجودة</h2>
        <p className="text-sm text-muted-foreground">قد تكون قد حُذفت أو أن الرابط غير صحيح.</p>
        <Link to="/invoices" search={{ q: "", status: "all", from: "", to: "" }}
          className="inline-block px-4 h-9 leading-9 rounded-md bg-primary text-primary-foreground text-sm font-bold">
          رجوع للفواتير
        </Link>
      </div>
    </AppShell>
  );
}


type PrintFormat = "a4" | "thermal";

function InvoiceDetailPage() {
  const { invoiceId } = Route.useParams();
  const { autoprint, autopdf, autoshare } = Route.useSearch();
  const { data: storeProfile } = useStoreProfile();
  const saveProfile = useSaveStoreProfile();

  const [format, setFormat] = useState<PrintFormat>("a4");
  const [formatReady, setFormatReady] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [busyPhase, setBusyPhase] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewFitMode, setPreviewFitMode] = useState<"fit" | "100">("fit");
  const [showGuides, setShowGuides] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  // Robust Fit-to-page: accounts for viewport, device pixel ratio, container padding,
  // scrollbars, and mobile browser quirks. Computes zoom based on both width & height
  // so the sheet is always fully visible without clipped margins.
  const computeFitZoom = () => {
    const scroller = previewScrollRef.current;
    if (!scroller) return 1;
    const mmToPx = 96 / 25.4;
    const paperWmm = format === "thermal" ? 80 : 297;
    const paperHmm = format === "thermal" ? 200 : 210;
    const paperW = paperWmm * mmToPx;
    const paperH = paperHmm * mmToPx;
    // Reserve padding + small safety gutter for scrollbar/rounding differences across browsers.
    const rect = scroller.getBoundingClientRect();
    const availW = Math.max(120, rect.width - 40);
    const availH = Math.max(120, rect.height - 40);
    // On very small viewports, don't allow the sheet to overflow horizontally.
    const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;
    const wZoom = availW / paperW;
    const hZoom = availH / paperH;
    // Mobile: prioritize width fit; desktop: use the smaller of the two so nothing clips.
    const raw = isMobile ? wZoom : Math.min(wZoom, hZoom);
    return Math.max(0.2, Math.min(3, +raw.toFixed(2)));
  };

  const applyFit = () => {
    setPreviewFitMode("fit");
    setPreviewZoom(computeFitZoom());
  };
  const applyReset = () => {
    // Reset behavior: if we're currently in Fit mode, snap back to a fresh fit calc;
    // otherwise reset to 100%. Either way, guides return to visible.
    setShowGuides(true);
    if (previewFitMode === "fit") setPreviewZoom(computeFitZoom());
    else setPreviewZoom(1);
  };

  // Auto-fit when preview opens or window resizes (debounced via rAF).
  useEffect(() => {
    if (!previewOpen) return;
    let raf = 0;
    const refit = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (previewFitMode === "fit") setPreviewZoom(computeFitZoom());
      });
    };
    // Initial fit after layout settles
    raf = requestAnimationFrame(() => setPreviewZoom(computeFitZoom()));
    window.addEventListener("resize", refit);
    window.addEventListener("orientationchange", refit);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", refit);
      window.removeEventListener("orientationchange", refit);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewOpen, format, previewFitMode]);

  // Load current user id for per-user preference storage
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  // Resolve print format: per-user localStorage overrides store profile default.
  useEffect(() => {
    const userKey = userId ? `invoice_print_format:${userId}` : null;
    const personal = userKey ? localStorage.getItem(userKey) : null;
    if (personal === "a4" || personal === "thermal") {
      setFormat(personal);
    } else if (storeProfile?.print_size) {
      const size = String(storeProfile.print_size).toLowerCase();
      setFormat(size.includes("mm") ? "thermal" : "a4");
    }
    setFormatReady(true);
  }, [storeProfile?.print_size, userId]);

  const changeFormat = (next: PrintFormat) => {
    setFormat(next);
    // Save per-user preference immediately
    if (userId) {
      try { localStorage.setItem(`invoice_print_format:${userId}`, next); } catch { /* quota */ }
    }
    const nextSize = next === "thermal" ? "80mm" : "A4";
    if (storeProfile && storeProfile.print_size !== nextSize) {
      saveProfile.mutate({ print_size: nextSize });
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: async () => {
      const { data: inv, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", invoiceId)
        .maybeSingle();
      if (error) throw error;
      const { data: items } = await supabase
        .from("invoice_items")
        .select("*")
        .eq("invoice_id", invoiceId);
      let paymentMethod = null;
      if (inv?.payment_method_id) {
        const { data: pm } = await supabase
          .from("payment_methods")
          .select("*")
          .eq("id", inv.payment_method_id)
          .maybeSingle();
        paymentMethod = pm;
      }
      return { inv, items: items ?? [], paymentMethod };
    },
  });

  // Editable rows: [{ id, product_id, product_name, quantity, unit_price }]
  type EditRow = { id: string; product_id: string | null; product_name: string; unit: string; quantity: number; unit_price: number; _origQty: number; _isNew?: boolean };
  const [editRows, setEditRows] = useState<EditRow[]>([]);
  const [deletedRowIds, setDeletedRowIds] = useState<Set<string>>(new Set());
  const [addQuery, setAddQuery] = useState("");
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const draftKey = `invoice-edit-draft:${invoiceId}`;
  const [draftRestored, setDraftRestored] = useState(false);

  // Hydrate rows from server whenever data changes and we're NOT editing.
  useEffect(() => {
    if (data?.items && !editMode) {
      setEditRows(
        data.items.map((it: any) => ({
          id: it.id,
          product_id: it.product_id,
          product_name: it.product_name,
          unit: it.unit ?? "قطعة",
          quantity: Number(it.quantity) || 0,
          unit_price: Number(it.unit_price) || 0,
          _origQty: Number(it.quantity) || 0,
          _isNew: false,
        })),
      );
      setDeletedRowIds(new Set());
    }
  }, [data?.items, editMode]);

  // Restore local draft on entering edit mode (survives PDF failures / refreshes).
  useEffect(() => {
    if (!editMode || draftRestored || !data?.items) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { rows: EditRow[]; savedAt: number };
        if (Array.isArray(parsed?.rows) && parsed.rows.length === data.items.length) {
          setEditRows(parsed.rows);
          toast.info("تم استعادة مسودة محلية للتعديلات غير المحفوظة", {
            description: new Date(parsed.savedAt).toLocaleString("ar-EG"),
            action: {
              label: "تجاهل المسودة",
              onClick: () => {
                localStorage.removeItem(draftKey);
                setEditRows(
                  data.items.map((it: any) => ({
                    id: it.id, product_id: it.product_id, product_name: it.product_name,
                    unit: it.unit ?? "قطعة",
                    quantity: Number(it.quantity) || 0, unit_price: Number(it.unit_price) || 0,
                    _origQty: Number(it.quantity) || 0, _isNew: false,
                  })),
                );
              },
            },
          });
        }
      }
    } catch { /* ignore corrupted draft */ }
    setDraftRestored(true);
  }, [editMode, draftRestored, data?.items, draftKey]);

  // Auto-save draft on every change while editing.
  useEffect(() => {
    if (!editMode || editRows.length === 0) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({ rows: editRows, savedAt: Date.now() }));
    } catch { /* quota / private mode — ignore */ }
  }, [editMode, editRows, draftKey]);

  // Stock availability lookup for edit mode: for each product used, fetch current stock.
  // Effective max we can enter for a row = currentStock + row._origQty
  // (because the row's original qty is currently reflected in stock as "already sold").
  const editProductIds = useMemo(
    () => Array.from(new Set(editRows.map((r) => r.product_id).filter(Boolean) as string[])),
    [editRows],
  );
  const { data: stockMap } = useQuery({
    queryKey: ["invoice-edit-stock", invoiceId, editProductIds.sort().join(",")],
    enabled: editMode && editProductIds.length > 0,
    queryFn: async () => {
      const { data: prods, error } = await supabase
        .from("products").select("id, name, quantity").in("id", editProductIds);
      if (error) throw error;
      const map = new Map<string, { id: string; name: string; quantity: number }>();
      for (const p of prods ?? []) map.set(p.id, { id: p.id, name: p.name, quantity: Number(p.quantity) || 0 });
      return map;
    },
    staleTime: 5_000,
  });

  const visibleEditRows = useMemo(
    () => editRows.filter((r) => !deletedRowIds.has(r.id)),
    [editRows, deletedRowIds],
  );
  const editTotal = useMemo(
    () => visibleEditRows.reduce((s, r) => s + r.quantity * r.unit_price, 0),
    [visibleEditRows],
  );

  const maxAllowedFor = (row: EditRow): number | null => {
    if (!row.product_id || !stockMap) return null;
    const p = stockMap.get(row.product_id);
    if (!p) return null;
    return p.quantity + row._origQty;
  };

  // Per-row inline validation errors — {rowId: {quantity?, unit_price?}}
  const [rowErrors, setRowErrors] = useState<Record<string, { quantity?: string; unit_price?: string }>>({});
  const hasFieldErrors = useMemo(
    () => Object.values(rowErrors).some((e) => e.quantity || e.unit_price),
    [rowErrors],
  );

  // Overstock rows (quantity exceeds available). Blocks save with clear message.
  const overstockRows = useMemo(() => {
    return visibleEditRows
      .map((r) => {
        const max = maxAllowedFor(r);
        if (max === null) return null;
        if (r.quantity > max) return { row: r, max };
        return null;
      })
      .filter((x): x is { row: EditRow; max: number } => !!x);
  }, [visibleEditRows, stockMap]);
  const hasOverstock = overstockRows.length > 0;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!data?.inv) throw new Error("لا توجد بيانات فاتورة");
      const inv = data.inv;
      const reqId = newRequestId("inv");
      const visible = editRows.filter((r) => !deletedRowIds.has(r.id));
      const deletedRows = (data.items ?? []).filter((it: any) => deletedRowIds.has(it.id));
      logger.info("invoice_edit_save_start", {
        context: { invoiceId: inv.id, invoiceNumber: inv.invoice_number, rows: visible.length, added: visible.filter((r) => r._isNew).length, deleted: deletedRows.length, reqId },
      });

      // ---------- 1) Zod validation of visible rows ----------
      const parsed = invoiceEditRowsSchema.safeParse(visible);
      if (!parsed.success) {
        const firstIssue = parsed.error.issues[0];
        const rowIdx = typeof firstIssue?.path?.[0] === "number" ? (firstIssue.path[0] as number) + 1 : 0;
        const field = firstIssue?.path?.[1];
        const label = field === "quantity" ? "الكمية" : field === "unit_price" ? "سعر الوحدة" : "الحقل";
        const msg = rowIdx
          ? `الصف ${rowIdx} — ${label}: ${firstIssue?.message ?? "قيمة غير صالحة"}`
          : firstIssue?.message ?? "بيانات غير صالحة";
        logger.warn("invoice_edit_validation_failed", { message: msg, context: { reqId, invoiceId: inv.id } });
        throw new Error(msg);
      }

      // Map validated rows back to _isNew / unit info (schema strips them).
      const rowsWithFlags = parsed.data.map((r, i) => ({
        ...r,
        _isNew: !!visible[i]._isNew,
        unit: visible[i].unit ?? "قطعة",
      }));

      // ---------- 2) Pre-flight stock check for INCREASED quantities (incl. new rows) ----------
      const increases = rowsWithFlags.filter((r) => r.product_id && r.quantity > r._origQty);
      if (increases.length > 0) {
        const productIds = Array.from(new Set(increases.map((r) => r.product_id!) as string[]));
        const { data: prods, error: prodsErr } = await supabase
          .from("products")
          .select("id, name, quantity")
          .in("id", productIds);
        if (prodsErr) throw prodsErr;
        const stockMapLocal = new Map((prods ?? []).map((p) => [p.id, p]));
        for (const r of increases) {
          const p = stockMapLocal.get(r.product_id!);
          if (!p) continue;
          const delta = r.quantity - r._origQty;
          const available = Number(p.quantity) || 0;
          if (available < delta) {
            const shortage = delta - available;
            const msg = `الكمية المطلوبة للصنف "${p.name}" تتجاوز المخزون المتاح (متبقٍ ${available}، النقص ${shortage}).`;
            logger.warn("invoice_edit_insufficient_stock", {
              message: msg,
              context: { reqId, productId: p.id, available, requestedDelta: delta },
            });
            throw new Error(msg);
          }
        }
      }

      // Ensure user id (needed for inserts).
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData?.user?.id;
      if (!uid) throw new Error("يجب تسجيل الدخول");

      // ---------- 3a) Insert NEW rows ----------
      for (const row of rowsWithFlags) {
        if (!row._isNew) continue;
        const lineTotal = row.quantity * row.unit_price;
        const { error: insErr } = await supabase.from("invoice_items").insert({
          invoice_id: inv.id,
          user_id: uid,
          product_id: row.product_id,
          product_name: row.product_name,
          unit: row.unit ?? "قطعة",
          quantity: row.quantity,
          unit_price: row.unit_price,
          cost_price: 0,
          line_total: lineTotal,
        });
        if (insErr) throw insErr;
      }

      // ---------- 3b) UPDATE existing rows ----------
      for (const row of rowsWithFlags) {
        if (row._isNew) continue;
        const lineTotal = row.quantity * row.unit_price;
        const { error: upErr } = await supabase
          .from("invoice_items")
          .update({ quantity: row.quantity, unit_price: row.unit_price, line_total: lineTotal })
          .eq("id", row.id);
        if (upErr) throw upErr;
      }

      // ---------- 3c) DELETE removed rows + restore their stock ----------
      for (const it of deletedRows) {
        const { error: delErr } = await supabase.from("invoice_items").delete().eq("id", it.id);
        if (delErr) throw delErr;
        if (it.product_id) {
          const { data: prod } = await supabase
            .from("products").select("quantity").eq("id", it.product_id).maybeSingle();
          if (prod) {
            const restored = (Number(prod.quantity) || 0) + (Number(it.quantity) || 0);
            await supabase.from("products").update({ quantity: restored }).eq("id", it.product_id);
          }
        }
      }

      // ---------- 4) Apply stock deltas for kept rows (bounded to >=0) ----------
      for (const row of rowsWithFlags) {
        const delta = row.quantity - row._origQty;
        if (delta === 0 || !row.product_id) continue;
        const { data: prod, error: prodErr } = await supabase
          .from("products").select("quantity").eq("id", row.product_id).maybeSingle();
        if (prodErr) throw prodErr;
        if (!prod) continue;
        const currentQty = Number(prod.quantity) || 0;
        const newQty = currentQty - delta;
        if (newQty < 0) {
          const msg = `تعذّر تحديث المخزون — تغيّر رصيد الصنف قبل الحفظ. أعد المحاولة.`;
          logger.warn("invoice_edit_stock_race", { message: msg, context: { reqId, productId: row.product_id, currentQty, delta } });
          throw new Error(msg);
        }
        const { error: stockErr } = await supabase
          .from("products").update({ quantity: newQty }).eq("id", row.product_id);
        if (stockErr) throw stockErr;
      }

      // ---------- 5) Recompute invoice totals from validated data ----------
      const newTotal = rowsWithFlags.reduce((s, r) => s + r.quantity * r.unit_price, 0);
      const paid = Math.min(Number(inv.paid) || 0, newTotal);
      const remaining = Math.max(0, newTotal - paid);
      const status: "paid" | "partial" | "pending" =
        newTotal === 0 ? "paid" : remaining === 0 ? "paid" : paid > 0 ? "partial" : "pending";
      const { error: invErr } = await supabase
        .from("invoices")
        .update({ total: newTotal, paid, remaining, status })
        .eq("id", inv.id);
      if (invErr) throw invErr;

      // ---------- 6) Best-effort audit log ----------
      try {
        const changes = rowsWithFlags.map((r) => ({
          item_id: r._isNew ? null : r.id,
          product_id: r.product_id,
          product_name: r.product_name,
          qty_from: r._origQty,
          qty_to: r.quantity,
          unit_price: r.unit_price,
          added: !!r._isNew,
        }));
        const deletions = deletedRows.map((it: any) => ({
          item_id: it.id, product_id: it.product_id, product_name: it.product_name,
          qty_removed: Number(it.quantity) || 0,
        }));
        await supabase.from("audit_logs").insert({
          user_id: uid,
          action: "invoice.items.updated",
          table_name: "invoices",
          record_id: inv.id,
          details: { req_id: reqId, invoice_number: inv.invoice_number, changes, deletions, new_total: newTotal, paid, remaining, status },
        });
      } catch (auditErr) {
        logger.warn("audit_log_write_failed", { message: (auditErr as Error)?.message, context: { reqId } });
      }

      logger.info("invoice_edit_save_success", {
        context: { reqId, invoiceId: inv.id, newTotal, paid, remaining, status },
      });
      return { reqId, newTotal, paid, remaining, status };
    },
    onSuccess: (res) => {
      toast.success("تم حفظ التعديلات بنجاح", {
        description: res ? `الإجمالي الجديد: ${formatSDG(res.newTotal)}` : undefined,
      });
      setEditMode(false);
      setRowErrors({});
      setDraftRestored(false);
      setDeletedRowIds(new Set());
      try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
      queryClient.invalidateQueries({ queryKey: ["invoice", invoiceId] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["account-balances"] });
    },
    onError: (e) => handleError(e, "تعذّر حفظ التعديلات", {
      event: "invoice_edit_save_failed",
      context: { invoiceId, rows: editRows.length },
      action: { label: "إعادة المحاولة", onClick: () => saveMutation.mutate() },
    }),
  });

  // ============ Product search for "Add item" in edit mode ============
  const { data: allProducts = [] } = useProducts({ q: addQuery, sort: "name", asc: true });
  const productMatches = useMemo(() => {
    if (!addQuery.trim()) return [] as typeof allProducts;
    return allProducts.slice(0, 10);
  }, [allProducts, addQuery]);

  function addProductToInvoice(p: (typeof allProducts)[number]) {
    setEditRows((rows) => [
      ...rows,
      {
        id: (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`),
        product_id: p.id,
        product_name: p.name,
        unit: p.unit || "قطعة",
        quantity: 1,
        unit_price: p.salePrice,
        _origQty: 0,
        _isNew: true,
      },
    ]);
    setAddQuery("");
    setAddPickerOpen(false);
  }

  // ============ Add-payment dialog ============
  const { data: paymentMethods = [] } = usePaymentMethods(true);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payAmount, setPayAmount] = useState<string>("");
  const [payMethodId, setPayMethodId] = useState<string>("");
  const [payReference, setPayReference] = useState<string>("");
  const [payNotes, setPayNotes] = useState<string>("");

  useEffect(() => {
    if (!payDialogOpen) return;
    // Prefill with the remaining amount and default method.
    const remaining = Math.max(0, Number(data?.inv?.remaining) || 0);
    setPayAmount(remaining > 0 ? String(remaining) : "");
    if (!payMethodId && paymentMethods.length > 0) {
      const def = paymentMethods.find((m) => m.is_default) ?? paymentMethods[0];
      setPayMethodId(def.id);
    }
    setPayReference("");
    setPayNotes("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payDialogOpen]);

  const addPaymentMutation = useMutation({
    mutationFn: async () => {
      if (!data?.inv) throw new Error("لا توجد بيانات فاتورة");
      const inv = data.inv;
      const amount = Number(payAmount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("أدخل مبلغاً صحيحاً");
      const remaining = Math.max(0, Number(inv.remaining) || 0);
      if (amount > remaining) throw new Error(`المبلغ يتجاوز المتبقي (${formatSDG(remaining)})`);
      const method = paymentMethods.find((m) => m.id === payMethodId);
      if (!method) throw new Error("اختر حساب الدفع");
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData?.user?.id;
      if (!uid) throw new Error("يجب تسجيل الدخول");

      const notesParts: string[] = [];
      if (method.type === "bank" && payReference.trim()) notesParts.push(`رقم العملية: ${payReference.trim()}`);
      if (payNotes.trim()) notesParts.push(payNotes.trim());

      const { error: payErr } = await supabase.from("payments").insert({
        user_id: uid,
        party_type: inv.customer_id ? "customer" : null,
        party_id: inv.customer_id ?? null,
        amount,
        method: method.type,
        account_id: method.id,
        invoice_id: inv.id,
        notes: notesParts.join(" — ") || null,
      } as never);
      if (payErr) throw payErr;

      const newPaid = (Number(inv.paid) || 0) + amount;
      const newRemaining = Math.max(0, (Number(inv.total) || 0) - newPaid);
      const newStatus: "paid" | "partial" | "pending" =
        newRemaining === 0 ? "paid" : newPaid > 0 ? "partial" : "pending";
      const { error: invErr } = await supabase
        .from("invoices")
        .update({ paid: newPaid, remaining: newRemaining, status: newStatus })
        .eq("id", inv.id);
      if (invErr) throw invErr;
      return { amount, newRemaining };
    },
    onSuccess: (res) => {
      toast.success("تم تسجيل الدفعة", {
        description: `المتبقي: ${formatSDG(res.newRemaining)}`,
      });
      setPayDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["invoice", invoiceId] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["account-balances"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
    },
    onError: (e) => handleError(e, "تعذّر تسجيل الدفعة"),
  });



  const cancelMutation = useMutation({
    mutationFn: async (reason: string) => {
      const trimmed = reason.trim();
      if (trimmed.length < 3) throw new Error("يرجى إدخال سبب واضح للإلغاء (3 أحرف على الأقل)");
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData?.user?.id ?? null;
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from("invoices")
        .update({
          status: "cancelled",
          cancellation_reason: trimmed,
          cancelled_at: nowIso,
          cancelled_by: uid,
        })
        .eq("id", invoiceId);
      if (error) throw error;
      if (uid) {
        await supabase.from("audit_logs").insert({
          user_id: uid,
          action: "invoice.cancelled",
          table_name: "invoices",
          record_id: invoiceId,
          details: { reason: trimmed, invoice_number: data?.inv?.invoice_number },
        });
      }
    },
    onSuccess: () => {
      toast.success("تم إلغاء الفاتورة");
      setCancelOpen(false);
      setCancelReason("");
      queryClient.invalidateQueries({ queryKey: ["invoice", invoiceId] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e) => handleError(e, "تعذّر إلغاء الفاتورة"),
  });


  // Auto-open print dialog only ONCE per page visit; background refetches
  // must not retrigger window.print(). Wrapped in try/catch since some
  // embedded browsers throw on window.print().
  const printedRef = useRef(false);
  const hasInv = Boolean(data?.inv);
  useEffect(() => {
    if (!autoprint || !formatReady || !hasInv || printedRef.current) return;
    printedRef.current = true;
    const t = setTimeout(() => {
      try {
        window.print();
      } catch (e) {
        handleError(e, "تعذّر فتح نافذة الطباعة", {
          event: "auto_print_failed",
          context: { invoiceId },
        });
      }
    }, 350);
    return () => clearTimeout(t);
  }, [autoprint, formatReady, hasInv, invoiceId]);

  // Auto-trigger PDF/WhatsApp actions if requested via search params (once).
  const pdfTriggeredRef = useRef(false);
  const shareTriggeredRef = useRef(false);
  useEffect(() => {
    if (!formatReady || !hasInv) return;
    if (autopdf && !pdfTriggeredRef.current) {
      pdfTriggeredRef.current = true;
      setTimeout(() => { handleDownloadPdf().catch(() => {}); }, 400);
    }
    if (autoshare && !shareTriggeredRef.current) {
      shareTriggeredRef.current = true;
      setTimeout(() => { try { handleWhatsAppShare(); } catch { /* noop */ } }, 400);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autopdf, autoshare, formatReady, hasInv]);

  if (isLoading) {
    return (
      <AppShell title="فاتورة" showBack>
        <div className="p-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="size-4 animate-spin" /> جارٍ التحميل…
        </div>
      </AppShell>
    );
  }
  if (!data?.inv) {
    return <InvoiceNotFound />;
  }

  const { inv, items, paymentMethod } = data;
  const store = storeProfile;
  const storeName = store?.name || "المهندس";
  const storeSubtitle = store?.invoice_header || "المهندس لقطع غيار السيارات";
  const storePhone = store?.phone || "0960514233 - 0113071742";
  const storeAddress = store?.address || "";
  const invoiceFooter = store?.invoice_footer || "";
  const showLogo = store?.show_logo !== false;
  const baseLabel = inv.payment_method === "bank" ? "تحويل بنكي" : inv.payment_method === "mixed" ? "مختلط" : "نقدي";
  const paymentLabel = paymentMethod?.name ? `${baseLabel} — ${paymentMethod.name}` : baseLabel;

  /** Try to safely trigger the browser print dialog. */
  function tryPrint() {
    try {
      window.print();
    } catch (e) {
      handleError(e, "تعذّر فتح نافذة الطباعة — استخدم اختصار Ctrl+P", {
        event: "manual_print_failed",
        context: { invoiceId: inv.id },
      });
    }
  }

  async function handleDownloadPdf(attempt = 1) {
    const el = previewRef.current ?? printRef.current;
    if (!el) {
      toast.error("لم يتم تجهيز محتوى الفاتورة بعد — أعد المحاولة");
      return;
    }
    if (pdfBusy) return;
    setPdfBusy(true);
    setBusyPhase("جارٍ توليد الـ PDF…");
    const reqId = newRequestId("pdf");
    logger.info("pdf_download_start", { context: { reqId, invoiceId: inv.id, format, attempt } });
    try {
      const filename = `فاتورة-${inv.invoice_number}.pdf`;
      await downloadElementAsPdf(el, filename, format);
      toast.success("تم تنزيل الـ PDF");
      logger.info("pdf_download_success", { context: { reqId, invoiceId: inv.id } });
    } catch (e) {
      // First failure: offer a one-click retry. Second: offer print fallback.
      if (attempt < 2) {
        handleError(e, "تعذّر إنشاء الـ PDF — قد يكون بسبب حجم الصفحة أو الذاكرة", {
          event: "pdf_download_failed",
          context: { reqId, invoiceId: inv.id, attempt },
          action: { label: "إعادة المحاولة", onClick: () => handleDownloadPdf(2) },
        });
      } else {
        handleError(e, "تعذّر إنشاء الـ PDF مرتين — يمكنك الطباعة مباشرة كبديل", {
          event: "pdf_download_failed_final",
          context: { reqId, invoiceId: inv.id, attempt },
          action: { label: "طباعة بدلاً من ذلك", onClick: () => tryPrint() },
        });
      }
    } finally {
      setBusyPhase("");
      setPdfBusy(false);
    }
  }

  /**
   * Native OS share for the PDF file itself. On iOS/Android this opens the
   * system share sheet so the user picks the target app (WhatsApp / Mail /
   * Files / Telegram / AirDrop). On desktop or unsupported browsers it
   * gracefully falls back to a local download.
   */
  async function handleSharePdfNative(attempt = 1) {
    const el = previewRef.current ?? printRef.current;
    if (!el) { toast.error("لم يتم تجهيز محتوى الفاتورة بعد — أعد المحاولة"); return; }
    if (pdfBusy) return;
    setPdfBusy(true);
    setBusyPhase("جارٍ توليد ملف PDF…");
    const reqId = newRequestId("pdf-share");
    const loadingId = toast.loading("جارٍ تجهيز ملف PDF للمشاركة…");
    try {
      const filename = `فاتورة-${inv.invoice_number}.pdf`;
      const text = buildInvoiceText(inv, items, storeName, {
        includeItems: false,
        footer: invoiceFooter || undefined,
        storePhone,
      });
      setBusyPhase("جارٍ فتح نافذة المشاركة…");
      const result = await sharePdfFileNative(el, filename, format, {
        title: `فاتورة #${inv.invoice_number}`,
        text,
      });
      toast.dismiss(loadingId);
      if (result === "shared") {
        toast.success("✅ تمت مشاركة ملف PDF بنجاح");
      } else if (result === "downloaded") {
        toast.info("📥 تم تنزيل الملف — جهازك لا يدعم المشاركة المباشرة", {
          description: "يمكنك الآن رفع الملف يدوياً في أي تطبيق.",
        });
      } else {
        toast("تم إلغاء المشاركة");
      }
      logger.info("pdf_share_native", { context: { reqId, invoiceId: inv.id, result, attempt } });
    } catch (e) {
      toast.dismiss(loadingId);
      const err = e as { name?: string; message?: string; code?: string | number };
      const errName = err?.name || "Error";
      const errCode = err?.code ?? errName;
      const errMsg = err?.message || String(e);
      const errText = `[${reqId}] ${errName}(${errCode}): ${errMsg}`.slice(0, 500);
      const description = `السبب: ${errMsg.slice(0, 140)} — رمز: ${errCode}`;
      toast.error(attempt < 2 ? "❌ فشلت مشاركة PDF" : "❌ فشلت المشاركة مرتين — جرّب الطباعة", {
        description,
        duration: 12000,
        action: attempt < 2
          ? { label: "إعادة المحاولة", onClick: () => handleSharePdfNative(2) }
          : { label: "طباعة بدلاً من ذلك", onClick: () => tryPrint() },
        cancel: {
          label: "نسخ الخطأ",
          onClick: () => {
            try {
              navigator.clipboard.writeText(errText);
              toast.success("تم نسخ رسالة الخطأ — أرسلها للدعم");
            } catch {
              toast.error("تعذّر النسخ التلقائي");
            }
          },
        },
      });
      logger.error("pdf_share_native_failed", { context: { reqId, invoiceId: inv.id, attempt, errName, errCode, errMsg } });
    } finally {
      setBusyPhase("");
      setPdfBusy(false);
    }
  }

  /** Show a quick confirmation toast before opening the print dialog. */
  function confirmAndPrint() {
    toast("إرسال الفاتورة إلى الطابعة؟", {
      description: format === "thermal" ? "الحجم: 80mm حراري" : "الحجم: A4",
      action: { label: "تأكيد الطباعة", onClick: () => tryPrint() },
      cancel: { label: "إلغاء", onClick: () => {} },
      duration: 6000,
    });
  }

  function sendWhatsAppText(phone: string | null) {
    if (shareBusy) return;
    setShareBusy(true);
    const reqId = newRequestId("wa");
    try {
      const text = buildInvoiceText(inv, items, storeName, {
        includeItems: true,
        footer: invoiceFooter || undefined,
        storePhone,
      });
      openWhatsAppShare(phone, text);
      toast.success(phone ? "تم فتح واتساب مع نص الفاتورة" : "اختر جهة الاتصال في واتساب");
      logger.info("whatsapp_share_success", { context: { reqId, invoiceId: inv.id, hadPhone: !!phone } });
    } catch (e) {
      handleError(e, "تعذّر فتح واتساب", {
        event: "whatsapp_share_failed",
        context: { reqId, invoiceId: inv.id },
      });
    } finally {
      setShareBusy(false);
    }
  }

  function handleWhatsAppShare(opts: { pickContact?: boolean } = {}) {
    if (opts.pickContact) { setPickerOpen(true); return; }
    // Direct send to invoice customer's phone; if none, wa.me opens contact picker.
    sendWhatsAppText(inv.customer_phone ?? null);
  }





  return (
    <div className="min-h-dvh bg-muted/30 print:bg-white">
      {/* Global progress bar while generating/sharing PDF */}
      {(pdfBusy || shareBusy) && (
        <div className="fixed top-0 inset-x-0 z-50 print:hidden" role="progressbar" aria-label="جارٍ المعالجة">
          <div className="h-1 bg-primary/20 overflow-hidden">
            <div className="h-full w-1/3 bg-primary animate-[progress_1.2s_ease-in-out_infinite]" />
          </div>
          {busyPhase && (
            <div className="mx-auto max-w-4xl text-xs text-center py-1 bg-primary/10 text-primary font-medium">
              {busyPhase}
            </div>
          )}
        </div>
      )}
      {/* Toolbar */}
      <header className="bg-header text-header-foreground shadow print:hidden">
        <div className="mx-auto max-w-4xl px-4 h-14 flex items-center gap-2 flex-wrap">
          <Link to="/invoices" search={{ q: "", status: "all", from: "", to: "" }} className="p-2 rounded-md hover:bg-white/10">
            <ArrowRight className="size-5" />
          </Link>
          <h1 className="text-lg font-bold flex-1 min-w-[140px]">فاتورة #{inv.invoice_number}</h1>

          <div className="flex items-center rounded-lg bg-white/10 p-0.5 text-sm">
            <button
              onClick={() => changeFormat("a4")}
              className={`flex items-center gap-1 rounded-md px-3 py-1.5 transition ${format === "a4" ? "bg-white text-header shadow" : "text-white/90 hover:bg-white/10"}`}
            >
              <FileText className="size-4" /> A4
            </button>
            <button
              onClick={() => changeFormat("thermal")}
              className={`flex items-center gap-1 rounded-md px-3 py-1.5 transition ${format === "thermal" ? "bg-white text-header shadow" : "text-white/90 hover:bg-white/10"}`}
            >
              <Receipt className="size-4" /> حراري
            </button>
          </div>

          <button
            onClick={() => setPreviewOpen(true)}
            className="flex items-center gap-1 text-sm bg-white/20 hover:bg-white/30 rounded-lg px-2.5 sm:px-3 py-1.5"
            title="معاينة قبل الطباعة أو المشاركة"
            aria-label="معاينة"
          >
            <Eye className="size-4" /> <span className="hidden sm:inline">معاينة</span>
          </button>

          <button
            onClick={() => handleSharePdfNative()}
            disabled={pdfBusy}
            className="flex items-center gap-1 text-sm bg-sky-500 hover:bg-sky-600 disabled:opacity-60 text-white rounded-lg px-2.5 sm:px-3 py-1.5"
            title="مشاركة ملف PDF عبر تطبيقات الجهاز (واتساب/بريد/تلغرام...)"
            aria-label="مشاركة PDF"
          >
            {pdfBusy ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}
            <span className="hidden sm:inline">مشاركة PDF</span>
          </button>

          <button
            onClick={confirmAndPrint}
            className="flex items-center gap-1 text-sm bg-white/20 hover:bg-white/30 rounded-lg px-2.5 sm:px-3 py-1.5"
            title="طباعة الفاتورة (يظهر تأكيد سريع أولاً)"
            aria-label="طباعة"
          >
            <Printer className="size-4" /> <span className="hidden sm:inline">طباعة</span>
          </button>

          <button
            onClick={() => handleWhatsAppShare()}
            disabled={shareBusy}
            className="flex items-center gap-1 text-sm bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white rounded-lg px-2.5 sm:px-3 py-1.5"
            title={inv.customer_phone ? "إرسال نص الفاتورة إلى رقم العميل" : "إرسال نص الفاتورة — اختر جهة الاتصال"}
            aria-label="واتساب"
          >
            {shareBusy ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}
            <span className="hidden sm:inline">واتساب</span>
          </button>

          <button
            onClick={() => handleWhatsAppShare({ pickContact: true })}
            disabled={shareBusy}
            className="hidden sm:flex items-center gap-1 text-sm bg-emerald-600/90 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-lg px-3 py-1.5"
            title="اختر جهة اتصال من واتساب وأرسل نص الفاتورة"
          >
            <Share2 className="size-4" /> اختر جهة اتصال
          </button>

          {inv.status !== "cancelled" && Number(inv.remaining) > 0 && (
            <button
              onClick={() => setPayDialogOpen(true)}
              className="flex items-center gap-1 text-sm bg-emerald-500/90 hover:bg-emerald-600 text-white rounded-lg px-2.5 sm:px-3 py-1.5"
              title="تسجيل دفعة جديدة على الفاتورة"
              aria-label="تسجيل دفعة"
            >
              <Wallet className="size-4" />
              <span className="hidden sm:inline">تسجيل دفعة</span>
            </button>
          )}

          <button
            onClick={() => setEditMode((v) => !v)}
            className={`flex items-center gap-1 text-sm rounded-lg px-2.5 sm:px-3 py-1.5 ${editMode ? "bg-amber-500 text-white hover:bg-amber-600" : "bg-white/20 hover:bg-white/30"}`}
            title={editMode ? "إلغاء التعديل" : "تعديل بنود الفاتورة"}
            aria-label={editMode ? "إلغاء" : "تعديل"}
          >
            {editMode ? <X className="size-4" /> : <Edit3 className="size-4" />}
            <span className="hidden sm:inline">{editMode ? "إلغاء" : "تعديل"}</span>
          </button>

          {inv.status !== "cancelled" && (
            <button
              onClick={() => setCancelOpen(true)}
              className="flex items-center gap-1 text-sm bg-red-500/90 hover:bg-red-600 text-white rounded-lg px-2.5 sm:px-3 py-1.5"
              title="إلغاء الفاتورة مع إدخال سبب"
            >
              <X className="size-4" /> <span className="hidden sm:inline">إلغاء الفاتورة</span>
            </button>
          )}
        </div>
      </header>

      {inv.status === "cancelled" && (
        <div className="mx-auto max-w-4xl px-4 pt-3 print:hidden">
          <div className="rounded-lg border border-red-300 bg-red-50 text-red-800 p-3 text-sm">
            <div className="font-bold mb-0.5">هذه الفاتورة ملغاة</div>
            {inv.cancellation_reason && <div>السبب: {inv.cancellation_reason}</div>}
            {inv.cancelled_at && (
              <div className="text-xs opacity-80 mt-0.5">
                وقت الإلغاء: {new Date(inv.cancelled_at).toLocaleString("ar-EG")}
              </div>
            )}
          </div>
        </div>
      )}

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>إلغاء الفاتورة #{inv.invoice_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">سبب الإلغاء (مطلوب)</label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="مثال: طلب العميل الإلغاء، خطأ في الأصناف، ..."
              className="w-full rounded-md border border-input bg-background p-2 text-sm"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">سيصل تنبيه فوري للمدير يوضّح السبب.</p>
          </div>
          <DialogFooter>
            <button
              onClick={() => setCancelOpen(false)}
              className="px-4 h-9 rounded-md border border-input bg-background text-sm"
            >
              تراجع
            </button>
            <button
              onClick={() => cancelMutation.mutate(cancelReason)}
              disabled={cancelMutation.isPending || cancelReason.trim().length < 3}
              className="px-4 h-9 rounded-md bg-red-600 text-white text-sm font-bold flex items-center gap-1 disabled:opacity-60"
            >
              {cancelMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
              تأكيد الإلغاء
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <WhatsAppCustomerPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        defaultCustomerId={inv.customer_id ?? null}
        defaultCustomerName={inv.customer_name ?? null}
        defaultCustomerPhone={inv.customer_phone ?? null}
        onConfirm={(phone) => sendWhatsAppText(phone)}
      />

      {/* Add payment dialog */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="size-5 text-emerald-600" /> تسجيل دفعة على الفاتورة #{inv.invoice_number}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex items-center justify-between rounded-md bg-muted p-2 text-sm">
              <span>الإجمالي: <span className="nums font-semibold">{formatSDG(Number(inv.total) || 0)}</span></span>
              <span>المدفوع: <span className="nums font-semibold">{formatSDG(Number(inv.paid) || 0)}</span></span>
              <span>المتبقي: <span className="nums font-bold text-emerald-700">{formatSDG(Number(inv.remaining) || 0)}</span></span>
            </div>

            <div>
              <label className="text-xs font-semibold mb-1 block">المبلغ</label>
              <input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 nums"
              />
              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  onClick={() => setPayAmount(String(Math.max(0, Number(inv.remaining) || 0)))}
                  className="text-xs underline text-emerald-700"
                >دفع المتبقي</button>
                <button
                  type="button"
                  onClick={() => setPayAmount(String((Math.max(0, Number(inv.remaining) || 0)) / 2))}
                  className="text-xs underline text-muted-foreground"
                >النصف</button>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold mb-1 block">حساب الدفع</label>
              {paymentMethods.length === 0 ? (
                <p className="text-xs text-muted-foreground">لا توجد حسابات مفعّلة — أضف حساباً من صفحة الحسابات.</p>
              ) : (
                <div className="grid grid-cols-1 gap-1.5">
                  {paymentMethods.map((m) => {
                    const active = m.id === payMethodId;
                    const Icon = m.type === "bank" ? Landmark : Wallet;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setPayMethodId(m.id)}
                        className={`flex items-center gap-2 rounded-md border p-2 text-sm text-right ${active ? "border-brand bg-brand/5 ring-1 ring-brand" : "border-input hover:bg-muted"}`}
                      >
                        <Icon className={`size-4 ${m.type === "bank" ? "text-blue-600" : "text-emerald-600"}`} />
                        <span className="font-medium">{m.name}</span>
                        <span className="text-[11px] text-muted-foreground me-auto">{m.type === "bank" ? "بنكي" : "نقدي"}{m.bank_name ? ` — ${m.bank_name}` : ""}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {(() => {
              const chosen = paymentMethods.find((m) => m.id === payMethodId);
              if (chosen?.type === "bank") {
                return (
                  <div>
                    <label className="text-xs font-semibold mb-1 block flex items-center gap-1">
                      <CreditCard className="size-3.5" /> رقم العملية
                    </label>
                    <input
                      type="text"
                      value={payReference}
                      onChange={(e) => setPayReference(e.target.value)}
                      placeholder="رقم مرجعي/تحويل بنكي"
                      className="w-full h-10 rounded-md border border-input bg-background px-3"
                    />
                  </div>
                );
              }
              return null;
            })()}

            <div>
              <label className="text-xs font-semibold mb-1 block">ملاحظات (اختياري)</label>
              <input
                type="text"
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
                className="w-full h-10 rounded-md border border-input bg-background px-3"
              />
            </div>
          </div>
          <DialogFooter>
            <button
              onClick={() => setPayDialogOpen(false)}
              className="px-4 h-10 rounded-md border border-input bg-background text-sm hover:bg-muted"
            >إلغاء</button>
            <button
              onClick={() => addPaymentMutation.mutate()}
              disabled={addPaymentMutation.isPending || !payMethodId || !payAmount}
              className="px-4 h-10 rounded-md bg-emerald-600 text-white text-sm font-bold flex items-center gap-1 disabled:opacity-60"
            >
              {addPaymentMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              تسجيل الدفعة
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>






      {/* Inline edit panel */}
      {editMode && (
        <section className="bg-amber-50 border-b border-amber-200 print:hidden">
          <div className="mx-auto max-w-4xl px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-amber-900">تعديل بنود الفاتورة</h2>
              <div className="text-sm text-amber-900">
                الإجمالي الجديد: <span className="font-bold nums">{formatSDG(editTotal)}</span>
              </div>
            </div>
            <div className="rounded-lg bg-white border border-amber-200 overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead className="bg-amber-100/60 text-amber-900">
                  <tr>
                    <th className="p-2 text-right">الصنف</th>
                    <th className="p-2 w-24">الكمية</th>
                    <th className="p-2 w-32">سعر الوحدة</th>
                    <th className="p-2 w-32">الإجمالي</th>
                    <th className="p-2 w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100">
                  {visibleEditRows.map((row) => {
                    const i = editRows.findIndex((r) => r.id === row.id);
                    const err = rowErrors[row.id] ?? {};
                    const max = maxAllowedFor(row);
                    const over = max !== null && row.quantity > max;
                    return (
                    <tr key={row.id} className={row._isNew ? "bg-emerald-50/70" : undefined}>
                      <td className="p-2 align-top">
                        {row.product_name}
                        {row._isNew && <span className="ms-2 text-[10px] rounded bg-emerald-600 text-white px-1.5 py-0.5">جديد</span>}
                      </td>
                      <td className="p-2 align-top">
                        <input
                          type="number"
                          min={1}
                          step="1"
                          inputMode="numeric"
                          value={row.quantity}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const v = raw === "" ? 0 : Math.max(0, Number(raw) || 0);
                            setEditRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, quantity: v } : r)));
                            const msg = validateItemField("quantity", v);
                            setRowErrors((prev) => ({ ...prev, [row.id]: { ...prev[row.id], quantity: msg ?? undefined } }));
                          }}
                          aria-invalid={!!err.quantity || over}
                          className={`w-full text-center h-9 rounded-md border bg-background px-2 nums ${err.quantity || over ? "border-destructive" : "border-input"}`}
                        />
                        {err.quantity && <div className="text-[11px] text-destructive mt-1">{err.quantity}</div>}
                        {over && (
                          <div className="mt-1 space-y-1">
                            <div className="text-[11px] text-destructive font-semibold flex items-center gap-1">
                              <AlertTriangle className="size-3" /> تتجاوز المتاح (الأقصى {max})
                            </div>
                            <input
                              type="range"
                              min={1}
                              max={Math.max(1, max!)}
                              value={Math.min(row.quantity, max!)}
                              onChange={(e) => {
                                const v = Number(e.target.value) || 1;
                                setEditRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, quantity: v } : r)));
                                setRowErrors((prev) => ({ ...prev, [row.id]: { ...prev[row.id], quantity: undefined } }));
                              }}
                              className="w-full accent-brand"
                              aria-label="اختر كمية بديلة ضمن المتاح"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setEditRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, quantity: max! } : r)));
                              }}
                              className="text-[11px] underline text-amber-900"
                            >
                              استخدم الحد الأقصى ({max})
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="p-2 align-top">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          inputMode="decimal"
                          value={row.unit_price}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const v = raw === "" ? 0 : Math.max(0, Number(raw) || 0);
                            setEditRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, unit_price: v } : r)));
                            const msg = validateItemField("unit_price", v);
                            setRowErrors((prev) => ({ ...prev, [row.id]: { ...prev[row.id], unit_price: msg ?? undefined } }));
                          }}
                          aria-invalid={!!err.unit_price}
                          className={`w-full text-center h-9 rounded-md border bg-background px-2 nums ${err.unit_price ? "border-destructive" : "border-input"}`}
                        />
                        {err.unit_price && <div className="text-[11px] text-destructive mt-1">{err.unit_price}</div>}
                      </td>
                      <td className="p-2 text-center font-semibold nums align-top">
                        {formatSDG(row.quantity * row.unit_price)}
                      </td>
                      <td className="p-2 align-top text-center">
                        <button
                          type="button"
                          onClick={() => {
                            if (row._isNew) {
                              setEditRows((rows) => rows.filter((r) => r.id !== row.id));
                            } else {
                              setDeletedRowIds((s) => new Set(s).add(row.id));
                            }
                          }}
                          className="text-red-600 hover:bg-red-50 rounded p-1"
                          title="حذف هذا الصنف من الفاتورة"
                          aria-label="حذف الصنف"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                  {visibleEditRows.length === 0 && (
                    <tr><td colSpan={5} className="p-4 text-center text-muted-foreground text-sm">لا توجد أصناف — أضف صنفاً من الأسفل.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Deleted rows summary + undo */}
            {deletedRowIds.size > 0 && (
              <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800 flex items-center justify-between">
                <span>سيتم حذف {deletedRowIds.size} صنف عند الحفظ (تُعاد الكميات إلى المخزون).</span>
                <button
                  type="button"
                  className="underline"
                  onClick={() => setDeletedRowIds(new Set())}
                >تراجع</button>
              </div>
            )}

            {/* Add-item search box */}
            <div className="mt-3 rounded-lg border border-emerald-200 bg-white p-3">
              <label className="text-xs font-semibold text-emerald-900 flex items-center gap-1 mb-2">
                <Plus className="size-3.5" /> إضافة صنف جديد إلى الفاتورة
              </label>
              <div className="relative">
                <Search className="size-4 absolute top-1/2 -translate-y-1/2 start-2 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={addQuery}
                  onChange={(e) => { setAddQuery(e.target.value); setAddPickerOpen(true); }}
                  onFocus={() => setAddPickerOpen(true)}
                  placeholder="ابحث بالاسم أو الباركود..."
                  className="w-full h-10 rounded-md border border-input bg-background ps-8 pe-3 text-sm"
                />
                {addPickerOpen && productMatches.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-input bg-popover shadow-lg">
                    {productMatches.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => addProductToInvoice(p)}
                        className="w-full text-right px-3 py-2 hover:bg-muted text-sm flex items-center justify-between gap-2 border-b last:border-b-0"
                      >
                        <span className="font-medium">{p.name}</span>
                        <span className="text-xs text-muted-foreground nums">
                          {formatSDG(p.salePrice)} — المتاح {p.quantity}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {addPickerOpen && addQuery.trim() && productMatches.length === 0 && (
                  <div className="absolute z-20 mt-1 w-full rounded-lg border border-input bg-popover shadow-lg p-3 text-xs text-muted-foreground">
                    لا توجد نتائج مطابقة.
                  </div>
                )}
              </div>
            </div>

            {hasFieldErrors && (
              <div className="mt-2 text-sm text-destructive flex items-center gap-1">
                <AlertTriangle className="size-4" /> يوجد قيم غير صالحة — صحّحها قبل الحفظ.
              </div>
            )}
            {hasOverstock && (
              <div className="mt-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <div className="flex items-center gap-1 font-bold mb-1">
                  <AlertTriangle className="size-4" /> لا يمكن الحفظ — كميات تتجاوز المخزون المتاح
                </div>
                <ul className="list-disc pr-5 space-y-0.5 text-xs">
                  {overstockRows.map(({ row, max }) => (
                    <li key={row.id}>
                      <span className="font-semibold">{row.product_name}</span> — طُلب {row.quantity}، الأقصى المتاح {max}. استخدم المنزلقة أعلاه لاختيار كمية بديلة.
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => {
                  setEditMode(false);
                  setRowErrors({});
                  setDraftRestored(false);
                }}
                className="px-4 h-9 rounded-md border border-input bg-background text-sm hover:bg-muted"
              >
                إلغاء
              </button>
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || hasFieldErrors || hasOverstock}
                className="px-4 h-9 rounded-md bg-brand text-white text-sm font-bold flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed"
                title={hasOverstock ? "صحّح الكميات المتجاوزة للمخزون" : hasFieldErrors ? "صحّح الأخطاء قبل الحفظ" : undefined}
              >
                {saveMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                حفظ التعديلات
              </button>
            </div>
            <p className="text-xs text-amber-800 mt-2">
              ملاحظة: زيادة الكمية تخصم من المخزون تلقائياً — إذا كان المخزون غير كافٍ سيتم رفض الحفظ ورسالة الخطأ ستوضّح الصنف والكمية المتاحة.
            </p>
          </div>
        </section>
      )}


      <main className="py-6 px-4 print:p-0">
        <div ref={printRef}>
        {format === "a4" ? (
          <A4Invoice
            inv={inv}
            items={items}
            paymentMethod={paymentMethod}
            storeName={storeName}
            storeSubtitle={storeSubtitle}
            storePhone={storePhone}
            invoiceFooter={invoiceFooter}
            showLogo={showLogo}
            paymentLabel={paymentLabel}
          />
        ) : (
          <ThermalInvoice
            inv={inv}
            items={items}
            paymentMethod={paymentMethod}
            storeName={storeName}
            storeSubtitle={storeSubtitle}
            storePhone={storePhone}
            storeAddress={storeAddress}
            invoiceFooter={invoiceFooter}
            showLogo={showLogo}
            paymentLabel={paymentLabel}
          />
        )}
        </div>
      </main>

      {/* Mobile-only floating action bar — Facebook-style pill buttons. */}
      {formatReady && (
        <div className="sm:hidden fixed bottom-0 inset-x-0 z-40 print:hidden bg-background/95 backdrop-blur border-t border-border p-2 flex gap-2 shadow-lg">
          <button
            onClick={confirmAndPrint}
            disabled={pdfBusy || shareBusy}
            className="flex-1 h-11 rounded-full bg-[#1877F2] hover:bg-[#166FE5] active:bg-[#1461C9] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm disabled:opacity-60 transition-colors"
            aria-label="طباعة الفاتورة"
          >
            <Printer className="size-5" />
            طباعة ({format === "thermal" ? "حراري" : "A4"})
          </button>
          <button
            onClick={() => handleSharePdfNative()}
            disabled={pdfBusy}
            className="h-11 px-4 rounded-full bg-[#E4E6EB] hover:bg-[#D8DADF] text-[#050505] font-semibold text-sm flex items-center justify-center gap-1 disabled:opacity-60 transition-colors"
            aria-label="مشاركة PDF"
          >
            {pdfBusy ? <Loader2 className="size-5 animate-spin" /> : <Share2 className="size-5" />}
          </button>
          <button
            onClick={() => setPreviewOpen(true)}
            disabled={pdfBusy}
            className="h-11 px-4 rounded-full bg-[#E4E6EB] hover:bg-[#D8DADF] text-[#050505] font-semibold text-sm flex items-center justify-center disabled:opacity-60 transition-colors"
            aria-label="معاينة"
          >
            <Eye className="size-5" />
          </button>
        </div>
      )}
      {formatReady && <div className="sm:hidden h-16 print:hidden" aria-hidden />}

      {/* Preview dialog — Facebook-style, with margin guides + Fit-to-page. */}
      <Dialog open={previewOpen} onOpenChange={(o) => { setPreviewOpen(o); if (!o) setPreviewZoom(1); }}>
        <DialogContent className="max-w-5xl w-full max-h-[95vh] h-[95vh] sm:h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
          <DialogHeader className="flex flex-row items-center justify-between gap-2 space-y-0 px-4 py-3 border-b border-border bg-[#F0F2F5]">
            <DialogTitle className="text-base sm:text-lg font-semibold text-[#050505]">معاينة الطباعة</DialogTitle>
            <div className="flex items-center gap-1 rounded-full bg-white border border-[#CED0D4] px-1 py-0.5 shadow-sm flex-wrap">
              <button
                type="button"
                onClick={() => { setPreviewFitMode("100"); setPreviewZoom((z) => Math.max(0.2, +(z - 0.1).toFixed(2))); }}
                className="p-1.5 rounded-full hover:bg-[#E4E6EB] disabled:opacity-40"
                disabled={previewZoom <= 0.2}
                aria-label="تصغير"
                title="تصغير"
              >
                <ZoomOut className="size-4" />
              </button>
              <span className="text-xs tabular-nums w-10 text-center font-mono text-[#050505]">{Math.round(previewZoom * 100)}%</span>
              <button
                type="button"
                onClick={() => { setPreviewFitMode("100"); setPreviewZoom((z) => Math.min(3, +(z + 0.1).toFixed(2))); }}
                className="p-1.5 rounded-full hover:bg-[#E4E6EB] disabled:opacity-40"
                disabled={previewZoom >= 3}
                aria-label="تكبير"
                title="تكبير"
              >
                <ZoomIn className="size-4" />
              </button>
              <button
                type="button"
                onClick={applyFit}
                className={`text-xs px-2 py-1 rounded-full hover:bg-[#E4E6EB] flex items-center gap-1 font-semibold ${previewFitMode === "fit" ? "bg-[#E7F3FF] text-[#1877F2]" : "text-[#1877F2]"}`}
                title="ملاءمة للصفحة"
              >
                <Maximize2 className="size-3.5" /> ملاءمة
              </button>
              <button
                type="button"
                onClick={() => { setPreviewFitMode("100"); setPreviewZoom(1); }}
                className="text-xs px-2 py-1 rounded-full hover:bg-[#E4E6EB] text-[#65676B]"
                title="حجم طبيعي"
              >
                100%
              </button>
              <button
                type="button"
                onClick={applyReset}
                className="text-xs px-2 py-1 rounded-full hover:bg-[#E4E6EB] text-[#65676B] flex items-center gap-1"
                title="إعادة ضبط المعاينة"
                aria-label="إعادة ضبط"
              >
                <RotateCcw className="size-3.5" /> إعادة ضبط
              </button>
              <button
                type="button"
                onClick={() => setShowGuides((v) => !v)}
                className={`text-xs px-2 py-1 rounded-full hover:bg-[#E4E6EB] flex items-center gap-1 ${showGuides ? "text-[#1877F2]" : "text-[#65676B]"}`}
                title={showGuides ? "إخفاء خطوط الهوامش" : "إظهار خطوط الهوامش"}
                aria-pressed={showGuides}
              >
                {showGuides ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                {showGuides ? "الهوامش" : "الهوامش"}
              </button>
            </div>
          </DialogHeader>
          <div ref={previewScrollRef} className="flex-1 overflow-auto bg-[#F0F2F5] p-4">
            {/* Paper wrapper: keeps A4 landscape aspect + margin guide overlay */}
            <div
              className="mx-auto origin-top transition-transform"
              style={{
                width: format === "thermal" ? "80mm" : "297mm",
                transform: `scale(${previewZoom})`,
                transformOrigin: "top center",
              }}
            >
              <div
                ref={previewRef}
                className="relative bg-white shadow-md"
                style={{
                  width: format === "thermal" ? "80mm" : "297mm",
                  minHeight: format === "thermal" ? "auto" : "210mm",
                }}
              >
                {/* Margin guide (dashed inner box shows printable safe area) — toggleable */}
                {showGuides && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 print:hidden"
                    style={{ padding: format === "thermal" ? "2mm" : "8mm" }}
                  >
                    <div className="w-full h-full border border-dashed border-[#1877F2]/50 rounded-[1px]" />
                  </div>
                )}
                {format === "a4" ? (
                  <A4Invoice
                    inv={inv}
                    items={items}
                    paymentMethod={paymentMethod}
                    storeName={storeName}
                    storeSubtitle={storeSubtitle}
                    storePhone={storePhone}
                    invoiceFooter={invoiceFooter}
                    showLogo={showLogo}
                    paymentLabel={paymentLabel}
                  />
                ) : (
                  <ThermalInvoice
                    inv={inv}
                    items={items}
                    paymentMethod={paymentMethod}
                    storeName={storeName}
                    storeSubtitle={storeSubtitle}
                    storePhone={storePhone}
                    storeAddress={storeAddress}
                    invoiceFooter={invoiceFooter}
                    showLogo={showLogo}
                    paymentLabel={paymentLabel}
                  />
                )}
              </div>
              <div className="text-center text-[10px] text-[#65676B] mt-1 print:hidden">
                {format === "a4" ? "A4 أفقي · 297×210mm · هامش 8mm" : "حراري · 80mm · هامش 2mm"}
              </div>
            </div>
          </div>
          {/* Facebook-style unified footer buttons */}
          <DialogFooter className="gap-2 flex-wrap px-4 py-3 border-t border-border bg-[#F0F2F5]">
            <button
              onClick={() => setPreviewOpen(false)}
              className="px-4 h-10 rounded-full bg-[#E4E6EB] hover:bg-[#D8DADF] text-[#050505] text-sm font-semibold transition-colors"
            >
              إغلاق
            </button>
            <button
              onClick={confirmAndPrint}
              className="px-4 h-10 rounded-full bg-[#E4E6EB] hover:bg-[#D8DADF] text-[#050505] text-sm font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Printer className="size-4" /> طباعة
            </button>
            <button
              onClick={() => handleSharePdfNative()}
              disabled={pdfBusy}
              className="px-4 h-10 rounded-full bg-[#1877F2] hover:bg-[#166FE5] text-white text-sm font-semibold flex items-center gap-1.5 disabled:opacity-60 transition-colors"
            >
              {pdfBusy ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}
              مشاركة PDF
            </button>
            <button
              onClick={() => handleWhatsAppShare()}
              disabled={shareBusy}
              className="px-4 h-10 rounded-full bg-[#42B72A] hover:bg-[#36A420] text-white text-sm font-semibold flex items-center gap-1.5 disabled:opacity-60 transition-colors"
            >
              {shareBusy ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}
              واتساب + PDF
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style>{`
        @keyframes progress {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
        @media print {
          html, body { background: white !important; margin: 0 !important; padding: 0 !important; }
          .print\\:hidden { display: none !important; }
          /* Fit-to-page: force content to shrink into printable area without clipping */
          .print-a4, .print-thermal { box-shadow: none !important; border: none !important; max-width: none !important; }
          .print-a4 {
            width: 281mm; /* A4 landscape 297mm - 2×8mm margins */
            min-height: 194mm;
            margin: 0 auto !important;
            page-break-inside: avoid;
          }
          .print-thermal { width: 76mm; margin: 0 auto !important; }
          ${format === "thermal"
            ? "@page { size: 80mm auto; margin: 2mm; } @page :first { size: 80mm auto; margin: 2mm; }"
            : "@page { size: A4 landscape; margin: 8mm; } @page :first { size: A4 landscape; margin: 8mm; } @page :left { size: A4 landscape; } @page :right { size: A4 landscape; }"}
        }
        /* Hard-lock A4 to landscape even if the browser is asked to switch to portrait. */
        @media print and (orientation: portrait) {
          ${format === "a4" ? ".print-a4 { transform: rotate(-90deg) translateY(-100%); transform-origin: top left; width: 194mm; height: 281mm; }" : ""}
        }
      `}</style>
    </div>
  );
}

/* ============= A4 CLASSIC INVOICE ============= */

type A4Props = {
  inv: any; items: any[]; paymentMethod: any;
  storeName: string; storeSubtitle: string; storePhone: string;
  invoiceFooter: string; showLogo: boolean; paymentLabel: string;
};

function A4Invoice({ inv, items, paymentMethod, storeName, storeSubtitle, storePhone, invoiceFooter, showLogo, paymentLabel }: A4Props) {
  // Pad to 21 rows like reference
  const MIN_ROWS = 21;
  const paddedRows = [
    ...items,
    ...Array.from({ length: Math.max(0, MIN_ROWS - items.length) }, () => null),
  ];
  const created = new Date(inv.created_at);
  const dateStr = `${created.getFullYear()} / ${String(created.getMonth() + 1).padStart(2, "0")} / ${String(created.getDate()).padStart(2, "0")}`;

  return (
    <div className="print-a4 mx-auto max-w-[210mm] bg-white text-black shadow-lg border p-8 print:shadow-none print:border-0" dir="rtl">
      {/* Header: logo | title | logo (mirror reference) */}
      <div className="grid grid-cols-[1fr_2fr_1fr] items-center gap-4 pb-4">
        <div className="flex justify-start">
          {showLogo && <img src={logo} alt={storeName} className="h-20 w-20 object-contain" />}
        </div>
        <div className="text-center">
          <h1 className="text-3xl font-extrabold tracking-wide">فاتورة مبدئية</h1>
          <p className="text-base font-semibold mt-1">{storeSubtitle}</p>
          <p className="text-xs mt-0.5 nums" dir="ltr">TEL: {storePhone}</p>
        </div>
        <div className="flex justify-end">
          {showLogo && <img src={logo} alt={storeName} className="h-20 w-20 object-contain" />}
        </div>
      </div>

      {/* Meta line: date left, customer name line right */}
      <div className="flex items-end justify-between gap-6 mb-3 text-sm">
        <div className="flex items-baseline gap-2 shrink-0">
          <span className="font-semibold">التاريخ:</span>
          <span className="nums border-b border-black min-w-[110px] text-center">{dateStr}</span>
        </div>
        <div className="flex items-baseline gap-2 flex-1">
          <span className="font-semibold">اسم العميل:</span>
          <span className="flex-1 border-b border-dotted border-black min-h-[1.25rem] px-2">
            {inv.customer_name || ""}
          </span>
        </div>
      </div>

      {/* Items table */}
      <table className="w-full border-collapse border border-black text-sm">
        <thead>
          <tr className="bg-white">
            <th className="border border-black py-1.5 w-10">م</th>
            <th className="border border-black py-1.5">الصنف</th>
            <th className="border border-black py-1.5 w-40">السعر (وحدة)</th>
            <th className="border border-black py-1.5 w-16">الكمية</th>
            <th className="border border-black py-1.5 w-40">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {paddedRows.map((it, i) => (
            <tr key={i} className="h-7">
              <td className="border border-black text-center nums">{i + 1}</td>
              <td className="border border-black px-2">{it?.product_name ?? ""}</td>
              <td className="border border-black text-center nums px-1">{it ? formatSDG(Number(it.unit_price)) : ""}</td>
              <td className="border border-black text-center nums">{it?.quantity ?? ""}</td>
              <td className="border border-black text-center nums px-1">{it ? formatSDG(Number(it.line_total)) : ""}</td>
            </tr>
          ))}
          <tr className="h-9 font-bold">
            <td colSpan={4} className="border border-black text-left px-3">المجموع الكلي:</td>
            <td className="border border-black text-center nums text-base px-1">{formatSDG(Number(inv.total))}</td>
          </tr>
        </tbody>
      </table>

      {/* Payment summary — always visible */}
      <div className="mt-3 flex flex-wrap justify-between gap-3 text-sm">
        <div><span className="font-semibold">طريقة الدفع:</span> {paymentLabel}</div>
        <div><span className="font-semibold">المدفوع:</span> <span className="nums">{formatSDG(Number(inv.paid))}</span></div>
        {Number(inv.remaining) > 0 && (
          <div className="text-rose-700">
            <span className="font-semibold">المتبقي:</span> <span className="nums">{formatSDG(Number(inv.remaining))}</span>
          </div>
        )}
      </div>


      {/* Bank transfer details */}
      {paymentMethod && paymentMethod.type === "bank" && (
        <div className="mt-3 border border-black/50 p-2 text-xs">
          <div className="font-bold mb-1">تفاصيل التحويل البنكي</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            {paymentMethod.bank_name && <div>البنك: <span className="font-semibold">{paymentMethod.bank_name}</span></div>}
            {paymentMethod.account_holder && <div>صاحب الحساب: <span className="font-semibold">{paymentMethod.account_holder}</span></div>}
            {paymentMethod.account_number && <div dir="ltr" className="text-right">حساب: <span className="font-semibold nums">{paymentMethod.account_number}</span></div>}
            {paymentMethod.iban && <div dir="ltr" className="text-right">IBAN: <span className="font-semibold nums">{paymentMethod.iban}</span></div>}
            {inv.reference_number && <div className="col-span-2">رقم العملية: <span className="font-bold nums">{inv.reference_number}</span></div>}
          </div>

        </div>
      )}

      {/* Signature */}
      <div className="mt-6 flex items-baseline gap-2 text-sm">
        <span className="font-semibold">التوقيع:</span>
        <span className="flex-1 border-b border-dotted border-black min-h-[1.25rem]" />
      </div>

      {invoiceFooter && (
        <p className="text-center text-xs mt-6 whitespace-pre-line text-black/70">{invoiceFooter}</p>
      )}
    </div>
  );
}

/* ============= THERMAL RECEIPT ============= */

type ThermalProps = A4Props & { storeAddress: string };

function ThermalInvoice({ inv, items, paymentMethod, storeName, storeSubtitle, storePhone, storeAddress, invoiceFooter, showLogo, paymentLabel }: ThermalProps) {
  return (
    <div className="print-thermal mx-auto w-[80mm] bg-white text-black shadow-lg border p-3 text-[12px] leading-tight print:shadow-none print:border-0" dir="rtl">
      <div className="text-center border-b border-dashed border-black pb-2">
        {showLogo && <img src={logo} alt={storeName} className="mx-auto h-14 w-14 object-contain" />}
        <div className="font-extrabold text-base mt-1">{storeName}</div>
        <div className="text-[11px]">{storeSubtitle}</div>
        {storeAddress && <div className="text-[11px]">{storeAddress}</div>}
        <div className="text-[11px] nums" dir="ltr">{storePhone}</div>
      </div>

      <div className="py-2 border-b border-dashed border-black text-[11px] space-y-0.5">
        <div className="flex justify-between"><span>فاتورة #</span><span className="nums">{inv.invoice_number}</span></div>
        <div className="flex justify-between">
          <span>التاريخ</span>
          <span className="nums">{new Date(inv.created_at).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" })}</span>
        </div>
        {inv.customer_name && <div className="flex justify-between"><span>العميل</span><span>{inv.customer_name}</span></div>}
        <div className="flex justify-between"><span>الدفع</span><span>{paymentLabel}</span></div>
      </div>

      <table className="w-full my-2 text-[11px]">
        <thead>
          <tr className="border-b border-dashed border-black">
            <th className="text-right py-1">الصنف</th>
            <th className="text-center py-1 w-8">كم</th>
            <th className="text-left py-1 w-14">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="align-top">
              <td className="py-0.5">
                <div>{it.product_name}</div>
                <div className="text-[10px] text-black/60 nums">{formatSDGShort(Number(it.unit_price))} × {it.quantity}</div>
              </td>
              <td className="text-center py-0.5 nums">{it.quantity}</td>
              <td className="text-left py-0.5 nums">{formatSDGShort(Number(it.line_total))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="border-t border-dashed border-black pt-2 space-y-0.5 text-[11px]">
        <div className="flex justify-between font-bold text-[13px]">
          <span>الإجمالي</span>
          <span className="nums">{formatSDG(Number(inv.total))}</span>
        </div>
        <div className="flex justify-between">
          <span>المدفوع</span>
          <span className="nums">{formatSDGShort(Number(inv.paid))}</span>
        </div>
        {Number(inv.remaining) > 0 && (
          <div className="flex justify-between font-bold">
            <span>المتبقي</span>
            <span className="nums">{formatSDG(Number(inv.remaining))}</span>
          </div>
        )}
      </div>

      {paymentMethod && paymentMethod.type === "bank" && (
        <div className="mt-2 border-t border-dashed border-black pt-2 text-[10.5px] space-y-0.5">
          <div className="font-bold text-center">تفاصيل التحويل البنكي</div>
          {paymentMethod.bank_name && <div>البنك: {paymentMethod.bank_name}</div>}
          {paymentMethod.account_holder && <div>الحساب باسم: {paymentMethod.account_holder}</div>}
          {paymentMethod.account_number && <div dir="ltr" className="text-right nums">Acc: {paymentMethod.account_number}</div>}
          {paymentMethod.iban && <div dir="ltr" className="text-right nums">IBAN: {paymentMethod.iban}</div>}
          {inv.reference_number && <div className="font-bold">رقم العملية: <span className="nums">{inv.reference_number}</span></div>}
        </div>

      )}

      {invoiceFooter && (
        <div className="mt-3 text-center text-[10.5px] whitespace-pre-line border-t border-dashed border-black pt-2">
          {invoiceFooter}
        </div>
      )}
    </div>
  );
}
