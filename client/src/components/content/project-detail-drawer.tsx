"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Bot,
  Calendar,
  Database,
  ExternalLink,
  Loader2,
  RefreshCw,
  X,
  XCircle,
} from "lucide-react";
import { Badge, Button, Skeleton } from "@/components/ui/primitives";
import { cn } from "@/lib/design-system";
import { apiGet, apiPost } from "@/lib/api-client";
import type { ProjectRecord } from "./project-list";
import { ScrapedUrlRow, type ScrapedUrlItem } from "./scraped-url-row";

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

interface AssistantBrief {
  id: string;
  name: string;
  status: string;
  totalPagesCrawled: string;
  totalChunksIndexed: string;
}

interface ProjectDetailDrawerProps {
  project: ProjectRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assistants: AssistantBrief[];
  activeJobs: ActiveJob[];
  /** Auth token for fetching scraped content. */
  token?: string;
}

function statusVariant(status: string): "trust" | "caution" | "refuse" | "neutral" {
  const s = status.toLowerCase();
  if (s === "active" || s === "ready" || s === "completed") return "trust";
  if (s === "deleting" || s === "ingesting" || s === "running" || s === "creating") return "caution";
  if (s === "deleted" || s === "error" || s === "failed") return "refuse";
  return "neutral";
}

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * Right-side detail drawer for a project.
 * Shows project metadata, assistants in scope, active ingestion jobs,
 * and (when a job is selected) a list of scraped URLs with expandable
 * content preview.
 */
export function ProjectDetailDrawer({
  project,
  open,
  onOpenChange,
  assistants,
  activeJobs,
  token,
}: ProjectDetailDrawerProps) {
  const [selectedJobId, setSelectedJobId] = React.useState<string | null>(null);
  const [urls, setUrls] = React.useState<ScrapedUrlItem[]>([]);
  const [loadingUrls, setLoadingUrls] = React.useState(false);
  const [urlsError, setUrlsError] = React.useState<string | null>(null);

  // Content preview cache: keyed by URL.
  const [expandedUrl, setExpandedUrl] = React.useState<string | null>(null);
  const [contentCache, setContentCache] = React.useState<Record<string, { loading: boolean; content?: string; error?: string }>>({});

  const [actingJobIds, setActingJobIds] = React.useState<Set<string>>(new Set());

  const runJobAction = async (jobId: string, action: "cancel" | "restart") => {
    if (!token) return;
    if (action === "cancel" && !confirm("Cancel this ingestion job?")) return;
    setActingJobIds((s) => new Set(s).add(jobId));
    try {
      const res = await apiPost(`/api/v1/status/job/${jobId}/${action}`, undefined, token);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || `Failed to ${action} job (${res.status})`);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : `Failed to ${action} job`);
    } finally {
      setActingJobIds((s) => {
        const next = new Set(s);
        next.delete(jobId);
        return next;
      });
    }
  };

  // Reset state when the drawer opens for a different project.
  React.useEffect(() => {
    if (!open) {
      setSelectedJobId(null);
      setUrls([]);
      setUrlsError(null);
      setExpandedUrl(null);
      setContentCache({});
    }
  }, [open]);

  // Fetch URLs when a job is selected.
  React.useEffect(() => {
    let cancelled = false;
    if (!selectedJobId || !token) {
      setUrls([]);
      return;
    }
    setLoadingUrls(true);
    setUrlsError(null);
    (async () => {
      try {
        const res = await apiGet(`/api/projects/website/scrape/${selectedJobId}/urls`, token);
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setUrls(Array.isArray(data.urls) ? data.urls : []);
        } else {
          const err = await res.json().catch(() => ({}));
          setUrlsError(err.detail || `Failed to load URLs (${res.status})`);
        }
      } catch (e) {
        if (!cancelled) setUrlsError(e instanceof Error ? e.message : "Failed to load URLs");
      } finally {
        if (!cancelled) setLoadingUrls(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedJobId, token]);

  const toggleUrl = async (url: string) => {
    if (expandedUrl === url) {
      setExpandedUrl(null);
      return;
    }
    setExpandedUrl(url);
    if (contentCache[url] || !selectedJobId || !token) return;
    setContentCache((c) => ({ ...c, [url]: { loading: true } }));
    try {
      const res = await apiGet(
        `/api/projects/website/scrape/${selectedJobId}/content?url=${encodeURIComponent(url)}`,
        token
      );
      if (res.ok) {
        const data = await res.json();
        setContentCache((c) => ({ ...c, [url]: { loading: false, content: data.raw_content || "" } }));
      } else {
        const err = await res.json().catch(() => ({}));
        setContentCache((c) => ({
          ...c,
          [url]: { loading: false, error: err.detail || `Failed (${res.status})` },
        }));
      }
    } catch (e) {
      setContentCache((c) => ({
        ...c,
        [url]: {
          loading: false,
          error: e instanceof Error ? e.message : "Failed to load content",
        },
      }));
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            "fixed inset-0 z-40 bg-[var(--color-overlay)]/50 backdrop-blur-sm",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=open]:fade-in data-[state=closed]:fade-out"
          )}
        />
        <Dialog.Content
          className={cn(
            "fixed inset-y-0 right-0 z-50 w-full max-w-2xl",
            "bg-[var(--color-surface)] shadow-[var(--elevation-3)]",
            "flex flex-col",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right"
          )}
        >
          <header className="flex items-start justify-between gap-4 border-b border-[var(--color-border-subtle)] p-6">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="truncate text-lg font-semibold text-[var(--color-text-primary)]">
                {project?.name ?? "Project"}
              </Dialog.Title>
              {project?.description ? (
                <Dialog.Description className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  {project.description}
                </Dialog.Description>
              ) : null}
              <div className="mt-3 flex items-center gap-2">
                {project ? (
                  <Badge variant={statusVariant(project.status)}>{project.status}</Badge>
                ) : null}
                <span className="inline-flex items-center gap-1 text-xs text-[var(--color-text-tertiary)]">
                  <Calendar className="h-3 w-3" />
                  Created {formatDate(project?.created_at)}
                </span>
              </div>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <X className="h-5 w-5" />
              </Button>
            </Dialog.Close>
          </header>

          <div className="flex-1 overflow-y-auto p-6">
            {/* Assistants section */}
            <section className="mb-6">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
                <Bot className="h-4 w-4" />
                Assistants ({assistants.length})
              </h3>
              {assistants.length === 0 ? (
                <div className="rounded-md border border-dashed border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] p-4 text-center text-sm text-[var(--color-text-secondary)]">
                  No assistants in this project yet.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {assistants.map((a) => (
                    <a
                      key={a.id}
                      href={`/assistant/${a.id}/review`}
                      className="flex items-center justify-between rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-3 transition-[border-color,box-shadow] hover:border-[var(--color-border-default)] hover:shadow-[var(--elevation-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                            {a.name}
                          </span>
                          <Badge variant={statusVariant(a.status)}>{a.status}</Badge>
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-xs text-[var(--color-text-tertiary)]">
                          <span>{a.totalPagesCrawled || "0"} pages</span>
                          <span>{a.totalChunksIndexed || "0"} chunks</span>
                        </div>
                      </div>
                      <ExternalLink className="h-4 w-4 text-[var(--color-text-tertiary)]" />
                    </a>
                  ))}
                </div>
              )}
            </section>

            {/* Active ingestion jobs */}
            <section className="mb-6">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
                <Loader2 className="h-4 w-4" />
                Active jobs ({activeJobs.length})
              </h3>
              {activeJobs.length === 0 ? (
                <div className="rounded-md border border-dashed border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] p-4 text-center text-sm text-[var(--color-text-secondary)]">
                  No active ingestion jobs.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {activeJobs.map((job) => {
                    const acting = actingJobIds.has(job.job_id);
                    const canCancel = ["running", "queued"].includes(job.status?.toLowerCase() || "");
                    const canRestart = ["failed", "cancelled", "error"].includes(job.status?.toLowerCase() || "");
                    return (
                      <div
                        key={job.job_id}
                        className={cn(
                          "flex items-center gap-2 rounded-md border p-3",
                          selectedJobId === job.job_id
                            ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)]"
                            : "border-[var(--color-border-subtle)] bg-[var(--color-surface)]"
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedJobId(job.job_id)}
                          className="min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] rounded-sm"
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant={statusVariant(job.status)}>{job.current_stage || job.status}</Badge>
                            <span className="font-mono text-xs text-[var(--color-text-tertiary)]">
                              {job.job_id.slice(0, 8)}…
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-3 text-xs text-[var(--color-text-secondary)]">
                            <span>{job.urls_scraped}/{job.urls_discovered} URLs</span>
                            <span>{job.chunks_created} chunks</span>
                          </div>
                        </button>
                        <div className="flex items-center gap-1">
                          {canCancel ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => runJobAction(job.job_id, "cancel")}
                              disabled={acting}
                              aria-label="Cancel job"
                              title="Cancel job"
                            >
                              {acting ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <XCircle className="h-4 w-4 text-[var(--color-refuse)]" />
                              )}
                            </Button>
                          ) : null}
                          {canRestart ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => runJobAction(job.job_id, "restart")}
                              disabled={acting}
                              aria-label="Restart job"
                              title="Restart job"
                            >
                              {acting ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4 text-[var(--color-trust)]" />
                              )}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Scraped URLs (only shown when a job is selected) */}
            {selectedJobId ? (
              <section>
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
                  <Database className="h-4 w-4" />
                  Scraped URLs
                </h3>
                {loadingUrls ? (
                  <div className="flex flex-col gap-2">
                    {[0, 1, 2].map((i) => (
                      <Skeleton key={i} className="h-16 w-full rounded-md" />
                    ))}
                  </div>
                ) : urlsError ? (
                  <div className="rounded-md border border-[var(--color-refuse-border)] bg-[var(--color-refuse-soft)] p-4 text-sm text-[var(--color-refuse-strong)]">
                    {urlsError}
                  </div>
                ) : urls.length === 0 ? (
                  <div className="rounded-md border border-dashed border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] p-4 text-center text-sm text-[var(--color-text-secondary)]">
                    No URLs scraped for this job yet.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {urls.map((u) => {
                      const cache = contentCache[u.url];
                      return (
                        <ScrapedUrlRow
                          key={u.url}
                          item={u}
                          expanded={expandedUrl === u.url}
                          loading={cache?.loading ?? false}
                          content={cache?.content}
                          error={cache?.error}
                          onToggle={() => toggleUrl(u.url)}
                        />
                      );
                    })}
                  </div>
                )}
              </section>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
