"use client";

import * as React from "react";
import { Code, Save, Sparkles } from "lucide-react";
import { Badge, Button, Card, CardHeader, CardTitle, CardDescription, CardContent, Input, Skeleton } from "@/components/ui/primitives";
import { apiGet, apiPut } from "@/lib/api-client";
import { WidgetPreview } from "./widget-preview";

interface WidgetConfig {
  enabled?: boolean;
  allowed_origins?: string[];
  position?: "bottom-right" | "bottom-left";
  primary_color?: string;
  title?: string;
  subtitle?: string;
  launcher_label?: string;
  send_label?: string;
  placeholder?: string;
  welcome_message?: string;
}

interface WidgetConfigSectionProps {
  assistantId: string;
  token: string;
}

const DEFAULTS: WidgetConfig = {
  enabled: false,
  allowed_origins: [],
  position: "bottom-right",
  primary_color: "#14532d",
  title: "Ask Flakers Studio",
  subtitle: "Governed answers from your knowledge base",
  launcher_label: "Chat",
  send_label: "Send",
  placeholder: "Ask a question...",
  welcome_message: "Hi. Ask a question to start the conversation.",
};

export function WidgetConfigSection({ assistantId, token }: WidgetConfigSectionProps) {
  const [config, setConfig] = React.useState<WidgetConfig>(DEFAULTS);
  const [originsRaw, setOriginsRaw] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiGet(`/api/assistant/${assistantId}/widget-config`, token);
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          const wc: WidgetConfig = { ...DEFAULTS, ...(data.widget_config || {}) };
          setConfig(wc);
          setOriginsRaw((wc.allowed_origins || []).join("\n"));
        } else {
          const err = await res.json().catch(() => ({}));
          setError(err.detail || `Failed to load widget config (${res.status})`);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load widget config");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assistantId, token]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const origins = originsRaw
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const payload = {
      assistant_id: assistantId,
      widget_config: { ...config, allowed_origins: origins },
    };
    try {
      const res = await apiPut(`/api/assistant/${assistantId}/widget-config`, payload, token);
      if (res.ok) {
        const data = await res.json();
        setConfig({ ...DEFAULTS, ...(data.widget_config || {}) });
        setSavedAt(Date.now());
        setTimeout(() => setSavedAt(null), 3000);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.detail || `Failed to save widget config (${res.status})`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save widget config");
    } finally {
      setSaving(false);
    }
  };

  const update = <K extends keyof WidgetConfig>(field: K, value: WidgetConfig[K]) => {
    setConfig((c) => ({ ...c, [field]: value }));
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Widget</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Widget configuration
          </CardTitle>
          <CardDescription>
            Embed an interactive chat widget on your own site.
          </CardDescription>
        </div>
        <Badge variant={config.enabled ? "trust" : "neutral"}>
          {config.enabled ? "Enabled" : "Disabled"}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {error ? (
          <div className="rounded-md border border-[var(--color-refuse-border)] bg-[var(--color-refuse-soft)] p-3 text-sm text-[var(--color-refuse-strong)]">
            {error}
          </div>
        ) : null}

        {/* Toggle */}
        <label className="flex items-center justify-between rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] p-3">
          <div>
            <div className="text-sm font-medium text-[var(--color-text-primary)]">Enable widget</div>
            <div className="text-xs text-[var(--color-text-secondary)]">
              When off, public chat requests are rejected.
            </div>
          </div>
          <input
            type="checkbox"
            checked={Boolean(config.enabled)}
            onChange={(e) => update("enabled", e.target.checked)}
            className="h-5 w-5 accent-[var(--color-brand)]"
          />
        </label>

        {/* Allowed origins */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-[var(--color-text-secondary)]">
            Allowed origins
          </label>
          <textarea
            value={originsRaw}
            onChange={(e) => setOriginsRaw(e.target.value)}
            placeholder="https://example.com&#10;https://app.example.com"
            rows={3}
            className="w-full rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 font-mono text-xs text-[var(--input-fg)] focus:border-[var(--input-border-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]"
          />
          <p className="text-xs text-[var(--color-text-tertiary)]">
            One per line. Requests from other origins will be blocked.
          </p>
        </div>

        {/* Appearance */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Widget title"
            value={config.title ?? ""}
            onChange={(e) => update("title", e.target.value)}
            placeholder="Ask Flakers Studio"
          />
          <Input
            label="Subtitle"
            value={config.subtitle ?? ""}
            onChange={(e) => update("subtitle", e.target.value)}
            placeholder="Governed answers from your knowledge base"
          />
          <Input
            label="Launcher label"
            value={config.launcher_label ?? ""}
            onChange={(e) => update("launcher_label", e.target.value)}
          />
          <Input
            label="Send button label"
            value={config.send_label ?? ""}
            onChange={(e) => update("send_label", e.target.value)}
          />
          <Input
            label="Input placeholder"
            value={config.placeholder ?? ""}
            onChange={(e) => update("placeholder", e.target.value)}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--color-text-secondary)]">Position</label>
            <select
              value={config.position ?? "bottom-right"}
              onChange={(e) =>
                update("position", e.target.value as WidgetConfig["position"])
              }
              className="h-10 rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-3 text-sm text-[var(--input-fg)] focus:border-[var(--input-border-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]"
            >
              <option value="bottom-right">Bottom right</option>
              <option value="bottom-left">Bottom left</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--color-text-secondary)]">
              Primary color
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={config.primary_color ?? "#14532d"}
                onChange={(e) => update("primary_color", e.target.value)}
                className="h-10 w-14 cursor-pointer rounded-md border border-[var(--input-border)] bg-[var(--input-bg)]"
              />
              <input
                type="text"
                value={config.primary_color ?? ""}
                onChange={(e) => update("primary_color", e.target.value)}
                className="h-10 flex-1 rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-3 font-mono text-sm text-[var(--input-fg)] focus:border-[var(--input-border-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]"
                placeholder="#14532d"
              />
            </div>
          </div>
        </div>

        {/* Welcome message */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-[var(--color-text-secondary)]">
            Welcome message
          </label>
          <textarea
            value={config.welcome_message ?? ""}
            onChange={(e) => update("welcome_message", e.target.value)}
            rows={2}
            className="w-full rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--input-fg)] focus:border-[var(--input-border-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]"
          />
        </div>

        {/* Embed snippet */}
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-text-secondary)]">
            <Code className="h-3.5 w-3.5" />
            Embed snippet
          </label>
          <pre className="overflow-x-auto rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] p-3 font-mono text-xs text-[var(--color-text-primary)]">
{`<script
  src="https://your-domain.com/widget.js"
  data-assistant-id="${assistantId}"
  data-api-key="<YOUR_API_KEY>"
  async
></script>`}
          </pre>
          <p className="text-xs text-[var(--color-text-tertiary)]">
            Paste this on any page that should show the widget. Use a key from the API Keys section.
          </p>
        </div>

        {/* Save */}
        <div className="flex items-center justify-end gap-3">
          {savedAt ? (
            <span className="text-xs text-[var(--color-trust-strong)]">Saved</span>
          ) : null}
          <Button onClick={handleSave} isLoading={saving} disabled={saving}>
            <Save className="h-4 w-4" />
            Save changes
          </Button>
        </div>
      </CardContent>
    </Card>

    {/* Live preview — sticky on desktop so it stays in view while editing */}
    <div className="lg:sticky lg:top-20 lg:self-start">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
        Live preview
      </p>
      <WidgetPreview
        config={{
          enabled: config.enabled,
          position: config.position,
          primary_color: config.primary_color,
          title: config.title,
          subtitle: config.subtitle,
          launcher_label: config.launcher_label,
          send_label: config.send_label,
          placeholder: config.placeholder,
          welcome_message: config.welcome_message,
        }}
      />
    </div>
    </div>
  );
}
