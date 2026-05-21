"use client";

import * as React from "react";
import { Building2, Check, Copy, Loader2, Save, Users } from "lucide-react";
import { Badge, Button, Card, Input, Skeleton } from "@/components/ui/primitives";
import { SectionCard } from "./section-card";
import { apiGet, apiPut } from "@/lib/api-client";

interface Member {
  user_id: string;
  email: string;
  full_name?: string | null;
  role: string;
  joined_at?: string | null;
}

interface TenantSectionProps {
  tenantId: string;
  tenantName: string;
  token: string;
  /** Current user's role; controls whether tenant rename is allowed. */
  role?: string;
  /** Called after tenant rename succeeds. */
  onSaved?: () => void;
}

function roleVariant(role: string): "trust" | "brand" | "neutral" {
  if (role === "owner") return "trust";
  if (role === "admin") return "brand";
  return "neutral";
}

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
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

export function TenantSection({
  tenantId,
  tenantName,
  token,
  role,
  onSaved,
}: TenantSectionProps) {
  const [name, setName] = React.useState(tenantName);
  const [copied, setCopied] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saveMessage, setSaveMessage] = React.useState<{
    kind: "trust" | "refuse";
    text: string;
  } | null>(null);

  const [members, setMembers] = React.useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = React.useState(true);
  const [membersError, setMembersError] = React.useState<string | null>(null);

  const canEdit = role === "admin" || role === "owner";

  React.useEffect(() => {
    setName(tenantName);
  }, [tenantName]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiGet("/api/auth/tenant/members", token);
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setMembers(Array.isArray(data.members) ? data.members : []);
        } else {
          const err = await res.json().catch(() => ({}));
          setMembersError(err.detail || `Failed to load members (${res.status})`);
        }
      } catch (e) {
        if (!cancelled) setMembersError(e instanceof Error ? e.message : "Failed to load members");
      } finally {
        if (!cancelled) setLoadingMembers(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(tenantId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy tenant ID:", err);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await apiPut("/api/auth/tenant", { name }, token);
      if (res.ok) {
        setSaveMessage({ kind: "trust", text: "Organization renamed." });
        onSaved?.();
      } else {
        const err = await res.json().catch(() => ({}));
        setSaveMessage({
          kind: "refuse",
          text: err.detail || `Rename failed (${res.status})`,
        });
      }
    } catch (e) {
      setSaveMessage({
        kind: "refuse",
        text: e instanceof Error ? e.message : "Rename failed",
      });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 4000);
    }
  };

  return (
    <SectionCard
      title="Organization"
      description="Tenant-level settings shared by all members"
      icon={<Building2 className="h-4 w-4" />}
    >
      <div className="flex flex-col gap-6">
        {/* Tenant ID */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-[var(--color-text-secondary)]">Tenant ID</label>
          <div className="flex items-center gap-2">
            <div className="flex h-10 flex-1 items-center rounded-md border border-[var(--input-border)] bg-[var(--color-surface-sunken)] px-3 font-mono text-xs text-[var(--color-text-tertiary)]">
              {tenantId || "—"}
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={handleCopy}
              aria-label="Copy tenant ID"
              type="button"
            >
              {copied ? (
                <Check className="h-4 w-4 text-[var(--color-trust)]" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Tenant name */}
        <div className="flex flex-col gap-2">
          <Input
            label="Organization name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={tenantName || "Organization name"}
            disabled={!canEdit}
          />
          {!canEdit ? (
            <p className="text-xs text-[var(--color-text-tertiary)]">
              Only admins and owners can rename the organization.
            </p>
          ) : null}
        </div>

        {saveMessage ? (
          <div
            className={`rounded-md border p-3 text-sm ${
              saveMessage.kind === "trust"
                ? "border-[var(--color-trust-border)] bg-[var(--color-trust-soft)] text-[var(--color-trust-strong)]"
                : "border-[var(--color-refuse-border)] bg-[var(--color-refuse-soft)] text-[var(--color-refuse-strong)]"
            }`}
          >
            {saveMessage.text}
          </div>
        ) : null}

        {canEdit ? (
          <div className="flex justify-end">
            <Button
              variant="primary"
              onClick={handleSave}
              isLoading={saving}
              disabled={saving || name === tenantName || !name.trim()}
            >
              <Save className="h-4 w-4" />
              Save name
            </Button>
          </div>
        ) : null}

        {/* Members */}
        <div className="flex flex-col gap-3 border-t border-[var(--color-border-subtle)] pt-6">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-medium text-[var(--color-text-primary)]">
              <Users className="h-4 w-4" />
              Team members
            </span>
            <Badge variant="neutral">{loadingMembers ? "—" : members.length}</Badge>
          </div>

          {loadingMembers ? (
            <>
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </>
          ) : membersError ? (
            <p className="text-sm text-[var(--color-refuse)]">{membersError}</p>
          ) : members.length === 0 ? (
            <div className="rounded-md border border-dashed border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] p-4 text-center text-sm text-[var(--color-text-secondary)]">
              No members found.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {members.map((m) => (
                <li
                  key={m.user_id}
                  className="flex items-center justify-between gap-3 rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                      {m.full_name || m.email}
                    </p>
                    <p className="truncate text-xs text-[var(--color-text-secondary)]">{m.email}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant={roleVariant(m.role)}>{m.role}</Badge>
                    <span className="text-xs text-[var(--color-text-tertiary)]">
                      {formatDate(m.joined_at)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
