"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertOctagon, RefreshCw, Home } from "lucide-react";
import { Button, Card, CardContent } from "@/components/ui/primitives";

/**
 * Default error boundary for dashboard routes.
 * Caught by Next.js when a route throws during render.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error("[Dashboard route error]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-refuse-soft)] text-[var(--color-refuse-strong)]">
            <AlertOctagon className="h-6 w-6" />
          </span>
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              Something went wrong
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)]">
              {error.message || "An unexpected error occurred while loading this page."}
            </p>
            {error.digest ? (
              <p className="mt-2 font-mono text-xs text-[var(--color-text-tertiary)]">
                Error ID: {error.digest}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => router.push("/dashboard")}>
              <Home className="h-4 w-4" />
              Go to dashboard
            </Button>
            <Button variant="primary" size="sm" onClick={reset}>
              <RefreshCw className="h-4 w-4" />
              Try again
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
