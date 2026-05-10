/**
 * Local types and helpers for the redesigned chat surface.
 * Owned by feat/chat-interface-revamp; imports from feat/governance-trust-ui's
 * `@/components/governance` package but does not modify it.
 */
import type {
  GovernanceDecision,
  GovernanceRuleId,
  GovernanceSource,
  RuleEvaluation,
} from "@/components/governance";

/**
 * Shape we expect from the `query_rag_backend` tool result.
 * The backend currently returns flat fields; this is documented in
 * `@/components/governance/types.ts` (the GAP comment).
 */
export interface RagToolResult {
  success?: boolean;
  decision?: "ANSWER" | "REFUSE";
  answer?: string;
  reason?: string;
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
  processing_time_ms?: number;
  suggestions?: string[];
}

/**
 * Adapter — coerce the legacy backend payload into the richer
 * `GovernanceDecision` shape the DecisionRenderer consumes.
 */
export function ragResultToDecision(
  result: RagToolResult,
  fallbackId = "src",
): GovernanceDecision | null {
  if (!result || !result.decision) return null;

  const sources: GovernanceSource[] = (result.sources ?? []).map((s, i) => ({
    id: `${fallbackId}-${i}`,
    title: s.title || s.url || "Untitled",
    url: s.url,
    snippet: s.snippet ?? "",
    relevanceScore:
      typeof s.relevance_score === "number" ? s.relevance_score : 0,
    intent: s.intent,
  }));

  const ruleEvaluations: RuleEvaluation[] = (result.rules_applied ?? []).map(
    (r) => ({
      // Backend lower-cases rule names today — uppercase to match the
      // canonical GovernanceRuleId enum; unknown rules pass through
      // and the GovernancePanel falls back gracefully.
      id: r.toUpperCase() as GovernanceRuleId,
      status: result.decision === "ANSWER" ? "passed" : "failed",
    }),
  );

  return {
    decision: result.decision,
    answer:
      result.decision === "ANSWER"
        ? (result.answer ?? "")
        : undefined,
    refusalReason:
      result.decision === "REFUSE"
        ? (result.reason ?? "")
        : undefined,
    refusalCode: result.refusal_code as GovernanceDecision["refusalCode"],
    confidence:
      typeof result.confidence === "number" ? result.confidence : undefined,
    sources,
    ruleEvaluations,
    suggestions: result.suggestions,
    processingTimeMs: result.processing_time_ms,
  };
}

/**
 * Look at a TamboThreadMessage's tool_calls and pull the first
 * `query_rag_backend` result (if any). Returns null while still streaming
 * or if no governance result has landed.
 */
export function extractRagDecisionFromMessage(message: {
  id?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tool_calls?: any[];
}): GovernanceDecision | null {
  const tc = message.tool_calls?.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (call: any) => call.toolName === "query_rag_backend",
  );
  if (!tc?.result) return null;
  return ragResultToDecision(tc.result, message.id ?? "src");
}

/**
 * Bucket a date into a human-readable history group.
 */
export function bucketByDate(d: Date): "Today" | "Yesterday" | "This week" | "Older" {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 7);

  if (d >= startOfToday) return "Today";
  if (d >= startOfYesterday) return "Yesterday";
  if (d >= startOfWeek) return "This week";
  return "Older";
}

/**
 * Format a relative timestamp ("2m ago", "Yesterday", "Mar 4").
 */
export function formatRelativeTime(d: Date): string {
  const now = Date.now();
  const diff = Math.max(0, now - d.getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Should we show a per-message timestamp because of a 60s+ gap? */
export function shouldShowTimestamp(
  current: Date,
  previous: Date | undefined,
): boolean {
  if (!previous) return false;
  return current.getTime() - previous.getTime() >= 60_000;
}
