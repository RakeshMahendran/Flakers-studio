"use client";

/**
 * AssistantReviewScreen — post-creation success/review screen.
 *
 * Shown right after an assistant is created. Summarizes:
 *   - Project details (name, URL, ID)
 *   - Source + template + status
 *   - Governance configuration
 *   - Ingestion summary (pages, chunks, intents)
 *   - Widget configuration preview
 *
 * Refactored from the legacy `enhanced-ui` primitives to canonical
 * `primitives.tsx` so it matches the rest of the app (theme-aware,
 * token-driven, accessible).
 */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Bot,
  CheckCircle,
  ChevronLeft,
  FileText,
  Globe,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Chip,
  Skeleton,
} from "@/components/ui/primitives";
import { useAuth } from "@/contexts/auth-context";
import { useAppShell } from "@/components/layout/app-shell";
import { normalizeAssistant, type Assistant } from "./dashboard-screen";
import { apiGet } from "@/lib/api-client";

interface AssistantReviewScreenProps {
  assistantId: string;
}

function statusVariant(status: string): "trust" | "caution" | "refuse" | "neutral" {
  if (status === "ready") return "trust";
  if (status === "error") return "refuse";
  if (status === "creating" || status === "ingesting") return "caution";
  return "neutral";
}

interface StatTileProps {
  value: string | number;
  label: string;
  tone: "trust" | "brand" | "accent";
}

const TONE_BG: Record<StatTileProps["tone"], string> = {
  trust: "bg-[var(--color-trust-soft)] text-[var(--color-trust-strong)]",
  brand: "bg-[var(--color-brand-soft)] text-[var(--color-brand)]",
  accent: "bg-[var(--color-accent-soft)] text-[var(--color-accent)]",
};

function StatTile({ value, label, tone }: StatTileProps) {
  return (
    <div
      className={`rounded-lg p-4 text-center ${TONE_BG[tone]}`}
    >
      <div className="text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs font-medium opacity-80">{label}</div>
    </div>
  );
}

export function AssistantReviewScreen({ assistantId }: AssistantReviewScreenProps) {
  const router = useRouter();
  const { user } = useAuth();
  const shell = useAppShell();
  const [assistant, setAssistant] = useState<Assistant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    shell.registerAssistants([]);
    shell.registerRecents([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) return;
      try {
        const response = await apiGet("/api/assistants", user.accessToken);
        if (cancelled) return;
        if (response.ok) {
          const data = await response.json();
          const list = Array.isArray(data.assistants)
            ? data.assistants.map(normalizeAssistant)
            : [];
          const found = list.find((a: Assistant) => a.id === assistantId);
          if (found) setAssistant(found);
        }
      } catch (error) {
        console.error("Failed to fetch assistant:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assistantId, user]);

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-72 w-full rounded-xl" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-60 rounded-xl" />
          <Skeleton className="h-60 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!assistant) {
    return (
      <div className="flex flex-col gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard")}>
          <ChevronLeft className="h-4 w-4" />
          Back to dashboard
        </Button>
        <div className="rounded-md border border-[var(--color-refuse-border)] bg-[var(--color-refuse-soft)] p-4 text-sm text-[var(--color-refuse-strong)]">
          Assistant not found.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push("/dashboard")}
        className="self-start"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to dashboard
      </Button>

      {/* Hero */}
      <header className="flex flex-col items-center gap-3 py-6 text-center">
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.35 }}
          className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-trust-soft)] text-[var(--color-trust-strong)]"
        >
          <CheckCircle className="h-7 w-7" />
        </motion.div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">
          {assistant.name}
        </h1>
        <p className="max-w-xl text-sm text-[var(--color-text-secondary)]">
          {assistant.description || "Review your assistant configuration and continue when ready."}
        </p>
        <Badge variant={statusVariant(assistant.status)}>{assistant.status}</Badge>
      </header>

      {/* Ingestion summary */}
      <Card>
        <CardHeader>
          <CardTitle>Ingestion summary</CardTitle>
          <CardDescription>Content discovered and indexed for this assistant.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            <StatTile value={assistant.totalPagesCrawled || "0"} label="Pages crawled" tone="brand" />
            <StatTile
              value={assistant.totalChunksIndexed || "0"}
              label="Chunks indexed"
              tone="trust"
            />
            <StatTile
              value={assistant.allowedIntents?.length || 0}
              label="Allowed intents"
              tone="accent"
            />
          </div>
        </CardContent>
      </Card>

      {/* Two-column: details + selections */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Project details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <dt className="text-[var(--color-text-secondary)]">Name</dt>
                <dd className="font-medium text-[var(--color-text-primary)]">{assistant.name}</dd>
              </div>
              {assistant.description ? (
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-[var(--color-text-secondary)]">Description</dt>
                  <dd className="max-w-[60%] text-right text-[var(--color-text-primary)]">
                    {assistant.description}
                  </dd>
                </div>
              ) : null}
              <div className="flex items-start justify-between gap-3">
                <dt className="text-[var(--color-text-secondary)]">URL</dt>
                <dd className="max-w-[60%] break-all text-right font-mono text-xs text-[var(--color-text-primary)]">
                  {assistant.siteUrl}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-[var(--color-text-secondary)]">Assistant ID</dt>
                <dd className="max-w-[60%] break-all text-right font-mono text-xs text-[var(--color-text-tertiary)]">
                  {assistantId}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-[var(--color-text-secondary)]">
                  <Globe className="h-4 w-4" /> Source type
                </span>
                <Badge variant="brand" className="capitalize">
                  {assistant.sourceType}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-[var(--color-text-secondary)]">
                  <Bot className="h-4 w-4" /> Template
                </span>
                <Badge variant="accent" className="capitalize">
                  {assistant.template}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-[var(--color-text-secondary)]">
                  <FileText className="h-4 w-4" /> Status
                </span>
                <Badge variant={statusVariant(assistant.status)}>{assistant.status}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Governance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[var(--color-trust-strong)]" />
            Governance configuration
          </CardTitle>
          <CardDescription>
            Policies that constrain answers and protect tenant data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-text-secondary)]">Context required</span>
                <Badge variant={assistant.governanceRules?.require_context ? "trust" : "neutral"}>
                  {assistant.governanceRules?.require_context ? "Enabled" : "Disabled"}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-text-secondary)]">Tenant isolation</span>
                <Badge variant={assistant.governanceRules?.tenant_isolation ? "trust" : "neutral"}>
                  {assistant.governanceRules?.tenant_isolation ? "Enforced" : "Relaxed"}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-text-secondary)]">Source attribution</span>
                <Badge
                  variant={assistant.governanceRules?.attribution_required ? "trust" : "neutral"}
                >
                  {assistant.governanceRules?.attribution_required ? "Required" : "Optional"}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-text-secondary)]">Confidence threshold</span>
                <span className="font-medium text-[var(--color-text-primary)]">
                  {assistant.governanceRules?.confidence_threshold ?? "default"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-text-secondary)]">Policy handling</span>
                <Badge variant={assistant.governanceRules?.policy_quote_only ? "trust" : "neutral"}>
                  {assistant.governanceRules?.policy_quote_only ? "Quote-only" : "Standard"}
                </Badge>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                Allowed intents
              </p>
              {(assistant.allowedIntents || []).length === 0 ? (
                <p className="text-sm text-[var(--color-text-tertiary)]">
                  No specific intent restrictions
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {(assistant.allowedIntents || []).map((intent) => (
                    <Chip key={intent} variant="tag" className="capitalize">
                      {intent.replaceAll("_", " ")}
                    </Chip>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Widget */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Widget
            </CardTitle>
            <CardDescription>Status of the embeddable chat widget.</CardDescription>
          </div>
          <Badge variant={assistant.widgetConfig?.enabled ? "trust" : "neutral"}>
            {assistant.widgetConfig?.enabled ? "Enabled" : "Disabled"}
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-text-secondary)]">Launcher label</span>
                <span className="font-medium text-[var(--color-text-primary)]">
                  {assistant.widgetConfig?.launcher_label || "Chat"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-text-secondary)]">Position</span>
                <span className="font-medium text-[var(--color-text-primary)]">
                  {assistant.widgetConfig?.position || "bottom-right"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-text-secondary)]">Primary color</span>
                <span className="flex items-center gap-2">
                  <span
                    className="h-4 w-4 rounded-full border border-[var(--color-border-subtle)]"
                    style={{
                      backgroundColor: assistant.widgetConfig?.primary_color || "#14532d",
                    }}
                  />
                  <span className="font-mono text-xs text-[var(--color-text-primary)]">
                    {assistant.widgetConfig?.primary_color || "#14532d"}
                  </span>
                </span>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                Allowed origins
              </p>
              {(assistant.widgetConfig?.allowed_origins || []).length === 0 ? (
                <p className="text-sm text-[var(--color-text-tertiary)]">No origins configured</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {(assistant.widgetConfig?.allowed_origins || []).map((origin) => (
                    <Chip key={origin} variant="source">
                      {origin}
                    </Chip>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-wrap justify-end gap-3 pt-2">
        <Button variant="outline" onClick={() => router.push(`/assistant/${assistantId}/manage`)}>
          <SettingsIcon className="h-4 w-4" />
          Manage
        </Button>
        <Button variant="primary" onClick={() => router.push("/dashboard")}>
          Continue
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
