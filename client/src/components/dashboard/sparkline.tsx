"use client";

/**
 * Sparkline — token-driven SVG line/area chart.
 *
 * Lightweight, dependency-free, and themed against the design system. Used by
 * the dashboard KPI tiles and assistant cards. Produces both a stroke and an
 * optional gradient fill underneath.
 */
import * as React from "react";
import { cn } from "@/lib/design-system";

export type SparklineTone = "trust" | "brand" | "caution" | "refuse" | "accent";

const STROKE_VAR: Record<SparklineTone, string> = {
  trust: "var(--color-trust)",
  brand: "var(--color-brand)",
  caution: "var(--color-caution)",
  refuse: "var(--color-refuse)",
  accent: "var(--color-accent)",
};

export interface SparklineProps extends Omit<React.SVGProps<SVGSVGElement>, "points"> {
  /** Numeric series — at least two points. */
  data: number[];
  /** Token tone used for stroke + area. */
  tone?: SparklineTone;
  /** Render the area underneath the line. */
  area?: boolean;
  /** Stroke width in SVG units. */
  strokeWidth?: number;
  /** Width of the SVG viewBox. */
  width?: number;
  /** Height of the SVG viewBox. */
  height?: number;
  /** Optional accessible label. */
  ariaLabel?: string;
}

export const Sparkline = React.memo(function Sparkline({
  data,
  tone = "trust",
  area = true,
  strokeWidth = 2,
  width = 120,
  height = 36,
  ariaLabel,
  className,
  ...rest
}: SparklineProps) {
  const reactId = React.useId();
  const gradId = reactId.replace(/:/g, "");

  // Memoize path calculations to avoid recalculating on every render
  const { linePath, areaPath, stroke } = React.useMemo(() => {
    if (!data || data.length < 2) {
      return { linePath: "", areaPath: "", stroke: STROKE_VAR[tone] };
    }

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const stepX = width / (data.length - 1);
    const padY = strokeWidth + 1;
    const innerH = height - padY * 2;

    const points = data.map((v, i) => {
      const x = i * stepX;
      const y = padY + innerH - ((v - min) / range) * innerH;
      return [x, y] as const;
    });

    const linePath = points
      .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
      .join(" ");

    const areaPath =
      `${linePath} L${(width).toFixed(2)},${height.toFixed(2)} L0,${height.toFixed(2)} Z`;

    const stroke = STROKE_VAR[tone];

    return { linePath, areaPath, stroke };
  }, [data, tone, width, height, strokeWidth]);

  if (!data || data.length < 2) {
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className={cn("block", className)}
        aria-hidden
        {...rest}
      />
    );
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      preserveAspectRatio="none"
      className={cn("block", className)}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      {...rest}
    >
      <defs>
        <linearGradient id={`sparkline-fill-${gradId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      {area ? (
        <path d={areaPath} fill={`url(#sparkline-fill-${gradId})`} />
      ) : null}
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
});
