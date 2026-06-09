"use client";

import * as React from "react";
import {
  Plus,
  MessageSquare,
  ChevronLeft,
  ShieldCheck,
} from "lucide-react";

import { cn } from "@/lib/design-system";
import { Badge } from "@/components/ui/primitives";
import { bucketByDate, formatRelativeTime } from "./chat-types";

/* --------------------------------------------------------------------- */
/* Public — minimal session shape used by the pane                       */
/* --------------------------------------------------------------------- */
export interface ChatSession {
  id: string;
  name?: string | null;
  createdAt: string;
}

/* --------------------------------------------------------------------- */
/* Group bucket                                                          */
/* --------------------------------------------------------------------- */
interface ThreadBucket {
  label: "Today" | "Yesterday" | "This week" | "Older";
  threads: ChatSession[];
}

function groupThreads(threads: ChatSession[]): ThreadBucket[] {
  const buckets: Record<ThreadBucket["label"], ChatSession[]> = {
    Today: [],
    Yesterday: [],
    "This week": [],
    Older: [],
  };
  for (const t of threads) {
    const created = new Date(t.createdAt);
    buckets[bucketByDate(created)].push(t);
  }
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
  onSelect,
}: {
  thread: ChatSession;
  isActive: boolean;
  onSelect: () => void;
}) {
  const created = new Date(thread.createdAt);
  const name = thread.name ?? `Conversation ${thread.id.substring(0, 6)}`;

  return (
    <button
      type="button"
      onClick={onSelect}
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
        <MessageSquare
          className={cn(
            "mt-0.5 h-4 w-4 flex-shrink-0",
            isActive
              ? "text-[var(--color-brand)]"
              : "text-[var(--color-text-muted)]",
          )}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="line-clamp-1 text-sm font-medium text-[var(--color-text-primary)]">
            {name}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-[var(--color-text-muted)]">
            {formatRelativeTime(created)}
          </div>
        </div>
      </div>
    </button>
  );
}

/* --------------------------------------------------------------------- */
/* Public — ThreadHistoryPane                                           */
/* --------------------------------------------------------------------- */
export interface ThreadHistoryPaneProps {
  assistantName: string;
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelect: (sessionId: string) => void;
  onNewConversation: () => void;
  onBack: () => void;
  isLoading?: boolean;
}

export function ThreadHistoryPane({
  assistantName,
  sessions,
  activeSessionId,
  onSelect,
  onNewConversation,
  onBack,
  isLoading,
}: ThreadHistoryPaneProps) {
  const grouped = React.useMemo(() => groupThreads(sessions), [sessions]);

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

      {/* New conversation */}
      <div className="border-b border-[var(--color-border-subtle)] px-3 py-3">
        <button
          type="button"
          onClick={onNewConversation}
          className={cn(
            "inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md text-sm font-medium",
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

      {/* Thread list */}
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="px-3 py-2 text-xs text-[var(--color-text-muted)]">
            Loading…
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-3 py-8 text-center">
            <p className="text-sm text-[var(--color-text-muted)]">
              No conversations yet
            </p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              Start a new chat to see it here.
            </p>
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
                      isActive={t.id === activeSessionId}
                      onSelect={() => onSelect(t.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
