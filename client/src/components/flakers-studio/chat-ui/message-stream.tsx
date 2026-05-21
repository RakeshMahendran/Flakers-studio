"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Streamdown } from "streamdown";
import type { TamboThreadMessage } from "@tambo-ai/react";

import { cn } from "@/lib/design-system";
import { DecisionRenderer } from "@/components/governance";
import { getSafeContent } from "@/lib/thread-hooks";
import { markdownComponents } from "@/components/tambo/markdown-components";

import { SuggestionChip } from "./suggestion-chip";
import {
  extractRagDecisionFromMessage,
  shouldShowTimestamp,
  formatRelativeTime,
} from "./chat-types";

/* --------------------------------------------------------------------- */
/* User message bubble                                                   */
/* --------------------------------------------------------------------- */
function UserBubble({
  text,
  showTimestamp,
  timestamp,
}: {
  text: string;
  showTimestamp?: boolean;
  timestamp?: Date;
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
          "bg-[var(--color-brand)] text-[var(--color-brand-foreground)]",
          "px-4 py-2.5 text-[15px] leading-relaxed",
          "shadow-[var(--elevation-1)]",
        )}
      >
        <p className="whitespace-pre-wrap break-words">{text}</p>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Streaming "thinking" indicator (3-dot pulse)                          */
/* --------------------------------------------------------------------- */
function StreamingDots() {
  return (
    <div className="flex items-center gap-1.5 px-1 py-2" aria-label="Assistant thinking">
      <span
        className="h-2 w-2 rounded-full bg-[var(--color-brand)] opacity-70 animate-bounce"
        style={{ animationDelay: "0ms" }}
      />
      <span
        className="h-2 w-2 rounded-full bg-[var(--color-brand)] opacity-70 animate-bounce"
        style={{ animationDelay: "120ms" }}
      />
      <span
        className="h-2 w-2 rounded-full bg-[var(--color-brand)] opacity-70 animate-bounce"
        style={{ animationDelay: "240ms" }}
      />
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Streaming text bubble — shown while tokens are arriving               */
/* --------------------------------------------------------------------- */
function StreamingTextBubble({ text }: { text: string }) {
  return (
    <motion.div
      key="streaming-text"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "rounded-xl border bg-[var(--color-surface)]",
        "border-[var(--color-border-subtle)]",
        "px-4 py-3 text-[15px] leading-relaxed text-[var(--color-text-primary)]",
        "shadow-[var(--elevation-1)]",
        "[&_p]:my-1 [&_p]:leading-relaxed",
      )}
    >
      {text ? (
        <Streamdown components={markdownComponents}>{text}</Streamdown>
      ) : (
        <StreamingDots />
      )}
      {text ? (
        <span
          className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-[var(--color-brand)]"
          aria-hidden
        />
      ) : null}
    </motion.div>
  );
}

/* --------------------------------------------------------------------- */
/* Suggested follow-ups under each completed assistant answer            */
/* --------------------------------------------------------------------- */
function FollowUpRow({
  suggestions,
  onPick,
}: {
  suggestions: string[];
  onPick: (s: string) => void;
}) {
  if (!suggestions.length) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.2 }}
      className="mt-3 flex flex-wrap gap-2"
    >
      {suggestions.slice(0, 4).map((s) => (
        <SuggestionChip key={s} onClick={() => onPick(s)}>
          {s}
        </SuggestionChip>
      ))}
    </motion.div>
  );
}

/* --------------------------------------------------------------------- */
/* Assistant message — handles streaming-to-decision morph              */
/* --------------------------------------------------------------------- */
function AssistantMessage({
  message,
  isLoading,
  followUps,
  onSuggestionClick,
  onFeedback,
  showTimestamp,
  timestamp,
  assistantName,
}: {
  message: TamboThreadMessage;
  isLoading: boolean;
  followUps?: string[];
  onSuggestionClick: (s: string) => void;
  onFeedback?: (messageId: string, rating: "up" | "down") => void;
  showTimestamp?: boolean;
  timestamp?: Date;
  /** Threaded into the GovernanceDecision so the side panel header
   *  shows the assistant name instead of the generic "Governance". */
  assistantName?: string;
}) {
  const decision = React.useMemo(
    () =>
      extractRagDecisionFromMessage(
        {
          id: message.id,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tool_calls: (message as any).tool_calls,
        },
        assistantName,
      ),
    [message, assistantName],
  );

  const text = React.useMemo(() => getSafeContent(message.content), [
    message.content,
  ]);

  const showFollowUps = !isLoading && decision?.decision === "ANSWER";

  // We morph from streaming text bubble → DecisionRenderer when:
  //   1. The message is no longer loading, AND
  //   2. The governance result has landed (decision !== null).
  // Until then we show whatever streaming text we have (or the dots).
  const renderDecision = !isLoading && decision !== null;

  return (
    <div className="group w-full">
      {showTimestamp && timestamp ? (
        <div className="mb-1 text-[11px] text-[var(--color-text-muted)]">
          {formatRelativeTime(timestamp)}
        </div>
      ) : null}

      <AnimatePresence mode="wait" initial={false}>
        {renderDecision ? (
          <motion.div
            key="decision"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="w-full"
          >
            <DecisionRenderer
              decision={decision!}
              onSuggestionClick={onSuggestionClick}
              onFeedback={(rating) =>
                onFeedback?.(message.id ?? "unknown", rating)
              }
            />
          </motion.div>
        ) : (
          <StreamingTextBubble text={typeof text === "string" ? text : ""} />
        )}
      </AnimatePresence>

      {showFollowUps && followUps && followUps.length > 0 ? (
        <FollowUpRow suggestions={followUps} onPick={onSuggestionClick} />
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Public — message stream                                              */
/* --------------------------------------------------------------------- */

export interface MessageStreamProps {
  /** Tambo thread messages (filtered for visible roles by the caller). */
  messages: TamboThreadMessage[];
  /** True while the last assistant message is still being generated. */
  isGenerating: boolean;
  /** Auto-suggested follow-up prompts to surface on the most-recent answer. */
  followUpSuggestions?: string[];
  /** When a SuggestionChip / RefusalCard suggestion is clicked. */
  onSuggestionClick: (s: string) => void;
  /** Optional feedback handler — called from AnswerCard's thumbs up/down. */
  onFeedback?: (messageId: string, rating: "up" | "down") => void;
  /** Threaded into each governed decision so the GovernancePanel header
   *  renders the assistant's actual name. */
  assistantName?: string;
}

export function MessageStream({
  messages,
  isGenerating,
  followUpSuggestions,
  onSuggestionClick,
  onFeedback,
  assistantName,
}: MessageStreamProps) {
  // We only render user + assistant messages; system / tool / sub-thread
  // messages are filtered out for the redesigned stream.
  const visible = React.useMemo(
    () =>
      messages.filter(
        (m) =>
          (m.role === "user" || m.role === "assistant") &&
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          !(m as any).parentMessageId,
      ),
    [messages],
  );

  // A11Y: Announce streaming progress to screen readers
  const [liveMessage, setLiveMessage] = React.useState('');

  React.useEffect(() => {
    if (!isGenerating) {
      setLiveMessage('');
      return;
    }

    const lastMsg = visible[visible.length - 1];
    if (lastMsg?.role === 'assistant') {
      const text = getSafeContent(lastMsg.content);
      if (typeof text === 'string' && text.length > 20) {
        // Announce every ~100 characters to avoid spam
        const chunks = Math.floor(text.length / 100);
        if (chunks > 0) {
          setLiveMessage(`Assistant is responding. ${chunks} section${chunks === 1 ? '' : 's'} received.`);
        }
      } else if (typeof text === 'string' && text.length > 0) {
        setLiveMessage('Assistant is thinking...');
      }
    }
  }, [isGenerating, visible]);

  return (
    <>
      {/* A11Y: Hidden live region for screen reader announcements */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="false">
        {liveMessage}
      </div>

      <div className="mx-auto flex w-full max-w-[768px] flex-col gap-6 px-4 py-8">
        {visible.map((message, index) => {
        const prev = visible[index - 1];
        const cur = (message.createdAt ? new Date(message.createdAt) : new Date());
        const prevDate = prev?.createdAt ? new Date(prev.createdAt) : undefined;
        const showTs = shouldShowTimestamp(cur, prevDate);

        const isLast = index === visible.length - 1;
        const isAssistant = message.role === "assistant";
        const lastAssistantIsLoading =
          isLast && isAssistant && isGenerating;

        if (isAssistant) {
          return (
            <div
              key={message.id ?? `assistant-${index}`}
              data-role="assistant"
            >
              <AssistantMessage
                message={message}
                isLoading={lastAssistantIsLoading}
                followUps={isLast ? followUpSuggestions : undefined}
                onSuggestionClick={onSuggestionClick}
                onFeedback={onFeedback}
                showTimestamp={showTs}
                timestamp={cur}
                assistantName={assistantName}
              />
            </div>
          );
        }

        const text = typeof message.content === "string"
          ? message.content
          : getSafeContent(message.content);

        return (
          <div key={message.id ?? `user-${index}`} data-role="user">
            <UserBubble
              text={typeof text === "string" ? text : ""}
              showTimestamp={showTs}
              timestamp={cur}
            />
          </div>
        );
        })}
      </div>
    </>
  );
}
