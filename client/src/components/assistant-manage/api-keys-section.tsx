"use client";

import * as React from "react";
import { Check, Copy, Key, Loader2, Plus, Trash2, AlertCircle } from "lucide-react";
import { Badge, Button, Card, CardHeader, CardTitle, CardDescription, CardContent, Input, Skeleton } from "@/components/ui/primitives";
import { apiGet, apiPost, apiDelete } from "@/lib/api-client";

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  is_active: boolean;
  rate_limit_per_minute: number;
  last_used_at?: string | null;
  created_at: string;
}

interface ApiKeysSectionProps {
  assistantId: string;
  token: string;
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

export function ApiKeysSection({ assistantId, token }: ApiKeysSectionProps) {
  const [keys, setKeys] = React.useState<ApiKey[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [creating, setCreating] = React.useState(false);
  const [newKeyName, setNewKeyName] = React.useState("");
  const [newKeyRate, setNewKeyRate] = React.useState(60);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [nameTouched, setNameTouched] = React.useState(false);

  // Newly-created key — shown ONCE with the raw value, then cleared.
  const [revealedKey, setRevealedKey] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const [revokingIds, setRevokingIds] = React.useState<Set<string>>(new Set());

  const fetchKeys = React.useCallback(async () => {
    setError(null);
    try {
      const res = await apiGet(`/api/assistant/${assistantId}/api-keys`, token);
      if (res.ok) {
        setKeys(await res.json());
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.detail || `Failed to load API keys (${res.status})`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load API keys");
    } finally {
      setLoading(false);
    }
  }, [assistantId, token]);

  React.useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const handleCreate = async () => {
    setNameTouched(true);
    setCreateError(null);
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const res = await apiPost(
        `/api/assistant/${assistantId}/api-keys`,
        { name: newKeyName.trim(), rate_limit_per_minute: newKeyRate },
        token
      );
      if (res.ok) {
        const data = await res.json();
        setRevealedKey(data.api_key);
        setNewKeyName("");
        setNewKeyRate(60);
        setNameTouched(false);
        await fetchKeys();
      } else {
        const err = await res.json().catch(() => ({}));
        setCreateError(err.detail || `Failed to create API key (${res.status})`);
      }
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create API key");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (key: ApiKey) => {
    if (!confirm(`Revoke API key "${key.name}"? This cannot be undone.`)) return;
    setRevokingIds((s) => new Set(s).add(key.id));
    setError(null);
    try {
      const res = await apiDelete(`/api/assistant/${assistantId}/api-keys/${key.id}`, token);
      if (res.ok) {
        await fetchKeys();
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.detail || `Failed to revoke key (${res.status})`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke key");
    } finally {
      setRevokingIds((s) => {
        const next = new Set(s);
        next.delete(key.id);
        return next;
      });
    }
  };

  const handleCopyKey = async () => {
    if (!revealedKey) return;
    try {
      await navigator.clipboard.writeText(revealedKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* swallow */
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-4 w-4" />
          API Keys
        </CardTitle>
        <CardDescription>
          Authenticate widget and public chat requests with assistant-scoped keys.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {/* Reveal newly-created key (shown once) */}
        {revealedKey ? (
          <div className="rounded-xl border border-[var(--color-trust-border)] bg-[var(--color-trust-soft)] p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-trust-strong)]" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--color-trust-strong)]">
                  New API key generated — copy it now
                </p>
                <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                  This is the only time the full key will be shown. Store it securely.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <code className="flex-1 min-w-0 truncate rounded-md bg-[var(--color-surface)] px-3 py-2 font-mono text-xs">
                    {revealedKey}
                  </code>
                  <Button variant="outline" size="sm" onClick={handleCopyKey}>
                    {copied ? <Check className="h-4 w-4 text-[var(--color-trust)]" /> : <Copy className="h-4 w-4" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <div className="mt-3">
                  <Button variant="ghost" size="sm" onClick={() => setRevealedKey(null)}>
                    Dismiss
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Create new key form */}
        <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] p-4">
          <p className="mb-3 text-sm font-medium text-[var(--color-text-primary)]">Generate new key</p>
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto]">
            <Input
              label="Name"
              placeholder="e.g. Production website"
              value={newKeyName}
              onChange={(e) => {
                setNewKeyName(e.target.value);
                if (createError) setCreateError(null);
              }}
              onBlur={() => setNameTouched(true)}
              disabled={creating}
              error={nameTouched && !newKeyName.trim() ? "Name is required" : undefined}
              aria-required="true"
            />
            <Input
              label="Rate limit / min"
              type="number"
              min={1}
              max={10000}
              value={newKeyRate}
              onChange={(e) => setNewKeyRate(Number(e.target.value) || 60)}
              disabled={creating}
            />
            <div className="flex items-end">
              <Button
                onClick={handleCreate}
                disabled={creating || !newKeyName.trim()}
                isLoading={creating}
              >
                <Plus className="h-4 w-4" />
                Generate
              </Button>
            </div>
          </div>
          {createError ? (
            <div className="mt-3 rounded-md border border-[var(--color-refuse-border)] bg-[var(--color-refuse-soft)] p-2.5 text-xs text-[var(--color-refuse-strong)]">
              {createError}
            </div>
          ) : null}
        </div>

        {/* Existing keys list */}
        <div className="flex flex-col gap-2">
          {loading ? (
            <>
              <Skeleton className="h-16 w-full rounded-md" />
              <Skeleton className="h-16 w-full rounded-md" />
            </>
          ) : error ? (
            <div className="flex flex-col gap-2 rounded-md border border-[var(--color-refuse-border)] bg-[var(--color-refuse-soft)] p-3">
              <p className="text-sm text-[var(--color-refuse-strong)]">{error}</p>
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setLoading(true);
                    fetchKeys();
                  }}
                >
                  Try again
                </Button>
              </div>
            </div>
          ) : keys.length === 0 ? (
            <div className="rounded-md border border-dashed border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] p-6 text-center text-sm text-[var(--color-text-secondary)]">
              No API keys yet. Create your first key above.
            </div>
          ) : (
            keys.map((key) => {
              const isRevoking = revokingIds.has(key.id);
              return (
                <div
                  key={key.id}
                  className="flex items-center gap-3 rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[var(--color-text-primary)]">{key.name}</span>
                      <Badge variant={key.is_active ? "trust" : "neutral"}>
                        {key.is_active ? "Active" : "Revoked"}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-[var(--color-text-tertiary)]">
                      <code className="font-mono">{key.key_prefix}…</code>
                      <span>{key.rate_limit_per_minute} req/min</span>
                      <span>Created {formatDate(key.created_at)}</span>
                      {key.last_used_at ? <span>Last used {formatDate(key.last_used_at)}</span> : null}
                    </div>
                  </div>
                  {key.is_active ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRevoke(key)}
                      disabled={isRevoking}
                      aria-label={`Revoke key ${key.name}`}
                    >
                      {isRevoking ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 text-[var(--color-refuse)]" />
                      )}
                    </Button>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
