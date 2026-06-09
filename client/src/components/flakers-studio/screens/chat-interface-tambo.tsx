"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Info, Menu, ShieldCheck } from "lucide-react";

import { useAuth } from "@/contexts/auth-context";
import { apiClient, apiGet } from "@/lib/api-client";
import { cn } from "@/lib/design-system";
import { Badge, Skeleton } from "@/components/ui/primitives";

import { Composer, type ComposerHandle } from "../chat-ui/composer";
import { EmptyState } from "../chat-ui/empty-state";
import { MessageStream, type ChatMessage } from "../chat-ui/message-stream";
import { MobileSheet } from "../chat-ui/mobile-sheet";
import {
  ThreadHistoryPane,
  type ChatSession,
} from "../chat-ui/thread-history-pane";
import { ToastProvider, useToast } from "../chat-ui/toast";
import { ChatErrorBoundary } from "../chat-ui/error-boundary";
import type { RagToolResult } from "../chat-ui/chat-types";
import type { Assistant } from "./dashboard-screen";

/**
 * ChatInterfaceTambo — canonical chat surface (native React implementation).
 *
 * This component is named ChatInterfaceTambo for backwards compatibility
 * with existing imports; the implementation no longer depends on the
 * legacy chat SDK. Messages are exchanged with the backend through the
 * Next.js BFF routes:
 *
 *   POST /api/chat/query    — send a message + receive a governed answer
 *   GET  /api/chat/threads  — list sessions for an assistant (best-effort)
 *   GET  /api/chat/history  — load messages for a session (best-effort)
 *
 * Layout (≥ xl):
 *   ┌────────────┬──────────────────────────┐
 *   │ History    │  Conversation            │
 *   │ pane (288) │  • header                │
 *   │            │  • message stream        │
 *   │            │  • composer              │
 *   └────────────┴──────────────────────────┘
 * Mobile collapses the pane behind a hamburger sheet. When the threads
 * endpoint returns no items, the pane stays mounted but shows the empty
 * "Start a new chat to see it here." placeholder. When the request fails
 * outright, the pane is hidden entirely.
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

/* --------------------------------------------------------------------- */
/* Backend payload shapes (loose — backend is the source of truth)       */
/* --------------------------------------------------------------------- */
interface ChatQueryResponse {
  decision: "ANSWER" | "REFUSE";
  answer?: string;
  refusal_reason?: string;
  refusal_code?: string;
  confidence?: number;
  sources?: Array<{
    url: string;
    title: string;
    intent?: string;
    snippet?: string;
    relevance_score?: number;
  }>;
  rules_applied?: string[];
  session_id: string;
  processing_time_ms?: number;
  used_fallback?: boolean;
  applied_filters?: string[];
  suggestions?: string[];
}

interface ThreadsResponse {
  sessions?: Array<{
    id?: string;
    session_id?: string;
    name?: string | null;
    title?: string | null;
    created_at?: string;
    createdAt?: string;
  }>;
  threads?: Array<{
    id?: string;
    session_id?: string;
    name?: string | null;
    title?: string | null;
    created_at?: string;
    createdAt?: string;
  }>;
}

interface HistoryResponse {
  messages?: Array<{
    id?: string;
    message_id?: string;
    role?: "user" | "assistant";
    content?: string;
    message?: string;
    answer?: string;
    created_at?: string;
    createdAt?: string;
    rag_result?: RagToolResult;
    ragResult?: RagToolResult;
  }>;
}

/* --------------------------------------------------------------------- */
/* Helpers                                                                */
/* --------------------------------------------------------------------- */
function generateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function responseToRagResult(res: ChatQueryResponse): RagToolResult {
  return {
    success: true,
    decision: res.decision,
    answer: res.answer,
    reason: res.refusal_reason,
    refusal_code: res.refusal_code,
    confidence: res.confidence,
    sources: res.sources,
    rules_applied: res.rules_applied,
    processing_time_ms: res.processing_time_ms,
    suggestions: res.suggestions,
  };
}

function normalizeSessions(payload: ThreadsResponse): ChatSession[] {
  const raw = payload.sessions ?? payload.threads ?? [];
  const out: ChatSession[] = [];
  for (const s of raw) {
    const id = s.id ?? s.session_id;
    if (!id) continue;
    out.push({
      id,
      name: s.title ?? s.name ?? null,
      createdAt: s.createdAt ?? s.created_at ?? new Date().toISOString(),
    });
  }
  return out;
}

function normalizeHistory(payload: HistoryResponse): ChatMessage[] {
  const raw = payload.messages ?? [];
  return raw
    .map((m, i) => {
      const role = m.role ?? "assistant";
      const id = m.id ?? m.message_id ?? `hist-${i}`;
      const createdAt =
        m.createdAt ?? m.created_at ?? new Date().toISOString();
      const ragResult = m.ragResult ?? m.rag_result;
      const content =
        role === "assistant"
          ? (m.answer ?? m.content ?? ragResult?.answer ?? "")
          : (m.message ?? m.content ?? "");
      return {
        id,
        role,
        content,
        createdAt,
        ragResult,
        status: "sent" as const,
      };
    });
}

/* --------------------------------------------------------------------- */
/* Inner component                                                       */
/* --------------------------------------------------------------------- */
function ChatInterfaceTamboInner({ assistantId }: ChatInterfaceTamboProps) {
  const { user } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();

  /* ---------------- Assistant lookup ---------------- */
  const [assistant, setAssistant] = React.useState<Assistant | null>(null);
  const [loadingAssistant, setLoadingAssistant] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    const fetchAssistant = async () => {
      if (!user) return;
      try {
        const res = await apiGet("/api/assistants", user.accessToken);
        if (!res.ok) {
          if (!cancelled) setAssistant(null);
          return;
        }
        const data = await res.json();
        const found = (data.assistants ?? []).find(
          (a: Assistant) => a.id === assistantId,
        );
        if (!cancelled) setAssistant(found ?? null);
      } catch (err) {
        console.error("Failed to fetch assistant", err);
        if (!cancelled) setAssistant(null);
      } finally {
        if (!cancelled) setLoadingAssistant(false);
      }
    };
    void fetchAssistant();
    return () => {
      cancelled = true;
    };
  }, [assistantId, user]);

  /* ---------------- Threads / sessions ---------------- */
  // `null` here means "we haven't determined whether threads are available";
  // an empty array means "endpoint responded, no sessions yet" (pane is shown
  // with the empty placeholder); `unavailable` means the request failed and
  // the pane should be hidden entirely.
  const [sessions, setSessions] = React.useState<ChatSession[]>([]);
  const [threadsStatus, setThreadsStatus] = React.useState<
    "idle" | "loading" | "ready" | "unavailable"
  >("idle");

  const loadSessions = React.useCallback(async () => {
    if (!user) return;
    setThreadsStatus("loading");
    try {
      const res = await apiGet(
        `/api/chat/threads?assistant_id=${encodeURIComponent(assistantId)}`,
        user.accessToken,
      );
      if (!res.ok) {
        setThreadsStatus("unavailable");
        return;
      }
      const data: ThreadsResponse = await res.json();
      setSessions(normalizeSessions(data));
      setThreadsStatus("ready");
    } catch (err) {
      console.error("Failed to load threads", err);
      setThreadsStatus("unavailable");
    }
  }, [assistantId, user]);

  React.useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  /* ---------------- Session + messages state ---------------- */
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = React.useState(false);
  const [loadingHistory, setLoadingHistory] = React.useState(false);
  // Track the latest failed message keyed by its id → original text so
  // retry can re-send the exact same string.
  const failedTextRef = React.useRef<Map<string, string>>(new Map());

  const loadHistory = React.useCallback(
    async (targetSessionId: string) => {
      if (!user) return;
      setLoadingHistory(true);
      try {
        const res = await apiGet(
          `/api/chat/history?session_id=${encodeURIComponent(targetSessionId)}`,
          user.accessToken,
        );
        if (!res.ok) {
          // History endpoint missing or errored — fall back to empty stream.
          setMessages([]);
          return;
        }
        const data: HistoryResponse = await res.json();
        setMessages(normalizeHistory(data));
      } catch (err) {
        console.error("Failed to load history", err);
        setMessages([]);
      } finally {
        setLoadingHistory(false);
      }
    },
    [user],
  );

  const handleSelectSession = React.useCallback(
    (id: string) => {
      if (id === sessionId) return;
      setSessionId(id);
      failedTextRef.current.clear();
      void loadHistory(id);
    },
    [sessionId, loadHistory],
  );

  const handleNewConversation = React.useCallback(() => {
    setSessionId(null);
    setMessages([]);
    failedTextRef.current.clear();
  }, []);

  /* ---------------- Send a message ---------------- */
  const sendMessage = React.useCallback(
    async (text: string, retryOf?: string) => {
      if (!user || !assistant) return;
      const userMessageId = retryOf ?? generateId("user");
      const userMessage: ChatMessage = {
        id: userMessageId,
        role: "user",
        content: text,
        createdAt: new Date().toISOString(),
        status: "sent",
      };

      setMessages((prev) => {
        if (retryOf) {
          // Replace the failed message (clearing status) and drop any later
          // entries (there shouldn't be any, but be defensive).
          return prev.map((m) =>
            m.id === retryOf
              ? { ...m, status: "sent" as const, errorMessage: undefined }
              : m,
          );
        }
        return [...prev, userMessage];
      });
      failedTextRef.current.delete(userMessageId);
      setIsSending(true);

      try {
        const res = await apiClient("/api/chat/query", {
          method: "POST",
          token: user.accessToken,
          body: JSON.stringify({
            assistant_id: assistant.id,
            // Backend's ChatQueryRequest field is `user_message`, not `message`.
            // Sending `message` produced a 422 because Pydantic dropped it as
            // an unknown extra and then flagged user_message as missing.
            user_message: text,
            ...(sessionId ? { session_id: sessionId } : {}),
          }),
        });
        if (!res.ok) {
          // Surface backend detail (status + parsed detail) instead of a
          // generic 'status N' string, matching the pattern used in the
          // creation flow.
          let detail: string | undefined;
          try {
            const body = await res.json();
            detail = body?.detail || body?.error || body?.message;
            if (Array.isArray(detail)) {
              // FastAPI/Pydantic 422 detail is a list of {loc, msg, type}
              detail = detail
                .map((d: { loc?: unknown; msg?: string }) =>
                  `${Array.isArray(d.loc) ? d.loc.join(".") : ""} ${d.msg ?? ""}`.trim()
                )
                .join("; ");
            }
          } catch {
            detail = await res.text().catch(() => undefined);
          }
          throw new Error(
            `Request failed with status ${res.status}${detail ? `: ${detail}` : ""}`
          );
        }
        const data: ChatQueryResponse = await res.json();

        // Capture the session id returned by the backend for subsequent
        // requests in this conversation.
        if (data.session_id && data.session_id !== sessionId) {
          setSessionId(data.session_id);
        }

        const assistantMessage: ChatMessage = {
          id: generateId("asst"),
          role: "assistant",
          content:
            data.decision === "ANSWER"
              ? (data.answer ?? "")
              : (data.refusal_reason ?? ""),
          createdAt: new Date().toISOString(),
          ragResult: responseToRagResult(data),
          status: "sent",
        };
        setMessages((prev) => [...prev, assistantMessage]);

        // Refresh the sessions list so a newly-created session shows up in
        // the pane (best-effort — silent on failure).
        if (threadsStatus === "ready") {
          void loadSessions();
        }
      } catch (err) {
        console.error("Failed to send message", err);
        const message =
          err instanceof Error
            ? err.message
            : "Failed to send. Check your connection and try again.";
        failedTextRef.current.set(userMessageId, text);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === userMessageId
              ? { ...m, status: "failed" as const, errorMessage: message }
              : m,
          ),
        );
        showToast("Failed to send message", "error");
      } finally {
        setIsSending(false);
      }
    },
    [user, assistant, sessionId, threadsStatus, loadSessions, showToast],
  );

  const handleRetry = React.useCallback(
    (messageId: string) => {
      const text = failedTextRef.current.get(messageId);
      if (!text) return;
      void sendMessage(text, messageId);
    },
    [sendMessage],
  );

  /* ---------------- UI plumbing ---------------- */
  const composerRef = React.useRef<ComposerHandle>(null);
  const [historyOpen, setHistoryOpen] = React.useState(false);

  const handleSuggestionClick = React.useCallback((s: string) => {
    composerRef.current?.setValue(s);
  }, []);

  const handleFeedback = React.useCallback(
    async (messageId: string, rating: "up" | "down") => {
      try {
        await fetch("/api/v1/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message_id: messageId, value: rating }),
        });
        showToast("Thanks for your feedback");
      } catch {
        showToast("Thanks for your feedback");
      }
    },
    [showToast],
  );

  /* ---------------- Render ---------------- */
  if (loadingAssistant) {
    return (
      <div
        className="flex w-full overflow-hidden bg-[var(--color-background)]"
        style={{ minHeight: "calc(100dvh - 3.5rem)" }}
        aria-busy="true"
        aria-label="Loading assistant"
      >
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
          </div>
          <div className="flex flex-col gap-2 px-3 py-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        </div>
        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="flex h-14 flex-shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface)] px-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-16 rounded-full" />
            </div>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6">
            <span
              className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent text-[var(--color-text-muted)]"
              aria-hidden
            />
            <p className="text-sm text-[var(--color-text-muted)]">
              Loading assistant…
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (!assistant) {
    return (
      <div
        className="flex items-center justify-center bg-[var(--color-background)] px-6"
        style={{ minHeight: "calc(100dvh - 3.5rem)" }}
      >
        <div className="flex max-w-sm flex-col items-center gap-4 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-6 text-center shadow-[var(--elevation-1)]">
          <ShieldCheck
            className="h-8 w-8 text-[var(--color-text-muted)]"
            aria-hidden
          />
          <div className="flex flex-col gap-1.5">
            <p className="text-base font-semibold text-[var(--color-text-primary)]">
              Assistant not found
            </p>
            <p className="text-sm text-[var(--color-text-muted)]">
              We couldn&apos;t load this assistant. It may have been deleted,
              or you may not have access.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className={cn(
              "inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium",
              "bg-[var(--color-brand)] text-white",
              "hover:bg-[var(--color-brand-hover)]",
              "shadow-[var(--elevation-1)]",
            )}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  const onBack = () => router.push("/dashboard");
  const showHistoryPane = threadsStatus !== "unavailable";

  return (
    <div
      className={cn(
        "flex w-full overflow-hidden",
        "bg-[var(--color-background)]",
      )}
      style={{ height: "calc(100dvh - 3.5rem)" }}
      data-slot="chat-interface-tambo"
    >
      <a
        href="#main-chat-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:text-black focus:rounded-md focus:shadow-lg"
      >
        Skip to chat
      </a>

      {/* Desktop left pane — xl only */}
      {showHistoryPane ? (
        <div className="hidden h-full w-72 flex-shrink-0 xl:block">
          <ThreadHistoryPane
            assistantName={assistant.name}
            sessions={sessions}
            activeSessionId={sessionId}
            onSelect={handleSelectSession}
            onNewConversation={handleNewConversation}
            onBack={onBack}
            isLoading={threadsStatus === "loading"}
          />
        </div>
      ) : null}

      {/* Mobile left pane sheet */}
      {showHistoryPane ? (
        <MobileSheet
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          side="left"
          ariaLabel="Conversation history"
        >
          <ThreadHistoryPane
            assistantName={assistant.name}
            sessions={sessions}
            activeSessionId={sessionId}
            onSelect={(id) => {
              handleSelectSession(id);
              setHistoryOpen(false);
            }}
            onNewConversation={() => {
              handleNewConversation();
              setHistoryOpen(false);
            }}
            onBack={() => {
              setHistoryOpen(false);
              onBack();
            }}
            isLoading={threadsStatus === "loading"}
          />
        </MobileSheet>
      ) : null}

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
          onBack={onBack}
          showMenuButton={showHistoryPane}
        />
        <ChatBody
          assistant={assistant}
          messages={messages}
          isSending={isSending}
          loadingHistory={loadingHistory}
          composerRef={composerRef}
          onSubmit={(text) => void sendMessage(text)}
          onSuggestionClick={handleSuggestionClick}
          onFeedback={handleFeedback}
          onRetry={handleRetry}
        />
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
  onBack,
  showMenuButton,
}: {
  assistant: Assistant;
  onOpenHistory: () => void;
  onBack: () => void;
  showMenuButton: boolean;
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
        {showMenuButton ? (
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
        ) : null}
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to dashboard"
          className={cn(
            "inline-flex h-9 w-9 items-center justify-center rounded-md",
            "text-[var(--color-text-muted)] hover:bg-[var(--button-ghost-bg-hover)]",
            "hover:text-[var(--color-text-primary)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]",
            showMenuButton ? "xl:inline-flex" : "",
          )}
        >
          <ChevronLeft className="h-5 w-5" />
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
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Body — empty state / message stream + composer                        */
/* --------------------------------------------------------------------- */
function ChatBody({
  assistant,
  messages,
  isSending,
  loadingHistory,
  composerRef,
  onSubmit,
  onSuggestionClick,
  onFeedback,
  onRetry,
}: {
  assistant: Assistant;
  messages: ChatMessage[];
  isSending: boolean;
  loadingHistory: boolean;
  composerRef: React.RefObject<ComposerHandle | null>;
  onSubmit: (text: string) => void;
  onSuggestionClick: (s: string) => void;
  onFeedback: (messageId: string, rating: "up" | "down") => Promise<void>;
  onRetry: (messageId: string) => void;
}) {
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom whenever the message list grows or the thinking
  // indicator toggles.
  React.useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const raf = window.requestAnimationFrame(() => {
      node.scrollTop = node.scrollHeight;
    });
    return () => window.cancelAnimationFrame(raf);
  }, [messages.length, isSending]);

  const isEmpty = messages.length === 0 && !loadingHistory;

  return (
    <div className="relative flex flex-1 min-h-0 flex-col">
      <div
        ref={scrollRef}
        className={cn(
          "flex-1 min-h-0 overflow-y-auto",
          "[&::-webkit-scrollbar]:w-[6px]",
          "[&::-webkit-scrollbar-thumb]:bg-[var(--color-border-default)]",
          "[&::-webkit-scrollbar-thumb]:rounded-full",
        )}
      >
        {loadingHistory ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
            <span
              className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent text-[var(--color-text-muted)]"
              aria-hidden
            />
            <p className="mt-3 text-sm text-[var(--color-text-muted)]">
              Loading conversation…
            </p>
          </div>
        ) : isEmpty ? (
          <EmptyState
            assistantName={assistant.name}
            description="Ask anything — sources will be cited."
            onStarterClick={(prompt) => composerRef.current?.setValue(prompt)}
          />
        ) : (
          <MessageStream
            messages={messages}
            isGenerating={isSending}
            onSuggestionClick={onSuggestionClick}
            onFeedback={(id, rating) => void onFeedback(id, rating)}
            assistantName={assistant.name}
            onRetry={onRetry}
          />
        )}
      </div>

      {/* Composer */}
      <div
        className={cn(
          "flex-shrink-0 border-t border-[var(--color-border-subtle)]",
          "bg-[var(--color-background)] px-4 pb-4 pt-3",
        )}
      >
        <div className="mx-auto w-full max-w-[768px]">
          <Composer
            ref={composerRef}
            placeholder={`Ask anything about ${assistant.name}…`}
            onSubmit={onSubmit}
            disabled={isSending}
            isSending={isSending}
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
