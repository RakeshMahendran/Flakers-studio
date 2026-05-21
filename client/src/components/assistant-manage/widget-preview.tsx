"use client";

/**
 * WidgetPreview — live preview of the embeddable chat widget.
 *
 * Renders an approximation of how the widget appears on a customer's
 * website. Updates reactively as the user edits the widget config so they
 * can iterate without leaving the settings page.
 */
import * as React from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { cn } from "@/lib/design-system";

interface WidgetPreviewConfig {
  enabled?: boolean;
  position?: "bottom-right" | "bottom-left";
  primary_color?: string;
  title?: string;
  subtitle?: string;
  launcher_label?: string;
  send_label?: string;
  placeholder?: string;
  welcome_message?: string;
}

interface WidgetPreviewProps {
  config: WidgetPreviewConfig;
  className?: string;
}

export function WidgetPreview({ config, className }: WidgetPreviewProps) {
  const [open, setOpen] = React.useState(true);
  const primary = config.primary_color || "#14532d";
  const position = config.position || "bottom-right";

  return (
    <div
      className={cn(
        "relative h-full min-h-[420px] overflow-hidden rounded-xl border border-[var(--color-border-subtle)]",
        "bg-[oklch(0.96_0.012_270)] dark:bg-[oklch(0.18_0.012_270)]",
        className
      )}
      aria-label="Widget preview"
    >
      {/* Fake page content */}
      <div className="space-y-2 p-6">
        <div className="h-3 w-2/3 rounded bg-[var(--color-text-tertiary)]/30" />
        <div className="h-3 w-1/2 rounded bg-[var(--color-text-tertiary)]/20" />
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 rounded bg-[var(--color-text-tertiary)]/15" />
          ))}
        </div>
        <div className="mt-4 h-3 w-3/4 rounded bg-[var(--color-text-tertiary)]/20" />
        <div className="h-3 w-2/3 rounded bg-[var(--color-text-tertiary)]/20" />
        <div className="h-3 w-1/2 rounded bg-[var(--color-text-tertiary)]/20" />
      </div>

      {/* Disabled banner */}
      {!config.enabled ? (
        <div className="absolute inset-x-0 top-0 z-10 bg-[var(--color-caution-soft)] px-4 py-2 text-center text-xs font-medium text-[var(--color-caution-strong)]">
          Widget is disabled — public chat requests will be rejected
        </div>
      ) : null}

      {/* Widget anchor */}
      <div
        className={cn(
          "absolute z-20 flex flex-col gap-3",
          position === "bottom-right" ? "bottom-4 right-4 items-end" : "bottom-4 left-4 items-start"
        )}
      >
        {open ? (
          <div
            className={cn(
              "flex w-[280px] flex-col overflow-hidden rounded-2xl bg-white text-slate-900 shadow-2xl ring-1 ring-black/5",
              "animate-fade-in"
            )}
            style={{ maxHeight: 320 }}
          >
            {/* Header */}
            <div
              className="flex items-start justify-between gap-2 p-3.5 text-white"
              style={{ backgroundColor: primary }}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{config.title || "Ask Flakers Studio"}</p>
                {config.subtitle ? (
                  <p className="mt-0.5 truncate text-[11px] text-white/85">{config.subtitle}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close widget preview"
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-white/85 hover:bg-white/10 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 space-y-2 overflow-y-auto bg-slate-50 p-3">
              <div className="max-w-[90%] rounded-xl rounded-tl-sm bg-white px-3 py-2 text-xs leading-snug text-slate-700 shadow-sm">
                {config.welcome_message || "Hi. Ask a question to start the conversation."}
              </div>
            </div>

            {/* Composer */}
            <div className="flex items-center gap-2 border-t border-slate-200 bg-white p-2">
              <div className="flex-1 truncate rounded-full bg-slate-100 px-3 py-1.5 text-[11px] text-slate-500">
                {config.placeholder || "Ask a question..."}
              </div>
              <button
                type="button"
                aria-label="Send"
                className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium text-white"
                style={{ backgroundColor: primary }}
              >
                <Send className="h-3 w-3" />
                {config.send_label || "Send"}
              </button>
            </div>
          </div>
        ) : null}

        {/* Launcher */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-white shadow-lg ring-1 ring-black/10 transition-transform hover:scale-105 active:scale-100"
          style={{ backgroundColor: primary }}
          aria-label={open ? "Close chat widget" : "Open chat widget"}
        >
          <MessageCircle className="h-4 w-4" />
          {config.launcher_label || "Chat"}
        </button>
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(8px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .animate-fade-in {
          animation: fade-in 200ms ease-out both;
        }
      `}</style>
    </div>
  );
}
