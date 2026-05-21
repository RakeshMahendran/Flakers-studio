"use client";

import * as React from "react";
import { Activity, AlertOctagon, CheckCircle2, Clock } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/primitives";
import { cn } from "@/lib/design-system";

export interface PerformanceData {
  avg_response_time: number; // ms
  p95_response_time: number; // ms
  error_rate: number; // 0-1
  ingestion_success_rate: number; // 0-1
}

interface PerformanceCardProps {
  data: PerformanceData;
}

function formatMs(n: number): string {
  if (n < 1000) return `${Math.round(n)}ms`;
  return `${(n / 1000).toFixed(2)}s`;
}

function formatPercent(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

interface MetricSpec {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "trust" | "brand" | "caution" | "refuse";
}

const TONE_BG: Record<MetricSpec["tone"], string> = {
  trust: "bg-[var(--color-trust-soft)] text-[var(--color-trust-strong)]",
  brand: "bg-[var(--color-brand-soft)] text-[var(--color-brand)]",
  caution: "bg-[var(--color-caution-soft)] text-[var(--color-caution-strong)]",
  refuse: "bg-[var(--color-refuse-soft)] text-[var(--color-refuse-strong)]",
};

/**
 * Performance summary: avg/p95 response times, error rate, ingestion success.
 */
export function PerformanceCard({ data }: PerformanceCardProps) {
  const metrics: MetricSpec[] = [
    {
      label: "Avg response",
      value: formatMs(data.avg_response_time ?? 0),
      icon: Clock,
      tone: "brand",
    },
    {
      label: "p95 response",
      value: formatMs(data.p95_response_time ?? 0),
      icon: Activity,
      tone: "caution",
    },
    {
      label: "Error rate",
      value: formatPercent(data.error_rate ?? 0),
      icon: AlertOctagon,
      tone: data.error_rate > 0.05 ? "refuse" : "trust",
    },
    {
      label: "Ingestion success",
      value: formatPercent(data.ingestion_success_rate ?? 0),
      icon: CheckCircle2,
      tone: data.ingestion_success_rate >= 0.9 ? "trust" : "caution",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Performance</CardTitle>
        <CardDescription>System-wide latency and reliability.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2">
          {metrics.map((m) => {
            const Icon = m.icon;
            return (
              <div
                key={m.label}
                className="flex items-center gap-3 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-3"
              >
                <span className={cn("inline-flex h-9 w-9 items-center justify-center rounded-md", TONE_BG[m.tone])}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-[var(--color-text-muted)]">{m.label}</p>
                  <p className="text-lg font-semibold text-[var(--color-text-primary)] tabular-nums">
                    {m.value}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
