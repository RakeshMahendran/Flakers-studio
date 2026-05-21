"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, ExternalLink, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/design-system";

export interface ScrapedUrlItem {
  url: string;
  title?: string | null;
  content_type?: string | null;
  content_length?: number | null;
  scraped_at?: string | null;
}

interface ScrapedUrlRowProps {
  item: ScrapedUrlItem;
  expanded: boolean;
  loading: boolean;
  content?: string;
  error?: string;
  onToggle: () => void;
}

function formatBytes(n?: number | null): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Single scraped URL row with expandable content preview.
 * Lazy-loads the raw content when expanded.
 */
export function ScrapedUrlRow({ item, expanded, loading, content, error, onToggle }: ScrapedUrlRowProps) {
  return (
    <div
      className={cn(
        "rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface)]",
        "overflow-hidden transition-colors"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 p-3 text-left hover:bg-[var(--color-surface-sunken)] focus-visible:outline-none focus-visible:bg-[var(--color-surface-sunken)]"
      >
        <span className="mt-0.5 text-[var(--color-text-tertiary)]">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          {item.title ? (
            <div className="truncate text-sm font-medium text-[var(--color-text-primary)]">
              {item.title}
            </div>
          ) : null}
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:underline"
          >
            <span className="truncate max-w-md">{item.url}</span>
            <ExternalLink className="h-3 w-3" />
          </a>
          <div className="mt-1.5 flex items-center gap-2">
            {item.content_type ? <Badge variant="neutral">{item.content_type}</Badge> : null}
            <span className="text-xs text-[var(--color-text-tertiary)]">
              {formatBytes(item.content_length)}
            </span>
          </div>
        </div>
      </button>
      {expanded ? (
        <div className="border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] p-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading content…
            </div>
          ) : error ? (
            <p className="text-sm text-[var(--color-refuse)]">{error}</p>
          ) : (
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-[var(--color-text-primary)]">
              {content || "(empty)"}
            </pre>
          )}
        </div>
      ) : null}
    </div>
  );
}
