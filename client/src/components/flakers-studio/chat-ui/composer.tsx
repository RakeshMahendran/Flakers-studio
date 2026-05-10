"use client";

import * as React from "react";
import { Paperclip, ArrowUp, Square } from "lucide-react";
import {
  useIsTamboTokenUpdating,
  useTamboThread,
  useTamboThreadInput,
} from "@tambo-ai/react";

import { cn } from "@/lib/design-system";
import { DictationButton } from "@/components/tambo/message-input";

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */
const ROW_HEIGHT_PX = 24;
const MIN_ROWS = 1;
const MAX_ROWS = 6;
const PLACEHOLDER_CYCLE_MS = 4_000;
const CHAR_LIMIT = 4_000;
const CHAR_WARN_AT = Math.floor(CHAR_LIMIT * 0.8);
const MAX_IMAGES = 10;

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
  /** Cycled placeholder examples (shown when input is empty). */
  placeholders?: string[];
  /** Disable the input (e.g. waiting for assistant config). */
  disabled?: boolean;
}

/* ------------------------------------------------------------------ */
/* Composer                                                            */
/* ------------------------------------------------------------------ */
export const Composer = React.forwardRef<ComposerHandle, ComposerProps>(
  function Composer(
    {
      placeholders = [
        "Ask anything about your knowledge base…",
        "What does the docs say about X?",
        "Help me find a specific policy…",
        "Show me a summary of recent changes…",
      ],
      disabled = false,
    },
    ref,
  ) {
    const {
      value,
      setValue,
      submit,
      isPending,
      images,
      addImages,
    } = useTamboThreadInput();
    const { cancel, isIdle } = useTamboThread();
    const isUpdatingToken = useIsTamboTokenUpdating();

    const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
    const [placeholderIdx, setPlaceholderIdx] = React.useState(0);
    const [submitError, setSubmitError] = React.useState<string | null>(null);
    const [imageError, setImageError] = React.useState<string | null>(null);
    const [hasInteracted, setHasInteracted] = React.useState(false);

    // Track first interaction to stop placeholder cycling
    React.useEffect(() => {
      if (value && value.length > 0) {
        setHasInteracted(true);
      }
    }, [value]);

    // Cycle the placeholder every 4s when input is empty and user hasn't interacted
    React.useEffect(() => {
      if (hasInteracted || value.length > 0) return;
      if (placeholders.length <= 1) return;
      const t = window.setInterval(() => {
        setPlaceholderIdx((i) => (i + 1) % placeholders.length);
      }, PLACEHOLDER_CYCLE_MS);
      return () => window.clearInterval(t);
    }, [value, placeholders.length, hasInteracted]);

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

    // CLEANUP: Clear file input on unmount to prevent memory leaks
    React.useEffect(() => {
      return () => {
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      };
    }, []);

    React.useImperativeHandle(
      ref,
      () => ({
        setValue: (v: string) => {
          setValue(v);
          // Schedule resize + focus after the update
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
      [setValue, resize],
    );

    /* ---------------- Submit handling ---------------- */
    const isSubmitting = isPending || !isIdle;
    const charCount = (value ?? "").length;
    const showCharCount = charCount >= CHAR_WARN_AT;
    const overLimit = charCount > CHAR_LIMIT;

    const doSubmit = React.useCallback(async () => {
      const trimmed = (value ?? "").trim();
      if (!trimmed && images.length === 0) return;
      if (overLimit) return;
      setSubmitError(null);

      // A11Y: Only refocus if composer had focus before submit
      const hadFocus = document.activeElement === textareaRef.current;

      try {
        await submit({
          streamResponse: true,
          resourceNames: {},
        });
        setValue("");
        // Refocus only if user was actively typing
        if (hadFocus) {
          window.setTimeout(() => textareaRef.current?.focus(), 0);
        }
      } catch (err) {
        setSubmitError(
          err instanceof Error
            ? err.message
            : "Failed to send message. Please try again.",
        );
        await cancel().catch(() => undefined);
      }
    }, [value, submit, setValue, images.length, overLimit, cancel]);

    const handleFormSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      void doSubmit();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Cmd+Enter (mac) / Ctrl+Enter (win/linux) → send
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void doSubmit();
        return;
      }
      // Plain Enter (no shift, no modifier) → send (familiar Tambo behavior)
      if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        void doSubmit();
        return;
      }
      // Shift+Enter → newline (default behavior — let it through)
    };

    /* ---------------- File attach ---------------- */
    const fileInputRef = React.useRef<HTMLInputElement | null>(null);
    const handleAttachClick = () => {
      fileInputRef.current?.click();
    };
    const handleFileChange = async (
      e: React.ChangeEvent<HTMLInputElement>,
    ) => {
      const files = Array.from(e.target.files ?? []);
      try {
        if (images.length + files.length > MAX_IMAGES) {
          setImageError(`Max ${MAX_IMAGES} uploads at a time`);
          e.target.value = "";
          return;
        }
        setImageError(null);
        await addImages(files);
      } catch (err) {
        setImageError(
          err instanceof Error ? err.message : "Failed to attach files.",
        );
      }
      e.target.value = "";
    };

    /* ---------------- Render ---------------- */
    const sendDisabled =
      disabled ||
      isUpdatingToken ||
      overLimit ||
      ((value ?? "").trim().length === 0 && images.length === 0);

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
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileChange}
          aria-hidden
        />

        {/* Textarea */}
        <div className="px-4 pt-3">
          <textarea
            ref={textareaRef}
            value={value ?? ""}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholders[placeholderIdx]}
            disabled={disabled || isUpdatingToken}
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

        {/* Toolbar row */}
        <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-1">
          {/* Left: attach + dictate */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleAttachClick}
              disabled={disabled || isUpdatingToken}
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-lg",
                "text-[var(--color-text-muted)] hover:bg-[var(--button-ghost-bg-hover)] hover:text-[var(--color-text-primary)]",
                "transition-colors duration-[var(--duration-fast)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]",
                "disabled:opacity-50 disabled:pointer-events-none",
              )}
              aria-label="Attach files"
              aria-describedby="attach-hint"
              title="Attach files"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            {/* A11Y: Hidden hint for screen readers */}
            <span id="attach-hint" className="sr-only">
              Attach up to {MAX_IMAGES} images. Supported formats: JPG, PNG, GIF, WebP.
            </span>
            <DictationButton />
          </div>

          {/* Right: char count + send */}
          <div className="flex items-center gap-2">
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
            {isSubmitting ? (
              <button
                type="button"
                onClick={() => void cancel()}
                aria-label="Cancel message"
                className={cn(
                  "inline-flex h-9 w-9 items-center justify-center rounded-lg",
                  "bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)]",
                  "hover:bg-[var(--button-ghost-bg-hover)]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]",
                )}
              >
                <Square className="h-3.5 w-3.5" fill="currentColor" />
              </button>
            ) : (
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
                <ArrowUp className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Error footer (image / submit) */}
        {(submitError || imageError) ? (
          <div className="px-4 pb-2 text-xs text-[var(--color-refuse)]">
            {submitError ?? imageError}
          </div>
        ) : null}

        {/* Hint footer — only show when empty and there's room */}
        {!value || value.length === 0 ? (
          <div
            className={cn(
              "hidden md:flex items-center justify-end gap-1 border-t",
              "border-[var(--color-border-subtle)] px-4 py-1.5",
              "text-[11px] text-[var(--color-text-muted)]",
            )}
            aria-hidden
          >
            <kbd className="rounded bg-[var(--color-surface-sunken)] px-1.5 py-0.5 font-mono text-[10px]">
              ⌘
            </kbd>
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
