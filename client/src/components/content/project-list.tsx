"use client";

import * as React from "react";
import { Calendar, ChevronRight, FileText, Loader2, Trash2 } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { cn } from "@/lib/design-system";

export interface ProjectRecord {
  id: string;
  tenant_id: string;
  name: string;
  description?: string | null;
  status: string; // active, deleting, deleted
  created_at: string;
  updated_at?: string | null;
  deleted_at?: string | null;
}

export interface ProjectListProps {
  projects: ProjectRecord[];
  /** Set of project IDs that currently have active ingestion jobs. */
  activeProjectIds?: Set<string>;
  /** Map projectId → assistant count (for inline metric). */
  assistantCounts?: Record<string, number>;
  onSelect: (project: ProjectRecord) => void;
  onDelete: (project: ProjectRecord) => void;
  /** Project IDs whose delete request is in-flight. */
  deletingIds?: Set<string>;
}

function statusVariant(status: string): "trust" | "caution" | "refuse" | "neutral" {
  const s = status.toLowerCase();
  if (s === "active") return "trust";
  if (s === "deleting") return "caution";
  if (s === "deleted") return "refuse";
  return "neutral";
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

/**
 * Project list — card-style rows showing name, status, dates, and quick actions.
 * Active ingestion is indicated with a spinning loader chip on the row.
 */
export function ProjectList({
  projects,
  activeProjectIds,
  assistantCounts,
  onSelect,
  onDelete,
  deletingIds,
}: ProjectListProps) {
  if (projects.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center gap-3 p-12 text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-surface-sunken)] text-[var(--color-text-tertiary)]">
          <FileText className="h-6 w-6" />
        </div>
        <h3 className="text-base font-medium text-[var(--color-text-primary)]">No content projects yet</h3>
        <p className="max-w-sm text-sm text-[var(--color-text-secondary)]">
          Projects are created automatically when you build an assistant. Start by creating an
          assistant from the dashboard.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {projects.map((project) => {
        const isActive = activeProjectIds?.has(project.id) ?? false;
        const isDeleting = deletingIds?.has(project.id) ?? false;
        const assistantCount = assistantCounts?.[project.id] ?? 0;
        return (
          <Card
            key={project.id}
            className={cn(
              "group flex items-center gap-4 p-5 transition-shadow",
              "hover:shadow-[var(--elevation-2)]",
              isDeleting && "opacity-50 pointer-events-none"
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(project)}
              className="flex flex-1 items-center gap-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] rounded-md"
            >
              <span
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-sunken)] text-[var(--color-text-secondary)]"
                aria-hidden
              >
                <FileText className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
                    {project.name}
                  </h3>
                  <Badge variant={statusVariant(project.status)}>{project.status}</Badge>
                  {isActive ? (
                    <Badge variant="caution" className="gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Ingesting
                    </Badge>
                  ) : null}
                </div>
                {project.description ? (
                  <p className="mt-1 truncate text-sm text-[var(--color-text-secondary)]">
                    {project.description}
                  </p>
                ) : null}
                <div className="mt-2 flex items-center gap-4 text-xs text-[var(--color-text-tertiary)]">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatDate(project.created_at)}
                  </span>
                  <span>
                    {assistantCount} {assistantCount === 1 ? "assistant" : "assistants"}
                  </span>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-text-tertiary)] transition-colors group-hover:text-[var(--color-brand)]">
                <span className="hidden sm:inline">View</span>
                <ChevronRight className="h-4 w-4" />
              </span>
            </button>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(project);
              }}
              aria-label={`Delete project ${project.name}`}
              disabled={isDeleting || project.status === "deleted"}
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 text-[var(--color-refuse)]" />
              )}
            </Button>
          </Card>
        );
      })}
    </div>
  );
}
