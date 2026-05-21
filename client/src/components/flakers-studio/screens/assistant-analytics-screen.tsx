"use client";

/**
 * AssistantAnalyticsScreen — per-assistant analytics drilldown.
 *
 * Fetches `/api/v1/analytics/assistant/{id}/stats?days=N` and shows:
 *   - Chat stats (sessions, messages, answer rate, avg response time)
 *   - Content stats (chunks, unique sources, avg confidence)
 *   - Recent ingestion jobs
 *
 * Reuses TimeWindowToggle and RecentJobsTable from the system-wide
 * analytics screen so the UX is consistent.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  Clock,
  Database,
  MessageSquare,
  RefreshCw,
  Target,
  Activity,
  Sparkles,
} from "lucide-react";

import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from "@/components/ui/primitives";
import { cn } from "@/lib/design-system";
import { useAuth } from "@/contexts/auth-context";
import { apiGet } from "@/lib/api-client";
import { useAppShell } from "@/components/layout/app-shell";

import { TimeWindowToggle, type TimeWindowDays } from "@/components/analytics/time-window-toggle";
import { RecentJobsTable, type RecentJob } from "@/components/analytics/recent-jobs-table";

interface AssistantAnalyticsResponse {
  assistant_id: string;
  assistant_name: string;
  period_days: number;
  chat_stats: {
    total_sessions: number;
    total_messages: number;
    successful_answers: number;
    answer_rate: number;
    avg_response_time: number;
  };
  content_stats: {
    total_chunks: number;
    unique_sources: number;
    avg_confidence: number;
  };
  recent_jobs?: RecentJob[];
}

interface AssistantAnalyticsScreenProps {
  assistantId: string;
}

function formatMs(n: number): string {
  if (!n) return "—";
  if (n < 1000) return `${Math.round(n)}ms`;
  return `${(n / 1000).toFixed(2)}s`;
}

interface MetricTileProps {
  label: string;
  value: string;
  subValue?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "trust" | "brand" | "caution" | "accent";
}

const TONE_BG: Record<MetricTileProps["tone"], string> = {
  trust: "bg-[var(--color-trust-soft)] text-[var(--color-trust-strong)]",
  brand: "bg-[var(--color-brand-soft)] text-[var(--color-brand)]",
  caution: "bg-[var(--color-caution-soft)] text-[var(--color-caution-strong)]",
  accent: "bg-[var(--color-accent-soft)] text-[var(--color-accent)]",
};

function MetricTile({ label, value, subValue, icon: Icon, tone }: MetricTileProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-4",
        "shadow-[var(--elevation-1)]"
      )}
    >
      <span
        className={cn(
          "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
          TONE_BG[tone]
        )}
        aria-hidden
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-[var(--color-text-muted)]">{label}</p>
        <p className="text-2xl font-semibold text-[var(--color-text-primary)]">{value}</p>
        {subValue ? <p className="text-xs text-[var(--color-text-tertiary)]">{subValue}</p> : null}
      </div>
    </div>
  );
}

export function AssistantAnalyticsScreen({ assistantId }: AssistantAnalyticsScreenProps) {
  const router = useRouter();
  const { user } = useAuth();
  const shell = useAppShell();

  const [windowDays, setWindowDays] = React.useState<TimeWindowDays>(30);
  const [data, setData] = React.useState<AssistantAnalyticsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);

  React.useEffect(() => {
    shell.registerAssistants([]);
    shell.registerRecents([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchStats = React.useCallback(
    async (days: TimeWindowDays) => {
      if (!user) return;
      setError(null);
      try {
        const res = await apiGet(
          `/api/v1/analytics/assistant/${assistantId}/stats?days=${days}`,
          user.accessToken
        );
        if (res.ok) {
          setData(await res.json());
        } else {
          const err = await res.json().catch(() => ({}));
          setError(err.detail || `Failed to load assistant analytics (${res.status})`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load assistant analytics");
      } finally {
        setLoading(false);
      }
    },
    [user, assistantId]
  );

  React.useEffect(() => {
    fetchStats(windowDays);
  }, [fetchStats, windowDays]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchStats(windowDays);
    setRefreshing(false);
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-72" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/analytics")}>
          <ArrowLeft className="h-4 w-4" />
          Back to analytics
        </Button>
        <div className="rounded-md border border-[var(--color-refuse-border)] bg-[var(--color-refuse-soft)] p-4 text-sm text-[var(--color-refuse-strong)]">
          {error || "Assistant not found."}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/analytics")}
          className="self-start"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to analytics
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">
                {data.assistant_name}
              </h1>
              <Badge variant="brand">Assistant analytics</Badge>
            </div>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Last {data.period_days} days of activity.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <TimeWindowToggle value={windowDays} onChange={setWindowDays} />
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => router.push(`/assistant/${assistantId}/manage`)}
            >
              <Bot className="h-4 w-4" />
              Manage
            </Button>
          </div>
        </div>
      </div>

      {/* Chat stats */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
          Chat performance
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricTile
            label="Sessions"
            value={data.chat_stats.total_sessions.toLocaleString()}
            icon={MessageSquare}
            tone="brand"
          />
          <MetricTile
            label="Messages"
            value={data.chat_stats.total_messages.toLocaleString()}
            subValue={`${data.chat_stats.successful_answers} answers`}
            icon={Activity}
            tone="accent"
          />
          <MetricTile
            label="Answer rate"
            value={`${Math.round(data.chat_stats.answer_rate)}%`}
            icon={Target}
            tone="trust"
          />
          <MetricTile
            label="Avg response"
            value={formatMs(data.chat_stats.avg_response_time)}
            icon={Clock}
            tone="caution"
          />
        </div>
      </section>

      {/* Content stats */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
          Content
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricTile
            label="Chunks"
            value={data.content_stats.total_chunks.toLocaleString()}
            icon={Database}
            tone="brand"
          />
          <MetricTile
            label="Unique sources"
            value={data.content_stats.unique_sources.toLocaleString()}
            icon={Sparkles}
            tone="accent"
          />
          <MetricTile
            label="Avg confidence"
            value={`${Math.round(data.content_stats.avg_confidence * 100)}%`}
            icon={Target}
            tone={data.content_stats.avg_confidence >= 0.7 ? "trust" : "caution"}
          />
        </div>
      </section>

      {/* Recent jobs */}
      {data.recent_jobs && data.recent_jobs.length > 0 ? (
        <RecentJobsTable jobs={data.recent_jobs} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Recent ingestion jobs</CardTitle>
            <CardDescription>No recent jobs in this window.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-24 items-center justify-center text-sm text-[var(--color-text-tertiary)]">
              No ingestion activity for this assistant in the last {data.period_days} days.
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
