"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  ChevronDown,
  ExternalLink,
  FileText,
  Filter,
  Globe,
  TrendingUp,
} from "lucide-react";

import { Card, Chip } from "@/components/ui/primitives";
import { cn, confidenceColor } from "@/lib/design-system";
import type { GovernanceSource } from "./types";

interface SourceExplorerProps {
  sources: GovernanceSource[];
  /** Optional initial filter — useful when the explorer is opened from
   * a specific chip. */
  initialQuery?: string;
  /** Optional preselected source — that card will be expanded on mount. */
  initialExpandedId?: string;
  className?: string;
}

/**
 * SourceExplorer
 *
 * Card grid (≥md) / list (<md) of all sources cited for the current
 * decision. Each card shows favicon, title, host, relevance bar, and a
 * 3-line snippet. Click a card to expand it and see the full retrieved
 * chunk text plus metadata pills.
 *
 * The filter bar reads `metadata.year`, `metadata.category`,
 * `metadata.sourceType` (populated by feat/rich-metadata-extraction).
 */
export function SourceExplorer({
  sources,
  initialQuery = "",
  initialExpandedId,
  className,
}: SourceExplorerProps) {
  const [expandedId, setExpandedId] = React.useState<string | null>(
    initialExpandedId ?? null,
  );
  const [query, setQuery] = React.useState(initialQuery);
  const [activeType, setActiveType] = React.useState<string | null>(null);
  const [activeYear, setActiveYear] = React.useState<string | null>(null);
  const [activeCategory, setActiveCategory] = React.useState<string | null>(
    null,
  );

  const types = React.useMemo(
    () =>
      uniq(
        sources
          .map((s) => s.metadata?.sourceType)
          .filter(Boolean) as string[],
      ),
    [sources],
  );
  const years = React.useMemo(
    () =>
      uniq(
        sources
          .map((s) => s.metadata?.year?.toString())
          .filter(Boolean) as string[],
      ).sort((a, b) => b.localeCompare(a)),
    [sources],
  );
  const categories = React.useMemo(
    () =>
      uniq(
        sources
          .map((s) => s.metadata?.category)
          .filter(Boolean) as string[],
      ),
    [sources],
  );

  const filtered = React.useMemo(() => {
    return sources.filter((s) => {
      if (
        activeType &&
        s.metadata?.sourceType?.toString() !== activeType
      )
        return false;
      if (
        activeYear &&
        s.metadata?.year?.toString() !== activeYear
      )
        return false;
      if (
        activeCategory &&
        s.metadata?.category?.toString() !== activeCategory
      )
        return false;
      if (query) {
        const q = query.toLowerCase();
        if (
          !s.title.toLowerCase().includes(q) &&
          !s.snippet.toLowerCase().includes(q) &&
          !s.url.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [sources, activeType, activeYear, activeCategory, query]);

  const avgRelevance =
    sources.length === 0
      ? 0
      : sources.reduce((sum, s) => sum + s.relevanceScore, 0) /
        sources.length;
  const highConfidence = sources.filter((s) => s.relevanceScore >= 0.8).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className={cn("space-y-4", className)}
    >
      {/* Heading */}
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-[var(--color-brand)]" aria-hidden />
        <h3 className="text-base font-semibold tracking-tight text-[var(--color-text-primary)]">
          Sources ({sources.length})
        </h3>
      </div>

      {/* Filter bar */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-lg border p-2",
          "bg-[var(--color-surface-sunken)] border-[var(--color-border-subtle)]",
        )}
      >
        <Filter
          className="h-3.5 w-3.5 ml-1 text-[var(--color-text-muted)]"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search sources..."
          aria-label="Search sources"
          className={cn(
            "h-7 min-w-[120px] flex-1 max-w-[220px] rounded-md px-2 text-xs",
            "bg-[var(--color-surface)] text-[var(--color-text-primary)]",
            "border border-[var(--color-border-subtle)]",
            "placeholder:text-[var(--color-text-muted)]",
            "focus-visible:outline-none focus-visible:border-[var(--color-focus-ring)]",
          )}
        />
        <FilterGroup
          label="Type"
          options={types}
          value={activeType}
          onChange={setActiveType}
        />
        <FilterGroup
          label="Year"
          options={years}
          value={activeYear}
          onChange={setActiveYear}
        />
        <FilterGroup
          label="Category"
          options={categories}
          value={activeCategory}
          onChange={setActiveCategory}
        />
      </div>

      {/* Source cards */}
      <div
        className={cn(
          "grid gap-3",
          "grid-cols-1",
          // Card grid on wider widths
          "md:grid-cols-2",
        )}
      >
        {filtered.map((source) => (
          <SourceCard
            key={source.id}
            source={source}
            expanded={expandedId === source.id}
            onToggle={() =>
              setExpandedId(expandedId === source.id ? null : source.id)
            }
          />
        ))}
        {filtered.length === 0 ? (
          <div
            className={cn(
              "col-span-full rounded-lg border-2 border-dashed",
              "border-[var(--color-border-subtle)]",
              "px-4 py-8 text-center text-sm text-[var(--color-text-muted)]",
            )}
          >
            No sources match the active filters.
          </div>
        ) : null}
      </div>

      {/* Summary */}
      {sources.length > 0 ? (
        <div
          className={cn(
            "rounded-lg border px-3 py-2 text-xs",
            "bg-[var(--color-brand-soft)] border-[var(--color-brand-border)]",
            "text-[var(--color-brand)]",
          )}
        >
          <span className="font-semibold">{highConfidence}</span> high-relevance
          source{highConfidence === 1 ? "" : "s"} ·{" "}
          <span className="font-semibold">
            {Math.round(avgRelevance * 100)}%
          </span>{" "}
          average relevance
        </div>
      ) : null}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Source card                                                         */
/* ------------------------------------------------------------------ */
function SourceCard({
  source,
  expanded,
  onToggle,
}: {
  source: GovernanceSource;
  expanded: boolean;
  onToggle: () => void;
}) {
  const host = React.useMemo(() => {
    try {
      return new URL(source.url).host.replace(/^www\./, "");
    } catch {
      return source.url;
    }
  }, [source.url]);

  const tone = confidenceColor(source.relevanceScore);
  const pct = Math.round(
    Math.max(0, Math.min(1, source.relevanceScore)) * 100,
  );

  const barColor =
    tone === "trust"
      ? "bg-[var(--color-trust)]"
      : tone === "caution"
        ? "bg-[var(--color-caution)]"
        : "bg-[var(--color-refuse)]";
  const scoreText =
    tone === "trust"
      ? "text-[var(--color-trust-strong)]"
      : tone === "caution"
        ? "text-[var(--color-caution-strong)]"
        : "text-[var(--color-refuse-strong)]";

  return (
    <Card
      elevation={1}
      padding="none"
      className={cn(
        "overflow-hidden transition-shadow duration-[var(--duration-base)]",
        "hover:shadow-[var(--elevation-2)]",
      )}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-3 p-4 pb-2">
        <div className="flex items-start gap-2.5 min-w-0">
          {source.faviconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={source.faviconUrl}
              alt=""
              className="mt-0.5 h-4 w-4 rounded-sm"
            />
          ) : source.url.startsWith("http") ? (
            <Globe
              className="mt-0.5 h-4 w-4 text-[var(--color-text-muted)] shrink-0"
              aria-hidden
            />
          ) : (
            <FileText
              className="mt-0.5 h-4 w-4 text-[var(--color-text-muted)] shrink-0"
              aria-hidden
            />
          )}
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-semibold leading-tight text-[var(--color-text-primary)] truncate">
              {source.title}
            </h4>
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "mt-0.5 inline-flex items-center gap-1 text-xs",
                "text-[var(--color-text-muted)] hover:text-[var(--color-brand)]",
                "focus-visible:outline-none focus-visible:underline",
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <span className="truncate max-w-[200px]">{host}</span>
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          </div>
        </div>

        <div
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 shrink-0",
            "bg-[var(--color-surface-sunken)] border-[var(--color-border-subtle)]",
          )}
          title={`Relevance ${pct}%`}
        >
          <TrendingUp
            className={cn("h-3 w-3", scoreText)}
            aria-hidden
          />
          <span className={cn("text-[10px] font-bold tabular-nums", scoreText)}>
            {pct}%
          </span>
        </div>
      </div>

      {/* Relevance bar */}
      <div className="mx-4 mb-2">
        <div
          className={cn(
            "h-1 w-full rounded-full overflow-hidden",
            "bg-[var(--color-border-subtle)]",
          )}
          aria-label={`Relevance score: ${pct}%`}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={cn("h-full rounded-full", barColor)}
            style={{
              width: `${pct}%`,
              transition: "width var(--duration-slow) var(--ease-out)",
            }}
          />
        </div>
      </div>

      {/* Snippet */}
      <div className="px-4 pb-2">
        <p
          className={cn(
            "text-xs leading-relaxed text-[var(--color-text-secondary)]",
            !expanded && "line-clamp-3",
          )}
        >
          {source.snippet || "(no snippet provided)"}
        </p>
      </div>

      {/* Metadata pills + expand toggle */}
      <div
        className={cn(
          "flex items-center justify-between gap-2 px-4 py-2",
          "border-t border-[var(--color-border-subtle)]",
          "bg-[var(--color-surface-sunken)]/60",
        )}
      >
        <div className="flex flex-wrap items-center gap-1">
          {source.metadata?.year ? (
            <Chip variant="tag" className="text-[10px]">
              {source.metadata.year}
            </Chip>
          ) : null}
          {source.metadata?.category ? (
            <Chip variant="tag" className="text-[10px]">
              {source.metadata.category}
            </Chip>
          ) : null}
          {source.metadata?.sourceType ? (
            <Chip variant="tag" className="text-[10px]">
              {source.metadata.sourceType}
            </Chip>
          ) : null}
          {source.metadata?.chunkIndex != null ? (
            <Chip variant="tag" className="text-[10px] font-mono">
              #{source.metadata.chunkIndex}
            </Chip>
          ) : null}
          {source.intent && !source.metadata?.category ? (
            <Chip variant="tag" className="text-[10px]">
              {source.intent}
            </Chip>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium",
            "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]",
            "transition-colors duration-[var(--duration-fast)]",
          )}
        >
          {expanded ? "Show less" : "Show more"}
          <ChevronDown
            className={cn(
              "h-3 w-3 transition-transform duration-[var(--duration-fast)]",
              expanded && "rotate-180",
            )}
            aria-hidden
          />
        </button>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Filter group                                                        */
/* ------------------------------------------------------------------ */
function FilterGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
        {label}
      </span>
      {options.map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(active ? null : opt)}
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]",
              active
                ? "bg-[var(--color-brand-soft)] text-[var(--color-brand)] border border-[var(--color-brand-border)]"
                : "bg-[var(--color-surface)] text-[var(--color-text-muted)] border border-[var(--color-border-subtle)] hover:text-[var(--color-text-primary)]",
            )}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
