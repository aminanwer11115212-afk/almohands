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
  });

  return router;
};
