"use client";

/**
 * DocsScreen — in-app reference for using FlakersStudio.
 *
 * Lightweight, single-page docs. Sections cover the core flows:
 * creating assistants, managing API keys/widget, governance,
 * analytics, and the command palette.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  Code,
  FileText,
  Key,
  Keyboard,
  Plus,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/primitives";
import { useAppShell } from "@/components/layout/app-shell";

interface DocSection {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  body: React.ReactNode;
}

export function DocsScreen() {
  const router = useRouter();
  const shell = useAppShell();

  React.useEffect(() => {
    shell.registerAssistants([]);
    shell.registerRecents([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sections: DocSection[] = [
    {
      id: "create-assistant",
      title: "Create an assistant",
      description: "Set up a governed AI agent backed by your content.",
      icon: Bot,
      body: (
        <ol className="ml-4 list-decimal space-y-2 text-sm text-[var(--color-text-secondary)]">
          <li>From the dashboard, click <strong>New assistant</strong>.</li>
          <li>Choose a template (Support, Sales, etc.) and a source (Website or WordPress).</li>
          <li>Enter the site URL — FlakersStudio will discover and ingest content automatically.</li>
          <li>Wait for the status to flip to <Badge variant="trust">ready</Badge>.</li>
        </ol>
      ),
    },
    {
      id: "api-keys",
      title: "API keys & widget",
      description: "Embed a governed chat widget on your public website.",
      icon: Key,
      body: (
        <div className="flex flex-col gap-3 text-sm text-[var(--color-text-secondary)]">
          <p>
            Open any assistant&rsquo;s <strong>Manage</strong> page and switch to the
            <strong> API Keys</strong> tab. Generate a key — copy it once, then enable the widget on the
            <strong> Widget</strong> tab.
          </p>
          <p>Paste this snippet on your site:</p>
          <pre className="overflow-x-auto rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] p-3 font-mono text-xs">
{`<script
  src="https://your-domain.com/widget.js"
  data-assistant-id="<ASSISTANT_ID>"
  data-api-key="<YOUR_API_KEY>"
  async
></script>`}
          </pre>
        </div>
      ),
    },
    {
      id: "governance",
      title: "Governance",
      description: "Policies that shape every answer before it&rsquo;s generated.",
      icon: ShieldCheck,
      body: (
        <div className="flex flex-col gap-2 text-sm text-[var(--color-text-secondary)]">
          <p>
            FlakersStudio applies <strong>governance rules</strong> per assistant: tenant
            isolation, citation requirements, confidence threshold, intent filtering, and policy
            quote-only mode.
          </p>
          <p>
            View an assistant&rsquo;s active rules in the post-creation Review screen, or via
            the &ldquo;Manage&rdquo; entry on the dashboard card.
          </p>
        </div>
      ),
    },
    {
      id: "content",
      title: "Content & ingestion",
      description: "Inspect what the assistant knows.",
      icon: FileText,
      body: (
        <div className="flex flex-col gap-2 text-sm text-[var(--color-text-secondary)]">
          <p>
            The <strong>Content</strong> tab lists every project. Click a project to view its
            assistants, active ingestion jobs, and scraped URLs with content preview.
          </p>
          <p>
            Active jobs can be cancelled or restarted directly from the project drawer.
          </p>
        </div>
      ),
    },
    {
      id: "analytics",
      title: "Analytics",
      description: "System-wide metrics + per-assistant drilldowns.",
      icon: TrendingUp,
      body: (
        <div className="flex flex-col gap-2 text-sm text-[var(--color-text-secondary)]">
          <p>
            The <strong>Analytics</strong> page shows usage volume, answer rate, content quality
            distribution, and performance. Use the time window toggle to compare 7d/14d/30d/90d.
          </p>
          <p>
            Click any assistant in the &ldquo;Top assistants&rdquo; list to drill into per-assistant
            chat + content + recent-job metrics.
          </p>
          <p>Export usage data to CSV with the Export button.</p>
        </div>
      ),
    },
    {
      id: "shortcuts",
      title: "Keyboard shortcuts",
      description: "Move fast with the command palette.",
      icon: Keyboard,
      body: (
        <div className="flex flex-col gap-2 text-sm text-[var(--color-text-secondary)]">
          <p>
            Press <kbd className="rounded border px-1.5 py-0.5 font-mono text-xs">⌘K</kbd> (or
            <kbd className="ml-1 rounded border px-1.5 py-0.5 font-mono text-xs">Ctrl+K</kbd>)
            anywhere to open the command palette. Search assistants, run quick actions, or browse
            the help section.
          </p>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">
          Documentation
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)]">
          A quick reference for the most common FlakersStudio workflows.
        </p>
      </header>

      {/* Quick-action shortcuts */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="flex flex-col items-start gap-2 p-5">
          <Plus className="h-5 w-5 text-[var(--color-brand)]" />
          <p className="text-sm font-medium text-[var(--color-text-primary)]">Build your first assistant</p>
          <p className="text-xs text-[var(--color-text-secondary)]">From URL to deployed widget in minutes.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/assistant/create")}
            className="mt-2"
          >
            Get started
          </Button>
        </Card>
        <Card className="flex flex-col items-start gap-2 p-5">
          <Sparkles className="h-5 w-5 text-[var(--color-accent)]" />
          <p className="text-sm font-medium text-[var(--color-text-primary)]">See the design system</p>
          <p className="text-xs text-[var(--color-text-secondary)]">All UI primitives at every state.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/design")}
            className="mt-2"
          >
            Open style guide
          </Button>
        </Card>
        <Card className="flex flex-col items-start gap-2 p-5">
          <Code className="h-5 w-5 text-[var(--color-trust-strong)]" />
          <p className="text-sm font-medium text-[var(--color-text-primary)]">Browse API endpoints</p>
          <p className="text-xs text-[var(--color-text-secondary)]">Hit the backend directly during integration.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.open("http://localhost:8000/docs", "_blank", "noopener,noreferrer");
              }
            }}
            className="mt-2"
          >
            Open API docs
          </Button>
        </Card>
      </div>

      {/* Sections */}
      {sections.map((s) => {
        const Icon = s.icon;
        return (
          <Card key={s.id} id={s.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                {s.title}
              </CardTitle>
              <CardDescription>{s.description}</CardDescription>
            </CardHeader>
            <CardContent>{s.body}</CardContent>
          </Card>
        );
      })}
    </div>
  );
}
