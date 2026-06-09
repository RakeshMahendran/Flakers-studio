"use client";

import * as React from "react";
import { ArrowUp } from "lucide-react";

import { cn } from "@/lib/design-system";

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */
const ROW_HEIGHT_PX = 24;
const MIN_ROWS = 1;
const MAX_ROWS = 6;
const CHAR_LIMIT = 4_000;
const CHAR_WARN_AT = Math.floor(CHAR_LIMIT * 0.8);

/* ------------------------------------------------------------------ */
/* Imperative handle exposed to parents                                */
/* ------------------------------------------------------------------ */
export interface ComposerHandle {
  /** Set the textarea contents and focus it; doesn't submit. */
  setValue: (value: string) => void;
  /** Focus the textarea. */
  focus: () => void;
}

interface ComposerProps {
  /** Placeholder for the empty input. */
  placeholder?: string;
  /** Called with the trimmed message when the user submits. */
  onSubmit: (text: string) => void;
  /** Disable the input + send button (e.g. while awaiting a response). */
  disabled?: boolean;
  /** When true, the send button shows a spinner. */
  isSending?: boolean;
}

/* ------------------------------------------------------------------ */
/* Composer — native textarea + send button                            */
/* ------------------------------------------------------------------ */
export const Composer = React.forwardRef<ComposerHandle, ComposerProps>(
  function Composer(
    {
      placeholder = "Ask anything…",
      onSubmit,
      disabled = false,
      isSending = false,
    },
    ref,
  ) {
    const [value, setLocalValue] = React.useState("");
    const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

    /* ---------------- Auto-grow textarea ---------------- */
    const resize = React.useCallback(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = "auto";
      const minH = MIN_ROWS * ROW_HEIGHT_PX;
      const maxH = MAX_ROWS * ROW_HEIGHT_PX;
      const next = Math.min(Math.max(el.scrollHeight, minH), maxH);
      el.style.height = `${next}px`;
      el.style.overflowY = el.scrollHeight > maxH ? "auto" : "hidden";
    }, []);

    React.useLayoutEffect(() => {
      resize();
    }, [value, resize]);

    React.useImperativeHandle(
      ref,
      () => ({
        setValue: (v: string) => {
          setLocalValue(v);
          window.requestAnimationFrame(() => {
            resize();
            textareaRef.current?.focus();
            const len = v.length;
            try {
              textareaRef.current?.setSelectionRange(len, len);
            } catch {
              /* ignore */
            }
          });
        },
        focus: () => textareaRef.current?.focus(),
      }),
      [resize],
    );

    /* ---------------- Submit ---------------- */
    const charCount = value.length;
    const showCharCount = charCount >= CHAR_WARN_AT;
    const overLimit = charCount > CHAR_LIMIT;

    const doSubmit = React.useCallback(() => {
      const trimmed = value.trim();
      if (!trimmed) return;
      if (overLimit) return;
      if (disabled || isSending) return;
      const hadFocus = document.activeElement === textareaRef.current;
      onSubmit(trimmed);
      setLocalValue("");
      if (hadFocus) {
        window.setTimeout(() => textareaRef.current?.focus(), 0);
      }
    }, [value, overLimit, disabled, isSending, onSubmit]);

    const handleFormSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      doSubmit();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter sends, Shift+Enter inserts a newline.
      if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        doSubmit();
        return;
      }
      // Cmd/Ctrl+Enter also sends.
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        doSubmit();
        return;
      }
    };

    const sendDisabled =
      disabled || isSending || overLimit || value.trim().length === 0;

    return (
      <form
        onSubmit={handleFormSubmit}
        className={cn(
          "relative flex flex-col rounded-2xl",
          "bg-[var(--color-surface)]",
          "border border-[var(--color-border-default)]",
          "shadow-[var(--elevation-2)]",
          "transition-[border-color,box-shadow] duration-[var(--duration-base)] ease-[var(--ease-out)]",
          "focus-within:border-[var(--color-brand-border)]",
          "focus-within:shadow-[var(--elevation-glow-brand)]",
        )}
        data-slot="chat-composer"
      >
        {/* Textarea */}
        <div className="px-4 pt-3">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setLocalValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className={cn(
              "w-full resize-none border-0 outline-none bg-transparent",
              "text-[15px] leading-6 text-[var(--color-text-primary)]",
              "placeholder:text-[var(--input-placeholder)]",
              "disabled:opacity-50",
            )}
            style={{ minHeight: ROW_HEIGHT_PX }}
            aria-label="Chat message input"
            data-slot="chat-composer-textarea"
          />
        </div>

        {/* Toolbar row — char count + send */}
        <div className="flex items-center justify-end gap-2 px-2 pb-2 pt-1">
          {showCharCount ? (
            <span
              className={cn(
                "text-[11px] tabular-nums",
                overLimit
                  ? "text-[var(--color-refuse)]"
                  : "text-[var(--color-text-muted)]",
              )}
              aria-live="polite"
            >
              {charCount} / {CHAR_LIMIT}
            </span>
          ) : null}
          <button
            type="submit"
            disabled={sendDisabled}
            aria-label="Send message"
            className={cn(
              "inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-lg px-3",
              "text-white",
              "bg-[image:var(--gradient-brand)] bg-[length:200%_100%] bg-left",
              "shadow-[var(--elevation-1)]",
              "transition-[background-position,box-shadow,transform] duration-[var(--duration-base)] ease-[var(--ease-out)]",
              "hover:bg-right hover:shadow-[var(--elevation-glow-brand)]",
              "active:scale-[0.98]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-focus-ring-offset)]",
              "disabled:opacity-50 disabled:pointer-events-none disabled:shadow-none",
            )}
          >
            {isSending ? (
              <span
                className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                aria-hidden
              />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Hint footer — Enter to send / Shift+Enter for newline */}
        {value.length === 0 ? (
          <div
            className={cn(
              "hidden md:flex items-center justify-end gap-1 border-t",
              "border-[var(--color-border-subtle)] px-4 py-1.5",
              "text-[11px] text-[var(--color-text-muted)]",
            )}
            aria-hidden
          >
            <kbd className="rounded bg-[var(--color-surface-sunken)] px-1.5 py-0.5 font-mono text-[10px]">
              Enter
            </kbd>
            <span>to send</span>
            <span className="mx-1.5 opacity-50">·</span>
            <kbd className="rounded bg-[var(--color-surface-sunken)] px-1.5 py-0.5 font-mono text-[10px]">
              Shift
            </kbd>
            <kbd className="rounded bg-[var(--color-surface-sunken)] px-1.5 py-0.5 font-mono text-[10px]">
              Enter
            </kbd>
            <span>for newline</span>
          </div>
        ) : null}
      </form>
    );
  },
);
