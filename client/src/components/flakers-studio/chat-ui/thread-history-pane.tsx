"use client";

import * as React from "react";
import {
  useTamboThread,
  useTamboThreadList,
} from "@tambo-ai/react";

// `useTamboThreadList` returns the SDK's base Thread shape (no `messages`),
// while `useTamboThread().thread` returns the extended `TamboThread`. We
// only need a narrow projection for the history pane, so define a local
// minimal type and structurally accept either.
type ThreadLike = {
  id: string;
  name?: string | null;
  createdAt: string;
};
import {
  Search,
  Plus,
  MessageSquare,
  Pencil,
  Sparkles,
  ChevronLeft,
  ShieldCheck,
} from "lucide-react";

import { cn } from "@/lib/design-system";
import { Badge } from "@/components/ui/primitives";
import { bucketByDate, formatRelativeTime } from "./chat-types";

// PERF: Lower threshold to prevent laggy scroll with 20-40 threads
const VIRTUALIZE_THRESHOLD = 20;
const ITEM_ESTIMATED_HEIGHT = 72;
const VIEWPORT_OVERSCAN = 4;

/* --------------------------------------------------------------------- */
/* Group bucket                                                          */
/* --------------------------------------------------------------------- */
interface ThreadBucket {
  label: "Today" | "Yesterday" | "This week" | "Older";
  threads: ThreadLike[];
}

function groupThreads(threads: ThreadLike[]): ThreadBucket[] {
  const buckets: Record<ThreadBucket["label"], ThreadLike[]> = {
    Today: [],
    Yesterday: [],
    "This week": [],
    Older: [],
  };
  for (const t of threads) {
    const created = new Date(t.createdAt);
    buckets[bucketByDate(created)].push(t);
  }
  // Sort each bucket newest-first
  for (const key of Object.keys(buckets) as ThreadBucket["label"][]) {
    buckets[key].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }
  return (
    [
      { label: "Today" as const, threads: buckets.Today },
      { label: "Yesterday" as const, threads: buckets.Yesterday },
      { label: "This week" as const, threads: buckets["This week"] },
      { label: "Older" as const, threads: buckets.Older },
    ] satisfies ThreadBucket[]
  ).filter((b) => b.threads.length > 0);
}

/* --------------------------------------------------------------------- */
/* Single thread row                                                     */
/* --------------------------------------------------------------------- */
function ThreadRow({
  thread,
  isActive,
  isLoading,
  onSelect,
  onRename,
  onGenerateName,
}: {
  thread: ThreadLike;
  isActive: boolean;
  isLoading?: boolean;
  onSelect: () => void;
  onRename: () => void;
  onGenerateName: () => void;
}) {
  const created = new Date(thread.createdAt);
  const name = thread.name ?? `Thread ${thread.id.substring(0, 6)}`;

  return (
    <div
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "group relative w-full cursor-pointer rounded-lg border px-3 py-2.5",
        "text-left transition-[background,border-color,box-shadow] duration-[var(--duration-base)] ease-[var(--ease-out)]",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]",
        isActive
          ? cn(
              "bg-[var(--color-brand-soft)]",
              "border-[var(--color-brand-border)]",
            )
          : cn(
              "bg-transparent border-transparent",
              "hover:bg-[var(--color-surface-sunken)] hover:border-[var(--color-border-subtle)]",
            ),
      )}
    >
      {/* 3px gradient left-accent for active */}
      {isActive ? (
        <span
          className={cn(
            "pointer-events-none absolute left-0 top-2 bottom-2 w-[3px] rounded-r",
            "bg-[image:var(--gradient-brand)]",
          )}
          aria-hidden
        />
      ) : null}

      <div className="flex items-start gap-2 pl-1">
        {isLoading ? (
          <span
            className="mt-0.5 inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent flex-shrink-0 text-[var(--color-brand)]"
            aria-hidden
          />
        ) : (
          <MessageSquare
            className={cn(
              "mt-0.5 h-4 w-4 flex-shrink-0",
              isActive
                ? "text-[var(--color-brand)]"
                : "text-[var(--color-text-muted)]",
            )}
            aria-hidden
          />
        )}
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "line-clamp-1 text-sm font-medium",
              isActive
                ? "text-[var(--color-text-primary)]"
                : "text-[var(--color-text-primary)]",
            )}
          >
            {name}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-[var(--color-text-muted)]">
            {formatRelativeTime(created)}
          </div>
        </div>

        {/* Hover actions — rename / regenerate */}
        <div className="flex flex-shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-[var(--duration-fast)] group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRename();
            }}
            aria-label="Rename thread"
            title="Rename"
            className={cn(
              "inline-flex h-6 w-6 items-center justify-center rounded-md",
              "text-[var(--color-text-muted)] hover:bg-[var(--button-ghost-bg-hover)]",
              "hover:text-[var(--color-text-primary)]",
            )}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onGenerateName();
            }}
            aria-label="Generate thread name"
            title="Generate name"
            className={cn(
              "inline-flex h-6 w-6 items-center justify-center rounded-md",
              "text-[var(--color-text-muted)] hover:bg-[var(--button-ghost-bg-hover)]",
              "hover:text-[var(--color-text-primary)]",
            )}
          >
            <Sparkles className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Virtualized list — simple windowing, no react-window dep             */
/* --------------------------------------------------------------------- */
function VirtualizedThreadList({
  threads,
  currentThreadId,
  switchingToId,
  onSelect,
  onRename,
  onGenerateName,
}: {
  threads: ThreadLike[];
  currentThreadId: string | undefined;
  switchingToId?: string | null;
  onSelect: (id: string) => void;
  onRename: (t: ThreadLike) => void;
  onGenerateName: (t: ThreadLike) => void;
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = React.useState(0);
  const [viewportH, setViewportH] = React.useState(600);

  // Track viewport height
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setViewportH(el.clientHeight);
    });
    ro.observe(el);
    setViewportH(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  const totalHeight = threads.length * ITEM_ESTIMATED_HEIGHT;
  const startIdx = Math.max(
    0,
    Math.floor(scrollTop / ITEM_ESTIMATED_HEIGHT) - VIEWPORT_OVERSCAN,
  );
  const endIdx = Math.min(
    threads.length,
    Math.ceil((scrollTop + viewportH) / ITEM_ESTIMATED_HEIGHT) +
      VIEWPORT_OVERSCAN,
  );
  const offsetY = startIdx * ITEM_ESTIMATED_HEIGHT;
  const visible = threads.slice(startIdx, endIdx);

  return (
    <div
      ref={containerRef}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      className="h-full overflow-y-auto"
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        <div
          style={{
            transform: `translateY(${offsetY}px)`,
            position: "absolute",
            left: 0,
            right: 0,
          }}
        >
          {visible.map((t) => (
            <div
              key={t.id}
              style={{ height: ITEM_ESTIMATED_HEIGHT, padding: "2px 0" }}
            >
              <ThreadRow
                thread={t}
                isActive={t.id === currentThreadId}
                isLoading={t.id === switchingToId}
                onSelect={() => onSelect(t.id)}
                onRename={() => onRename(t)}
                onGenerateName={() => onGenerateName(t)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Public — ThreadHistoryPane                                           */
/* --------------------------------------------------------------------- */
export interface ThreadHistoryPaneProps {
  assistantName: string;
  onBack: () => void;
}

export function ThreadHistoryPane({
  assistantName,
  onBack,
}: ThreadHistoryPaneProps) {
  const {
    data: threadList,
    isLoading,
    refetch,
  } = useTamboThreadList();
  const {
    thread: currentThread,
    switchCurrentThread,
    startNewThread,
    updateThreadName,
    generateThreadName,
  } = useTamboThread();

  const [search, setSearch] = React.useState("");
  const [editing, setEditing] = React.useState<ThreadLike | null>(null);
  const [editName, setEditName] = React.useState("");
  const [switchingTo, setSwitchingTo] = React.useState<string | null>(null);
  const editInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (editing) {
      window.setTimeout(() => editInputRef.current?.focus(), 50);
    }
  }, [editing]);

  const items: ThreadLike[] = (threadList?.items ?? []) as ThreadLike[];
  const filtered = React.useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((t) =>
      (t.name?.toLowerCase().includes(q) ?? false) ||
      t.id.toLowerCase().includes(q),
    );
  }, [items, search]);

  const grouped = React.useMemo(() => groupThreads(filtered), [filtered]);

  const handleNew = async () => {
    try {
      await startNewThread();
      await refetch();
    } catch (err) {
      console.error("Failed to create thread", err);
    }
  };

  const handleSelect = async (id: string) => {
    // UX: Show loading state while switching threads
    setSwitchingTo(id);
    try {
      await switchCurrentThread(id);
    } finally {
      setSwitchingTo(null);
    }
  };

  const handleRename = (t: ThreadLike) => {
    setEditing(t);
    setEditName(t.name ?? "");
  };

  const handleGenerateName = async (t: ThreadLike) => {
    try {
      await generateThreadName(t.id);
      await refetch();
    } catch (err) {
      console.error("Failed to generate name", err);
    }
  };

  const submitRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    try {
      await updateThreadName(editName, editing.id);
      await refetch();
    } catch (err) {
      console.error("Failed to rename thread", err);
    } finally {
      setEditing(null);
    }
  };

  const useVirtualization = filtered.length > VIRTUALIZE_THRESHOLD;

  return (
    <aside
      className={cn(
        "flex h-full w-full flex-col",
        "bg-[var(--color-surface)] border-r border-[var(--color-border-subtle)]",
      )}
      data-slot="thread-history-pane"
    >
      {/* Top — back link + assistant badge */}
      <div className="flex flex-col gap-3 border-b border-[var(--color-border-subtle)] px-4 py-4">
        <button
          type="button"
          onClick={onBack}
          className={cn(
            "inline-flex items-center gap-1.5 self-start text-xs font-medium",
            "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
            "transition-colors duration-[var(--duration-fast)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] rounded-sm",
          )}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Dashboard
        </button>
        <div className="flex items-start gap-2">
          <div
            className={cn(
              "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg",
              "bg-[image:var(--gradient-brand)] text-white",
            )}
            aria-hidden
          >
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="line-clamp-1 text-sm font-semibold text-[var(--color-text-primary)]">
              {assistantName}
            </div>
            <Badge variant="trust" className="mt-1">
              <ShieldCheck className="h-3 w-3" />
              Governed
            </Badge>
          </div>
        </div>
      </div>

      {/* Search + new */}
      <div className="flex flex-col gap-2 border-b border-[var(--color-border-subtle)] px-3 py-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-muted)]"
            aria-hidden
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations…"
            className={cn(
              "h-9 w-full rounded-md pl-8 pr-3 text-sm",
              "bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)]",
              "border border-transparent",
              "placeholder:text-[var(--input-placeholder)]",
              "focus:outline-none focus:border-[var(--color-brand-border)]",
              "focus:ring-2 focus:ring-[var(--color-focus-ring)] focus:ring-offset-1 focus:ring-offset-[var(--color-background)]",
            )}
            aria-label="Search conversations"
          />
        </div>
        <button
          type="button"
          onClick={handleNew}
          className={cn(
            "inline-flex h-9 items-center justify-center gap-1.5 rounded-md text-sm font-medium",
            "bg-[image:var(--gradient-brand)] text-white",
            "shadow-[var(--elevation-1)] hover:shadow-[var(--elevation-glow-brand)]",
            "transition-[box-shadow,transform] duration-[var(--duration-base)]",
            "active:scale-[0.98]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-focus-ring-offset)]",
          )}
        >
          <Plus className="h-4 w-4" />
          New conversation
        </button>
      </div>

      {/* Thread list (virtualized when long) */}
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="px-3 py-2 text-xs text-[var(--color-text-muted)]">
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-3 py-8 text-center">
            <p className="text-sm text-[var(--color-text-muted)]">
              {search.trim()
                ? "No matching conversations"
                : "No conversations yet"}
            </p>
            {!search.trim() ? (
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                Start a new chat to see it here.
              </p>
            ) : null}
          </div>
        ) : useVirtualization ? (
          <div className="h-full px-2 pb-3 pt-2">
            <VirtualizedThreadList
              threads={filtered}
              currentThreadId={currentThread?.id}
              switchingToId={switchingTo}
              onSelect={handleSelect}
              onRename={handleRename}
              onGenerateName={handleGenerateName}
            />
          </div>
        ) : (
          <div className="h-full overflow-y-auto px-2 pb-3 pt-2">
            {grouped.map((bucket) => (
              <div key={bucket.label} className="mb-3">
                <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                  {bucket.label}
                </div>
                <div className="space-y-1">
                  {bucket.threads.map((t) => (
                    <ThreadRow
                      key={t.id}
                      thread={t}
                      isActive={t.id === currentThread?.id}
                      isLoading={t.id === switchingTo}
                      onSelect={() => handleSelect(t.id)}
                      onRename={() => handleRename(t)}
                      onGenerateName={() => handleGenerateName(t)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rename modal — minimal inline overlay */}
      {editing ? (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-[oklch(0.16_0.012_270/0.40)] backdrop-blur-sm"
          onClick={() => setEditing(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Rename conversation"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submitRename}
            className={cn(
              "w-[90%] max-w-sm rounded-xl",
              "bg-[var(--color-surface)] border border-[var(--color-border-default)]",
              "p-4 shadow-[var(--elevation-3)]",
            )}
          >
            <label
              htmlFor="rename-input"
              className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]"
            >
              Rename conversation
            </label>
            <input
              ref={editInputRef}
              id="rename-input"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditing(null);
              }}
              className={cn(
                "h-10 w-full rounded-md px-3 text-sm",
                "bg-[var(--color-surface)] text-[var(--color-text-primary)]",
                "border border-[var(--color-border-default)]",
                "focus:outline-none focus:border-[var(--color-brand-border)]",
                "focus:ring-2 focus:ring-[var(--color-focus-ring)] focus:ring-offset-1 focus:ring-offset-[var(--color-background)]",
              )}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className={cn(
                  "h-8 rounded-md px-3 text-sm font-medium",
                  "text-[var(--color-text-secondary)] hover:bg-[var(--button-ghost-bg-hover)]",
                )}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={cn(
                  "h-8 rounded-md px-3 text-sm font-medium text-white",
                  "bg-[var(--color-brand)] hover:bg-[var(--color-brand-hover)]",
                  "shadow-[var(--elevation-1)]",
                )}
              >
                Save
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </aside>
  );
}
