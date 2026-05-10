"use client";

/**
 * Command Palette — Cmd+K / Ctrl+K
 * --------------------------------------------------------------------
 * Built on Radix Dialog primitives only — no `cmdk` dependency.
 * Sections: Quick actions, Assistants, Recent, Help.
 * Keyboard: ↑/↓ to navigate, Enter to run, Esc to close.
 * --------------------------------------------------------------------
 */
import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import {
  Bot,
  FileStack,
  Globe,
  HelpCircle,
  KeyRound,
  LifeBuoy,
  MessageSquare,
  Plus,
  Search,
  Settings,
  Shield,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/design-system";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type PaletteSection =
  | "quick-actions"
  | "assistants"
  | "recent"
  | "help";

export interface PaletteItem {
  id: string;
  label: string;
  /** Optional shorter helper text rendered to the right of the label. */
  hint?: string;
  /** Keyboard shortcut hint, e.g. "⌘N". */
  shortcut?: string;
  icon: React.ComponentType<{ className?: string }>;
  section: PaletteSection;
  /** Lowercased keywords for fuzzy filtering. */
  keywords?: string[];
  onSelect: () => void;
}

export interface PaletteAssistant {
  id: string;
  name: string;
  description?: string;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assistants: PaletteAssistant[];
  recents?: PaletteAssistant[];
}

/* ------------------------------------------------------------------ */
/* Section labels                                                      */
/* ------------------------------------------------------------------ */

const SECTION_LABEL: Record<PaletteSection, string> = {
  "quick-actions": "Quick actions",
  assistants: "Assistants",
  recent: "Recent",
  help: "Help",
};

const SECTION_ORDER: PaletteSection[] = [
  "quick-actions",
  "assistants",
  "recent",
  "help",
];

/* ------------------------------------------------------------------ */
/* Hook for keyboard shortcut + open state                             */
/* ------------------------------------------------------------------ */

export function useCommandPalette() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Support both Cmd (Mac) and Ctrl (Windows/Linux)
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        e.stopPropagation();
        setOpen((prev) => !prev);
      }
      // Also support Escape to close when open
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [open]);

  return { open, setOpen };
}

/* ------------------------------------------------------------------ */
/* Filtering — simple substring + keyword match                        */
/* ------------------------------------------------------------------ */

function matches(query: string, item: PaletteItem): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (item.label.toLowerCase().includes(q)) return true;
  if (item.hint?.toLowerCase().includes(q)) return true;
  if (item.keywords?.some((k) => k.includes(q))) return true;
  return false;
}

/* ------------------------------------------------------------------ */
/* Component                                                            */
/* ------------------------------------------------------------------ */

export function CommandPalette({
  open,
  onOpenChange,
  assistants,
  recents = [],
}: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const close = React.useCallback(() => {
    onOpenChange(false);
    setQuery("");
    setActive(0);
  }, [onOpenChange]);

  /* Build the full item list — quick actions first, then assistants,
   * then recent, then help. */
  const items = React.useMemo<PaletteItem[]>(() => {
    // Sanitize function to prevent command injection
    const sanitizeRoute = (route: string): string => {
      // Only allow alphanumeric, dash, slash, and underscore characters
      return route.replace(/[^a-zA-Z0-9\-/_]/g, '');
    };

    const out: PaletteItem[] = [
      {
        id: "create-assistant",
        label: "Create assistant",
        hint: "Build a new governed AI agent",
        shortcut: "N",
        icon: Plus,
        section: "quick-actions",
        keywords: ["new", "create", "assistant", "bot"],
        onSelect: () => {
          close();
          router.push(sanitizeRoute("/assistant/create"));
        },
      },
      {
        id: "upload-pdf",
        label: "Upload documents",
        hint: "Add PDFs or knowledge files",
        icon: FileStack,
        section: "quick-actions",
        keywords: ["pdf", "upload", "documents", "files", "knowledge"],
        onSelect: () => {
          close();
          router.push(sanitizeRoute("/assistant/create"));
        },
      },
      {
        id: "add-wordpress",
        label: "Add WordPress site",
        hint: "Crawl a WordPress source",
        icon: Globe,
        section: "quick-actions",
        keywords: ["wordpress", "site", "crawl", "source"],
        onSelect: () => {
          close();
          router.push(sanitizeRoute("/assistant/create"));
        },
      },
      {
        id: "open-settings",
        label: "Open settings",
        hint: "Workspace preferences",
        shortcut: ",",
        icon: Settings,
        section: "quick-actions",
        keywords: ["settings", "preferences", "config"],
        onSelect: () => {
          close();
          router.push(sanitizeRoute("/settings"));
        },
      },
      {
        id: "edit-governance",
        label: "Edit governance rules",
        hint: "Tenant isolation, attribution",
        icon: Shield,
        section: "quick-actions",
        keywords: ["governance", "rules", "policy", "shield"],
        onSelect: () => {
          close();
          router.push(sanitizeRoute("/settings/governance"));
        },
      },
    ];

    for (const a of assistants) {
      // Sanitize assistant IDs to prevent injection
      const safeId = sanitizeRoute(a.id);
      out.push({
        id: `assistant-${safeId}`,
        label: a.name,
        hint: a.description,
        icon: Bot,
        section: "assistants",
        keywords: [a.name.toLowerCase(), "assistant", "bot", "chat"],
        onSelect: () => {
          close();
          router.push(`/assistant/${safeId}`);
        },
      });
    }

    for (const r of recents) {
      // Sanitize recent IDs to prevent injection
      const safeId = sanitizeRoute(r.id);
      out.push({
        id: `recent-${safeId}`,
        label: r.name,
        hint: "Recent chat",
        icon: MessageSquare,
        section: "recent",
        keywords: [r.name.toLowerCase(), "recent", "chat"],
        onSelect: () => {
          close();
          router.push(`/assistant/${safeId}`);
        },
      });
    }

    out.push(
      {
        id: "help-shortcuts",
        label: "Keyboard shortcuts",
        hint: "View all shortcuts",
        shortcut: "?",
        icon: KeyRound,
        section: "help",
        keywords: ["shortcuts", "keys", "help"],
        onSelect: () => {
          close();
        },
      },
      {
        id: "help-docs",
        label: "Documentation",
        hint: "Read the docs",
        icon: HelpCircle,
        section: "help",
        keywords: ["docs", "help", "documentation"],
        onSelect: () => {
          close();
        },
      },
      {
        id: "help-support",
        label: "Contact support",
        icon: LifeBuoy,
        section: "help",
        keywords: ["support", "help", "contact"],
        onSelect: () => {
          close();
        },
      }
    );

    return out;
  }, [assistants, recents, close, router]);

  const filtered = React.useMemo(
    () => items.filter((item) => matches(query, item)),
    [items, query]
  );

  /* Group filtered items by section, preserving SECTION_ORDER. */
  const grouped = React.useMemo(() => {
    const map = new Map<PaletteSection, PaletteItem[]>();
    for (const item of filtered) {
      const list = map.get(item.section) ?? [];
      list.push(item);
      map.set(item.section, list);
    }
    return SECTION_ORDER.flatMap((section) => {
      const list = map.get(section);
      if (!list || list.length === 0) return [];
      return [{ section, items: list }];
    });
  }, [filtered]);

  /* Reset active index when results change. */
  React.useEffect(() => {
    setActive(0);
  }, [query]);

  /* Reset state when opened. */
  React.useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      // Focus is handled by Radix autoFocus on input — but ensure on next tick.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  /* Scroll the active item into view. */
  React.useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-index="${active}"]`
    );
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [active, filtered.length]);

  /* Trap focus within the dialog when open */
  React.useEffect(() => {
    if (!open) return;

    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return;

    const focusableElements = dialog.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    dialog.addEventListener('keydown', handleTab);
    return () => dialog.removeEventListener('keydown', handleTab);
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const selected = filtered[active];
      if (selected) selected.onSelect();
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            "fixed inset-0 z-50",
            "bg-[oklch(0.16_0.012_270/0.55)] backdrop-blur-sm",
            "data-[state=open]:animate-cmd-fade-in",
            "data-[state=closed]:animate-cmd-fade-out"
          )}
        />
        <Dialog.Content
          aria-describedby={undefined}
          onKeyDown={onKeyDown}
          className={cn(
            "fixed left-1/2 top-[18%] z-50 w-[92vw] max-w-xl -translate-x-1/2",
            "rounded-xl border border-[var(--color-border-subtle)]",
            "bg-[var(--color-surface-elevated)]",
            "shadow-[var(--elevation-4)]",
            "outline-none",
            "data-[state=open]:animate-cmd-pop-in",
            "data-[state=closed]:animate-cmd-pop-out"
          )}
        >
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <div className="flex items-center gap-3 border-b border-[var(--color-border-subtle)] px-4 py-3">
            <Search
              className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]"
              aria-hidden
            />
            <input
              ref={inputRef}
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type a command, assistant, or search…"
              className={cn(
                "flex-1 bg-transparent text-sm outline-none",
                "text-[var(--color-text-primary)]",
                "placeholder:text-[var(--color-text-muted)]"
              )}
              aria-label="Command palette search"
            />
            <kbd
              className={cn(
                "hidden sm:inline-flex h-6 items-center rounded border px-1.5",
                "border-[var(--color-border-default)] bg-[var(--color-surface-sunken)]",
                "text-[10px] font-medium text-[var(--color-text-muted)] tracking-wide"
              )}
            >
              ESC
            </kbd>
          </div>

          <div
            ref={listRef}
            role="listbox"
            aria-label="Commands"
            className="max-h-[60vh] overflow-y-auto p-2"
          >
            {grouped.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <Sparkles className="h-5 w-5 text-[var(--color-text-muted)]" />
                <p className="text-sm text-[var(--color-text-muted)]">
                  No results for &ldquo;{query}&rdquo;
                </p>
              </div>
            ) : (
              grouped.map(({ section, items: groupItems }) => (
                <div key={section} className="mb-2 last:mb-0">
                  <div
                    className={cn(
                      "px-3 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.16em]",
                      "text-[var(--color-text-muted)]"
                    )}
                  >
                    {SECTION_LABEL[section]}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {groupItems.map((item) => {
                      const idx = filtered.indexOf(item);
                      const isActive = idx === active;
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          data-index={idx}
                          onMouseEnter={() => setActive(idx)}
                          onClick={() => item.onSelect()}
                          className={cn(
                            "group flex w-full items-center gap-3 rounded-md px-3 py-2 text-left",
                            "transition-colors duration-[var(--duration-fast)]",
                            isActive
                              ? "bg-[var(--color-brand-soft)] text-[var(--color-text-primary)]"
                              : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-sunken)]"
                          )}
                        >
                          <span
                            className={cn(
                              "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                              "border border-[var(--color-border-subtle)]",
                              isActive
                                ? "bg-[var(--color-surface)] text-[var(--color-brand)]"
                                : "bg-[var(--color-surface)] text-[var(--color-text-muted)]"
                            )}
                          >
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <span className="flex flex-1 flex-col items-start">
                            <span className="text-sm font-medium leading-tight text-[var(--color-text-primary)]">
                              {item.label}
                            </span>
                            {item.hint ? (
                              <span className="line-clamp-1 text-xs text-[var(--color-text-muted)]">
                                {item.hint}
                              </span>
                            ) : null}
                          </span>
                          {item.shortcut ? (
                            <kbd
                              className={cn(
                                "ml-auto inline-flex h-6 items-center rounded border px-1.5",
                                "border-[var(--color-border-default)] bg-[var(--color-surface-sunken)]",
                                "text-[10px] font-medium text-[var(--color-text-muted)] tracking-wide"
                              )}
                            >
                              {item.shortcut}
                            </kbd>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          <div
            className={cn(
              "flex items-center justify-between gap-3 border-t border-[var(--color-border-subtle)] px-4 py-2",
              "text-[11px] text-[var(--color-text-muted)]"
            )}
          >
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1">
                <kbd className="rounded border border-[var(--color-border-default)] bg-[var(--color-surface-sunken)] px-1 py-0.5 text-[10px]">
                  ↑↓
                </kbd>
                navigate
              </span>
              <span className="inline-flex items-center gap-1">
                <kbd className="rounded border border-[var(--color-border-default)] bg-[var(--color-surface-sunken)] px-1 py-0.5 text-[10px]">
                  ↵
                </kbd>
                select
              </span>
              <span className="inline-flex items-center gap-1">
                <kbd className="rounded border border-[var(--color-border-default)] bg-[var(--color-surface-sunken)] px-1 py-0.5 text-[10px]">
                  esc
                </kbd>
                close
              </span>
            </div>
            <span>FlakersStudio</span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
