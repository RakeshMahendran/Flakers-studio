"use client";

/**
 * AnalyticsScreen — system-wide analytics dashboard.
 *
 * Sections:
 *   - Summary tiles (system-stats endpoint)
 *   - Usage chart: chat volume + answer rate over time window
 *   - Top assistants: ranked by message count in window
 *   - Content quality: intent + quality distribution donuts
 *   - Performance: latency, error rate, ingestion success
 *   - Recent ingestion jobs
 *
 * Time window (7d/14d/30d/90d) drives the `?days=` parameter on usage
 * endpoint. Other endpoints are window-independent.
 */
import * as React from "react";
import Link from "next/link";
import { AlertTriangle, BarChart3, Download, LogIn, RefreshCw } from "lucide-react";

import { Button, Card, Skeleton } from "@/components/ui/primitives";
import { useAuth } from "@/contexts/auth-context";
import { apiGet } from "@/lib/api-client";
import { useAppShell } from "@/components/layout/app-shell";
import { downloadCSV, toCSV } from "@/lib/csv-export";

import {
  AnalyticsSummaryTiles,
  type SystemStats,
} from "@/components/analytics/analytics-summary-tiles";
import {
  TimeWindowToggle,
  type TimeWindowDays,
} from "@/components/analytics/time-window-toggle";
import {
  UsageChart,
  type ChatVolumePoint,
  type AnswerRatePoint,
} from "@/components/analytics/usage-chart";
import {
  TopAssistantsList,
  type TopAssistantItem,
} from "@/components/analytics/top-assistants-list";
import { ContentQualityDonut } from "@/components/analytics/content-quality-donut";
import { PerformanceCard, type PerformanceData } from "@/components/analytics/performance-card";
import { RecentJobsTable, type RecentJob } from "@/components/analytics/recent-jobs-table";

interface UsageResponse {
  period: string;
  chat_volume: ChatVolumePoint[];
  answer_rates: AnswerRatePoint[];
  top_assistants: TopAssistantItem[];
  common_intents: { intent: string; count: number }[];
}

interface ContentQualityResponse {
  total_chunks: number;
  avg_confidence_score: number;
  intent_distribution: Record<string, number>;
  quality_distribution: Record<string, number>;
  sensitive_content_count: number;
  policy_content_count: number;
}

interface PerformanceResponse extends PerformanceData {
  recent_jobs: RecentJob[];
}

export function AnalyticsScreen() {
  const { user } = useAuth();
  const shell = useAppShell();

  const [window, setWindow] = React.useState<TimeWindowDays>(30);
  const [stats, setStats] = React.useState<SystemStats | null>(null);
  const [usage, setUsage] = React.useState<UsageResponse | null>(null);
  const [quality, setQuality] = React.useState<ContentQualityResponse | null>(null);
  const [performance, setPerformance] = React.useState<PerformanceResponse | null>(null);
  const [loadingStats, setLoadingStats] = React.useState(true);
  const [loadingUsage, setLoadingUsage] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [errorStatus, setErrorStatus] = React.useState<number | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);

  // Clear assistant/recent palette context.
  React.useEffect(() => {
    shell.registerAssistants([]);
    shell.registerRecents([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch window-independent endpoints once on mount + refresh.
  const fetchStatic = React.useCallback(async () => {
    if (!user) return;
    setError(null);
    setErrorStatus(null);
    try {
      const [statsRes, qualityRes, perfRes] = await Promise.all([
        apiGet("/api/v1/analytics/system-stats", user.accessToken),
        apiGet("/api/v1/analytics/content-quality", user.accessToken),
        apiGet("/api/v1/analytics/performance", user.accessToken),
      ]);

      if (statsRes.ok) {
        setStats(await statsRes.json());
      } else {
        const err = await statsRes.json().catch(() => ({}));
        setErrorStatus(statsRes.status);
        setError(err.detail || `Failed to load system stats (${statsRes.status})`);
      }
      if (qualityRes.ok) setQuality(await qualityRes.json());
      if (perfRes.ok) setPerformance(await perfRes.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load analytics");
    } finally {
      setLoadingStats(false);
    }
  }, [user]);

  // Fetch window-dependent usage endpoint whenever window changes.
  const fetchUsage = React.useCallback(
    async (days: TimeWindowDays) => {
      if (!user) return;
      setLoadingUsage(true);
      try {
        const res = await apiGet(`/api/v1/analytics/usage?days=${days}`, user.accessToken);
        if (res.ok) {
          setUsage(await res.json());
        } else {
          const err = await res.json().catch(() => ({}));
          setErrorStatus(res.status);
          setError(err.detail || `Failed to load usage analytics (${res.status})`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load usage analytics");
      } finally {
        setLoadingUsage(false);
      }
    },
    [user]
  );

  React.useEffect(() => {
    fetchStatic();
  }, [fetchStatic]);

  React.useEffect(() => {
    fetchUsage(window);
  }, [fetchUsage, window]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchStatic(), fetchUsage(window)]);
    setRefreshing(false);
  };

  const handleExportCSV = () => {
    if (!usage) return;
    // Join chat_volume and answer_rates by date for a single row per day.
    const rateMap = new Map(usage.answer_rates.map((r) => [r.date, r]));
    const rows = usage.chat_volume.map((v) => ({
      date: v.date,
      messages: v.messages,
      answer_rate_pct: rateMap.get(v.date)?.answer_rate ?? 0,
      total_messages: rateMap.get(v.date)?.total_messages ?? v.messages,
    }));
    const csv = toCSV(rows, ["date", "messages", "answer_rate_pct", "total_messages"]);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCSV(`flakers-usage-${window}d-${stamp}.csv`, csv);
  };

  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">
            Analytics
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Usage, quality, and performance for your tenant.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <TimeWindowToggle value={window} onChange={setWindow} />
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={!usage || usage.chat_volume.length === 0}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            Refresh
          </Button>
        </div>
      </header>

      {error ? (
        <AnalyticsErrorCard
          message={error}
          status={errorStatus}
          onRetry={handleRefresh}
          retrying={refreshing}
        />
      ) : null}

      {/* Summary tiles */}
      {loadingStats ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : stats ? (
        <AnalyticsSummaryTiles stats={stats} />
      ) : !error ? (
        <AnalyticsEmptyCard
          title="No analytics yet"
          description="Create an assistant and start a conversation to populate usage stats."
        />
      ) : null}

      {/* Usage chart */}
      {loadingUsage ? (
        <Skeleton className="h-72 w-full rounded-xl" />
      ) : usage ? (
        <UsageChart chatVolume={usage.chat_volume} answerRates={usage.answer_rates} />
      ) : null}

      {/* Two-column: top assistants + content quality */}
      <div className="grid gap-4 lg:grid-cols-2">
        {loadingUsage ? (
          <Skeleton className="h-72 w-full rounded-xl" />
        ) : usage ? (
          <TopAssistantsList items={usage.top_assistants} />
        ) : null}
        {loadingStats ? (
          <Skeleton className="h-72 w-full rounded-xl" />
        ) : quality ? (
          <ContentQualityDonut
            totalChunks={quality.total_chunks}
            avgConfidence={quality.avg_confidence_score}
            intentDistribution={quality.intent_distribution || {}}
            qualityDistribution={quality.quality_distribution || {}}
          />
        ) : null}
      </div>

      {/* Performance + recent jobs */}
      {loadingStats ? (
        <Skeleton className="h-48 w-full rounded-xl" />
      ) : performance ? (
        <PerformanceCard data={performance} />
      ) : null}

      {loadingStats ? (
        <Skeleton className="h-72 w-full rounded-xl" />
      ) : performance?.recent_jobs ? (
        <RecentJobsTable jobs={performance.recent_jobs} />
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------- */

interface AnalyticsErrorCardProps {
  message: string;
  status: number | null;
  onRetry: () => void;
  retrying: boolean;
}

/**
 * Inline error surface for analytics fetches. Specialises on 401 (the
 * "Authorization header required" case the user reported) by replacing the
 * raw detail with a friendly sign-in link.
 */
function AnalyticsErrorCard({ message, status, onRetry, retrying }: AnalyticsErrorCardProps) {
  const isAuth =
    status === 401 ||
    status === 403 ||
    /authorization header required/i.test(message) ||
    /not authenticated/i.test(message);

  return (
    <Card
      className="border-[var(--color-refuse-border)] bg-[var(--color-refuse-soft)]/60 p-4"
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <span
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--color-refuse-soft)] text-[var(--color-refuse-strong)]"
          aria-hidden
        >
          <AlertTriangle className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--color-refuse-strong)]">
            {isAuth ? "Your session has expired" : "Couldn't load analytics"}
          </p>
          <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
            {isAuth
              ? "Sign in again to view your analytics dashboard."
              : message}
          </p>
          <div className="mt-3 flex items-center gap-2">
            {isAuth ? (
              <Button variant="primary" size="sm" asChild>
                <Link href="/login">
                  <LogIn className="h-4 w-4" />
                  Sign in again
                </Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={onRetry} disabled={retrying}>
                <RefreshCw className={retrying ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                Try again
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

interface AnalyticsEmptyCardProps {
  title: string;
  description: string;
}

function AnalyticsEmptyCard({ title, description }: AnalyticsEmptyCardProps) {
  return (
    <Card className="flex flex-col items-center justify-center gap-3 p-10 text-center">
      <span
        className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-surface-sunken)] text-[var(--color-text-tertiary)]"
        aria-hidden
      >
        <BarChart3 className="h-6 w-6" />
      </span>
      <h3 className="text-base font-medium text-[var(--color-text-primary)]">{title}</h3>
      <p className="max-w-sm text-sm text-[var(--color-text-secondary)]">{description}</p>
      <Button variant="outline" size="sm" asChild className="mt-1">
        <Link href="/assistant/create">Create your first assistant</Link>
      </Button>
    </Card>
  );
}
