import { QueryClient, QueryCache, MutationCache } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { handleError } from "./lib/errors";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error: unknown) => {
          const msg = String((error as { message?: string })?.message ?? "").toLowerCase();
          // Don't retry auth/permission errors
          if (msg.includes("jwt") || msg.includes("unauthorized") || msg.includes("permission") || msg.includes("row-level")) {
            return false;
          }
          return failureCount < 2;
        },
        staleTime: 30_000,
      },
      mutations: {
        retry: false,
      },
    },
    queryCache: new QueryCache({
      onError: (error, query) => {
        // Only toast when the query was explicitly asked to surface errors
        if (query.meta?.showError !== false && query.state.data !== undefined) {
          handleError(error, "فشل تحديث البيانات");
        }
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => {
        if (mutation.meta?.showError === false) return;
        handleError(error, "فشلت العملية");
      },
    }),
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: ({ error, reset }) => (
      <div className="min-h-[60vh] flex items-center justify-center p-6" dir="rtl">
        <div className="max-w-lg w-full rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center space-y-3">
          <h2 className="text-lg font-bold">حدث خطأ غير متوقع</h2>
          <p className="text-sm text-muted-foreground">
            {error?.message || "تعذّر عرض هذا القسم — حاول مجدداً."}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <button onClick={reset} className="px-4 h-9 rounded-md bg-primary text-primary-foreground text-sm font-bold">
              حاول مجدداً
            </button>
            <button onClick={() => window.location.reload()} className="px-4 h-9 rounded-md border border-input bg-background text-sm">
              إعادة تحميل
            </button>
          </div>
        </div>
      </div>
    ),
  });


  return router;
};
