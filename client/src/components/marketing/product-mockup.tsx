"use client";

/**
 * ProductMockup — illustrated browser frame containing a stylized chat
 * exchange that demonstrates governance in action.
 *
 * Pure SVG + Tailwind. No real screenshot dependency so the marketing site
 * can ship without a designer in the loop. Scales responsively and
 * re-themes against the design tokens.
 */
import * as React from "react";
import {
  CheckCircle2,
  Circle,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/design-system";

interface ProductMockupProps {
  className?: string;
}

export function ProductMockup({ className }: ProductMockupProps) {
  return (
    <div
      className={cn(
        "relative w-full rounded-2xl border border-[var(--color-border-default)]",
        "bg-[var(--color-surface)] shadow-[var(--elevation-4)]",
        "overflow-hidden",
        className
      )}
    >
      {/* Browser chrome */}
      <div className="flex items-center gap-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
        </div>
        <div className="ml-3 flex h-6 flex-1 items-center rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface)] px-2 text-[10px] text-[var(--color-text-tertiary)]">
          <span className="truncate">flakers.studio/assistant/acme-support</span>
        </div>
      </div>

      {/* App content */}
      <div className="grid gap-0 sm:grid-cols-[180px_1fr]">
        {/* Sidebar */}
        <aside className="hidden border-r border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] p-3 sm:block">
          <div className="mb-3 flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-[image:var(--gradient-brand)] text-[10px] font-bold text-white">
              FS
            </span>
            <span className="text-xs font-semibold text-[var(--color-text-primary)]">FlakersStudio</span>
          </div>
          <ul className="flex flex-col gap-0.5 text-[11px]">
            <SidebarItem label="Dashboard" />
            <SidebarItem label="Assistants" active />
            <SidebarItem label="Content" />
            <SidebarItem label="Analytics" />
            <SidebarItem label="Settings" />
          </ul>
        </aside>

        {/* Chat surface */}
        <div className="flex flex-col gap-3 p-4 sm:p-5">
          {/* User message */}
          <div className="ml-auto max-w-[80%]">
            <div className="rounded-2xl rounded-tr-sm bg-[var(--color-brand)] px-3 py-2 text-xs text-white">
              Can I get a refund after 30 days?
            </div>
          </div>

          {/* Refusal card (the differentiator) */}
          <div className="max-w-[88%]">
            <div className="rounded-2xl rounded-tl-sm border border-[var(--color-caution-border)] bg-[var(--color-caution-soft)] p-3">
              <div className="mb-1.5 flex items-center gap-1.5">
                <ShieldCheck className="h-3 w-3 text-[var(--color-caution-strong)]" />
                <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-caution-strong)]">
                  Refused — policy quote required
                </span>
              </div>
              <p className="text-xs leading-snug text-[var(--color-text-primary)]">
                The refund window is described in section 4 of our terms. I&rsquo;d need to quote
                that section verbatim, but I&rsquo;m not allowed to summarize it.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Tag>policy_quote_only</Tag>
                <Tag>confidence: 0.94</Tag>
              </div>
            </div>
          </div>

          {/* Answer card (the success case) */}
          <div className="max-w-[88%]">
            <div className="rounded-2xl rounded-tl-sm border border-[var(--color-trust-border)] bg-[var(--color-trust-soft)] p-3">
              <div className="mb-1.5 flex items-center gap-1.5">
                <CheckCircle2 className="h-3 w-3 text-[var(--color-trust-strong)]" />
                <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-trust-strong)]">
                  Answered with 3 sources
                </span>
              </div>
              <p className="text-xs leading-snug text-[var(--color-text-primary)]">
                Your subscription auto-renews 7 days before the period ends. You&rsquo;ll get an
                email reminder the day before.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <SourceTag>/billing#renewal</SourceTag>
                <SourceTag>/faq#renewal-email</SourceTag>
                <SourceTag>/terms#section-3</SourceTag>
              </div>
            </div>
          </div>

          {/* Composer */}
          <div className="mt-1 flex items-center gap-2 rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-surface)] px-3 py-1.5">
            <Sparkles className="h-3 w-3 text-[var(--color-text-tertiary)]" />
            <span className="flex-1 truncate text-[11px] text-[var(--color-text-tertiary)]">
              Ask anything about your knowledge base&hellip;
            </span>
            <span className="rounded-md bg-[var(--color-brand)] px-2 py-0.5 text-[10px] font-medium text-white">
              Send
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarItem({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <li
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2 py-1",
        active
          ? "bg-[var(--color-brand-soft)] text-[var(--color-brand)] font-medium"
          : "text-[var(--color-text-secondary)]"
      )}
    >
      <Circle className="h-1.5 w-1.5 fill-current" />
      {label}
    </li>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--color-caution-border)] bg-[var(--color-surface)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--color-caution-strong)]">
      {children}
    </span>
  );
}

function SourceTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--color-trust-border)] bg-[var(--color-surface)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--color-trust-strong)]">
      {children}
    </span>
  );
}
