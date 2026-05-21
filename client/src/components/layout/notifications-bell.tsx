"use client";

/**
 * NotificationsBell — popover surfacing active ingestion jobs as notifications.
 *
 * Polls `/api/v1/status/jobs/active` every 15s. Shows a green dot when there
 * are active jobs. Clicking the bell opens a popover listing the jobs with a
 * deep-link to the Content page for follow-up.
 */
import * as React from "react";
import * as Popover from "@radix-ui/react-popover";
import { useRouter } from "next/navigation";
import { Bell, Database, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/design-system";
import { Badge } from "@/components/ui/primitives";
import { useAuth } from "@/contexts/auth-context";
import { apiGet } from "@/lib/api-client";

interface ActiveJob {
  job_id: string;
  assistant_id: string;
  status: string;
  current_stage?: string | null;
  urls_discovered: number;
  urls_scraped: number;
  chunks_created: number;
  started_at?: string | null;
}

function timeAgo(iso?: string | null): string {
  if (!iso) return "just now";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "just now";
  const diff = (Date.now() - then) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

export function NotificationsBell() {
  const router = useRouter();
  const { user } = useAuth();
  const [jobs, setJobs] = React.useState<ActiveJob[]>([]);

  React.useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const fetchJobs = async () => {
      try {
        const res = await apiGet("/api/v1/status/jobs/active", user.accessToken);
        if (!cancelled && res.ok) {
          const data = await res.json();
          setJobs(Array.isArray(data.active_jobs) ? data.active_jobs : []);
        }
      } catch {
        /* swallow */
      }
    };
    fetchJobs();
    const interval = setInterval(fetchJobs, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user]);

  const hasNotifications = jobs.length > 0;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={
            hasNotifications
              ? `Notifications. ${jobs.length} active ingestion ${
                  jobs.length === 1 ? "job" : "jobs"
                }.`
              : "Notifications. No new notifications."
          }
          className={cn(
            "relative inline-flex h-9 w-9 min-h-[44px] min-w-[44px] items-center justify-center rounded-md",
            "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-text-primary)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
          )}
        >
          <Bell className="h-4 w-4" />
          {hasNotifications ? (
            <span
              className={cn(
                "absolute right-2 top-2 h-2 w-2 rounded-full",
                "bg-[var(--color-caution)] ring-2 ring-[var(--color-surface)]"
              )}
              aria-hidden
              role="status"
            />
          ) : null}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className={cn(
            "z-50 w-80 rounded-lg border border-[var(--color-border-subtle)]",
            "bg-[var(--color-surface)] shadow-[var(--elevation-3)]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=open]:fade-in data-[state=closed]:fade-out"
          )}
        >
          <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-4 py-3">
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">Notifications</p>
            <Badge variant={hasNotifications ? "caution" : "neutral"}>
              {jobs.length} active
            </Badge>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {!hasNotifications ? (
              <div className="flex flex-col items-center gap-2 p-8 text-center">
                <Sparkles className="h-6 w-6 text-[var(--color-text-tertiary)]" />
                <p className="text-sm text-[var(--color-text-secondary)]">All caught up</p>
                <p className="text-xs text-[var(--color-text-tertiary)]">
                  No active ingestion jobs.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col">
                {jobs.map((job) => (
                  <li
                    key={job.job_id}
                    className="border-b border-[var(--color-border-subtle)] last:border-0"
                  >
                    <button
                      type="button"
                      onClick={() => router.push("/content")}
                      className="flex w-full items-start gap-3 p-3 text-left hover:bg-[var(--color-surface-sunken)] focus-visible:outline-none focus-visible:bg-[var(--color-surface-sunken)]"
                    >
                      <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--color-caution-soft)] text-[var(--color-caution-strong)]">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                            Ingesting content
                          </span>
                          <Badge variant="caution">{job.current_stage || job.status}</Badge>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                          <Database className="h-3 w-3" />
                          <span>
                            {job.urls_scraped}/{job.urls_discovered} URLs ·{" "}
                            {job.chunks_created} chunks
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
                          Started {timeAgo(job.started_at)}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {hasNotifications ? (
            <div className="border-t border-[var(--color-border-subtle)] px-4 py-2.5">
              <button
                type="button"
                onClick={() => router.push("/content")}
                className="text-xs font-medium text-[var(--color-brand)] hover:underline"
              >
                View all in Content →
              </button>
            </div>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
