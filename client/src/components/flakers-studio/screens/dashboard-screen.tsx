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
import { AlertTriangle, X } from "lucide-react";

import { Button, Skeleton } from "@/components/ui/primitives";
import { cn } from "@/lib/design-system";
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
/* Real KPI assembly — from /api/v1/analytics/system-stats and      */
/* /api/v1/analytics/usage. No synthetic numbers, no random walks.   */
/* =============================================================== */

interface SystemStatsResponse {
  total_assistants?: number;
  active_assistants?: number;
  total_projects?: number;
  total_content_chunks?: number;
  total_chat_sessions?: number;
  total_messages?: number;
  answer_rate?: number;
  avg_processing_time?: number;
}

interface UsageDailyPoint {
  date: string;
  messages: number;
}

interface UsageRatePoint {
  date: string;
  answer_rate: number; // backend returns 0..100
  total_messages: number;
}

interface UsageResponse {
  chat_volume?: UsageDailyPoint[];
  answer_rates?: UsageRatePoint[];
}

/**
 * Build the KpiTileData shape from real backend responses. Returns null
 * when there's no meaningful data yet (zero messages, zero sessions) so
 * the dashboard can hide the row instead of showing a wall of zeros.
 */
function buildKpiDataFromBackend(
  stats: SystemStatsResponse,
  usage: UsageResponse | null
): KpiTileData | null {
  const totalMessages = stats.total_messages ?? 0;
  const totalSessions = stats.total_chat_sessions ?? 0;

  // No real activity yet — let the caller hide the KPI row entirely
  // rather than render four "0" tiles with empty sparklines.
  if (totalMessages === 0 && totalSessions === 0) {
    return null;
  }

  // Chat volume series (real, one point per day). Empty array is fine —
  // the Sparkline component handles <2 points by rendering nothing.
  const totalChatsSeries =
    usage?.chat_volume?.map((p) => p.messages ?? 0) ?? [];

  // Answer rate series, normalised to 0..1 to match the existing KPI tile
  // contract (the tile multiplies by 100 itself).
  const answerRateSeries =
    usage?.answer_rates?.map((p) =>
      Math.max(0, Math.min(1, (p.answer_rate ?? 0) / 100))
    ) ?? [];

  // Compute a 7d-vs-prior-7d delta from real data only if we have at
  // least 14 days of points. Otherwise return 0 and let the tile show
  // "+0%" / "—" rather than fabricating a comparison.
  let totalChatsDelta = 0;
  if (totalChatsSeries.length >= 14) {
    const last7 = totalChatsSeries.slice(-7).reduce((s, v) => s + v, 0);
    const prev7 = totalChatsSeries.slice(-14, -7).reduce((s, v) => s + v, 0);
    totalChatsDelta = prev7 > 0 ? (last7 - prev7) / prev7 : 0;
  }

  return {
    totalChats: totalMessages,
    totalChatsSeries,
    totalChatsDelta,
    answerRate: stats.answer_rate ?? 0,
    answerRateSeries,
    // No historical comparison from the backend — show 0 (the tile renders
    // "+0%") rather than inventing a number.
    answerRateDelta: 0,
    avgProcessingMs: Math.round(stats.avg_processing_time ?? 0),
    // We don't have a per-day latency series from the backend yet.
    avgProcessingSeries: [],
    avgProcessingDelta: 0,
    // Refusals aren't yet exposed via system-stats; show 0 with no
    // fabricated per-rule breakdown.
    refusals: 0,
    refusalsSeries: [],
    refusalsBreakdown: [],
  };
}

/* =============================================================== */
/* Loading skeleton                                                  */
/* =============================================================== */

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading dashboard">
      {/* Greeting strip skeleton — mirrors the real header so the layout
          doesn't jump when content arrives. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-56 rounded-md" />
          <Skeleton className="h-4 w-40 rounded-md" />
        </div>
        <Skeleton className="h-10 w-36 rounded-md" />
      </div>
      {/* Quick actions / onboarding row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
      {/* Assistant grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-60 w-full rounded-xl" />
        ))}
      </div>
      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

/* =============================================================== */
/* Inline error banner — surfaces transient fetch failures gently   */
/* without throwing the user back to a full error page.             */
/* =============================================================== */

interface FetchErrorNoticeProps {
  onRetry: () => void;
  onDismiss: () => void;
  isRetrying?: boolean;
}

function FetchErrorNotice({ onRetry, onDismiss, isRetrying }: FetchErrorNoticeProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-start gap-3 rounded-xl border p-4",
        "border-[var(--color-caution-border)] bg-[var(--color-caution-soft)]",
        "shadow-[var(--elevation-1)]"
      )}
    >
      <AlertTriangle
        className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-caution-strong)]"
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-sm font-medium text-[var(--color-text-primary)]">
          Couldn&rsquo;t reach the assistants service
        </p>
        <p className="text-xs text-[var(--color-text-secondary)]">
          Your workspace will appear once the connection recovers. Retry, or
          create an assistant once the service is back.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" variant="outline" onClick={onRetry} isLoading={isRetrying}>
          Retry
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={onDismiss}
          aria-label="Dismiss error notice"
          title="Dismiss"
          className="h-8 w-8"
        >
          <X className="h-4 w-4" />
        </Button>
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
  // `fetchError` is non-null when the most recent fetch failed. Cleared on
  // a successful retry or user dismiss. We do NOT substitute fake data —
  // governance-first means an honest empty/error state instead.
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const fetchingRef = useRef(false);

  // Real KPI data, fetched from /api/v1/analytics endpoints. null until
  // the first fetch resolves; KpiTileData|null after that. We hide the
  // KPI row when this stays null or when the backend reports zero
  // activity (see buildKpiDataFromBackend).
  const [kpiData, setKpiData] = useState<KpiTileData | null>(null);

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
      // Fetch assistants + system stats + 30d usage in parallel. Each
      // result is treated independently — a failure in one doesn't taint
      // the others. We never substitute synthetic data on failure.
      const [assistantsRes, statsRes, usageRes] = await Promise.all([
        apiGet("/api/assistants", user.accessToken),
        apiGet("/api/v1/analytics/system-stats", user.accessToken).catch(
          () => null as Response | null
        ),
        apiGet("/api/v1/analytics/usage?days=30", user.accessToken).catch(
          () => null as Response | null
        ),
      ]);

      if (assistantsRes.ok) {
        const data = await assistantsRes.json();
        const list = Array.isArray(data.assistants)
          ? data.assistants.map(normalizeAssistant)
          : [];
        setAssistants(list);
        setFetchError(null);
      } else {
        // Don't pretend — leave the list as it was (likely empty on first
        // load) and surface the error so the user can retry.
        setFetchError(`Service returned ${assistantsRes.status}`);
      }

      // KPI assembly is best-effort: if either analytics call fails, we
      // simply don't show the KPI row. No fallback to fake numbers.
      let stats: SystemStatsResponse | null = null;
      let usage: UsageResponse | null = null;
      if (statsRes && statsRes.ok) {
        stats = await statsRes.json().catch(() => null);
      }
      if (usageRes && usageRes.ok) {
        usage = await usageRes.json().catch(() => null);
      }
      if (stats) {
        setKpiData(buildKpiDataFromBackend(stats, usage));
      } else {
        setKpiData(null);
      }
    } catch (err) {
      console.error("Failed to fetch dashboard data:", err);
      // Do not substitute seed/fake assistants. The dashboard renders an
      // honest empty state with a retry CTA via FetchErrorNotice.
      setFetchError(err instanceof Error ? err.message : "Network error");
      setKpiData(null);
    } finally {
      setLoading(false);
      setIsRetrying(false);
      fetchingRef.current = false;
    }
  };

  const handleRetryFetch = () => {
    setIsRetrying(true);
    fetchAssistants();
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

  // The dashboard treats "has real data" as "the workspace owns at least
  // one assistant". KPI rendering is independent — it requires both an
  // assistant AND non-zero usage from the backend (handled in kpiData).
  const hasRealData = assistants.length > 0;
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

      {/* Gentle inline notice when the most recent fetch failed. We've
          already fallen back to seed data so the rest of the page is
          interactive — this just gives the user a way to retry. */}
      {fetchError ? (
        <FetchErrorNotice
          onRetry={handleRetryFetch}
          onDismiss={() => setFetchError(null)}
          isRetrying={isRetrying}
        />
      ) : null}

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

      {/* KPI tiles render only when both the workspace has assistants AND
          the analytics backend reported non-zero activity. We never show
          synthesized "94%"-style numbers. */}
      {hasRealData && kpiData ? <KpiTiles data={kpiData} /> : null}
    </div>
  );
}
