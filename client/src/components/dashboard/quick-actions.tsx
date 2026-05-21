"use client";

/**
 * QuickActions — 4 short-cut cards directly below the hero.
 * Each card surfaces an entry point into a higher-order workflow
 * (add a WordPress site, upload PDFs, edit governance rules, view
 * analytics). On hover, a gradient ring fades in.
 */
import * as React from "react";
import { ChartArea, FileStack, FolderOpen, Globe } from "lucide-react";
import { cn } from "@/lib/design-system";

export interface QuickAction {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  onSelect: () => void;
}

interface QuickActionsProps {
  onAddSite: () => void;
  onUploadDocs: () => void;
  onEditGovernance: () => void;
  onViewAnalytics: () => void;
}

export function QuickActions({
  onAddSite,
  onUploadDocs,
  onEditGovernance,
  onViewAnalytics,
}: QuickActionsProps) {
  const items: QuickAction[] = [
    {
      id: "add-site",
      label: "Add WordPress site",
      description: "Crawl a site as a knowledge source",
      icon: Globe,
      onSelect: onAddSite,
    },
    {
      id: "upload",
      label: "Upload documents",
      description: "PDFs, manuals & policies",
      icon: FileStack,
      onSelect: onUploadDocs,
    },
    {
      id: "content",
      label: "Browse content",
      description: "Projects, scraped URLs, jobs",
      icon: FolderOpen,
      onSelect: onEditGovernance,
    },
    {
      id: "analytics",
      label: "View analytics",
      description: "Conversations & answer rate",
      icon: ChartArea,
      onSelect: onViewAnalytics,
    },
  ];

  return (
    <section aria-label="Quick actions" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={item.onSelect}
            className={cn(
              "group relative flex items-start gap-3 rounded-xl border p-4 text-left",
              "border-[var(--color-border-subtle)] bg-[var(--color-surface)]",
              "transition-[transform,box-shadow,border-color] duration-[var(--duration-base)] ease-[var(--ease-out)]",
              "hover:-translate-y-0.5 hover:border-[var(--color-brand-border)] hover:shadow-[var(--elevation-2)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
            )}
          >
            {/* Gradient ring on hover */}
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
            <span
              className={cn(
                "relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                "border border-[var(--color-border-subtle)]",
                "bg-[var(--color-surface-sunken)] text-[var(--color-text-secondary)]",
                "transition-colors group-hover:bg-[var(--color-brand-soft)] group-hover:text-[var(--color-brand)]"
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            <span className="relative flex min-w-0 flex-col">
              <span className="text-sm font-medium leading-tight text-[var(--color-text-primary)]">
                {item.label}
              </span>
              <span className="mt-0.5 line-clamp-1 text-xs text-[var(--color-text-muted)]">
                {item.description}
              </span>
            </span>
          </button>
        );
      })}
    </section>
  );
}
