import { useMutation, type UseMutationOptions, type UseMutationResult } from "@tanstack/react-query";
import { toast } from "sonner";
import { handleError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * Thin wrapper around `useMutation` that guarantees:
 *  - every failure passes through `handleError` (Arabic toast + logger + request id)
 *  - every success can show a standard toast via `successMessage`
 *  - a `logScope` + `action` label is attached to every log entry
 *
 * Prefer this over raw `useMutation` across the codebase.
 *
 * Note: `logScope` is used instead of `scope` because TanStack Query
 * already reserves `scope: MutationScope` on `UseMutationOptions`.
 */
export interface SafeMutationOptions<TData, TVariables>
  extends Omit<UseMutationOptions<TData, unknown, TVariables>, "onError"> {
  /** Short scope name for logs, e.g. "invoices", "products". */
  logScope: string;
  /** Verb describing the action, e.g. "create", "delete", "update". */
  action: string;
  /** Fallback Arabic message shown when the error is opaque. */
  errorFallback?: string;
  /** Success toast text — omit to stay silent on success. */
  successMessage?: string;
  /** Extra context appended to every log entry. */
  logContext?: Record<string, unknown>;
  /** Runs after `handleError` — receives the resolved message. */
  onErrorSafe?: (err: unknown, message: string, variables: TVariables) => void;
}

export function useSafeMutation<TData = unknown, TVariables = void>(
  options: SafeMutationOptions<TData, TVariables>,
): UseMutationResult<TData, unknown, TVariables> {
  const {
    logScope,
    action,
    errorFallback,
    successMessage,
    logContext,
    onErrorSafe,
    onSuccess,
    mutationFn,
    ...rest
  } = options;

  return useMutation<TData, unknown, TVariables>({
    ...rest,
    mutationFn,
    onSuccess: (...args: Parameters<NonNullable<typeof onSuccess>>) => {
      if (successMessage) toast.success(successMessage);
      logger.info(`${logScope}.${action}.success`, { context: { ...(logContext ?? {}) } });
      onSuccess?.(...args);
    },
    onError: (err, variables) => {
      const { message } = handleError(err, errorFallback ?? "فشلت العملية", {
        context: { scope: logScope, action, ...(logContext ?? {}) },
      });
      onErrorSafe?.(err, message, variables);
    },
  });
}
