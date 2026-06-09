"use client";

/**
 * ContentScreen — projects & ingested content browser.
 *
 * Shows a list of all projects for the current tenant. Clicking a project
 * opens a right-side drawer with:
 *   - Project metadata
 *   - Assistants in this project (linking to assistant pages)
 *   - Active ingestion jobs (selectable)
 *   - When a job is selected: scraped URLs with expandable content preview
 *
 * Polling: active jobs endpoint is polled every 10s so the "ingesting"
 * badge clears as soon as a job finishes.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Plus, RefreshCw, Search, X } from "lucide-react";

import { Button, Input, Skeleton, Card } from "@/components/ui/primitives";
import { cn } from "@/lib/design-system";
import { useAuth } from "@/contexts/auth-context";
import { apiGet, apiDelete } from "@/lib/api-client";
import { useAppShell } from "@/components/layout/app-shell";

import { ProjectList, type ProjectRecord } from "@/components/content/project-list";
import { ProjectDetailDrawer } from "@/components/content/project-detail-drawer";

type StatusFilter = "all" | "active" | "deleting" | "deleted";
const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Deleting", value: "deleting" },
];

interface AssistantApiRecord {
  id: string;
  name: string;
  status: string;
  project_id?: string;
  projectId?: string;
  total_pages_crawled?: string;
  totalPagesCrawled?: string;
  total_chunks_indexed?: string;
  totalChunksIndexed?: string;
}

interface ActiveJobRecord {
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
  projectId?: string;
}

function normalizeAssistantBrief(a: AssistantApiRecord): AssistantBrief {
  return {
    id: a.id,
    name: a.name,
    status: a.status,
    totalPagesCrawled: a.total_pages_crawled ?? a.totalPagesCrawled ?? "0",
    totalChunksIndexed: a.total_chunks_indexed ?? a.totalChunksIndexed ?? "0",
    projectId: a.project_id ?? a.projectId,
  };
}

export function ContentScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const shell = useAppShell();

  const [projects, setProjects] = React.useState<ProjectRecord[]>([]);
  const [assistants, setAssistants] = React.useState<AssistantBrief[]>([]);
  const [activeJobs, setActiveJobs] = React.useState<ActiveJobRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);

  const [selectedProject, setSelectedProject] = React.useState<ProjectRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [deletingIds, setDeletingIds] = React.useState<Set<string>>(new Set());

  // Search + filter state
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");

  // Clear assistant/recent palette context — Content has its own scope.
  React.useEffect(() => {
    shell.registerAssistants([]);
    shell.registerRecents([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAll = React.useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      const [projectsRes, assistantsRes, jobsRes] = await Promise.all([
        apiGet("/api/projects", user.accessToken),
        apiGet("/api/assistants", user.accessToken),
        apiGet("/api/v1/status/jobs/active", user.accessToken),
      ]);

      if (projectsRes.ok) {
        const data = await projectsRes.json();
        setProjects(Array.isArray(data.projects) ? data.projects : []);
      } else {
        const err = await projectsRes.json().catch(() => ({}));
        setError(err.detail || `Failed to load projects (${projectsRes.status})`);
      }

      if (assistantsRes.ok) {
        const data = await assistantsRes.json();
        const list: AssistantApiRecord[] = Array.isArray(data.assistants) ? data.assistants : [];
        setAssistants(list.map(normalizeAssistantBrief));
      }

      if (jobsRes.ok) {
        const data = await jobsRes.json();
        setActiveJobs(Array.isArray(data.active_jobs) ? data.active_jobs : []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load content");
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Initial fetch + 10s polling for active jobs.
  React.useEffect(() => {
    fetchAll();
    const interval = setInterval(() => {
      // Re-poll only active jobs + project status (cheap), not assistants.
      if (!user) return;
      Promise.all([
        apiGet("/api/v1/status/jobs/active", user.accessToken).then((r) => (r.ok ? r.json() : null)),
        apiGet("/api/projects", user.accessToken).then((r) => (r.ok ? r.json() : null)),
      ]).then(([jobsData, projectsData]) => {
        if (jobsData) setActiveJobs(Array.isArray(jobsData.active_jobs) ? jobsData.active_jobs : []);
        if (projectsData) setProjects(Array.isArray(projectsData.projects) ? projectsData.projects : []);
      });
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchAll, user]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  const handleSelectProject = (project: ProjectRecord) => {
    setSelectedProject(project);
    setDrawerOpen(true);
  };

  const handleDeleteProject = async (project: ProjectRecord) => {
    if (!user) return;
    if (!confirm(`Delete project "${project.name}"? This will remove all associated content.`)) return;

    setDeletingIds((s) => new Set(s).add(project.id));
    try {
      const res = await apiDelete(
        `/api/projects/${project.id}?tenant_id=${encodeURIComponent(user.tenantId)}`,
        user.accessToken
      );
      if (res.ok) {
        // Optimistic: drop locally; backend will eventually mark as DELETED.
        setProjects((p) => p.filter((x) => x.id !== project.id));
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || `Failed to delete project (${res.status})`);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete project");
    } finally {
      setDeletingIds((s) => {
        const next = new Set(s);
        next.delete(project.id);
        return next;
      });
    }
  };

  // Filtered projects (by search query + status filter)
  const filteredProjects = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return projects.filter((p) => {
      if (statusFilter !== "all" && (p.status || "").toLowerCase() !== statusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.description || "").toLowerCase().includes(q)
      );
    });
  }, [projects, searchQuery, statusFilter]);

  // Derived: assistantCounts per project, activeProjectIds (project has an
  // active job ↔ one of its assistants has an active job).
  const { assistantCounts, activeProjectIds, assistantsForSelectedProject, jobsForSelectedProject } =
    React.useMemo(() => {
      const counts: Record<string, number> = {};
      const activeAssistantIds = new Set(activeJobs.map((j) => j.assistant_id));

      // Build a lookup: assistantId → projectId.
      const assistantToProject: Record<string, string | undefined> = {};
      for (const a of assistants) {
        assistantToProject[a.id] = a.projectId;
        if (a.projectId) counts[a.projectId] = (counts[a.projectId] ?? 0) + 1;
      }

      const activeIds = new Set<string>();
      for (const j of activeJobs) {
        const pid = assistantToProject[j.assistant_id];
        if (pid) activeIds.add(pid);
      }

      const forProject = selectedProject
        ? assistants.filter((a) => a.projectId === selectedProject.id)
        : [];
      const projectAssistantIds = new Set(forProject.map((a) => a.id));
      const forJobs = selectedProject
        ? activeJobs.filter((j) => projectAssistantIds.has(j.assistant_id))
        : [];

      return {
        assistantCounts: counts,
        activeProjectIds: activeIds,
        assistantsForSelectedProject: forProject,
        jobsForSelectedProject: forJobs,
      };
    }, [assistants, activeJobs, selectedProject]);

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </header>
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">Content</h1>
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-trust-border)] bg-[var(--color-trust-soft)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--color-trust-strong)]"
              aria-label="Live — auto-refreshing every 10 seconds"
              title="Live — auto-refreshing every 10 seconds"
            >
              <span className="relative inline-flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-trust)] opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-trust)]" />
              </span>
              Live
            </span>
          </div>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Manage content projects, view scraped sources, and monitor ingestion.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            Refresh
          </Button>
          <Button variant="primary" size="sm" onClick={() => router.push("/assistant/create")}>
            <Plus className="h-4 w-4" />
            New assistant
          </Button>
        </div>
      </header>

      {error ? (
        <Card
          className="border-[var(--color-refuse-border)] bg-[var(--color-refuse-soft)]/60 p-4"
          role="alert"
          aria-live="polite"
        >
          <div className="flex items-start gap-3">
            <span
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--color-refuse-soft)] text-[var(--color-refuse-strong)]"
              aria-hidden
            >
              <AlertTriangle className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--color-refuse-strong)]">
                Couldn&rsquo;t load content
              </p>
              <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">{error}</p>
              <div className="mt-3">
                <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
                  <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                  Try again
                </Button>
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      {/* Search + filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search projects by name or description"
            className="pl-9 pr-9"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-text-primary)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        <div
          role="radiogroup"
          aria-label="Status filter"
          className="inline-flex items-center gap-0.5 rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] p-0.5"
        >
          {STATUS_FILTERS.map((f) => {
            const active = statusFilter === f.value;
            return (
              <button
                key={f.value}
                role="radio"
                aria-checked={active}
                type="button"
                onClick={() => setStatusFilter(f.value)}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]",
                  active
                    ? "bg-[var(--color-surface)] text-[var(--color-text-primary)] shadow-[var(--elevation-1)]"
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      <ProjectList
        projects={filteredProjects}
        activeProjectIds={activeProjectIds}
        assistantCounts={assistantCounts}
        onSelect={handleSelectProject}
        onDelete={handleDeleteProject}
        deletingIds={deletingIds}
        isFiltered={projects.length > 0 && (searchQuery.trim() !== "" || statusFilter !== "all")}
        onClearFilters={() => {
          setSearchQuery("");
          setStatusFilter("all");
        }}
      />

      <ProjectDetailDrawer
        project={selectedProject}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        assistants={assistantsForSelectedProject}
        activeJobs={jobsForSelectedProject}
        token={user?.accessToken}
      />
    </div>
  );
}
