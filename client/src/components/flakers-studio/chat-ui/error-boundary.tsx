"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/design-system";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * ChatErrorBoundary
 *
 * Catches errors in the chat interface tree and displays a fallback UI.
 * Prevents uncaught errors in streaming/governance from crashing the entire app.
 *
 * Usage:
 * ```tsx
 * <ChatErrorBoundary>
 *   <ChatInterfaceTamboInner assistantId={assistantId} />
 * </ChatErrorBoundary>
 * ```
 */
export class ChatErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ChatErrorBoundary] Caught error:", error, errorInfo);

    // TODO: Send to monitoring service (App Insights)
    // Example:
    // if (typeof window !== 'undefined' && (window as any).appInsights) {
    //   (window as any).appInsights.trackException({
    //     exception: error,
    //     properties: {
    //       component: 'ChatInterface',
    //       errorInfo: errorInfo.componentStack,
    //     },
    //   });
    // }
  }

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className="flex h-screen items-center justify-center bg-[var(--color-background)] p-4">
          <div className="flex max-w-md flex-col items-center gap-4 text-center">
            <div
              className={cn(
                "flex h-16 w-16 items-center justify-center rounded-2xl",
                "bg-[var(--color-refuse-soft)] text-[var(--color-refuse-strong)]",
              )}
              aria-hidden="true"
            >
              <AlertTriangle className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                Something went wrong
              </h2>
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                The chat interface encountered an error. Try refreshing the page.
              </p>
              {process.env.NODE_ENV === "development" && this.state.error && (
                <details className="mt-4 rounded-lg bg-[var(--color-surface-sunken)] p-3 text-left">
                  <summary className="cursor-pointer text-xs font-medium text-[var(--color-text-secondary)]">
                    Error details (dev only)
                  </summary>
                  <pre className="mt-2 overflow-auto text-[10px] text-[var(--color-text-muted)]">
                    {this.state.error.stack}
                  </pre>
                </details>
              )}
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-medium text-white",
                "bg-[var(--color-brand)] hover:bg-[var(--color-brand-hover)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]",
                "transition-colors duration-[var(--duration-base)]",
              )}
            >
              Refresh page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
