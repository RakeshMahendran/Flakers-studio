"use client";

/**
 * AssistantsScreen — dedicated "Your assistants" page.
 *
 * Lives behind /assistant. Shares the underlying AssistantGrid + Assistant
 * type with DashboardScreen, but renders only the assistant list (no
 * KPIs, no onboarding checklist, no quick actions). Use this when the
 * user has clicked the "Assistants" sidebar nav item and wants a focused
 * view of their assistants.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Plus, X } from "lucide-react";
import { Button, Skeleton } from "@/components/ui/primitives";
import { cn } from "@/lib/design-system";
import { useAuth } from "@/contexts/auth-context";
import { apiGet, apiDelete } from "@/lib/api-client";
import { useAppShell } from "@/components/layout/app-shell";

import { AssistantGrid } from "@/components/dashboard/assistant-grid";
import { normalizeAssistant, type Assistant } from "./dashboard-screen";

export function AssistantsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const shell = useAppShell();

  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const fetchingRef = useRef(false);

  // Clear assistant/recent palette context — this page itself IS the
  // assistants surface, no need to surface them in the command palette
  // recents row.
  useEffect(() => {
    shell.registerRecents([]);
  }, [shell]);

  useEffect(() => {
    if (!user) return;
    fetchAssistants();
    // Poll while any are still ingesting so the cards update in place.
    const interval = setInterval(() => {
      const stillIngesting = assistants.some(
        (a) => a.status === "ingesting" || a.status === "creating"
      );
      if (stillIngesting) fetchAssistants();
    }, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const fetchAssistants = async () => {
    if (fetchingRef.current) return;
    if (!user) {
      setLoading(false);
      return;
    }
    fetchingRef.current = true;
    try {
      const response = await apiGet("/api/assistants", user.accessToken);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || `Failed (${response.status})`);
      }
      const data = await response.json();
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.assistants)
          ? data.assistants
          : [];
      const normalized: Assistant[] = list.map(normalizeAssistant);
      setAssistants(normalized);
      shell.registerAssistants(
        normalized.map((a: Assistant) => ({
          id: a.id,
          name: a.name,
          status: a.status,
          siteUrl: a.siteUrl,
        }))
      );
      setFetchError(null);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to load assistants");
    } finally {
      fetchingRef.current = false;
      setLoading(false);
    }
  };

  const handleCreate = () => router.push("/assistant/create");
  const handleSelect = (id: string) => router.push(`/assistant/${id}`);
  const handleSettings = (id: string) => router.push(`/assistant/${id}/manage`);
  const handleDelete = async (id: string) => {
    if (!user) return;
    const ok = window.confirm(
      "Delete this assistant? Its ingested content will also be removed. This cannot be undone."
    );
    if (!ok) return;
    try {
      const res = await apiDelete(`/api/assistant/${id}`, user.accessToken);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Failed (${res.status})`);
      }
      setAssistants((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      // Surface inline rather than alert() so it's keyboard-accessible.
      setFetchError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleRetry = async () => {
    setIsRetrying(true);
    await fetchAssistants();
    setIsRetrying(false);
  };

  const counts = useMemo(() => {
    const total = assistants.length;
    const ready = assistants.filter((a) => a.status === "ready").length;
    return { total, ready };
  }, [assistants]);

  if (loading) {
    return (
      <div className="flex flex-col gap-6" aria-busy aria-label="Loading assistants">
        <Skeleton className="h-12 w-72 rounded-md" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-60 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">
            Your assistants
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {counts.total === 0
              ? "No assistants yet. Create one to start ingesting governed content."
              : `${counts.ready} of ${counts.total} ready.`}
          </p>
        </div>
        <Button variant="primary" size="md" onClick={handleCreate}>
          <Plus className="h-4 w-4" />
          New assistant
        </Button>
      </header>

      {fetchError ? (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "flex items-start gap-3 rounded-xl border p-4",
            "border-[var(--color-caution-border)] bg-[var(--color-caution-soft)]",
            "shadow-[var(--elevation-1)]"
          )}
        >
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-caution-strong)]"
            aria-hidden
          />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="text-sm font-medium text-[var(--color-text-primary)]">
              {fetchError}
            </p>
            <p className="text-xs text-[var(--color-text-secondary)]">
              We&rsquo;ll keep showing the most recent successful list.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button size="sm" variant="outline" onClick={handleRetry} isLoading={isRetrying}>
              Retry
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setFetchError(null)}
              aria-label="Dismiss error"
              title="Dismiss"
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}

      <AssistantGrid
        assistants={assistants}
        onSelect={handleSelect}
        onSettings={handleSettings}
        onDelete={handleDelete}
        onCreate={handleCreate}
      />
    </div>
  );
}
