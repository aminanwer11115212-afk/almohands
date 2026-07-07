import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportLovableError } from "@/lib/lovable-error-reporting";

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Client-side React ErrorBoundary — catches render/lifecycle errors inside its subtree
 * and prevents the whole app from crashing. Use around interactive sections.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);
    try {
      reportLovableError(error, { boundary: "react_error_boundary", componentStack: info.componentStack });
    } catch {
      /* noop — reporter must never crash the boundary */
    }
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error, this.reset);
      return (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
          <h2 className="text-lg font-semibold text-foreground">حدث خطأ غير متوقع</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            لم نتمكن من عرض هذا القسم. يمكنك المحاولة مرة أخرى أو إعادة تحميل الصفحة.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              onClick={this.reset}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              حاول مجدداً
            </button>
            <button
              onClick={() => window.location.reload()}
              className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
            >
              إعادة تحميل
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
