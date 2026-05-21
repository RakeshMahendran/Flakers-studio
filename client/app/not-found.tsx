import Link from "next/link";
import { Compass, Home } from "lucide-react";

/**
 * 404 page rendered for any unmatched route.
 * No `(dashboard)` group so it works for unauthenticated visitors too.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)] px-4">
      <div className="w-full max-w-md rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-8 text-center shadow-[var(--elevation-2)]">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
          <Compass className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">
          Page not found
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          The page you&rsquo;re looking for doesn&rsquo;t exist or has been moved.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center gap-2 rounded-md bg-[var(--button-primary-bg)] px-4 text-sm font-medium text-[var(--button-primary-fg)] shadow-[var(--elevation-1)] hover:bg-[var(--button-primary-bg-hover)]"
          >
            <Home className="h-4 w-4" />
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
