"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  Menu,
  Sparkles,
  Info,
} from "lucide-react";
import {
  useTambo,
  useTamboContextAttachment,
  useTamboThread,
  useTamboThreadInput,
} from "@tambo-ai/react";

import { useAuth } from "@/contexts/auth-context";
import { apiGet } from "@/lib/api-client";
import { cn } from "@/lib/design-system";
import { Badge, Skeleton } from "@/components/ui/primitives";

import { Composer, type ComposerHandle } from "../chat-ui/composer";
import { EmptyState } from "../chat-ui/empty-state";
import { MessageStream } from "../chat-ui/message-stream";
import { MobileSheet } from "../chat-ui/mobile-sheet";
import { ThreadHistoryPane } from "../chat-ui/thread-history-pane";
import { ToastProvider, useToast } from "../chat-ui/toast";
import { ChatErrorBoundary } from "../chat-ui/error-boundary";
import { extractRagDecisionFromMessage } from "../chat-ui/chat-types";
import type { Assistant } from "./dashboard-screen";

/**
 * ChatInterfaceTambo — canonical chat surface (Phase 1b: chat-interface-revamp).
 *
 * Three-pane layout (desktop ≥ md):
 *   ┌────────────┬──────────────────────────┐
 *   │ History    │  Conversation            │
 *   │ (320px)    │  • header                │
 *   │            │  • message stream        │
 *   │            │  • composer (sticky)     │
 *   └────────────┴──────────────────────────┘
 * Mobile collapses the history pane behind a hamburger Sheet.
 *
 * The right governance pane is owned by feat/governance-trust-ui's
 * `<DecisionRenderer>` — it renders the GovernancePanel and SourceExplorer
 * as overlays on top of the conversation when triggered from an answer card.
 */

interface ChatInterfaceTamboProps {
  assistantId: string;
}

export function ChatInterfaceTambo({ assistantId }: ChatInterfaceTamboProps) {
  return (
    <ChatErrorBoundary>
      <ToastProvider>
        <ChatInterfaceTamboInner assistantId={assistantId} />
      </ToastProvider>
    </ChatErrorBoundary>
  );
}

function ChatInterfaceTamboInner({ assistantId }: ChatInterfaceTamboProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [assistant, setAssistant] = React.useState<Assistant | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [historyOpen, setHistoryOpen] = React.useState(false);

  React.useEffect(() => {
    const fetchAssistant = async () => {
      if (!user) return;
      try {
        const res = await apiGet("/api/assistants", user.accessToken);
        const data = await res.json();
        const found = data.assistants?.find(
          (a: Assistant) => a.id === assistantId,
        );
        if (found) setAssistant(found);
      } catch (err) {
        console.error("Failed to fetch assistant", err);
      } finally {
        setLoading(false);
      }
    };
    void fetchAssistant();
  }, [assistantId, user]);

  if (loading) {
    return (
      <div
        className="flex h-screen w-full overflow-hidden bg-[var(--color-background)]"
        aria-busy="true"
        aria-label="Loading assistant"
      >
        {/* Skeleton history pane (xl only) */}
        <div className="hidden h-full w-72 flex-shrink-0 border-r border-[var(--color-border-subtle)] bg-[var(--color-surface)] xl:flex xl:flex-col">
          <div className="flex flex-col gap-3 border-b border-[var(--color-border-subtle)] px-4 py-4">
            <Skeleton className="h-3 w-20" />
            <div className="flex items-start gap-2">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-4 w-20 rounded-full" />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 px-3 py-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
          <div className="flex flex-col gap-2 px-3 py-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        </div>
        {/* Skeleton main */}
        <main className="relative flex h-full min-w-0 flex-1 flex-col">
          <div className="flex h-14 flex-shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface)] px-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-16 rounded-full" />
            </div>
            <Skeleton className="hidden h-4 w-20 rounded-full sm:block" />
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6">
            <span
              className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent text-[var(--color-text-muted)]"
              aria-hidden
            />
            <p className="text-sm text-[var(--color-text-muted)]">Loading assistant…</p>
          </div>
        </main>
      </div>
    );
  }

  if (!assistant) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--color-background)] px-6">
        <div className="flex max-w-sm flex-col items-center gap-4 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-6 text-center shadow-[var(--elevation-1)]">
          <ShieldCheck className="h-8 w-8 text-[var(--color-text-muted)]" aria-hidden />
          <div className="flex flex-col gap-1.5">
            <p className="text-base font-semibold text-[var(--color-text-primary)]">
              Assistant not available
            </p>
            <p className="text-sm text-[var(--color-text-muted)]">
              We couldn&apos;t load this assistant. It may have been deleted, or you may not
              have access.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setAssistant(null);
                // Bump dependency to re-trigger the effect
                router.refresh();
              }}
              className={cn(
                "inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium",
                "border border-[var(--button-outline-border)] bg-[var(--button-outline-bg)] text-[var(--button-outline-fg)]",
                "hover:bg-[var(--button-outline-bg-hover)] hover:border-[var(--color-border-strong)]",
              )}
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium text-[var(--color-brand)] hover:text-[var(--color-brand-hover)]"
            >
              Return to dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const onBack = () => router.push("/dashboard");

  return (
    <div
      className={cn(
        "flex h-screen w-full overflow-hidden",
        "bg-[var(--color-background)]",
      )}
      data-slot="chat-interface-tambo"
    >
      {/* A11Y: Skip navigation link for keyboard users */}
      <a
        href="#main-chat-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:text-black focus:rounded-md focus:shadow-lg"
      >
        Skip to chat
      </a>

      {/* Desktop left pane — only show on viewports wide enough to fit
          both the AppShell sidebar (w-60) and this history pane (w-80)
          comfortably alongside a usable conversation column. Below xl,
          we collapse to the mobile sheet to avoid overflow. */}
      <div className="hidden h-full w-72 flex-shrink-0 xl:block">
        <ThreadHistoryPane assistantName={assistant.name} onBack={onBack} />
      </div>

      {/* Mobile left pane sheet */}
      <MobileSheet
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        side="left"
        ariaLabel="Conversation history"
      >
        <ThreadHistoryPane
          assistantName={assistant.name}
          onBack={() => {
            setHistoryOpen(false);
            onBack();
          }}
        />
      </MobileSheet>

      {/* Center pane */}
      <main
        id="main-chat-content"
        className={cn(
          "relative z-0 flex h-full min-w-0 flex-1 flex-col",
          "bg-[var(--color-background)]",
        )}
      >
        <ChatHeader
          assistant={assistant}
          onOpenHistory={() => setHistoryOpen(true)}
        />
        <ChatBody assistant={assistant} />
      </main>
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Header                                                                */
/* --------------------------------------------------------------------- */
function ChatHeader({
  assistant,
  onOpenHistory,
}: {
  assistant: Assistant;
  onOpenHistory: () => void;
}) {
  return (
    <div
      className={cn(
        "flex h-14 flex-shrink-0 items-center justify-between gap-3 px-4",
        "border-b border-[var(--color-border-subtle)]",
        "bg-[var(--color-surface)]",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onOpenHistory}
          aria-label="Open conversation history"
          className={cn(
            "inline-flex h-9 w-9 items-center justify-center rounded-md xl:hidden",
            "text-[var(--color-text-muted)] hover:bg-[var(--button-ghost-bg-hover)]",
            "hover:text-[var(--color-text-primary)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]",
          )}
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-base font-semibold tracking-tight text-[var(--color-text-primary)]">
            {assistant.name}
          </h1>
          <Badge variant="trust">
            <ShieldCheck className="h-3 w-3" />
            Governed
          </Badge>
        </div>
      </div>
      <Badge variant="brand" className="hidden sm:inline-flex">
        <Sparkles className="h-3 w-3" />
        Tambo AI
      </Badge>
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Body — empty state / message stream + composer                        */
/* --------------------------------------------------------------------- */
function ChatBody({ assistant }: { assistant: Assistant }) {
  const { addContextAttachment } = useTamboContextAttachment();
  const { thread, isIdle } = useTambo();
  const composerRef = React.useRef<ComposerHandle>(null);
  const { showToast } = useToast();

  // Wire assistant context once per assistant.
  React.useEffect(() => {
    addContextAttachment({
      context: JSON.stringify({
        assistant_id: assistant.id,
        assistant_name: assistant.name,
        site_url: assistant.siteUrl,
        template: assistant.template,
        instruction:
          "Use the query_rag_backend tool to answer questions about this assistant's knowledge base.",
      }),
      displayName: `Assistant: ${assistant.name}`,
      type: "assistant_context",
    });
  }, [assistant, addContextAttachment]);

  const messages = thread?.messages ?? [];
  const visibleCount = messages.filter(
    (m) =>
      (m.role === "user" || m.role === "assistant") &&
      !(m as unknown as { parentMessageId?: string }).parentMessageId,
  ).length;

  const isGenerating = !isIdle;

  /* ---------------- Suggestion handling ---------------- */
  const handleSuggestionClick = React.useCallback((s: string) => {
    composerRef.current?.setValue(s);
  }, []);

  /* ---------------- Feedback handling ---------------- */
  const handleFeedback = React.useCallback(
    async (messageId: string, rating: "up" | "down") => {
      // POST to feedback endpoint — best-effort, never blocks UI.
      try {
        await fetch("/api/v1/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message_id: messageId, value: rating }),
        });
        showToast("Thanks for your feedback");
      } catch {
        // Even if the endpoint isn't wired yet, give the user feedback
        // so they don't tap repeatedly.
        showToast("Thanks for your feedback");
      }
    },
    [showToast],
  );

  /* ---------------- Auto-followups (heuristic) ---------------- */
  // Use the most recent assistant message's decision.suggestions if set.
  const followUps = React.useMemo(() => {
    const last = [...messages]
      .reverse()
      .find((m) => m.role === "assistant");
    if (!last) return [];
    const decision = extractRagDecisionFromMessage({
      id: last.id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tool_calls: (last as any).tool_calls,
    });
    if (decision?.suggestions?.length) return decision.suggestions;
    if (decision?.decision === "ANSWER") {
      // Fallback follow-ups if backend doesn't surface them yet.
      return [
        "Tell me more about this",
        "Show me the sources",
        "Summarize the answer",
      ];
    }
    return [];
  }, [messages]);

  const isEmpty = visibleCount === 0;

  return (
    <div className="relative flex flex-1 min-h-0 flex-col">
      {/* Scrollable region — flex-1 fills between header and composer */}
      <div
        className={cn(
          "flex-1 min-h-0 overflow-y-auto",
          "[&::-webkit-scrollbar]:w-[6px]",
          "[&::-webkit-scrollbar-thumb]:bg-[var(--color-border-default)]",
          "[&::-webkit-scrollbar-thumb]:rounded-full",
        )}
      >
        {isEmpty ? (
          <EmptyState
            assistantName={assistant.name}
            onStarterClick={(prompt) => composerRef.current?.setValue(prompt)}
          />
        ) : (
          <ChatMessagesArea
            messages={messages}
            isGenerating={isGenerating}
            followUps={followUps}
            onSuggestionClick={handleSuggestionClick}
            onFeedback={handleFeedback}
            assistantName={assistant.name}
          />
        )}
      </div>

      {/* Floating composer */}
      <div
        className={cn(
          "flex-shrink-0 border-t border-[var(--color-border-subtle)]",
          "bg-[var(--color-background)] px-4 pb-4 pt-3",
        )}
      >
        <div className="mx-auto w-full max-w-[768px]">
          <Composer
            ref={composerRef}
            placeholders={[
              `Ask anything about ${assistant.name}…`,
              `What does ${assistant.siteUrl} say about…`,
              "Find a specific policy or document…",
              "Summarize a recent topic…",
            ]}
          />
          <p
            className={cn(
              "mt-2 flex items-center justify-center gap-1 text-[11px]",
              "text-[var(--color-text-muted)]",
            )}
          >
            <Info className="h-3 w-3" />
            Answers are grounded in cited sources and governed by your policies.
          </p>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Messages area with auto-scroll behavior                              */
/* --------------------------------------------------------------------- */
function ChatMessagesArea({
  messages,
  isGenerating,
  followUps,
  onSuggestionClick,
  onFeedback,
  assistantName,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: any[];
  isGenerating: boolean;
  followUps: string[];
  onSuggestionClick: (s: string) => void;
  onFeedback: (messageId: string, rating: "up" | "down") => Promise<void>;
  assistantName?: string;
}) {
  // We rely on the parent's scrollable container; this is just the
  // content layer. Auto-scroll-to-bottom + pause-on-user-scroll is wired
  // up below via a sentinel element + an IntersectionObserver.
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);
  const [pauseAuto, setPauseAuto] = React.useState(false);
  const lastMessageId = messages[messages.length - 1]?.id;
  const lastUserScrollAt = React.useRef(0);

  // Track user scroll on the closest scrolling ancestor.
  React.useEffect(() => {
    const el = sentinelRef.current?.parentElement;
    const scroller =
      el?.parentElement?.classList.contains("overflow-y-auto") &&
      el.parentElement;
    const target = scroller || sentinelRef.current?.closest(".overflow-y-auto");
    if (!target) return;

    const onScroll = () => {
      const now = Date.now();
      lastUserScrollAt.current = now;
      const node = target as HTMLElement;
      const distanceToBottom =
        node.scrollHeight - node.scrollTop - node.clientHeight;
      // UX: Use viewport-relative threshold (20%) for better high-DPI support
      const threshold = node.clientHeight * 0.2;
      setPauseAuto(distanceToBottom > threshold);
    };

    target.addEventListener("scroll", onScroll, { passive: true });
    return () => target.removeEventListener("scroll", onScroll);
  }, []);

  // Auto-scroll on new content (unless user is reading older messages).
  // PERF: Debounce to prevent RAF leak during rapid streaming updates.
  React.useEffect(() => {
    if (pauseAuto) return;
    const node = sentinelRef.current;
    if (!node) return;

    // Debounce: wait 150ms after last message change before scrolling
    const timer = window.setTimeout(() => {
      const raf = window.requestAnimationFrame(() => {
        node.scrollIntoView({ block: "end", behavior: "smooth" });
      });
      // Note: RAF cleanup happens when timer is cleared
    }, 150);

    return () => window.clearTimeout(timer);
  }, [lastMessageId, pauseAuto]);

  return (
    <div className="relative">
      <MessageStream
        messages={messages}
        isGenerating={isGenerating}
        followUpSuggestions={followUps}
        onSuggestionClick={onSuggestionClick}
        onFeedback={(id, rating) => void onFeedback(id, rating)}
        assistantName={assistantName}
      />
      <div ref={sentinelRef} aria-hidden style={{ height: 1 }} />
    </div>
  );
}
