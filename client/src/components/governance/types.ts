/**
 * UI-side governance types
 * --------------------------------------------------------------------
 * The backend `GovernanceDecision` (backend/services/governance.py) does
 * NOT yet emit every field this UI renders — `confidence`, per-rule
 * statuses, source relevance scores, suggestions, refusal subtypes are
 * the target shape we're designing for. Once `governance.py` is wired
 * back into `rag_pipeline.py` and extended to emit these, callers can
 * pass the backend payload through with minimal massaging.
 *
 * GAP: backend currently exposes (decision, reason, allowed_context,
 * rules_applied, explanation). It is missing:
 *   - confidence (float 0..1) — needed for the confidence ring
 *   - per-rule status (passed | failed | borderline | n/a)
 *   - per-rule detail message
 *   - sources[].relevance_score (the chunk score IS retrieved but never
 *     surfaced in `format_sources()`)
 *   - sources[].snippet, .metadata (year, category, chunk_index)
 *   - suggestions[] for the refusal "Try instead" chips
 *
 * This type is the contract the UI will consume. The wiring branch is
 * responsible for adapting the backend payload to it.
 * --------------------------------------------------------------------
 */

export type GovernanceDecisionType = "ANSWER" | "REFUSE";

/** All six rules from `backend/services/governance.py::GovernanceRule`. */
export type GovernanceRuleId =
  | "REQUIRE_CONTEXT"
  | "INTENT_FILTERING"
  | "ATTRIBUTION_REQUIRED"
  | "POLICY_QUOTE_ONLY"
  | "TENANT_ISOLATION"
  | "CONFIDENCE_THRESHOLD";

export type RuleStatus = "passed" | "failed" | "borderline" | "n/a";

export interface RuleEvaluation {
  id: GovernanceRuleId;
  status: RuleStatus;
  /** Short human-readable summary, e.g. "1 chunk above threshold". */
  detail?: string;
}

/** Refusal sub-type — also lives on backend as `RefusalReason`. */
export type RefusalReasonCode =
  | "OUT_OF_SCOPE"
  | "NO_CONTEXT"
  | "POLICY_VIOLATION"
  | "CROSS_TENANT"
  | "INSUFFICIENT_CONFIDENCE";

export interface GovernanceSource {
  id: string;
  title: string;
  url: string;
  /** Truncatable preview — UI clamps to 3 lines on the card. */
  snippet: string;
  /** Score in [0, 1]. Maps to a 0-100% relevance bar in SourceExplorer. */
  relevanceScore: number;
  /** Optional favicon / logo URL. UI falls back to a generic globe icon. */
  faviconUrl?: string;
  intent?: string;
  metadata?: {
    year?: number | string;
    category?: string;
    chunkIndex?: number;
    sourceType?: string;
  };
}

export interface GovernanceDecision {
  decision: GovernanceDecisionType;

  /** Plain-prose answer (markdown ok) when decision === "ANSWER". */
  answer?: string;

  /** Plain-prose refusal reason. NEVER show JSON here. */
  refusalReason?: string;
  /** Programmatic code so we can localize / show an icon, etc. */
  refusalCode?: RefusalReasonCode;

  /** [0, 1]. Optional — UI hides ring if undefined. */
  confidence?: number;

  /** Sources cited or considered for this decision. */
  sources?: GovernanceSource[];

  /** Per-rule evaluation — drives the GovernancePanel timeline. */
  ruleEvaluations?: RuleEvaluation[];

  /** "Try instead" suggestions on a REFUSE decision. */
  suggestions?: string[];

  /** Round-trip latency, ms. */
  processingTimeMs?: number;

  /** Assistant display name surfaced on the GovernancePanel header. */
  assistantName?: string;
}

/** Canonical order + display name for the 6 rules in the timeline. */
export const GOVERNANCE_RULES: Array<{
  id: GovernanceRuleId;
  label: string;
  description: string;
}> = [
  {
    id: "REQUIRE_CONTEXT",
    label: "Require Context",
    description: "At least one knowledge-base chunk must be retrieved.",
  },
  {
    id: "INTENT_FILTERING",
    label: "Intent Filtering",
    description: "Retrieved chunks must match this assistant's allowed intents.",
  },
  {
    id: "ATTRIBUTION_REQUIRED",
    label: "Attribution Required",
    description: "Answers must cite the sources they were derived from.",
  },
  {
    id: "POLICY_QUOTE_ONLY",
    label: "Policy Quote Only",
    description: "Policy / legal content must be quoted directly, never paraphrased.",
  },
  {
    id: "TENANT_ISOLATION",
    label: "Tenant Isolation",
    description: "Chunks belonging to a different tenant must never leak.",
  },
  {
    id: "CONFIDENCE_THRESHOLD",
    label: "Confidence Threshold",
    description: "Top-ranked chunk must clear the relevance threshold.",
  },
];

/** Quick lookup. */
export const GOVERNANCE_RULE_LABELS: Record<GovernanceRuleId, string> =
  GOVERNANCE_RULES.reduce(
    (acc, r) => ({ ...acc, [r.id]: r.label }),
    {} as Record<GovernanceRuleId, string>,
  );
