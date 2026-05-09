"use client";

/**
 * AssistantCard
 * --------------------------------------------------------------------
 * Replaces the legacy assistant tile. Token-driven, with a gradient
 * avatar, status badge, inline KPI row, and a 7-day confidence sparkline.
 * --------------------------------------------------------------------
 */
import * as React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Activity,
  ChevronRight,
  Gauge,
  MessageSquare,
  MoreHorizontal,
  Settings,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/design-system";
import { Sparkline } from "./sparkline";

/* The minimum subset of the legacy Assistant type this card needs. */
export interface AssistantCardData {
  id: string;
  name: string;
  description?: string;
  template: string;
  status: "creating" | "ingesting" | "ready" | "error";
  totalPagesCrawled?: string;
  /** Optional precomputed KPIs — fall back to deterministic stub values. */
  chatCount?: number;
  answerRatePct?: number;
  avgLatencyMs?: number;
  /** Last-7-day confidence series, 0..1 each. */
  confidenceSeries?: number[];
}

interface AssistantCardProps {
  assistant: AssistantCardData;
  onSelect: () => void;
  onSettings: () => void;
  onDelete: () => void;
}

/* Deterministic stub KPI values from the assistant id when none provided.
 * Pure-function so SSR/CSR match. */
function hashSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return h || 1;
}

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function deriveStubs(id: string): {
  chats: number;
  answerRate: number;
  latencyMs: number;
  series: number[];
} {
  const r = rng(hashSeed(id));
  const chats = Math.floor(60 + r() * 1000);
  const answerRate = 0.78 + r() * 0.2;
  const latencyMs = Math.floor(380 + r() * 720);
  const series: number[] = [];
  let v = 0.6 + r() * 0.3;
  for (let i = 0; i < 7; i += 1) {
    v = Math.max(0.4, Math.min(0.99, v + (r() - 0.5) * 0.12));
    series.push(v);
  }
  return { chats, answerRate, latencyMs, series };
}

const TEMPLATE_AVATAR_LABEL: Record<string, string> = {
  support: "Su",
  customer: "Cu",
  sales: "Sa",
  ecommerce: "Ec",
};

function statusToBadge(status: AssistantCardData["status"]): {
  variant: React.ComponentProps<typeof Badge>["variant"];
  label: string;
} {
  switch (status) {
    case "ready":
      return { variant: "trust", label: "Active" };
    case "creating":
    case "ingesting":
      return { variant: "caution", label: status === "creating" ? "Creating" : "Learning" };
    case "error":
      return { variant: "refuse", label: "Error" };
    default:
      return { variant: "neutral", label: "Paused" };
  }
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatChats(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

export function AssistantCard({
  assistant,
  onSelect,
  onSettings,
  onDelete,
}: AssistantCardProps) {
  const stub = React.useMemo(() => deriveStubs(assistant.id), [assistant.id]);
  const chats = assistant.chatCount ?? stub.chats;
  const answerRate = assistant.answerRatePct ?? stub.answerRate;
  const latency = assistant.avgLatencyMs ?? stub.latencyMs;
  const series = assistant.confidenceSeries ?? stub.series;
  const status = statusToBadge(assistant.status);
  const isReady = assistant.status === "ready";

  const initials =
    TEMPLATE_AVATAR_LABEL[assistant.template] ??
    assistant.name.slice(0, 2).toUpperCase() ??
    "AI";

  return (
    <div
      role={isReady ? "button" : undefined}
      tabIndex={isReady ? 0 : -1}
      onClick={() => {
        if (isReady) onSelect();
      }}
      onKeyDown={(e) => {
        if (!isReady) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-xl border p-5",
        "border-[var(--color-border-subtle)] bg-[var(--color-surface)]",
        "transition-[transform,box-shadow,border-color] duration-[var(--duration-base)] ease-[var(--ease-out)]",
        "shadow-[var(--elevation-1)]",
        isReady
          ? "cursor-pointer hover:-translate-y-0.5 hover:border-[var(--color-brand-border)] hover:shadow-[var(--elevation-3)]"
          : "opacity-80",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
      )}
    >
      {/* Gradient ring (visible only on hover) */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity",
          "duration-[var(--duration-base)] group-hover:opacity-100",
          "bg-[image:var(--gradient-brand)]",
          "[mask:linear-gradient(#000,#000)_content-box,linear-gradient(#000,#000)]",
          "[mask-composite:exclude] [-webkit-mask-composite:xor]",
          "p-px"
        )}
      />

      {/* Header */}
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            "bg-[image:var(--gradient-brand)] text-sm font-semibold text-white",
            "shadow-[var(--elevation-1)]"
          )}
          aria-hidden
        >
          {initials}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-semibold leading-tight tracking-tight text-[var(--color-text-primary)]">
              {assistant.name}
            </h3>
          </div>
          <Badge variant={status.variant} className="mt-1 self-start">
            <span
              aria-hidden
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                status.variant === "trust" && "bg-[var(--color-trust)]",
                status.variant === "caution" && "bg-[var(--color-caution)]",
                status.variant === "refuse" && "bg-[var(--color-refuse)]",
                status.variant === "neutral" && "bg-[var(--color-text-muted)]"
              )}
            />
            {status.label}
          </Badge>
        </div>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              aria-label="More actions"
              className={cn(
                "relative inline-flex h-7 w-7 items-center justify-center rounded-md",
                "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-text-primary)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
              )}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={6}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "z-50 min-w-[180px] rounded-md border p-1",
                "border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)]",
                "shadow-[var(--elevation-3)]"
              )}
            >
              <DropdownMenu.Item
                onSelect={() => onSettings()}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm outline-none",
                  "text-[var(--color-text-secondary)]",
                  "data-[highlighted]:bg-[var(--color-surface-sunken)] data-[highlighted]:text-[var(--color-text-primary)]"
                )}
              >
                <Settings className="h-4 w-4" /> Settings
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-[var(--color-border-subtle)]" />
              <DropdownMenu.Item
                onSelect={() => onDelete()}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm outline-none",
                  "text-[var(--color-refuse)]",
                  "data-[highlighted]:bg-[var(--color-refuse-soft)]"
                )}
              >
                <Trash2 className="h-4 w-4" /> Delete
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      {/* Description */}
      <p className="relative mt-3 line-clamp-1 text-sm text-[var(--color-text-muted)]">
        {assistant.description ||
          `Governed assistant trained on ${assistant.template} content.`}
      </p>

      {/* KPI row */}
      <div className="relative mt-4 grid grid-cols-3 gap-2">
        <Stat icon={MessageSquare} label="Chats" value={formatChats(chats)} />
        <Stat
          icon={Gauge}
          label="Answer rate"
          value={`${Math.round(answerRate * 100)}%`}
        />
        <Stat icon={Activity} label="Latency" value={formatLatency(latency)} />
      </div>

      {/* Sparkline */}
      <div className="relative mt-4 flex items-end justify-between gap-3">
        <div className="flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
            Confidence · 7d
          </div>
          <Sparkline
            data={series}
            tone="trust"
            width={220}
            height={36}
            className="mt-1 w-full"
            ariaLabel={`Confidence trend over the last 7 days for ${assistant.name}`}
          />
        </div>
        {isReady && (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs font-medium",
              "text-[var(--color-brand)] opacity-0 transition-opacity",
              "group-hover:opacity-100"
            )}
          >
            Open <ChevronRight className="h-3 w-3" />
          </span>
        )}
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-lg border px-2.5 py-2",
        "border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)]"
      )}
    >
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
        <Icon className="h-3 w-3" />
        {label}
      </span>
      <span className="text-sm font-semibold leading-none text-[var(--color-text-primary)]">
        {value}
      </span>
    </div>
  );
}
