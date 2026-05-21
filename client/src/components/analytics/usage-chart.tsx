"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/primitives";

export interface ChatVolumePoint {
  date: string;
  messages: number;
}

export interface AnswerRatePoint {
  date: string;
  answer_rate: number; // percentage 0-100
  total_messages: number;
}

interface UsageChartProps {
  chatVolume: ChatVolumePoint[];
  answerRates: AnswerRatePoint[];
}

const W = 600;
const H = 200;
const PAD = { top: 16, right: 28, bottom: 28, left: 36 };

/**
 * Interactive SVG chart: bars for daily chat volume + line overlay for
 * answer rate. All colors driven by CSS variables. Hover anywhere on the
 * chart to surface a tooltip with the day's data.
 */
export function UsageChart({ chatVolume, answerRates }: UsageChartProps) {
  const reactId = React.useId();
  const gradId = reactId.replace(/:/g, "");
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const [hoverIdx, setHoverIdx] = React.useState<number | null>(null);

  const { bars, linePoints, linePath, areaPath, xLabels, yLabelsLeft, yLabelsRight, step } =
    React.useMemo(() => {
      const n = chatVolume.length;
      if (n === 0) {
        return {
          bars: [],
          linePoints: [] as [number, number][],
          linePath: "",
          areaPath: "",
          xLabels: [],
          yLabelsLeft: [],
          yLabelsRight: [],
          step: 0,
        };
      }

      const innerW = W - PAD.left - PAD.right;
      const innerH = H - PAD.top - PAD.bottom;

      const maxVolume = Math.max(1, ...chatVolume.map((p) => p.messages));
      const step = innerW / n;
      const barW = step * 0.65;

      const bars = chatVolume.map((p, i) => {
        const x = PAD.left + i * step + (step - barW) / 2;
        const barH = (p.messages / maxVolume) * innerH;
        const y = PAD.top + innerH - barH;
        return { x, y, w: barW, h: barH, value: p.messages, date: p.date };
      });

      const lineRange = answerRates.length === n ? answerRates : answerRates.slice(0, n);
      const linePoints: [number, number][] = lineRange.map((p, i) => [
        PAD.left + i * step + step / 2,
        PAD.top + innerH - (Math.min(100, Math.max(0, p.answer_rate)) / 100) * innerH,
      ]);
      const linePath = linePoints
        .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
        .join(" ");
      const areaPath = linePoints.length
        ? `${linePath} L${(PAD.left + innerW).toFixed(2)},${(PAD.top + innerH).toFixed(2)} L${PAD.left.toFixed(2)},${(PAD.top + innerH).toFixed(2)} Z`
        : "";

      const xIndices = n <= 3 ? chatVolume.map((_, i) => i) : [0, Math.floor(n / 2), n - 1];
      const xLabels = xIndices.map((i) => ({
        x: PAD.left + i * step + step / 2,
        label: chatVolume[i].date.slice(5),
      }));

      const yLabelsLeft = [0, 0.5, 1].map((t) => ({
        y: PAD.top + innerH - t * innerH,
        label: Math.round(maxVolume * t).toString(),
      }));
      const yLabelsRight = [0, 50, 100].map((p) => ({
        y: PAD.top + innerH - (p / 100) * innerH,
        label: `${p}%`,
      }));

      return { bars, linePoints, linePath, areaPath, xLabels, yLabelsLeft, yLabelsRight, step };
    }, [chatVolume, answerRates]);

  const hasData = chatVolume.length > 0;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || step === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    // Map CSS x → SVG viewBox x using the SVG's preserveAspectRatio scale.
    const svgX = (cssX / rect.width) * W;
    const localX = svgX - PAD.left;
    if (localX < 0 || localX > W - PAD.left - PAD.right) {
      setHoverIdx(null);
      return;
    }
    const idx = Math.min(chatVolume.length - 1, Math.max(0, Math.floor(localX / step)));
    setHoverIdx(idx);
  };

  const handleMouseLeave = () => setHoverIdx(null);

  const hovered =
    hoverIdx !== null && hoverIdx >= 0 && hoverIdx < chatVolume.length
      ? {
          volume: chatVolume[hoverIdx],
          rate: answerRates[hoverIdx],
          x: PAD.left + hoverIdx * step + step / 2,
        }
      : null;

  // Position tooltip: keep it inside the chart bounds
  const tooltipLeftPct = hovered ? Math.max(8, Math.min(92, (hovered.x / W) * 100)) : 50;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chat volume &amp; answer rate</CardTitle>
        <CardDescription>Daily messages handled and the share that produced answers.</CardDescription>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="flex h-48 items-center justify-center text-sm text-[var(--color-text-tertiary)]">
            No data for this window yet.
          </div>
        ) : (
          <div className="relative">
            <div className="overflow-x-auto">
              <svg
                ref={svgRef}
                viewBox={`0 0 ${W} ${H}`}
                className="w-full cursor-crosshair"
                style={{ minWidth: 480 }}
                role="img"
                aria-label="Chat volume bars with answer rate line overlay"
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
              >
                <defs>
                  <linearGradient id={`area-${gradId}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-trust)" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="var(--color-trust)" stopOpacity={0} />
                  </linearGradient>
                </defs>

                {/* Y grid lines */}
                {yLabelsLeft.map((l, i) => (
                  <line
                    key={`grid-${i}`}
                    x1={PAD.left}
                    x2={W - PAD.right}
                    y1={l.y}
                    y2={l.y}
                    stroke="var(--color-border-subtle)"
                    strokeDasharray="2 3"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}

                {/* Bars */}
                {bars.map((b, i) => (
                  <rect
                    key={`bar-${i}`}
                    x={b.x}
                    y={b.y}
                    width={b.w}
                    height={Math.max(1, b.h)}
                    rx={2}
                    fill="var(--color-brand)"
                    fillOpacity={hoverIdx === i ? 0.95 : 0.7}
                    className="transition-[fill-opacity] duration-150"
                  />
                ))}

                {/* Answer rate area + line */}
                {areaPath ? <path d={areaPath} fill={`url(#area-${gradId})`} /> : null}
                {linePath ? (
                  <path
                    d={linePath}
                    fill="none"
                    stroke="var(--color-trust)"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}

                {/* Hover marker */}
                {hovered ? (
                  <>
                    <line
                      x1={hovered.x}
                      x2={hovered.x}
                      y1={PAD.top}
                      y2={H - PAD.bottom}
                      stroke="var(--color-text-tertiary)"
                      strokeDasharray="3 3"
                      vectorEffect="non-scaling-stroke"
                    />
                    {linePoints[hoverIdx ?? 0] ? (
                      <circle
                        cx={linePoints[hoverIdx ?? 0][0]}
                        cy={linePoints[hoverIdx ?? 0][1]}
                        r={4}
                        fill="var(--color-trust)"
                        stroke="var(--color-surface)"
                        strokeWidth={2}
                        vectorEffect="non-scaling-stroke"
                      />
                    ) : null}
                  </>
                ) : null}

                {/* Y labels left */}
                {yLabelsLeft.map((l, i) => (
                  <text
                    key={`yl-${i}`}
                    x={PAD.left - 6}
                    y={l.y}
                    textAnchor="end"
                    dominantBaseline="middle"
                    fontSize={10}
                    fill="var(--color-text-tertiary)"
                  >
                    {l.label}
                  </text>
                ))}

                {/* Y labels right */}
                {yLabelsRight.map((l, i) => (
                  <text
                    key={`yr-${i}`}
                    x={W - PAD.right + 6}
                    y={l.y}
                    textAnchor="start"
                    dominantBaseline="middle"
                    fontSize={10}
                    fill="var(--color-text-tertiary)"
                  >
                    {l.label}
                  </text>
                ))}

                {/* X labels */}
                {xLabels.map((l, i) => (
                  <text
                    key={`xl-${i}`}
                    x={l.x}
                    y={H - PAD.bottom + 14}
                    textAnchor="middle"
                    fontSize={10}
                    fill="var(--color-text-tertiary)"
                  >
                    {l.label}
                  </text>
                ))}
              </svg>
            </div>

            {/* Tooltip */}
            {hovered ? (
              <div
                className="pointer-events-none absolute top-2 z-10 -translate-x-1/2 rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface)] px-3 py-2 text-xs shadow-[var(--elevation-2)]"
                style={{ left: `${tooltipLeftPct}%` }}
              >
                <p className="font-semibold text-[var(--color-text-primary)]">
                  {hovered.volume.date}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="inline-flex h-2 w-2 rounded-sm bg-[var(--color-brand)] opacity-70" />
                  <span className="text-[var(--color-text-secondary)]">Messages</span>
                  <span className="ml-auto font-medium text-[var(--color-text-primary)] tabular-nums">
                    {hovered.volume.messages}
                  </span>
                </div>
                {hovered.rate ? (
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="inline-flex h-0.5 w-2 bg-[var(--color-trust)]" />
                    <span className="text-[var(--color-text-secondary)]">Answer rate</span>
                    <span className="ml-auto font-medium text-[var(--color-text-primary)] tabular-nums">
                      {hovered.rate.answer_rate.toFixed(1)}%
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Legend */}
            <div className="mt-3 flex items-center gap-4 text-xs text-[var(--color-text-secondary)]">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm bg-[var(--color-brand)] opacity-70" />
                Messages
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4 bg-[var(--color-trust)]" />
                Answer rate (%)
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
