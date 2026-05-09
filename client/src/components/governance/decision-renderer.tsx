"use client";

import * as React from "react";

import { AnswerCard } from "./answer-card";
import { GovernancePanel } from "./governance-panel";
import { RefusalCard } from "./refusal-card";
import { SourceExplorer } from "./source-explorer";
import type { GovernanceDecision, GovernanceSource } from "./types";

interface DecisionRendererProps {
  decision: GovernanceDecision;
  /** Suggestion-click handler — caller usually re-submits the chat input. */
  onSuggestionClick?: (suggestion: string) => void;
  /** Feedback handler for AnswerCard thumbs up/down. */
  onFeedback?: (rating: "up" | "down") => void;
  /** Disable the keyboard shortcut listeners (g / s). */
  disableShortcuts?: boolean;
  className?: string;
}

/**
 * DecisionRenderer
 *
 * Single switch component. Takes a GovernanceDecision and renders either
 * `<AnswerCard>` or `<RefusalCard>`, plus owns the slide-out
 * GovernancePanel and SourceExplorer side panels.
 *
 * Owns the "g" / "s" / Esc keyboard shortcuts spec'd in
 * `tasks/governance-ui.md`. Shortcuts are scoped via document-level
 * key listeners installed only while the renderer is mounted, so a
 * thread of N decisions doesn't fight over them — the topmost one
 * (chat-interface focuses message bubbles individually) wins.
 */
export function DecisionRenderer({
  decision,
  onSuggestionClick,
  onFeedback,
  disableShortcuts,
  className,
}: DecisionRendererProps) {
  const [governanceOpen, setGovernanceOpen] = React.useState(false);
  const [sourceExplorerOpen, setSourceExplorerOpen] = React.useState(false);
  const [selectedSourceId, setSelectedSourceId] = React.useState<
    string | null
  >(null);

  // Anchor for tab-focusable container so "g"/"s" only fire when the
  // user has actually focused this particular decision card.
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (disableShortcuts) return;
    function onKey(e: KeyboardEvent) {
      // Skip when typing in an input / textarea / contenteditable.
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      ) {
        return;
      }
      // Only act if focus is inside this renderer's subtree.
      const node = containerRef.current;
      if (!node || !node.contains(document.activeElement)) return;

      if (e.key === "g" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setGovernanceOpen(true);
      } else if (e.key === "s" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setSourceExplorerOpen(true);
      } else if (e.key === "Escape") {
        if (governanceOpen) setGovernanceOpen(false);
        if (sourceExplorerOpen) setSourceExplorerOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [disableShortcuts, governanceOpen, sourceExplorerOpen]);

  const handleOpenSource = React.useCallback((s: GovernanceSource) => {
    setSelectedSourceId(s.id);
    setSourceExplorerOpen(true);
  }, []);

  const closeSourceExplorer = React.useCallback(() => {
    setSourceExplorerOpen(false);
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      // Make the container focusable so keyboard shortcuts can scope.
      tabIndex={-1}
    >
      {decision.decision === "ANSWER" ? (
        <AnswerCard
          decision={decision}
          onOpenSource={handleOpenSource}
          onOpenGovernance={() => setGovernanceOpen(true)}
          onFeedback={onFeedback}
        />
      ) : (
        <RefusalCard
          decision={decision}
          onSuggestionClick={onSuggestionClick}
          onOpenGovernance={() => setGovernanceOpen(true)}
        />
      )}

      <GovernancePanel
        decision={decision}
        open={governanceOpen}
        onOpenChange={setGovernanceOpen}
      />

      {sourceExplorerOpen ? (
        <SourceExplorerOverlay
          sources={decision.sources ?? []}
          initialExpandedId={selectedSourceId ?? undefined}
          onClose={closeSourceExplorer}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Source Explorer overlay                                             */
/* ------------------------------------------------------------------ */
function SourceExplorerOverlay({
  sources,
  initialExpandedId,
  onClose,
}: {
  sources: GovernanceSource[];
  initialExpandedId?: string;
  onClose: () => void;
}) {
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Source explorer"
      className="fixed inset-0 z-50 flex items-stretch justify-end"
    >
      <button
        type="button"
        aria-label="Close source explorer"
        onClick={onClose}
        className="absolute inset-0 bg-[oklch(0.16_0.012_270/0.40)]"
      />
      <div
        className="relative flex h-dvh w-full max-w-2xl flex-col bg-[var(--color-surface)] border-l border-[var(--color-border-default)] shadow-[var(--elevation-4)]"
        style={{
          animation:
            "gov-slide-in-kf 240ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--color-border-subtle)]">
          <h2 className="text-sm font-semibold tracking-tight text-[var(--color-text-primary)]">
            Source Explorer
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
          >
            <span aria-hidden>×</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <SourceExplorer
            sources={sources}
            initialExpandedId={initialExpandedId}
          />
        </div>
      </div>
    </div>
  );
}
