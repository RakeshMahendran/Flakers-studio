"use client";

/**
 * AssistantManageScreen — full management surface for a single assistant.
 *
 * Tabs:
 *   - API Keys (list/create/revoke)
 *   - Widget (configure embeddable widget)
 *   - Settings (sync-status, activate, delete)
 *
 * Wires the new BFF proxy routes added under app/api/assistant/[id]/.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BarChart3, Key, Settings as SettingsIcon, Sparkles } from "lucide-react";

import { Badge, Button, Skeleton } from "@/components/ui/primitives";
import { cn } from "@/lib/design-system";
import { useAuth } from "@/contexts/auth-context";
import { apiGet } from "@/lib/api-client";
import { useAppShell } from "@/components/layout/app-shell";

import { ApiKeysSection } from "@/components/assistant-manage/api-keys-section";
import { WidgetConfigSection } from "@/components/assistant-manage/widget-config-section";
import { ActionsSection } from "@/components/assistant-manage/actions-section";

interface AssistantBrief {
  id: string;
  name: string;
  status: string;
  description?: string;
  site_url?: string;
}

interface AssistantManageScreenProps {
  assistantId: string;
}

type Tab = "widget" | "keys" | "settings";

export function AssistantManageScreen({ assistantId }: AssistantManageScreenProps) {
  const router = useRouter();
  const { user } = useAuth();
  const shell = useAppShell();

  const [assistant, setAssistant] = React.useState<AssistantBrief | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<Tab>("widget");

  React.useEffect(() => {
    shell.registerAssistants([]);
    shell.registerRecents([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAssistant = React.useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      const res = await apiGet(`/api/assistant/${assistantId}`, user.accessToken);
      if (res.ok) {
        setAssistant(await res.json());
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.detail || `Failed to load assistant (${res.status})`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load assistant");
    } finally {
      setLoading(false);
    }
  }, [assistantId, user]);

  React.useEffect(() => {
    fetchAssistant();
  }, [fetchAssistant]);

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !assistant) {
    return (
      <div className="flex flex-col gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard")}>
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Button>
        <div className="rounded-md border border-[var(--color-refuse-border)] bg-[var(--color-refuse-soft)] p-4 text-sm text-[var(--color-refuse-strong)]">
          {error || "Assistant not found."}
        </div>
      </div>
    );
  }

  const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "widget", label: "Widget", icon: Sparkles },
    { key: "keys", label: "API Keys", icon: Key },
    { key: "settings", label: "Settings", icon: SettingsIcon },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard")}
          className="self-start"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">
                {assistant.name}
              </h1>
              <Badge
                variant={
                  assistant.status === "ready"
                    ? "trust"
                    : assistant.status === "error"
                    ? "refuse"
                    : "caution"
                }
              >
                {assistant.status}
              </Badge>
            </div>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Manage API access, widget configuration, and lifecycle for this assistant.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/analytics/assistant/${assistantId}`)}
            >
              <BarChart3 className="h-4 w-4" />
              View analytics
            </Button>
            <Button variant="primary" size="sm" onClick={() => router.push(`/assistant/${assistantId}`)}>
              Open chat
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Assistant management tabs"
        className="flex items-center gap-1 border-b border-[var(--color-border-subtle)]"
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]",
                active
                  ? "border-[var(--color-brand)] text-[var(--color-text-primary)]"
                  : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Panels */}
      <div role="tabpanel">
        {tab === "keys" ? (
          <ApiKeysSection assistantId={assistantId} token={user?.accessToken ?? ""} />
        ) : null}
        {tab === "widget" ? (
          <WidgetConfigSection assistantId={assistantId} token={user?.accessToken ?? ""} />
        ) : null}
        {tab === "settings" ? (
          <ActionsSection
            assistantId={assistantId}
            assistantName={assistant.name}
            currentStatus={assistant.status}
            token={user?.accessToken ?? ""}
            onChanged={fetchAssistant}
          />
        ) : null}
      </div>
    </div>
  );
}
