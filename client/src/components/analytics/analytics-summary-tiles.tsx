"use client";

import * as React from "react";
import { Bot, Database, MessageSquare, Target } from "lucide-react";
import { cn } from "@/lib/design-system";

export interface SystemStats {
  total_assistants: number;
  active_assistants: number;
  total_projects: number;
  total_content_chunks: number;
  total_chat_sessions: number;
  total_messages: number;
  answer_rate: number;
  avg_processing_time: number;
}

interface AnalyticsSummaryTilesProps {
  stats: SystemStats;
}

interface TileSpec {
  label: string;
  value: string;
  subValue?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "trust" | "brand" | "caution" | "accent";
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

const TONE_BG: Record<TileSpec["tone"], string> = {
  trust: "bg-[var(--color-trust-soft)] text-[var(--color-trust-strong)]",
  brand: "bg-[var(--color-brand-soft)] text-[var(--color-brand)]",
  caution: "bg-[var(--color-caution-soft)] text-[var(--color-caution-strong)]",
  accent: "bg-[var(--color-accent-soft)] text-[var(--color-accent)]",
};

/**
 * Four summary tiles for the analytics page header.
 * Clones the visual language of `KpiTiles` but renders an icon badge
 * instead of a sparkline (since system-stats endpoint returns scalar
 * values, not time-series).
 */
export function AnalyticsSummaryTiles({ stats }: AnalyticsSummaryTilesProps) {
  const tiles: TileSpec[] = [
    {
      label: "Assistants",
      value: formatCount(stats.total_assistants ?? 0),
      subValue: `${stats.active_assistants ?? 0} active`,
      icon: Bot,
      tone: "brand",
    },
    {
      label: "Content chunks",
      value: formatCount(stats.total_content_chunks ?? 0),
      subValue: `${stats.total_projects ?? 0} projects`,
      icon: Database,
      tone: "trust",
    },
    {
      label: "Messages",
      value: formatCount(stats.total_messages ?? 0),
      subValue: `${stats.total_chat_sessions ?? 0} sessions`,
      icon: MessageSquare,
      tone: "accent",
    },
    {
      label: "Answer rate",
      value: `${Math.round((stats.answer_rate ?? 0) * 100)}%`,
      subValue: `${Math.round(stats.avg_processing_time ?? 0)}ms avg`,
      icon: Target,
      tone: "caution",
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((t) => {
        const Icon = t.icon;
        return (
          <div
            key={t.label}
            className={cn(
              "flex items-center gap-4 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-4",
              "shadow-[var(--elevation-1)]"
            )}
          >
            <span
              className={cn(
                "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                TONE_BG[t.tone]
              )}
              aria-hidden
            >
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-[var(--color-text-muted)]">{t.label}</p>
              <p className="text-2xl font-semibold text-[var(--color-text-primary)]">{t.value}</p>
              {t.subValue ? (
                <p className="text-xs text-[var(--color-text-tertiary)]">{t.subValue}</p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
