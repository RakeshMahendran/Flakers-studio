"use client";

import * as React from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/design-system";

export type ToastVariant = "success" | "error";

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    // Soft fallback so unit / mock environments don't crash
    return {
      showToast: (m) => console.info("[toast]", m),
    };
  }
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  // PATTERN: Use functional setState to avoid stale closures
  const remove = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = React.useCallback(
    (message: string, variant: ToastVariant = "success") => {
      const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev, { id, message, variant }]);
      // Functional setState ensures we always work with latest state
      window.setTimeout(() => remove(id), 3500);
    },
    [remove],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
      >
        <div className="flex w-full max-w-md flex-col items-center gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={cn(
                "pointer-events-auto flex w-full items-center gap-2 rounded-xl",
                "border border-[var(--color-border-default)]",
                "bg-[var(--color-surface)] px-4 py-3 shadow-[var(--elevation-3)]",
                "animate-[gov-fade-in-kf_220ms_var(--ease-out)_both]",
              )}
              role="status"
            >
              {t.variant === "success" ? (
                <CheckCircle2
                  className="h-4 w-4 flex-shrink-0 text-[var(--color-trust)]"
                  aria-hidden
                />
              ) : (
                <AlertCircle
                  className="h-4 w-4 flex-shrink-0 text-[var(--color-refuse)]"
                  aria-hidden
                />
              )}
              <p className="flex-1 text-sm text-[var(--color-text-primary)]">
                {t.message}
              </p>
              <button
                type="button"
                onClick={() => remove(t.id)}
                className={cn(
                  "inline-flex h-6 w-6 items-center justify-center rounded-md",
                  "text-[var(--color-text-muted)] hover:bg-[var(--button-ghost-bg-hover)]",
                  "hover:text-[var(--color-text-primary)]",
                )}
                aria-label="Dismiss notification"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}
