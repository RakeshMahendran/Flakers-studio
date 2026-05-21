"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/primitives";

interface QualityDistribution {
  [label: string]: number;
}

interface ContentQualityDonutProps {
  totalChunks: number;
  avgConfidence: number;
  intentDistribution: QualityDistribution;
  qualityDistribution: QualityDistribution;
}

const COLORS = [
  "var(--color-trust)",
  "var(--color-brand)",
  "var(--color-accent)",
  "var(--color-caution)",
  "var(--color-refuse)",
  "var(--color-text-tertiary)",
];

interface DonutProps {
  data: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
}

function Donut({ data, size = 140, thickness = 18 }: DonutProps) {
  const radius = size / 2 - thickness / 2;
  const circumference = 2 * Math.PI * radius;
  const total = data.reduce((s, d) => s + d.value, 0);

  if (total === 0) {
    return (
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-surface-sunken)"
          strokeWidth={thickness}
        />
      </svg>
    );
  }

  let offset = 0;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--color-surface-sunken)"
        strokeWidth={thickness}
      />
      {data.map((d, i) => {
        const fraction = d.value / total;
        const dash = fraction * circumference;
        const gap = circumference - dash;
        const segment = (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={d.color}
            strokeWidth={thickness}
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            strokeLinecap="butt"
          >
            <title>{`${d.label}: ${d.value}`}</title>
          </circle>
        );
        offset += dash;
        return segment;
      })}
    </svg>
  );
}

function Legend({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    return <p className="text-xs text-[var(--color-text-tertiary)]">No data available.</p>;
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {data.map((d) => (
        <li key={d.label} className="flex items-center justify-between gap-3 text-xs">
          <span className="flex min-w-0 items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: d.color }} />
            <span className="truncate text-[var(--color-text-secondary)]">{d.label}</span>
          </span>
          <span className="shrink-0 font-medium text-[var(--color-text-primary)] tabular-nums">
            {d.value} ({total > 0 ? Math.round((d.value / total) * 100) : 0}%)
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Side-by-side donuts for content intent distribution and quality
 * distribution, plus a centered avg-confidence stat.
 */
export function ContentQualityDonut({
  totalChunks,
  avgConfidence,
  intentDistribution,
  qualityDistribution,
}: ContentQualityDonutProps) {
  const intentData = React.useMemo(
    () =>
      Object.entries(intentDistribution || {})
        .sort(([, a], [, b]) => b - a)
        .map(([label, value], i) => ({ label, value, color: COLORS[i % COLORS.length] })),
    [intentDistribution]
  );
  const qualityData = React.useMemo(
    () =>
      Object.entries(qualityDistribution || {}).map(([label, value], i) => ({
        label,
        value,
        color: COLORS[i % COLORS.length],
      })),
    [qualityDistribution]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Content quality</CardTitle>
        <CardDescription>
          {totalChunks.toLocaleString()} chunks indexed · avg confidence {(avgConfidence * 100).toFixed(0)}%
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium text-[var(--color-text-muted)]">Intent distribution</p>
            <div className="flex items-center gap-4">
              <Donut data={intentData} />
              <div className="flex-1 min-w-0">
                <Legend data={intentData} />
              </div>
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-[var(--color-text-muted)]">Quality distribution</p>
            <div className="flex items-center gap-4">
              <Donut data={qualityData} />
              <div className="flex-1 min-w-0">
                <Legend data={qualityData} />
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
