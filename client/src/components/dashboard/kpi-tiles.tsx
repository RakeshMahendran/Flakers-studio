"use client";

/**
 * KpiTiles — bottom analytics row.
 *
 * Four small tiles, each with: label + value + 30-day sparkline (area
 * style). The "Refusals" tile shows a per-rule breakdown on hover via a
 * Radix Popover.
 */
import * as React from "react";
import * as Popover from "@radix-ui/react-popover";
import {
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  MessageSquare,
  ShieldAlert,
  Target,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/design-system";
import { Sparkline, type SparklineTone } from "./sparkline";

export interface RefusalBreakdown {
  rule: string;
  count: number;
}

export interface KpiTileData {
  totalChats: number;
  totalChatsSeries: number[];
  totalChatsDelta: number; // 0..1, e.g. 0.12 = +12%
  answerRate: number; // 0..1
  answerRateSeries: number[];
  answerRateDelta: number;
  avgProcessingMs: number;
  avgProcessingSeries: number[];
  avgProcessingDelta: number;
  refusals: number;
  refusalsSeries: number[];
  refusalsBreakdown: RefusalBreakdown[];
}

interface KpiTilesProps {
  data: KpiTileData;
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

function formatDelta(delta: number): string {
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${(delta * 100).toFixed(0)}%`;
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function deltaClass(delta: number, lowerIsBetter = false): string {
  const isPositive = lowerIsBetter ? delta < 0 : delta >= 0;
  return isPositive
    ? "text-[var(--color-trust-strong)] bg-[var(--color-trust-soft)] border-[var(--color-trust-border)]"
    : "text-[var(--color-refuse-strong)] bg-[var(--color-refuse-soft)] border-[var(--color-refuse-border)]";
}

interface TileProps {
  label: string;
  value: string;
  delta?: { value: number; lowerIsBetter?: boolean };
  series: number[];
  tone: SparklineTone;
  icon: React.ComponentType<{ className?: string }>;
  children?: React.ReactNode;
}

const Tile = React.memo(function Tile({ label, value, delta, series, tone, icon: Icon, children }: TileProps) {
  const ArrowIcon =
    delta && (delta.lowerIsBetter ? delta.value < 0 : delta.value >= 0)
      ? ArrowUpRight
      : ArrowDownRight;
  return (
    <div
      className={cn(
        "relative flex flex-col gap-3 rounded-xl border p-4",
        "border-[var(--color-border-subtle)] bg-[var(--color-surface)]",
        "shadow-[var(--elevation-1)]",
        "min-w-0" // Prevent overflow on small screens
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-xs font-medium text-[var(--color-text-muted)]">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </span>
        {delta ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
              deltaClass(delta.value, delta.lowerIsBetter)
            )}
          >
            <ArrowIcon className="h-2.5 w-2.5" />
            {formatDelta(delta.value)}
          </span>
        ) : null}
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold leading-none tracking-tight text-[var(--color-text-primary)]">
            {value}
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
            Last 30 days
          </div>
        </div>
        <Sparkline data={series} tone={tone} width={120} height={32} />
      </div>
      {children}
    </div>
  );
});

export const KpiTiles = React.memo(function KpiTiles({ data }: KpiTilesProps) {
  return (
    <section
      aria-label="Workspace analytics"
      className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
    >
      <Tile
        label="Total chats"
        value={formatCount(data.totalChats)}
        delta={{ value: data.totalChatsDelta }}
        series={data.totalChatsSeries}
        tone="brand"
        icon={MessageSquare}
      />
      <Tile
        label="Answer rate"
        value={`${Math.round(data.answerRate * 100)}%`}
        delta={{ value: data.answerRateDelta }}
        series={data.answerRateSeries}
        tone="trust"
        icon={Target}
      />
      <Tile
        label="Avg processing"
        value={formatLatency(data.avgProcessingMs)}
        delta={{ value: data.avgProcessingDelta, lowerIsBetter: true }}
        series={data.avgProcessingSeries}
        tone="accent"
        icon={Clock}
      />
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label="Refusals breakdown. Click for details by governance rule."
            title="Refusals — click for per-rule breakdown"
            className={cn(
              "group relative flex flex-col gap-3 rounded-xl border p-4 text-left",
              "border-[var(--color-border-subtle)] bg-[var(--color-surface)]",
              "shadow-[var(--elevation-1)]",
              "transition-[border-color,box-shadow] duration-[var(--duration-base)]",
              "hover:border-[var(--color-refuse-border)] hover:shadow-[var(--elevation-2)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]",
              "min-h-[44px]" // Ensure touch target size
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 text-xs font-medium text-[var(--color-text-muted)]">
                <ShieldAlert className="h-3.5 w-3.5" />
                Refusals
              </span>
              <span className="text-[10px] text-[var(--color-text-muted)]">
                Click for breakdown
              </span>
            </div>
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-2xl font-semibold leading-none tracking-tight text-[var(--color-text-primary)]">
                  {data.refusals}
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                  Last 30 days
                </div>
              </div>
              <Sparkline data={data.refusalsSeries} tone="refuse" width={120} height={32} />
            </div>
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            sideOffset={8}
            align="end"
            className={cn(
              "z-40 w-64 rounded-md border p-3",
              "border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)]",
              "shadow-[var(--elevation-3)]"
            )}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                By rule
              </span>
              <TrendingUp className="h-3 w-3 text-[var(--color-text-muted)]" />
            </div>
            {data.refusalsBreakdown.length === 0 ? (
              <p className="py-2 text-center text-xs text-[var(--color-text-muted)]">
                No refusals in the last 30 days.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {data.refusalsBreakdown.map((b) => (
                  <li
                    key={b.rule}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="truncate text-[var(--color-text-secondary)]">{b.rule}</span>
                    <span className="font-semibold text-[var(--color-text-primary)]">
                      {b.count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Popover.Arrow className="fill-[var(--color-surface-elevated)]" />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </section>
  );
});
