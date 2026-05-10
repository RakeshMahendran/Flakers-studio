"use client";

/**
 * Public marketing landing — `/`
 *
 * Governance-first positioning. NOT a generic AI marketing page.
 * Authenticated users are redirected to /dashboard on mount; everyone
 * else sees the full landing.
 */
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  ChevronRight,
  Database,
  FileText,
  Globe,
  Link2,
  ScrollText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Badge, Button, Card, Chip } from "@/components/ui/primitives";
import { cn } from "@/lib/design-system";
import { GradientHero } from "@/components/marketing/gradient-hero";
import { FeatureCard } from "@/components/marketing/feature-card";
import { RuleChipStrip } from "@/components/marketing/rule-chip-strip";

/* ------------------------------------------------------------------ */
/* Top nav                                                             */
/* ------------------------------------------------------------------ */
function TopNav() {
  return (
    <nav
      aria-label="Primary"
      className={cn(
        "sticky top-0 z-30 w-full border-b border-transparent",
        "backdrop-blur-md supports-[backdrop-filter]:bg-[var(--color-background)]/70",
        "bg-[var(--color-background)]/95"
      )}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
          aria-label="FlakersStudio home"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[image:var(--gradient-brand)] text-white shadow-[var(--elevation-1)]">
            <span className="text-sm font-bold tracking-tight">FS</span>
          </span>
          <span className="text-sm font-semibold tracking-tight">FlakersStudio</span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          <NavLink href="#pricing">Pricing</NavLink>
          <NavLink href="#how">How it works</NavLink>
          <NavLink href="/design">Design</NavLink>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Login</Link>
          </Button>
          <Button asChild variant="gradient" size="sm">
            <Link href="/register">
              Get started
              <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden />
            </Link>
          </Button>
        </div>
      </div>
    </nav>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm text-[var(--color-text-secondary)]",
        "hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-text-primary)]",
        "transition-colors"
      )}
    >
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Hero — word-by-word fade-up headline                                */
/* ------------------------------------------------------------------ */
const HEADLINE = ["AI", "assistants", "that", "show", "their", "work."];

function HeadlineWords() {
  return (
    <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight text-[var(--color-text-primary)] sm:text-5xl md:text-6xl lg:text-7xl">
      <span className="sr-only">{HEADLINE.join(" ")}</span>
      <span aria-hidden className="inline">
        {HEADLINE.map((word, i) => {
          const isAccent = word === "show" || word === "their" || word === "work.";
          return (
            <span
              key={`${word}-${i}`}
              className="inline-block overflow-hidden"
            >
              <span
                className={cn(
                  "inline-block",
                  "translate-y-[1.2em] opacity-0 will-change-transform",
                  "[animation:hero-word-up_0.7s_var(--ease-out)_both]",
                  isAccent ? "text-gradient-brand" : ""
                )}
                style={{ animationDelay: `${i * 80}ms` }}
              >
                {word}
              </span>
              {i < HEADLINE.length - 1 ? <span>&nbsp;</span> : null}
            </span>
          );
        })}
      </span>
    </h1>
  );
}

function Hero() {
  return (
    <GradientHero className="pt-10 pb-20 sm:pt-16 sm:pb-28">
      {/* Local keyframe — co-located with the only consumer */}
      <style jsx global>{`
        @keyframes hero-word-up {
          0% {
            transform: translateY(1.2em);
            opacity: 0;
          }
          100% {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <Badge variant="brand" className="mb-6">
            <Sparkles className="h-3 w-3" aria-hidden />
            <span>Governed RAG, six rules deep</span>
          </Badge>

          <HeadlineWords />

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[var(--color-text-secondary)] sm:text-xl">
            Every answer cites its sources, every refusal explains why.
            Six governance rules, enforced by design — not by hope.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild variant="gradient" size="lg" className="w-full sm:w-auto">
              <Link href="/register">
                Start free
                <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
              <Link href="#how">See it live</Link>
            </Button>
          </div>

          <p className="mt-4 text-xs text-[var(--color-text-muted)]">
            No credit card. WordPress-ready. Tenant-isolated from day one.
          </p>
        </div>

        <div className="mt-16 sm:mt-20">
          <RuleChipStrip />
        </div>
      </div>
    </GradientHero>
  );
}

/* ------------------------------------------------------------------ */
/* Features                                                            */
/* ------------------------------------------------------------------ */
function Features() {
  return (
    <section
      id="features"
      className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8"
    >
      <div className="mx-auto max-w-2xl text-center">
        <Badge variant="neutral" className="mb-3">
          Why teams trust it
        </Badge>
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Three guarantees competitors can't make
        </h2>
        <p className="mt-3 text-base text-[var(--color-text-secondary)]">
          We didn't bolt governance onto a chatbot. We built the chatbot around governance.
        </p>
      </div>

      <div className="mt-12 grid gap-6 md:grid-cols-3">
        <FeatureCard
          tone="brand"
          delay={0}
          icon={<ShieldCheck className="h-5 w-5" />}
          title="Governance, not guardrails"
          description="Refusals are first-class. Out-of-scope questions trigger an explained 'no', not a hallucination dressed as a 'yes'."
        />
        <FeatureCard
          tone="trust"
          delay={120}
          icon={<Globe className="h-5 w-5" />}
          title="WordPress-native ingestion"
          description="Point at a WordPress site, hit ingest, ship. We respect canonical URLs, taxonomies, and the publish/draft state."
        />
        <FeatureCard
          tone="accent"
          delay={240}
          icon={<Link2 className="h-5 w-5" />}
          title="Source-cited answers"
          description="Every answer links back to the chunk it came from. Auditors and legal stop asking 'where did the bot get this?'"
        />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* How it works                                                        */
/* ------------------------------------------------------------------ */
function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Ingest",
      icon: <Database className="h-5 w-5" />,
      tone: "neutral" as const,
      copy: "Crawl your WordPress site or upload docs. Chunked, embedded, and scoped to your tenant.",
    },
    {
      n: "02",
      title: "Govern",
      icon: <ScrollText className="h-5 w-5" />,
      tone: "brand" as const,
      copy: "Six rules guard every query: tenant scope, source citation, refusal-with-reason, no free-form facts.",
    },
    {
      n: "03",
      title: "Answer",
      icon: <BadgeCheck className="h-5 w-5" />,
      tone: "trust" as const,
      copy: "Replies stream with sources attached. Confidence is shown. Refusals are explained, not silent.",
    },
  ];

  return (
    <section
      id="how"
      className="relative bg-[var(--color-surface-sunken)] py-20 sm:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <Badge variant="brand" className="mb-3">
            How it works
          </Badge>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Three stages. One contract.
          </h2>
          <p className="mt-3 text-base text-[var(--color-text-secondary)]">
            From your content to a governed answer in under a minute.
          </p>
        </div>

        <ol className="mt-12 grid gap-5 md:grid-cols-3">
          {steps.map((step, i) => (
            <li key={step.n} className="relative">
              <Card elevation={1} padding="lg" className="h-full">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                    Step {step.n}
                  </span>
                  <Chip variant="rule" icon={step.icon}>
                    {step.title}
                  </Chip>
                </div>
                <h3 className="mt-4 text-xl font-semibold tracking-tight">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                  {step.copy}
                </p>
              </Card>
              {i < steps.length - 1 ? (
                <ChevronRight
                  aria-hidden
                  className="absolute -right-3 top-1/2 hidden h-5 w-5 -translate-y-1/2 text-[var(--color-text-muted)] md:block"
                />
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Pricing teaser                                                      */
/* ------------------------------------------------------------------ */
type Tier = {
  name: string;
  price: string;
  cadence: string;
  blurb: string;
  features: string[];
  cta: { label: string; href: string };
  highlighted?: boolean;
};

const TIERS: Tier[] = [
  {
    name: "Free",
    price: "$0",
    cadence: "forever",
    blurb: "Kick the tires on a single project.",
    features: [
      "1 assistant",
      "500 indexed pages",
      "Source citations",
      "Community support",
    ],
    cta: { label: "Start free", href: "/register" },
  },
  {
    name: "Studio",
    price: "$49",
    cadence: "per month",
    blurb: "Production governance for one tenant.",
    features: [
      "5 assistants",
      "25k indexed pages",
      "Audit log + refusal traces",
      "WordPress + sitemap ingestion",
      "Email support",
    ],
    cta: { label: "Start free trial", href: "/register" },
    highlighted: true,
  },
  {
    name: "Scale",
    price: "Talk to us",
    cadence: "annual",
    blurb: "Multi-tenant, SLA, deeper governance hooks.",
    features: [
      "Unlimited assistants",
      "SAML / SSO",
      "Custom retention",
      "Dedicated tenant isolation",
      "Priority support",
    ],
    cta: { label: "Contact sales", href: "mailto:hello@flakers.studio" },
  },
];

function Pricing() {
  return (
    <section
      id="pricing"
      className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8"
    >
      <div className="mx-auto max-w-2xl text-center">
        <Badge variant="accent" className="mb-3">
          Pricing
        </Badge>
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Pay for governance, not for tokens
        </h2>
        <p className="mt-3 text-base text-[var(--color-text-secondary)]">
          Predictable per-tenant pricing. No per-message guessing games.
        </p>
      </div>

      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {TIERS.map((tier) => (
          <Card
            key={tier.name}
            elevation={tier.highlighted ? 3 : 1}
            padding="lg"
            className={cn(
              "flex h-full flex-col",
              tier.highlighted &&
                "border-[var(--color-brand-border)] ring-1 ring-[var(--color-brand-border)]"
            )}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold tracking-tight">{tier.name}</h3>
              {tier.highlighted ? <Badge variant="brand">Most popular</Badge> : null}
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-4xl font-semibold tracking-tight">
                {tier.price}
              </span>
              <span className="text-sm text-[var(--color-text-muted)]">
                {tier.cadence}
              </span>
            </div>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              {tier.blurb}
            </p>

            <ul className="mt-6 flex-1 space-y-2.5">
              {tier.features.map((f) => (
                <li
                  key={f}
                  className="flex items-start gap-2 text-sm text-[var(--color-text-secondary)]"
                >
                  <Check
                    aria-hidden
                    className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-trust)]"
                  />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <div className="mt-7">
              <Button
                asChild
                variant={tier.highlighted ? "gradient" : "outline"}
                size="md"
                className="w-full"
              >
                <Link href={tier.cta.href}>{tier.cta.label}</Link>
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Footer                                                              */
/* ------------------------------------------------------------------ */
function Footer() {
  return (
    <footer className="border-t border-[var(--color-border-subtle)] bg-[var(--color-surface)]">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[image:var(--gradient-brand)] text-white">
              <span className="text-xs font-bold tracking-tight">FS</span>
            </span>
            <span className="text-sm font-semibold">FlakersStudio</span>
          </div>
          <nav
            aria-label="Footer"
            className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-[var(--color-text-muted)]"
          >
            <Link className="hover:text-[var(--color-text-primary)]" href="#features">
              Features
            </Link>
            <Link className="hover:text-[var(--color-text-primary)]" href="#how">
              How it works
            </Link>
            <Link className="hover:text-[var(--color-text-primary)]" href="#pricing">
              Pricing
            </Link>
            <Link className="hover:text-[var(--color-text-primary)]" href="/login">
              Login
            </Link>
            <Link className="hover:text-[var(--color-text-primary)]" href="/register">
              Sign up
            </Link>
          </nav>
        </div>
        <div className="mt-8 flex flex-col items-start justify-between gap-2 border-t border-[var(--color-border-subtle)] pt-6 text-xs text-[var(--color-text-muted)] md:flex-row md:items-center">
          <span>&copy; {new Date().getFullYear()} FlakersStudio. All rights reserved.</span>
          <span className="inline-flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" aria-hidden />
            <span>Governance-first by design.</span>
          </span>
        </div>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
export default function HomePage() {
  const router = useRouter();
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("user");
    if (stored) {
      router.replace("/dashboard");
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) {
    return null;
  }

  return (
    <main className="min-h-screen bg-[var(--color-background)] text-[var(--color-text-primary)]">
      <TopNav />
      <Hero />
      <Features />
      <HowItWorks />
      <Pricing />
      <Footer />
    </main>
  );
}
