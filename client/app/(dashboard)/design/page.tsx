"use client";

/**
 * /design — internal style-guide canary page
 * --------------------------------------------------------------------
 * This page renders every primitive at every state in BOTH light and
 * dark modes. Other frontend branches use it as a smoke test to see
 * what tokens / primitives are available.
 *
 * Not linked from nav — reach it by typing the URL directly.
 * --------------------------------------------------------------------
 */
import * as React from "react";
import {
  Bot,
  Check,
  ChevronRight,
  CircleAlert,
  FileText,
  Link2,
  Moon,
  Search,
  Shield,
  Sparkles,
  Sun,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Chip,
  Input,
  Skeleton,
} from "@/components/ui/primitives";
import {
  cn,
  confidenceColor,
  gradientClass,
  toneSoftClass,
  toneSolidClass,
  type SemanticTone,
} from "@/lib/design-system";

/* ------------------------------------------------------------------ */
/* Section primitive (page-local — not part of the public design lib) */
/* ------------------------------------------------------------------ */
function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 space-y-4">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">{description}</p>
        ) : null}
      </header>
      <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-6 shadow-[var(--elevation-1)]">
        {children}
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-3 py-3 first:pt-0 last:pb-0 md:grid-cols-[160px_1fr] md:items-center">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
        {label}
      </div>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Swatch helpers                                                      */
/* ------------------------------------------------------------------ */
function Swatch({
  name,
  cssVar,
  tone = "light",
}: {
  name: string;
  cssVar: string;
  tone?: "light" | "dark";
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={cn(
          "h-16 w-full rounded-lg border",
          tone === "dark"
            ? "border-white/10"
            : "border-[var(--color-border-subtle)]"
        )}
        style={{ background: `var(${cssVar})` }}
      />
      <div className="flex flex-col">
        <span className="text-xs font-medium text-[var(--color-text-primary)]">{name}</span>
        <code className="text-[10px] text-[var(--color-text-muted)]">{cssVar}</code>
      </div>
    </div>
  );
}

function Ramp({ name, ramp }: { name: string; ramp: string }) {
  const stops = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold text-[var(--color-text-primary)]">{name}</div>
      <div className="grid grid-cols-10 gap-1">
        {stops.map((stop) => (
          <div key={stop} className="flex flex-col items-center gap-1">
            <div
              className="h-10 w-full rounded-md border border-[var(--color-border-subtle)]"
              style={{ background: `var(--${ramp}-${stop})` }}
              title={`${ramp}-${stop}`}
            />
            <span className="text-[10px] text-[var(--color-text-muted)]">{stop}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
export default function DesignSystemPage() {
  const [isDark, setIsDark] = React.useState(false);

  const toggleDark = React.useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      if (typeof document !== "undefined") {
        document.documentElement.classList.toggle("dark", next);
      }
      return next;
    });
  }, []);

  React.useEffect(() => {
    return () => {
      if (typeof document !== "undefined") {
        document.documentElement.classList.remove("dark");
      }
    };
  }, []);

  const semanticTones: SemanticTone[] = ["brand", "trust", "caution", "refuse", "neutral", "accent"];

  return (
    <div className="min-h-screen bg-[var(--color-background)] text-[var(--color-text-primary)]">
      {/* Sticky toolbar */}
      <header className="sticky top-0 z-20 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface)]/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[image:var(--gradient-brand)] text-white shadow-[var(--elevation-glow-brand)]">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="text-base font-semibold tracking-tight">Design System</div>
              <div className="text-xs text-[var(--color-text-muted)]">
                Phase 0 foundations · canary route
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="brand">v0.1</Badge>
            <Button variant="outline" size="sm" onClick={toggleDark}>
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              <span className="ml-1">{isDark ? "Light" : "Dark"}</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-12 px-6 py-12">
        {/* Hero */}
        <div
          className="relative overflow-hidden rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-10"
          style={{ backgroundImage: "var(--gradient-mesh-bg)" }}
        >
          <div className="relative z-10 max-w-3xl space-y-3">
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-brand-border)] bg-[var(--color-brand-soft)] px-2.5 py-1 text-xs font-medium text-[var(--color-brand)]">
              <Sparkles className="h-3 w-3" />
              FlakersStudio Foundations
            </span>
            <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
              <span className="text-gradient-brand">Governance-aware</span> design system
            </h1>
            <p className="text-base text-[var(--color-text-secondary)] md:text-lg">
              OKLCH brand gradient, semantic governance tokens (trust / caution / refuse),
              elevation, motion, and a per-component token layer — all wired into Tailwind v4.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Button variant="primary">
                <Sparkles className="h-4 w-4" /> Primary action
              </Button>
              <Button variant="gradient">Gradient CTA</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
            </div>
          </div>
        </div>

        {/* Color: base ramps */}
        <Section id="ramps" title="Base color ramps" description="Raw OKLCH ramps. Components should reference semantic tokens, not these.">
          <div className="space-y-6">
            <Ramp name="Brand (indigo)" ramp="brand" />
            <Ramp name="Accent — Cyan" ramp="accent-cyan" />
            <Ramp name="Trust (emerald)" ramp="trust" />
            <Ramp name="Caution (amber)" ramp="caution" />
            <Ramp name="Refuse (rose)" ramp="refuse" />
            <Ramp name="Neutral (warm-tinted)" ramp="neutral" />
          </div>
        </Section>

        {/* Semantic surface tokens */}
        <Section id="surfaces" title="Semantic surfaces & text" description="Purpose-driven tokens that flip light↔dark. Use these in components.">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Swatch name="background" cssVar="--color-background" />
            <Swatch name="surface" cssVar="--color-surface" />
            <Swatch name="surface-elevated" cssVar="--color-surface-elevated" />
            <Swatch name="surface-sunken" cssVar="--color-surface-sunken" />
            <Swatch name="brand" cssVar="--color-brand" />
            <Swatch name="brand-soft" cssVar="--color-brand-soft" />
            <Swatch name="trust" cssVar="--color-trust" />
            <Swatch name="trust-soft" cssVar="--color-trust-soft" />
            <Swatch name="caution" cssVar="--color-caution" />
            <Swatch name="caution-soft" cssVar="--color-caution-soft" />
            <Swatch name="refuse" cssVar="--color-refuse" />
            <Swatch name="refuse-soft" cssVar="--color-refuse-soft" />
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <ContrastSample bg="--color-surface" fg="--color-text-primary" label="text-primary" />
            <ContrastSample bg="--color-surface" fg="--color-text-secondary" label="text-secondary" />
            <ContrastSample bg="--color-surface" fg="--color-text-muted" label="text-muted" />
            <ContrastSample bg="--color-brand" fg="--color-brand-foreground" label="on-brand" />
            <ContrastSample bg="--color-trust" fg="--color-trust-foreground" label="on-trust" />
            <ContrastSample bg="--color-refuse" fg="--color-refuse-foreground" label="on-refuse" />
            <ContrastSample bg="--color-trust-soft" fg="--color-trust-strong" label="trust-soft / strong" />
            <ContrastSample bg="--color-refuse-soft" fg="--color-refuse-strong" label="refuse-soft / strong" />
          </div>
        </Section>

        {/* Gradients */}
        <Section id="gradients" title="Gradients" description="Composable backgrounds for hero, CTA, and governance accents.">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {(["brand", "trust", "refuse", "caution"] as const).map((g) => (
              <div
                key={g}
                className={cn(
                  "flex h-28 items-end justify-between rounded-xl p-4 text-white shadow-[var(--elevation-2)]",
                  gradientClass(g)
                )}
              >
                <span className="text-sm font-semibold capitalize">{g} gradient</span>
                <code className="text-xs opacity-80">--gradient-{g}</code>
              </div>
            ))}
          </div>
          <div className="mt-4 flex h-28 items-end justify-between rounded-xl p-4 shadow-[var(--elevation-1)] bg-gradient-mesh">
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">Mesh background</span>
            <code className="text-xs text-[var(--color-text-muted)]">--gradient-mesh-bg</code>
          </div>
        </Section>

        {/* Elevation */}
        <Section id="elevation" title="Elevation" description="Replace flat borders with depth. Glow variants for branded emphasis.">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="flex h-24 items-center justify-center rounded-xl bg-[var(--color-surface)]"
                style={{ boxShadow: `var(--elevation-${n})` }}
              >
                <span className="text-sm font-medium">elevation-{n}</span>
              </div>
            ))}
            <div
              className="flex h-24 items-center justify-center rounded-xl bg-[var(--color-surface)]"
              style={{ boxShadow: "var(--elevation-glow-brand)" }}
            >
              <span className="text-sm font-medium">glow-brand</span>
            </div>
            <div
              className="flex h-24 items-center justify-center rounded-xl bg-[var(--color-surface)]"
              style={{ boxShadow: "var(--elevation-glow-trust)" }}
            >
              <span className="text-sm font-medium">glow-trust</span>
            </div>
            <div
              className="flex h-24 items-center justify-center rounded-xl bg-[var(--color-surface)]"
              style={{ boxShadow: "var(--elevation-glow-refuse)" }}
            >
              <span className="text-sm font-medium">glow-refuse</span>
            </div>
          </div>
        </Section>

        {/* Typography */}
        <Section id="typography" title="Typography" description="Display → body. Tighter tracking on display, looser on uppercase chips.">
          <div className="space-y-4">
            <div style={{ fontSize: "var(--text-display-size)", lineHeight: "var(--text-display-line)", letterSpacing: "var(--tracking-tighter)" }} className="font-bold">
              Display 2.5rem — governance-aware
            </div>
            <div style={{ fontSize: "var(--text-4xl-size)", lineHeight: "var(--text-4xl-line)", letterSpacing: "var(--tracking-tight)" }} className="font-bold">
              Heading 4xl — Manage your AI agents
            </div>
            <div style={{ fontSize: "var(--text-3xl-size)", lineHeight: "var(--text-3xl-line)" }} className="font-semibold">
              Heading 3xl — Knowledge graph
            </div>
            <div style={{ fontSize: "var(--text-2xl-size)", lineHeight: "var(--text-2xl-line)" }} className="font-semibold">
              Heading 2xl — Section title
            </div>
            <div style={{ fontSize: "var(--text-xl-size)", lineHeight: "var(--text-xl-line)" }} className="font-medium">
              Heading xl — subsection
            </div>
            <div style={{ fontSize: "var(--text-lg-size)", lineHeight: "var(--text-lg-line)" }}>
              Body lg — Source-grounded responses with full citation chain.
            </div>
            <div style={{ fontSize: "var(--text-base-size)", lineHeight: "var(--text-base-line)" }}>
              Body base — The default body copy. Should land at 4.5:1 against surface.
            </div>
            <div style={{ fontSize: "var(--text-sm-size)", lineHeight: "var(--text-sm-line)" }} className="text-[var(--color-text-secondary)]">
              Body sm — Secondary text used in metadata & captions.
            </div>
            <div style={{ fontSize: "var(--text-xs-size)", lineHeight: "var(--text-xs-line)", letterSpacing: "var(--tracking-uppercase)" }} className="font-semibold uppercase text-[var(--color-text-muted)]">
              Eyebrow uppercase
            </div>
          </div>
        </Section>

        {/* Buttons */}
        <Section id="buttons" title="Buttons" description="Primary, gradient, ghost, outline, destructive — all sizes + states.">
          <Row label="Primary">
            <Button size="sm" variant="primary">Small</Button>
            <Button size="md" variant="primary">Medium</Button>
            <Button size="lg" variant="primary">Large</Button>
            <Button size="md" variant="primary" disabled>Disabled</Button>
            <Button size="md" variant="primary" isLoading>Loading</Button>
          </Row>
          <Row label="Gradient">
            <Button size="sm" variant="gradient">Small</Button>
            <Button size="md" variant="gradient">Medium</Button>
            <Button size="lg" variant="gradient"><Sparkles className="h-4 w-4" /> Large</Button>
          </Row>
          <Row label="Outline">
            <Button size="sm" variant="outline">Small</Button>
            <Button size="md" variant="outline">Medium</Button>
            <Button size="lg" variant="outline">Large</Button>
            <Button size="md" variant="outline" disabled>Disabled</Button>
          </Row>
          <Row label="Ghost">
            <Button size="sm" variant="ghost">Small</Button>
            <Button size="md" variant="ghost">Medium</Button>
            <Button size="lg" variant="ghost">Large</Button>
          </Row>
          <Row label="Destructive">
            <Button size="sm" variant="destructive"><X className="h-4 w-4" /> Refuse</Button>
            <Button size="md" variant="destructive">Delete</Button>
            <Button size="lg" variant="destructive">Confirm refusal</Button>
          </Row>
          <Row label="Icon-only">
            <Button size="icon" variant="primary"><Search className="h-4 w-4" /></Button>
            <Button size="icon" variant="outline"><Search className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost"><Search className="h-4 w-4" /></Button>
          </Row>
        </Section>

        {/* Badges */}
        <Section id="badges" title="Badges" description="Semantic governance tones — trust, caution, refuse, brand, accent, neutral.">
          <Row label="Variants">
            <Badge variant="trust"><Check className="h-3 w-3" /> Answer · trust</Badge>
            <Badge variant="caution"><CircleAlert className="h-3 w-3" /> Low confidence</Badge>
            <Badge variant="refuse"><X className="h-3 w-3" /> Refuse</Badge>
            <Badge variant="brand">Brand</Badge>
            <Badge variant="accent">Accent</Badge>
            <Badge variant="neutral">Neutral</Badge>
            <Badge variant="solid">Solid</Badge>
          </Row>
        </Section>

        {/* Chips */}
        <Section id="chips" title="Chips" description="Tighter than badges, intended for source / rule / tag rows.">
          <Row label="Source">
            <Chip variant="source" icon={<Link2 />}>example.com / docs</Chip>
            <Chip variant="source" icon={<FileText />}>FAQ.pdf #4</Chip>
            <Chip variant="source">https://example.com</Chip>
          </Row>
          <Row label="Rule">
            <Chip variant="rule" icon={<Shield />}>tenant_isolation</Chip>
            <Chip variant="rule" icon={<Shield />}>require_context</Chip>
            <Chip variant="rule">attribution_required</Chip>
          </Row>
          <Row label="Tag">
            <Chip variant="tag">support</Chip>
            <Chip variant="tag">documentation</Chip>
            <Chip variant="tag">faq</Chip>
          </Row>
        </Section>

        {/* Cards */}
        <Section id="cards" title="Cards" description="Elevation 1–4 + interactive hover state.">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {([0, 1, 2, 3, 4] as const).map((level) => (
              <Card key={level} elevation={level}>
                <CardHeader>
                  <CardTitle>Card · elevation {level}</CardTitle>
                  <CardDescription>Wired to component tokens.</CardDescription>
                </CardHeader>
                <CardContent>
                  Hover the interactive variant below to see the elevation transition.
                </CardContent>
              </Card>
            ))}
            <Card interactive elevation={1}>
              <CardHeader>
                <CardTitle>Interactive card</CardTitle>
                <CardDescription>Hover me — shadow + border lift.</CardDescription>
              </CardHeader>
              <CardContent>
                Used for clickable assistant tiles on the dashboard.
              </CardContent>
              <CardFooter>
                <Button size="sm" variant="ghost">
                  Open <ChevronRight className="h-4 w-4" />
                </Button>
              </CardFooter>
            </Card>
          </div>
        </Section>

        {/* Inputs */}
        <Section id="inputs" title="Inputs" description="Component-token-driven inputs in default / hover / focus / error / disabled.">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Input label="Default" placeholder="Search the knowledge base" />
            <Input label="With value" defaultValue="hello@flakers.studio" />
            <Input label="Disabled" defaultValue="Read only" disabled />
            <Input label="Error" defaultValue="not-an-email" error="Enter a valid email address." />
            <Input label="Password" type="password" defaultValue="hunter22" />
            <Input label="Search" placeholder="Type to search..." />
          </div>
        </Section>

        {/* Skeletons + animations */}
        <Section id="motion" title="Skeletons & motion" description="Shimmer, trust pulse, rule cascade, mesh drift.">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <div className="text-sm font-semibold">Skeleton shimmer</div>
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-32 w-full rounded-xl" />
            </div>
            <div className="space-y-3">
              <div className="text-sm font-semibold">Trust pulse (confirmed answer)</div>
              <div className="rounded-xl border border-[var(--color-trust-border)] bg-[var(--color-trust-soft)] p-4 animate-pulse-trust">
                <div className="flex items-center gap-2 text-[var(--color-trust-strong)]">
                  <Check className="h-4 w-4" />
                  <span className="text-sm font-medium">Answer verified — sources cited</span>
                </div>
              </div>
              <div className="text-sm font-semibold pt-2">Rule cascade (stagger)</div>
              <div className="space-y-1.5">
                {["tenant_isolation", "require_context", "attribution_required", "policy_quote_only"].map((rule, i) => (
                  <div
                    key={rule}
                    className={cn(
                      "animate-rule-cascade rounded-md border border-[var(--color-brand-border)] bg-[var(--color-brand-soft)] px-3 py-1.5 text-xs font-medium text-[var(--color-brand)]",
                      `stagger-${i + 1}`
                    )}
                  >
                    <Shield className="mr-1 inline h-3 w-3" /> {rule}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div
            className="mt-6 h-32 w-full rounded-xl border border-[var(--color-border-subtle)] animate-mesh-drift"
            style={{ backgroundImage: "var(--gradient-mesh-bg)", backgroundSize: "150% 150%" }}
            aria-label="mesh drift demo"
          />
        </Section>

        {/* Tone helpers */}
        <Section id="tones" title="Tone helpers" description="`toneSoftClass` and `toneSolidClass` from design-system.ts.">
          <Row label="Soft">
            {semanticTones.map((tone) => (
              <span key={tone} className={cn("rounded-md px-3 py-1.5 text-xs font-medium", toneSoftClass[tone])}>
                {tone}
              </span>
            ))}
          </Row>
          <Row label="Solid">
            {semanticTones.map((tone) => (
              <span key={tone} className={cn("rounded-md px-3 py-1.5 text-xs font-medium", toneSolidClass[tone])}>
                {tone}
              </span>
            ))}
          </Row>
        </Section>

        {/* Confidence helper */}
        <Section id="confidence" title="confidenceColor()" description="Map a confidence score to a governance tone.">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {[0.95, 0.62, 0.30].map((score) => {
              const tone = confidenceColor(score);
              return (
                <div
                  key={score}
                  className={cn(
                    "rounded-xl border p-4",
                    tone === "trust" && "border-[var(--color-trust-border)] bg-[var(--color-trust-soft)]",
                    tone === "caution" && "border-[var(--color-caution-border)] bg-[var(--color-caution-soft)]",
                    tone === "refuse" && "border-[var(--color-refuse-border)] bg-[var(--color-refuse-soft)]"
                  )}
                >
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                    score {score.toFixed(2)}
                  </div>
                  <div className={cn(
                    "mt-1 text-lg font-bold",
                    tone === "trust" && "text-[var(--color-trust-strong)]",
                    tone === "caution" && "text-[var(--color-caution-strong)]",
                    tone === "refuse" && "text-[var(--color-refuse-strong)]"
                  )}>
                    → {tone}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        {/* Composite example: assistant card */}
        <Section id="composite" title="Composite — assistant tile" description="Real-world example using primitives + tokens together.">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card interactive>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[image:var(--gradient-brand)] text-white">
                    <Bot className="h-5 w-5" />
                  </div>
                  <Badge variant="trust"><Check className="h-3 w-3" /> Live</Badge>
                </div>
                <CardTitle className="mt-3">Support Assistant</CardTitle>
                <CardDescription>Trained on docs.flakers.studio · 25 pages</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)] mb-1.5">
                    Governance
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Chip variant="rule" icon={<Shield />}>tenant_isolation</Chip>
                    <Chip variant="rule" icon={<Shield />}>require_context</Chip>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)] mb-1.5">
                    Sources
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Chip variant="source" icon={<Link2 />}>docs.flakers.studio</Chip>
                    <Chip variant="source" icon={<FileText />}>FAQ.pdf</Chip>
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button size="sm" variant="ghost">Open <ChevronRight className="h-4 w-4" /></Button>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-caution-soft)] text-[var(--color-caution-strong)]">
                    <Bot className="h-5 w-5" />
                  </div>
                  <Badge variant="caution"><CircleAlert className="h-3 w-3" /> Learning</Badge>
                </div>
                <CardTitle className="mt-3">Sales Assistant</CardTitle>
                <CardDescription>Ingesting 47 / 120 pages...</CardDescription>
              </CardHeader>
              <CardContent>
                <Skeleton className="h-2 w-full rounded-full" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-refuse-soft)] text-[var(--color-refuse-strong)]">
                    <Bot className="h-5 w-5" />
                  </div>
                  <Badge variant="refuse"><X className="h-3 w-3" /> Error</Badge>
                </div>
                <CardTitle className="mt-3">Legacy Assistant</CardTitle>
                <CardDescription>Crawler timed out — 3 retries failed.</CardDescription>
              </CardHeader>
              <CardFooter>
                <Button size="sm" variant="destructive">Retry</Button>
                <Button size="sm" variant="ghost">Dismiss</Button>
              </CardFooter>
            </Card>
          </div>
        </Section>

        {/* Footer note */}
        <p className="pt-6 text-center text-xs text-[var(--color-text-muted)]">
          Internal canary. Not linked from nav. Visit <code>/design</code> in light + dark to verify.
        </p>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Contrast sample helper                                              */
/* ------------------------------------------------------------------ */
function ContrastSample({
  bg,
  fg,
  label,
}: {
  bg: string;
  fg: string;
  label: string;
}) {
  return (
    <div
      className="flex flex-col gap-1.5 rounded-lg border border-[var(--color-border-subtle)] p-3"
      style={{ background: `var(${bg})`, color: `var(${fg})` }}
    >
      <span className="text-sm font-medium">{label}</span>
      <span className="text-xs">The quick brown fox jumps over the lazy dog.</span>
      <span className="text-[10px] opacity-80">
        bg {bg} · fg {fg}
      </span>
    </div>
  );
}
