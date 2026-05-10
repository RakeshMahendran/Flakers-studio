"use client";

/**
 * AuthSplitLayout — the canonical 50/50 auth shell.
 *
 * Left:  neutral surface, holds the form (login / register / forgot).
 * Right: full-bleed gradient mesh + a slot for marketing collateral
 *        (rotating quotes, onboarding preview, screenshot).
 *
 * Below 768px the right column collapses below the form (form first
 * because that's the primary action on mobile).
 *
 * The component composes design-system primitives — it does NOT
 * introduce new colors, spacings, or typography.
 */
import * as React from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/design-system";

export interface AuthSplitLayoutProps {
  /** The auth form content (left column on desktop). */
  children: React.ReactNode;
  /** Marketing / brand collateral (right column on desktop). */
  aside: React.ReactNode;
  /** Optional small label above the form heading, e.g. "Sign in". */
  eyebrow?: string;
  /** Form heading — large display weight. */
  title: string;
  /** Sub-copy under the heading. */
  subtitle?: string;
  /** Footer link rendered below the form (e.g. "Don't have an account?") */
  footer?: React.ReactNode;
}

export function AuthSplitLayout({
  children,
  aside,
  eyebrow,
  title,
  subtitle,
  footer,
}: AuthSplitLayoutProps) {
  return (
    <div className="min-h-screen bg-[var(--color-background)] text-[var(--color-text-primary)]">
      <div className="grid min-h-screen grid-cols-1 md:grid-cols-2">
        {/* ---------- Left: form column ---------- */}
        <section className="relative flex flex-col px-6 py-8 sm:px-10 md:px-12 md:py-12 lg:px-16">
          <header className="flex items-center justify-between">
            <Link
              href="/"
              className="group inline-flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background)]"
              aria-label="FlakersStudio home"
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[image:var(--gradient-brand)] text-white shadow-[var(--elevation-1)]">
                <span className="text-sm font-bold tracking-tight">FS</span>
              </span>
              <span className="text-sm font-semibold tracking-tight text-[var(--color-text-primary)]">
                FlakersStudio
              </span>
            </Link>
            <Link
              href="/"
              className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              Back to site
            </Link>
          </header>

          <div className="flex flex-1 items-center">
            <div className="mx-auto w-full max-w-md py-10 sm:py-14">
              {eyebrow ? (
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-brand)]">
                  {eyebrow}
                </p>
              ) : null}
              <h1
                className={cn(
                  "mt-3 text-3xl font-semibold tracking-tight text-[var(--color-text-primary)]",
                  "sm:text-4xl"
                )}
              >
                {title}
              </h1>
              {subtitle ? (
                <p className="mt-3 text-base text-[var(--color-text-secondary)]">
                  {subtitle}
                </p>
              ) : null}
              <div className="mt-8">{children}</div>
              {footer ? (
                <div className="mt-8 text-sm text-[var(--color-text-secondary)]">
                  {footer}
                </div>
              ) : null}
            </div>
          </div>

          <footer className="mt-auto flex items-center justify-between text-xs text-[var(--color-text-muted)]">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-[var(--color-trust)]" />
              <span>Tenant-isolated by design</span>
            </span>
            <span>&copy; {new Date().getFullYear()} FlakersStudio</span>
          </footer>
        </section>

        {/* ---------- Right: gradient mesh aside ---------- */}
        <aside
          className={cn(
            "relative isolate hidden overflow-hidden md:flex md:flex-col",
            "border-l border-[var(--color-border-subtle)]",
            "bg-[var(--color-background)]"
          )}
        >
          <div
            aria-hidden
            className="absolute -inset-[10%] -z-10 bg-gradient-mesh bg-[length:140%_140%] animate-mesh-drift"
          />
          {/* Inner gradient sheen */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-transparent via-transparent to-[var(--color-background)]/40"
          />
          <div className="flex flex-1 items-center justify-center p-10 lg:p-14">
            <div className="w-full max-w-lg">{aside}</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
