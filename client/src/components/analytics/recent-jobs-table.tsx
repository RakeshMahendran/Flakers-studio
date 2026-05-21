"use client";

import * as React from "react";
import { Badge, Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/primitives";

export interface RecentJob {
  job_id?: string;
  id?: string;
  assistant_id?: string;
  status?: string;
  current_stage?: string | null;
  urls_discovered?: number;
  urls_scraped?: number;
  chunks_created?: number;
  started_at?: string | null;
  completed_at?: string | null;
  [key: string]: unknown;
}

interface RecentJobsTableProps {
  jobs: RecentJob[];
}

function statusVariant(status: string | undefined): "trust" | "caution" | "refuse" | "neutral" {
  const s = (status || "").toLowerCase();
  if (s === "completed" || s === "ready") return "trust";
  if (s === "running" || s === "queued" || s.includes("ingesting")) return "caution";
  if (s === "failed" || s === "error" || s === "cancelled") return "refuse";
  return "neutral";
}

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
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
 * Last 10 ingestion jobs with status badge, stage, throughput, and timestamp.
 */
export function RecentJobsTable({ jobs }: RecentJobsTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent ingestion jobs</CardTitle>
        <CardDescription>Latest content discovery and processing runs.</CardDescription>
      </CardHeader>
      <CardContent>
        {jobs.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-[var(--color-text-tertiary)]">
            No ingestion jobs yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border-subtle)] text-left text-xs text-[var(--color-text-muted)]">
                  <th className="px-2 py-2 font-medium">Job</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Stage</th>
                  <th className="px-2 py-2 text-right font-medium">URLs</th>
                  <th className="px-2 py-2 text-right font-medium">Chunks</th>
                  <th className="px-2 py-2 font-medium">Started</th>
                </tr>
              </thead>
              <tbody>
                {jobs.slice(0, 10).map((job, i) => {
                  const id = (job.job_id || job.id || "") as string;
                  const status = job.status as string | undefined;
                  return (
                    <tr
                      key={id || i}
                      className="border-b border-[var(--color-border-subtle)] last:border-0"
                    >
                      <td className="px-2 py-2 font-mono text-xs text-[var(--color-text-tertiary)]">
                        {id ? `${id.slice(0, 8)}…` : "—"}
                      </td>
                      <td className="px-2 py-2">
                        <Badge variant={statusVariant(status)}>{status || "—"}</Badge>
                      </td>
                      <td className="px-2 py-2 text-[var(--color-text-secondary)]">
                        {(job.current_stage as string) || "—"}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-[var(--color-text-secondary)]">
                        {(job.urls_scraped ?? 0).toLocaleString()}/{(job.urls_discovered ?? 0).toLocaleString()}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-[var(--color-text-secondary)]">
                        {(job.chunks_created ?? 0).toLocaleString()}
                      </td>
                      <td className="px-2 py-2 text-xs text-[var(--color-text-tertiary)]">
                        {formatDate(job.started_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
