"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Badge, Button, Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/primitives";
import { apiPost, apiDelete } from "@/lib/api-client";

interface ActionsSectionProps {
  assistantId: string;
  assistantName: string;
  currentStatus: string;
  token: string;
  /** Called after a successful sync so the parent can refetch. */
  onChanged?: () => void;
}

type ActionKey = "sync" | "activate" | "delete";

export function ActionsSection({
  assistantId,
  assistantName,
  currentStatus,
  token,
  onChanged,
}: ActionsSectionProps) {
  const router = useRouter();
  const [running, setRunning] = React.useState<ActionKey | null>(null);
  const [message, setMessage] = React.useState<{ kind: "trust" | "refuse"; text: string } | null>(null);

  const runAction = async (
    key: ActionKey,
    action: () => Promise<Response>,
    successMsg: string
  ) => {
    setRunning(key);
    setMessage(null);
    try {
      const res = await action();
      if (res.ok) {
        setMessage({ kind: "trust", text: successMsg });
        onChanged?.();
      } else {
        const err = await res.json().catch(() => ({}));
        setMessage({ kind: "refuse", text: err.detail || `Action failed (${res.status})` });
      }
    } catch (e) {
      setMessage({
        kind: "refuse",
        text: e instanceof Error ? e.message : "Action failed",
      });
    } finally {
      setRunning(null);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const handleSync = () =>
    runAction(
      "sync",
      () => apiPost(`/api/assistant/${assistantId}/sync-status`, undefined, token),
      "Status synced."
    );

  const handleActivate = () =>
    runAction(
      "activate",
      () => apiPost(`/api/assistant/${assistantId}/activate`, undefined, token),
      "Assistant activated and ready for chat."
    );

  const handleDelete = async () => {
    if (
      !confirm(
        `Permanently delete assistant "${assistantName}"? All chats and content will be removed. This cannot be undone.`
      )
    )
      return;
    setRunning("delete");
    setMessage(null);
    try {
      const res = await apiDelete(`/api/assistant/${assistantId}`, token);
      if (res.ok) {
        router.push("/dashboard");
      } else {
        const err = await res.json().catch(() => ({}));
        setMessage({ kind: "refuse", text: err.detail || `Delete failed (${res.status})` });
        setRunning(null);
      }
    } catch (e) {
      setMessage({
        kind: "refuse",
        text: e instanceof Error ? e.message : "Delete failed",
      });
      setRunning(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Operations card */}
      <Card>
        <CardHeader>
          <CardTitle>Operations</CardTitle>
          <CardDescription>Manual tools for keeping this assistant healthy.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {message ? (
            <div
              className={`rounded-md border p-3 text-sm ${
                message.kind === "trust"
                  ? "border-[var(--color-trust-border)] bg-[var(--color-trust-soft)] text-[var(--color-trust-strong)]"
                  : "border-[var(--color-refuse-border)] bg-[var(--color-refuse-soft)] text-[var(--color-refuse-strong)]"
              }`}
            >
              {message.text}
            </div>
          ) : null}

          {/* Current status */}
          <div className="flex items-center justify-between rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] p-3">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-[var(--color-text-primary)]">
                Current status
              </span>
              <span className="text-xs text-[var(--color-text-secondary)]">
                Reported by backend (may lag a few seconds).
              </span>
            </div>
            <Badge
              variant={
                currentStatus === "ready"
                  ? "trust"
                  : currentStatus === "error"
                  ? "refuse"
                  : "caution"
              }
            >
              {currentStatus}
            </Badge>
          </div>

          {/* Sync status */}
          <div className="flex items-center justify-between rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--color-text-primary)]">Sync status</p>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Force-recompute status from job records. Useful if the assistant appears stuck.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={running !== null}
              isLoading={running === "sync"}
            >
              <RefreshCw className="h-4 w-4" />
              Sync now
            </Button>
          </div>

          {/* Activate */}
          <div className="flex items-center justify-between rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--color-text-primary)]">Activate</p>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Mark the assistant as ready for chat. Only required if not auto-activated.
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={handleActivate}
              disabled={running !== null || currentStatus === "ready"}
              isLoading={running === "activate"}
            >
              <CheckCircle2 className="h-4 w-4" />
              Activate
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-[var(--color-refuse)]" />
            Danger zone
          </CardTitle>
          <CardDescription>Destructive operations cannot be undone.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-md border border-[var(--color-refuse-border)] bg-[var(--color-refuse-soft)] p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--color-text-primary)]">Delete assistant</p>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Removes the assistant, all chats, content chunks, and revokes API keys. Cannot be undone.
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={running !== null}
              isLoading={running === "delete"}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
