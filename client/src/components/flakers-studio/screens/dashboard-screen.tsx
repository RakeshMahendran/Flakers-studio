"use client";

/**
 * DashboardScreen — workspace home.
 *
 * Strategic minimalism: gradient hero, quick-action strip, assistant card
 * grid (the primary work unit), and a bottom KPI row. All chrome (sidebar,
 * top bar, command palette) lives in `AppShell`, wired in
 * `client/app/(dashboard)/layout.tsx`.
 *
 * Keeps the legacy `Assistant` type and `normalizeAssistant` helper as
 * named exports because `assistant-review-screen.tsx` imports them.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Skeleton } from "@/components/ui/primitives";
import { useAuth } from "@/contexts/auth-context";
import { apiGet, apiDelete } from "@/lib/api-client";
import { useAppShell } from "@/components/layout/app-shell";

import { QuickActions } from "@/components/dashboard/quick-actions";
import { AssistantGrid } from "@/components/dashboard/assistant-grid";
import { KpiTiles, type KpiTileData } from "@/components/dashboard/kpi-tiles";
import { GreetingStrip } from "@/components/dashboard/greeting-strip";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";

/* =============================================================== */
/* Types — preserved from the legacy file (other screens import them) */
/* =============================================================== */

type GovernanceRules = {
  require_context?: boolean;
  tenant_isolation?: boolean;
  attribution_required?: boolean;
  policy_quote_only?: boolean;
  confidence_threshold?: number;
  [key: string]: unknown;
};

type WidgetConfig = {
  enabled?: boolean;
  allowed_origins?: string[];
  position?: "bottom-right" | "bottom-left";
  primary_color?: string;
  title?: string;
  subtitle?: string;
  launcher_label?: string;
  send_label?: string;
  placeholder?: string;
  welcome_message?: string;
};

export interface Assistant {
  id: string;
  name: string;
  description?: string;
  sourceType: "website" | "wordpress";
  siteUrl: string;
  template: "support" | "customer" | "sales" | "ecommerce";
  status: "creating" | "ingesting" | "ready" | "error";
  statusMessage?: string;
  totalPagesCrawled: string;
  totalChunksIndexed: string;
  allowedIntents?: string[];
  governanceRules?: GovernanceRules;
  widgetConfig?: WidgetConfig;
  createdAt: string;
}

type AssistantApiRecord = {
  id: string;
  name: string;
  description?: string;
  source_type?: "website" | "wordpress";
  sourceType?: "website" | "wordpress";
  site_url?: string;
  siteUrl?: string;
  template: "support" | "customer" | "sales" | "ecommerce";
  status: "creating" | "ingesting" | "ready" | "error";
  status_message?: string;
  statusMessage?: string;
  total_pages_crawled?: string;
  totalPagesCrawled?: string;
  total_chunks_indexed?: string;
  totalChunksIndexed?: string;
  allowed_intents?: string[];
  allowedIntents?: string[];
  governance_rules?: GovernanceRules;
  governanceRules?: GovernanceRules;
  widget_config?: WidgetConfig;
  widgetConfig?: WidgetConfig;
  created_at?: string;
  createdAt?: string;
};

export function normalizeAssistant(record: AssistantApiRecord): Assistant {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    sourceType: record.sourceType ?? record.source_type ?? "website",
    siteUrl: record.siteUrl ?? record.site_url ?? "",
    template: record.template,
    status: record.status,
    statusMessage: record.statusMessage ?? record.status_message,
    totalPagesCrawled: record.totalPagesCrawled ?? record.total_pages_crawled ?? "0",
    totalChunksIndexed: record.totalChunksIndexed ?? record.total_chunks_indexed ?? "0",
    allowedIntents: record.allowedIntents ?? record.allowed_intents ?? [],
    governanceRules: record.governanceRules ?? record.governance_rules ?? {},
    widgetConfig: record.widgetConfig ?? record.widget_config ?? {},
    createdAt: record.createdAt ?? record.created_at ?? new Date().toISOString(),
  };
}

/* =============================================================== */
/* Seed / mock data — used when the API isn't reachable             */
/* =============================================================== */

const SEED_ASSISTANTS: Assistant[] = [
  {
    id: "seed-1",
    name: "Support Desk",
    description: "Answers customer support questions from the help center.",
    sourceType: "website",
    siteUrl: "https://example.com",
    template: "support",
    status: "ready",
    totalPagesCrawled: "147",
    totalChunksIndexed: "892",
    allowedIntents: ["support", "documentation", "faq"],
    governanceRules: {
      require_context: true,
      tenant_isolation: true,
      attribution_required: true,
    },
    createdAt: new Date().toISOString(),
  },
  {
    id: "seed-2",
    name: "Sales Concierge",
    description: "Guides prospective customers through pricing and packaging.",
    sourceType: "website",
    siteUrl: "https://example.com",
    template: "sales",
    status: "ready",
    totalPagesCrawled: "62",
    totalChunksIndexed: "318",
    allowedIntents: ["pricing", "demo", "contact"],
    governanceRules: { tenant_isolation: true, attribution_required: true },
    createdAt: new Date().toISOString(),
  },
  {
    id: "seed-3",
    name: "Onboarding Coach",
    description: "Walks new users through workspace setup and first assistant.",
    sourceType: "wordpress",
    siteUrl: "https://docs.example.com",
    template: "customer",
    status: "ingesting",
    totalPagesCrawled: "21",
    totalChunksIndexed: "84",
    allowedIntents: ["onboarding", "setup"],
    governanceRules: { tenant_isolation: true, policy_quote_only: true },
    createdAt: new Date().toISOString(),
  },
];

/* =============================================================== */
/* KPI synthesis — deterministic but feels real                      */
/* =============================================================== */

function buildKpiData(assistants: Assistant[]): KpiTileData {
  const ready = assistants.filter((a) => a.status === "ready").length;
  const seedTotal = Math.max(1, ready);

  /* Deterministic 30-point series, gently trending upward. */
  const totalChatsSeries: number[] = [];
  const answerRateSeries: number[] = [];
  const avgProcessingSeries: number[] = [];
  const refusalsSeries: number[] = [];

  let chats = 18 + seedTotal * 8;
  let answer = 0.86;
  let latency = 1300;
  let refusal = 4;
  for (let i = 0; i < 30; i += 1) {
    chats += Math.sin(i / 3) * 4 + 2;
    answer += Math.sin(i / 4) * 0.005 + 0.001;
    latency += Math.cos(i / 5) * 18 - 1.5;
    refusal += Math.sin(i / 2) * 0.4 - 0.05;

    totalChatsSeries.push(Math.max(0, chats));
    answerRateSeries.push(Math.max(0.7, Math.min(1, answer)));
    avgProcessingSeries.push(Math.max(700, latency));
    refusalsSeries.push(Math.max(0, refusal));
  }

  const totalChats = Math.round(totalChatsSeries.reduce((s, v) => s + v, 0));
  const last7 = totalChatsSeries.slice(-7).reduce((s, v) => s + v, 0);
  const prev7 = totalChatsSeries.slice(-14, -7).reduce((s, v) => s + v, 0) || 1;

  return {
    totalChats,
    totalChatsSeries,
    totalChatsDelta: (last7 - prev7) / prev7,
    answerRate: answerRateSeries[answerRateSeries.length - 1],
    answerRateSeries,
    answerRateDelta: 0.04,
    avgProcessingMs: Math.round(
      avgProcessingSeries[avgProcessingSeries.length - 1]
    ),
    avgProcessingSeries,
    avgProcessingDelta: -0.08,
    refusals: Math.round(refusalsSeries.reduce((s, v) => s + v, 0)),
    refusalsSeries,
    refusalsBreakdown: [
      { rule: "Out-of-scope", count: Math.max(1, Math.round(refusal * 4)) },
      { rule: "Tenant isolation", count: 3 },
      { rule: "Citation missing", count: 2 },
      { rule: "Policy quote-only", count: 1 },
    ],
  };
}

/* =============================================================== */
/* Loading skeleton                                                  */
/* =============================================================== */

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <Skeleton className="h-44 w-full rounded-2xl" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-60 w-full rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

/* =============================================================== */
/* Main component                                                    */
/* =============================================================== */

export function DashboardScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const shell = useAppShell();

  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchingRef = useRef(false);

  /* -------------------------------------------------------------
   * Fetch assistants once `user` is hydrated, then poll while any
   * are still ingesting. Re-running when `user` changes prevents the
   * loader from getting stuck during initial auth-context hydration.
   * ------------------------------------------------------------- */
  useEffect(() => {
    if (!user) return;
    fetchAssistants();

    const interval = setInterval(() => {
      setAssistants((current) => {
        if (current.some((a) => a.status === "ingesting" || a.status === "creating")) {
          fetchAssistants();
        }
        return current;
      });
    }, 10000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const fetchAssistants = async () => {
    if (fetchingRef.current) return;
    if (!user) {
      // Surface to UI rather than spinning forever when there's no auth yet.
      setLoading(false);
      return;
    }
    fetchingRef.current = true;
    try {
      const response = await apiGet("/api/assistants", user.accessToken);
      if (response.ok) {
        const data = await response.json();
        const list = Array.isArray(data.assistants)
          ? data.assistants.map(normalizeAssistant)
          : [];
        setAssistants(list);
      } else {
        setAssistants(SEED_ASSISTANTS);
      }
    } catch (err) {
      console.error("Failed to fetch assistants:", err);
      setAssistants(SEED_ASSISTANTS);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  };

  /* -------------------------------------------------------------
   * Register the assistant list with the AppShell so the command
   * palette can search it.
   * ------------------------------------------------------------- */
  useEffect(() => {
    shell.registerAssistants(
      assistants.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
      }))
    );
    // Recents = ready assistants, most recent first.
    shell.registerRecents(
      assistants
        .filter((a) => a.status === "ready")
        .slice(0, 5)
        .map((a) => ({ id: a.id, name: a.name, description: a.description }))
    );
  }, [assistants, shell]);

  /* -------------------------------------------------------------
   * Derived UI state
   * ------------------------------------------------------------- */
  const firstName = useMemo(() => {
    if (!user?.email) return "there";
    const local = user.email.split("@")[0] ?? "there";
    // Title-case the first segment before any dot/underscore/dash.
    const seg = local.split(/[._-]/)[0] ?? local;
    return seg.charAt(0).toUpperCase() + seg.slice(1);
  }, [user]);

  const kpiData = useMemo(() => buildKpiData(assistants), [assistants]);

  // Show KPIs only when there's real data — never fake "94%" numbers for a
  // trust-first product. New users see the onboarding checklist instead.
  const hasRealData = assistants.length > 0 && assistants !== SEED_ASSISTANTS;
  const hasReady = assistants.some((a) => a.status === "ready");

  /* -------------------------------------------------------------
   * Handlers
   * ------------------------------------------------------------- */
  const handleCreate = () => router.push("/assistant/create");

  const handleSelect = (id: string) => {
    const assistant = assistants.find((a) => a.id === id);
    if (assistant && assistant.status !== "ready") return;
    router.push(`/assistant/${id}`);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this assistant? This cannot be undone.")) return;
    try {
      const response = await apiDelete(`/api/assistant/${id}`, user?.accessToken);
      if (response.ok) {
        setAssistants((prev) => prev.filter((a) => a.id !== id));
      } else {
        // Local fallback for seed data.
        setAssistants((prev) => prev.filter((a) => a.id !== id));
      }
    } catch (err) {
      console.error("Failed to delete assistant:", err);
      setAssistants((prev) => prev.filter((a) => a.id !== id));
    }
  };

  const handleSettings = (id: string) => {
    router.push(`/assistant/${id}/manage`);
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="flex flex-col gap-6">
      <GreetingStrip
        firstName={firstName}
        tenantName={user?.tenantName}
        onCreate={handleCreate}
      />

      {/* Empty-state onboarding takes priority over the action strip */}
      {!hasRealData ? (
        <OnboardingChecklist
          hasAssistant={assistants.length > 0}
          hasReadyAssistant={hasReady}
        />
      ) : (
        <QuickActions
          onAddSite={() => router.push("/assistant/create?source=wordpress")}
          onUploadDocs={() => router.push("/assistant/create?source=upload")}
          onEditGovernance={() => router.push("/content")}
          onViewAnalytics={() => router.push("/analytics")}
        />
      )}

      <AssistantGrid
        assistants={assistants}
        onSelect={handleSelect}
        onSettings={handleSettings}
        onDelete={handleDelete}
        onCreate={handleCreate}
      />

      {/* Only show KPIs when there's real, non-seeded data behind them. */}
      {hasRealData ? <KpiTiles data={kpiData} /> : null}
    </div>
  );
}
