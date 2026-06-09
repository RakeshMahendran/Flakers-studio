"use client";

import * as React from "react";
import { AlertCircle, RotateCw } from "lucide-react";

import { cn } from "@/lib/design-system";
import { DecisionRenderer } from "@/components/governance";

import {
  ragResultToDecision,
  shouldShowTimestamp,
  formatRelativeTime,
  type RagToolResult,
} from "./chat-types";

/* --------------------------------------------------------------------- */
/* Public — native message shape (Tambo-free)                           */
/* --------------------------------------------------------------------- */
export type ChatMessageStatus = "sent" | "failed";

export interface ChatMessage {
  /** Stable id used as a React key + DecisionRenderer source-id prefix. */
  id: string;
  role: "user" | "assistant";
  /** Plain-text content (user messages and assistant refusal/answer text). */
  content: string;
  /** ISO-8601 timestamp. */
  createdAt: string;
  /** Present on assistant messages — the parsed rag pipeline result. */
  ragResult?: RagToolResult;
  /** Used to flag user messages that failed to send. */
  status?: ChatMessageStatus;
  /** Optional error string shown under failed user messages. */
  errorMessage?: string;
}

/* --------------------------------------------------------------------- */
/* User message bubble                                                   */
/* --------------------------------------------------------------------- */
function UserBubble({
  text,
  showTimestamp,
  timestamp,
  failed,
  errorMessage,
  onRetry,
}: {
  text: string;
  showTimestamp?: boolean;
  timestamp?: Date;
  failed?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="group flex flex-col items-end">
      {showTimestamp && timestamp ? (
        <div className="mb-1 text-[11px] text-[var(--color-text-muted)]">
          {formatRelativeTime(timestamp)}
        </div>
      ) : null}
      <div
        className={cn(
          "max-w-[80%] rounded-2xl rounded-br-sm",
          "bg-[var(--color-brand-soft)] text-[var(--color-text-primary)]",
          "px-4 py-2.5 text-[15px] leading-relaxed",
          "shadow-[var(--elevation-1)]",
          failed && "border border-[var(--color-refuse-border)]",
        )}
      >
        <p className="whitespace-pre-wrap break-words">{text}</p>
      </div>
      {failed ? (
        <div className="mt-1.5 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[11px] text-[var(--color-refuse)]">
            <AlertCircle className="h-3 w-3" aria-hidden />
            {errorMessage ?? "Failed to send"}
          </span>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium",
                "text-[var(--color-brand)] hover:bg-[var(--color-brand-soft)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]",
              )}
            >
              <RotateCw className="h-3 w-3" aria-hidden />
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Thinking indicator                                                    */
/* --------------------------------------------------------------------- */
function ThinkingIndicator() {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-xl border",
        "bg-[var(--color-surface)] border-[var(--color-border-subtle)]",
        "px-3 py-2 shadow-[var(--elevation-1)]",
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-1" aria-hidden>
        <span
          className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand)] opacity-70 animate-bounce"
          style={{ animationDelay: "0ms" }}
        />
        <span
          className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand)] opacity-70 animate-bounce"
          style={{ animationDelay: "120ms" }}
        />
        <span
          className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand)] opacity-70 animate-bounce"
          style={{ animationDelay: "240ms" }}
        />
      </div>
      <span className="text-xs text-[var(--color-text-muted)]">Thinking…</span>
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Assistant message — renders DecisionRenderer (Answer/Refuse + panels) */
/* --------------------------------------------------------------------- */
function AssistantMessage({
  message,
  onSuggestionClick,
  onFeedback,
  showTimestamp,
  timestamp,
  assistantName,
}: {
  message: ChatMessage;
  onSuggestionClick: (s: string) => void;
  onFeedback?: (messageId: string, rating: "up" | "down") => void;
  showTimestamp?: boolean;
  timestamp?: Date;
  /** Threaded into the GovernanceDecision so the side panel header
   *  shows the assistant name instead of the generic "Governance". */
  assistantName?: string;
}) {
  const decision = React.useMemo(() => {
    if (!message.ragResult) return null;
    return ragResultToDecision(
      message.ragResult,
      message.id ?? "src",
      assistantName,
    );
  }, [message.id, message.ragResult, assistantName]);

  return (
    <div className="group w-full">
      {showTimestamp && timestamp ? (
        <div className="mb-1 text-[11px] text-[var(--color-text-muted)]">
          {formatRelativeTime(timestamp)}
        </div>
      ) : null}

      {decision ? (
        <DecisionRenderer
          decision={decision}
          onSuggestionClick={onSuggestionClick}
          onFeedback={(rating) =>
            onFeedback?.(message.id ?? "unknown", rating)
          }
        />
      ) : (
        // Fallback: assistant message without a rag result (shouldn't usually
        // happen, but render the raw text rather than nothing).
        <div
          className={cn(
            "rounded-xl border bg-[var(--color-surface)]",
            "border-[var(--color-border-subtle)]",
            "px-4 py-3 text-[15px] leading-relaxed text-[var(--color-text-primary)]",
            "shadow-[var(--elevation-1)]",
          )}
        >
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Public — message stream                                              */
/* --------------------------------------------------------------------- */

export interface MessageStreamProps {
  /** Ordered list of messages to display. */
  messages: ChatMessage[];
  /** True while the assistant is generating a response. */
  isGenerating: boolean;
  /** Suggestion-click handler (re-submits via Composer). */
  onSuggestionClick: (s: string) => void;
  /** Feedback handler — called from AnswerCard's thumbs up/down. */
  onFeedback?: (messageId: string, rating: "up" | "down") => void;
  /** Threaded into each governed decision so the GovernancePanel header
   *  renders the assistant's actual name. */
  assistantName?: string;
  /** Retry handler for failed user messages. */
  onRetry?: (messageId: string) => void;
}

export function MessageStream({
  messages,
  isGenerating,
  onSuggestionClick,
  onFeedback,
  assistantName,
  onRetry,
}: MessageStreamProps) {
  // A11Y: announce thinking state to screen readers
  const liveMessage = isGenerating ? "Assistant is thinking…" : "";

  return (
    <>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="false">
        {liveMessage}
      </div>

      <div className="mx-auto flex w-full max-w-[768px] flex-col gap-6 px-4 py-8">
        {messages.map((message, index) => {
          const prev = messages[index - 1];
          const cur = new Date(message.createdAt);
          const prevDate = prev?.createdAt ? new Date(prev.createdAt) : undefined;
          const showTs = shouldShowTimestamp(cur, prevDate);

          if (message.role === "assistant") {
            return (
              <div key={message.id} data-role="assistant">
                <AssistantMessage
                  message={message}
                  onSuggestionClick={onSuggestionClick}
                  onFeedback={onFeedback}
                  showTimestamp={showTs}
                  timestamp={cur}
                  assistantName={assistantName}
                />
              </div>
            );
          }

          return (
            <div key={message.id} data-role="user">
              <UserBubble
                text={message.content}
                showTimestamp={showTs}
                timestamp={cur}
                failed={message.status === "failed"}
                errorMessage={message.errorMessage}
                onRetry={
                  message.status === "failed" && onRetry
                    ? () => onRetry(message.id)
                    : undefined
                }
              />
            </div>
          );
        })}

        {isGenerating ? (
          <div data-role="thinking" className="flex justify-start">
            <ThinkingIndicator />
          </div>
        ) : null}
      </div>
    </>
  );
}
