"use client";

/**
 * /design/governance — visual canary for the governance UI surface.
 *
 * Renders AnswerCard, RefusalCard, GovernancePanel, and SourceExplorer
 * with several mock GovernanceDecision payloads so the design + a11y
 * can be eyeballed without running the backend. Reach by typing the
 * URL; not linked from nav.
 */
import * as React from "react";
import { Moon, Sun } from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/primitives";
import {
  AnswerCard,
  ConfidenceRing,
  DecisionRenderer,
  GovernancePanel,
  RefusalCard,
  SourceExplorer,
  type GovernanceDecision,
  type GovernanceSource,
} from "@/components/governance";
import { cn } from "@/lib/design-system";

/* ------------------------------------------------------------------ */
/* Mocks                                                              */
/* ------------------------------------------------------------------ */

const MOCK_SOURCES: GovernanceSource[] = [
  {
    id: "src-1",
    title: "Refund policy — extended window for premium tier",
    url: "https://docs.flakers.studio/policies/refunds",
    snippet:
      "Premium tier customers may request a refund within 30 days of purchase, no questions asked. Standard tier follows the 14-day rolling window. Refunds are processed within 3-5 business days back to the original payment method, minus any processing fees disclosed in the order summary.",
    relevanceScore: 0.92,
    intent: "support",
    metadata: {
      year: 2025,
      category: "policy",
      sourceType: "docs",
      chunkIndex: 4,
    },
  },
  {
    id: "src-2",
    title: "FAQ — How do I cancel my subscription?",
    url: "https://docs.flakers.studio/faq/billing",
    snippet:
      "To cancel: open Settings → Billing → Manage subscription → Cancel. Your plan stays active until the end of the current billing cycle. Re-enabling within 14 days restores your prior state, including saved assistants and trained knowledge bases.",
    relevanceScore: 0.81,
    intent: "support",
    metadata: {
      year: 2025,
      category: "faq",
      sourceType: "docs",
      chunkIndex: 11,
    },
  },
  {
    id: "src-3",
    title: "Customer success blog — refund best practices",
    url: "https://blog.flakers.studio/refunds",
    snippet:
      "Small SaaS teams handle most refund requests within a single business day when their docs surface refund timing on the pricing page. Customers who self-serve via documentation are 4x less likely to escalate.",
    relevanceScore: 0.64,
    intent: "marketing",
    metadata: {
      year: 2024,
      category: "blog",
      sourceType: "blog",
      chunkIndex: 0,
    },
  },
  {
    id: "src-4",
    title: "Internal runbook — refund escalation paths",
    url: "https://internal.flakers.studio/runbooks/refund-escalation",
    snippet:
      "Tier-1 agents can issue refunds up to $500 without approval. Anything above goes to Tier-2 with the customer's last 90 days of activity attached. Disputed chargebacks bypass this flow entirely — see chargeback runbook.",
    relevanceScore: 0.47,
    intent: "internal",
    metadata: {
      year: 2025,
      category: "runbook",
      sourceType: "internal",
      chunkIndex: 2,
    },
  },
];

const ANSWER_MOCK: GovernanceDecision = {
  decision: "ANSWER",
  assistantName: "Support Assistant",
  answer: `Yes — **premium customers can get a refund within 30 days** of purchase, no questions asked. Standard tier customers fall under the 14-day rolling window.

Refunds usually clear in 3–5 business days back to the original payment method. Any processing fees disclosed at checkout are deducted from the refund amount.

If the customer needs a refund outside these windows, escalate via the internal runbook — but that path is internal-only and not surfaced here.`,
  confidence: 0.87,
  sources: MOCK_SOURCES,
  ruleEvaluations: [
    {
      id: "REQUIRE_CONTEXT",
      status: "passed",
      detail: "4 chunks above relevance threshold",
    },
    {
      id: "INTENT_FILTERING",
      status: "passed",
      detail: "All chunks match allowed intents (support, marketing)",
    },
    {
      id: "ATTRIBUTION_REQUIRED",
      status: "passed",
      detail: "3 sources cited in the answer body",
    },
    { id: "POLICY_QUOTE_ONLY", status: "n/a", detail: "Non-policy content" },
    {
      id: "TENANT_ISOLATION",
      status: "passed",
      detail: "All chunks belong to tenant_42",
    },
    {
      id: "CONFIDENCE_THRESHOLD",
      status: "passed",
      detail: "Top chunk score 0.92 (cutoff 0.65)",
    },
  ],
  processingTimeMs: 612,
};

const ANSWER_LOW_CONF_MOCK: GovernanceDecision = {
  ...ANSWER_MOCK,
  answer: `Refund timing is roughly **3–5 business days** based on the docs I have, but the chunks I'm reading are partial — treat this as best-effort, not policy.`,
  confidence: 0.62,
  sources: MOCK_SOURCES.slice(0, 2),
  ruleEvaluations: [
    { id: "REQUIRE_CONTEXT", status: "passed", detail: "2 chunks retrieved" },
    { id: "INTENT_FILTERING", status: "passed" },
    { id: "ATTRIBUTION_REQUIRED", status: "passed" },
    { id: "POLICY_QUOTE_ONLY", status: "n/a" },
    { id: "TENANT_ISOLATION", status: "passed" },
    {
      id: "CONFIDENCE_THRESHOLD",
      status: "borderline",
      detail: "Top chunk score 0.62 (cutoff 0.65)",
    },
  ],
  processingTimeMs: 738,
};

const REFUSE_OOS_MOCK: GovernanceDecision = {
  decision: "REFUSE",
  assistantName: "Support Assistant",
  refusalCode: "OUT_OF_SCOPE",
  refusalReason:
    "I'm scoped to support questions about FlakersStudio's billing, accounts, and assistants. Investment advice isn't something I'm allowed to weigh in on.",
  suggestions: [
    "Ask about your subscription",
    "How do I create an assistant?",
    "What does the Pro plan include?",
  ],
  ruleEvaluations: [
    { id: "REQUIRE_CONTEXT", status: "passed", detail: "5 chunks retrieved" },
    {
      id: "INTENT_FILTERING",
      status: "failed",
      detail: "No chunks matched allowed intents (support, billing)",
    },
    { id: "ATTRIBUTION_REQUIRED", status: "n/a" },
    { id: "POLICY_QUOTE_ONLY", status: "n/a" },
    { id: "TENANT_ISOLATION", status: "passed" },
    { id: "CONFIDENCE_THRESHOLD", status: "n/a" },
  ],
  processingTimeMs: 248,
};

const REFUSE_NO_CONTEXT_MOCK: GovernanceDecision = {
  decision: "REFUSE",
  assistantName: "Support Assistant",
  refusalCode: "NO_CONTEXT",
  refusalReason:
    "I searched the knowledge base but couldn't find anything about that. It might not be ingested yet.",
  suggestions: ["Ask about something in my docs", "Rephrase your question"],
  ruleEvaluations: [
    {
      id: "REQUIRE_CONTEXT",
      status: "failed",
      detail: "No chunks retrieved (0 above threshold)",
    },
    { id: "INTENT_FILTERING", status: "n/a" },
    { id: "ATTRIBUTION_REQUIRED", status: "n/a" },
    { id: "POLICY_QUOTE_ONLY", status: "n/a" },
    { id: "TENANT_ISOLATION", status: "n/a" },
    { id: "CONFIDENCE_THRESHOLD", status: "n/a" },
  ],
  processingTimeMs: 134,
};

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
export default function GovernanceDesignPage() {
  const [isDark, setIsDark] = React.useState(false);
  const [isolatedPanel, setIsolatedPanel] = React.useState(false);
  const [feedback, setFeedback] = React.useState<string | null>(null);
  const [suggestion, setSuggestion] = React.useState<string | null>(null);

  const toggleDark = React.useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      if (typeof document !== "undefined") {
        document.documentElement.classList.toggle("dark", next);
      }
      return next;
    });
  }, []);

  React.useEffect(() => {
    return () => {
      if (typeof document !== "undefined") {
        document.documentElement.classList.remove("dark");
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-[var(--color-background)] text-[var(--color-text-primary)]">
      {/* Toolbar */}
      <header className="sticky top-0 z-20 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface)]/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-base font-semibold tracking-tight">
              Governance UI · canary
            </h1>
            <p className="text-xs text-[var(--color-text-muted)]">
              AnswerCard / RefusalCard / GovernancePanel / SourceExplorer with
              mock data
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="brand">phase 1b</Badge>
            <Button variant="outline" size="sm" onClick={toggleDark}>
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              <span className="ml-1">{isDark ? "Light" : "Dark"}</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-12 px-6 py-12">
        {/* Section 1: Live Decisions */}
        <section className="space-y-4">
          <header>
            <h2 className="text-2xl font-semibold tracking-tight">
              Decisions in context
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Each tile renders a full DecisionRenderer — click the shield to
              open the GovernancePanel, click a source chip to open the
              SourceExplorer. Keyboard: focus a card, press{" "}
              <kbd className="rounded bg-[var(--color-surface-sunken)] px-1.5 py-0.5 text-[10px] font-mono">
                g
              </kbd>{" "}
              for governance,{" "}
              <kbd className="rounded bg-[var(--color-surface-sunken)] px-1.5 py-0.5 text-[10px] font-mono">
                s
              </kbd>{" "}
              for sources,{" "}
              <kbd className="rounded bg-[var(--color-surface-sunken)] px-1.5 py-0.5 text-[10px] font-mono">
                Esc
              </kbd>{" "}
              to close.
            </p>
          </header>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ScenarioTile title="High confidence answer" subtitle="confidence 0.87">
              <DecisionRenderer
                decision={ANSWER_MOCK}
                onFeedback={(r) => setFeedback(`Answer feedback: ${r}`)}
              />
            </ScenarioTile>

            <ScenarioTile
              title="Borderline confidence answer"
              subtitle="confidence 0.62 — one rule borderline"
            >
              <DecisionRenderer
                decision={ANSWER_LOW_CONF_MOCK}
                onFeedback={(r) => setFeedback(`Answer feedback: ${r}`)}
              />
            </ScenarioTile>

            <ScenarioTile
              title="Refusal — out of scope"
              subtitle="INTENT_FILTERING failed"
            >
              <DecisionRenderer
                decision={REFUSE_OOS_MOCK}
                onSuggestionClick={(s) => setSuggestion(s)}
              />
            </ScenarioTile>

            <ScenarioTile
              title="Refusal — no context"
              subtitle="REQUIRE_CONTEXT failed"
            >
              <DecisionRenderer
                decision={REFUSE_NO_CONTEXT_MOCK}
                onSuggestionClick={(s) => setSuggestion(s)}
              />
            </ScenarioTile>
          </div>

          {(feedback || suggestion) ? (
            <div className="rounded-md border border-[var(--color-brand-border)] bg-[var(--color-brand-soft)] px-3 py-2 text-xs text-[var(--color-brand)]">
              {feedback ? <div>{feedback}</div> : null}
              {suggestion ? <div>Suggestion clicked: {suggestion}</div> : null}
            </div>
          ) : null}
        </section>

        {/* Section 2: Confidence ring */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">
            ConfidenceRing
          </h2>
          <Card padding="md">
            <CardContent className="flex flex-wrap items-center gap-8">
              {[0.95, 0.78, 0.62, 0.5, 0.32].map((c) => (
                <div key={c} className="flex flex-col items-center gap-2">
                  <ConfidenceRing score={c} size={48} strokeWidth={4} />
                  <code className="text-xs text-[var(--color-text-muted)]">
                    {c.toFixed(2)}
                  </code>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        {/* Section 3: Cards in isolation */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">
            Cards in isolation
          </h2>
          <p className="text-sm text-[var(--color-text-muted)]">
            Plain AnswerCard / RefusalCard renders without the
            DecisionRenderer wrapper.
          </p>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card padding="md">
              <CardHeader>
                <CardTitle>AnswerCard</CardTitle>
                <CardDescription>Mock — high confidence</CardDescription>
              </CardHeader>
              <CardContent>
                <AnswerCard
                  decision={ANSWER_MOCK}
                  onOpenGovernance={() => setIsolatedPanel(true)}
                />
              </CardContent>
            </Card>

            <Card padding="md">
              <CardHeader>
                <CardTitle>RefusalCard</CardTitle>
                <CardDescription>Mock — out of scope</CardDescription>
              </CardHeader>
              <CardContent>
                <RefusalCard
                  decision={REFUSE_OOS_MOCK}
                  onOpenGovernance={() => setIsolatedPanel(true)}
                />
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Section 4: SourceExplorer standalone */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">
            SourceExplorer
          </h2>
          <Card padding="md">
            <CardContent>
              <SourceExplorer sources={MOCK_SOURCES} />
            </CardContent>
          </Card>
        </section>

        {/* Section 5: Mobile widths */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">
            Narrow widths
          </h2>
          <p className="text-sm text-[var(--color-text-muted)]">
            Cards must work down to 360px. Source chips stack vertically below
            500px.
          </p>
          <div className="flex flex-wrap gap-6">
            <div
              className={cn(
                "rounded-xl border-2 border-dashed border-[var(--color-border-default)]",
                "p-3 bg-[var(--color-surface-sunken)]",
              )}
              style={{ width: 360 }}
            >
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] mb-2 text-[var(--color-text-muted)]">
                360 px
              </div>
              <AnswerCard decision={ANSWER_MOCK} />
            </div>
            <div
              className={cn(
                "rounded-xl border-2 border-dashed border-[var(--color-border-default)]",
                "p-3 bg-[var(--color-surface-sunken)]",
              )}
              style={{ width: 360 }}
            >
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] mb-2 text-[var(--color-text-muted)]">
                360 px refusal
              </div>
              <RefusalCard decision={REFUSE_OOS_MOCK} />
            </div>
          </div>
        </section>

        <p className="pt-6 text-center text-xs text-[var(--color-text-muted)]">
          Phase 1b · feat/governance-trust-ui · mocks only · backend pipeline
          wiring is a separate task
        </p>
      </main>

      {/* Standalone panel triggered from the isolated cards section */}
      <GovernancePanel
        decision={ANSWER_MOCK}
        open={isolatedPanel}
        onOpenChange={setIsolatedPanel}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Scenario tile                                                       */
/* ------------------------------------------------------------------ */
function ScenarioTile({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
          {title}
        </div>
        {subtitle ? (
          <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
            {subtitle}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}
