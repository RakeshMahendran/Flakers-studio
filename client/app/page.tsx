"use client";

/**
 * Public marketing landing — `/`
 *
 * Governance-first positioning. Authenticated users are redirected to
 * /dashboard on mount; everyone else sees the full landing.
 *
 * Layout:
 *   - Hero (named pain, named outcome, product mockup)
 *   - Logo strip (social proof)
 *   - Features (3 differentiators)
 *   - Stats row (concrete numbers)
 *   - How it works (3 steps)
 *   - Testimonial (single pull quote)
 *   - Pricing (3 tiers)
 *   - CTA banner
 *   - Footer (with Privacy/Terms/Security)
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
  Link2,
  Lock,
  ScrollText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Badge, Button, Card, Chip } from "@/components/ui/primitives";
import { cn } from "@/lib/design-system";
import { GradientHero } from "@/components/marketing/gradient-hero";
import { FeatureCard } from "@/components/marketing/feature-card";
import { LogoStrip } from "@/components/marketing/logo-strip";
import { ProductMockup } from "@/components/marketing/product-mockup";
import { StatsRow } from "@/components/marketing/stats-row";
import { TestimonialCard } from "@/components/marketing/testimonial-card";

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
          <NavLink href="#features">Features</NavLink>
          <NavLink href="#how">How it works</NavLink>
          <NavLink href="#pricing">Pricing</NavLink>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild variant="gradient" size="sm">
            <Link href="/register">
              Start free
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
/* Hero                                                                 */
/* ------------------------------------------------------------------ */
function Hero() {
  return (
    <GradientHero className="pt-12 pb-16 sm:pt-20 sm:pb-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <Badge variant="brand" className="mb-6 gap-1.5">
            <Sparkles className="h-3 w-3" aria-hidden />
            <span>Governed RAG for regulated teams</span>
          </Badge>

          <h1
            className={cn(
              "text-balance text-4xl font-semibold leading-[1.05] tracking-tight",
              "text-[var(--color-text-primary)] sm:text-5xl md:text-6xl lg:text-7xl",
              "animate-hero-headline"
            )}
          >
            The AI chatbot your{" "}
            <span className="text-gradient-brand">compliance team</span>{" "}
            will sign off on.
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-relaxed text-[var(--color-text-secondary)] sm:text-xl">
            Every answer cites its sources. Every refusal explains why. Built for teams
            who can&rsquo;t afford a hallucination on the record.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild variant="gradient" size="lg" className="w-full sm:w-auto">
              <Link href="/register">
                Start free — no card
                <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
              <Link href="#how">See how it works</Link>
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-[var(--color-text-muted)]">
            <span className="inline-flex items-center gap-1">
              <Check className="h-3 w-3 text-[var(--color-trust)]" /> Tenant-isolated
            </span>
            <span className="inline-flex items-center gap-1">
              <Check className="h-3 w-3 text-[var(--color-trust)]" /> WordPress-ready
            </span>
            <span className="inline-flex items-center gap-1">
              <Check className="h-3 w-3 text-[var(--color-trust)]" /> Audit trail by default
            </span>
          </div>
        </div>

        {/* Product mockup */}
        <div className="mx-auto mt-16 max-w-5xl px-2 sm:mt-20">
          <div className="animate-hero-mockup">
            <ProductMockup />
          </div>
        </div>
      </div>

      {/* Hero-specific keyframes */}
      <style jsx global>{`
        @keyframes hero-headline-in {
          0% {
            opacity: 0;
            transform: translateY(12px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes hero-mockup-in {
          0% {
            opacity: 0;
            transform: translateY(24px) scale(0.98);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .animate-hero-headline {
          animation: hero-headline-in 0.6s var(--ease-out) both;
        }
        .animate-hero-mockup {
          animation: hero-mockup-in 0.8s var(--ease-out) 200ms both;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-hero-headline,
          .animate-hero-mockup {
            animation: none;
            opacity: 1;
            transform: none;
          }
        }
      `}</style>
    </GradientHero>
  );
}

/* ------------------------------------------------------------------ */
/* Logo strip                                                           */
/* ------------------------------------------------------------------ */
function LogoBand() {
  return (
    <section className="border-y border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] py-12 sm:py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <LogoStrip />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Features                                                             */
/* ------------------------------------------------------------------ */
function Features() {
  return (
    <section
      id="features"
      className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8"
    >
      <div className="mx-auto max-w-2xl text-center">
        <Badge variant="neutral" className="mb-3">
          What makes it different
        </Badge>
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Three things most AI chatbots can&rsquo;t do.
        </h2>
        <p className="mt-3 text-base text-[var(--color-text-secondary)]">
          We didn&rsquo;t bolt governance onto a chatbot. We built the chatbot around it.
        </p>
      </div>

      <div className="mt-12 grid gap-6 md:grid-cols-3">
        <FeatureCard
          tone="trust"
          delay={0}
          icon={<ShieldCheck className="h-5 w-5" />}
          title="Explained refusals"
          description="When the bot can't answer, it tells you which rule blocked it — and which document would've answered the question if your policies allowed."
        />
        <FeatureCard
          tone="brand"
          delay={120}
          icon={<Link2 className="h-5 w-5" />}
          title="Source-cited answers"
          description="Every response links back to the chunk that produced it. Auditors stop asking 'where did the bot get this?' because the answer is right there."
        />
        <FeatureCard
          tone="accent"
          delay={240}
          icon={<Lock className="h-5 w-5" />}
          title="Tenant-isolated by design"
          description="Multi-tenant SaaS pattern from day one. Your content can't leak to another tenant — not through prompt injection, not through context bleed."
        />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Stats                                                                */
/* ------------------------------------------------------------------ */
function Stats() {
  return (
    <section className="mx-auto -mt-8 max-w-6xl px-4 sm:px-6 lg:px-8">
      <StatsRow />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* How it works                                                         */
/* ------------------------------------------------------------------ */
function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Ingest",
      icon: <Database className="h-5 w-5" />,
      copy: "Point at a WordPress site or upload docs. Content is chunked, embedded, and scoped to your tenant — no cross-talk.",
    },
    {
      n: "02",
      title: "Govern",
      icon: <ScrollText className="h-5 w-5" />,
      copy: "Six rules sit between every query and every answer: tenant scope, source citation, refusal-with-reason, no free-form facts.",
    },
    {
      n: "03",
      title: "Answer",
      icon: <BadgeCheck className="h-5 w-5" />,
      copy: "Streamed replies with sources attached, confidence shown, and refusals explained — not silent.",
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
            From your content to a governed answer in under a minute.
          </h2>
          <p className="mt-3 text-base text-[var(--color-text-secondary)]">
            Three stages. One contract — your assistant can&rsquo;t exceed its rules.
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
                <h3 className="mt-4 text-xl font-semibold tracking-tight">{step.title}</h3>
                <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{step.copy}</p>
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
/* Testimonial                                                          */
/* ------------------------------------------------------------------ */
function Testimonial() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <TestimonialCard
          quote="We tried four chatbot vendors before FlakersStudio. They were the only ones whose refusal log was something I could hand to legal without translating it."
          authorName="Priya Anand"
          authorRole="Head of Compliance"
          authorCompany="Northwind Partners"
          badge="SOC 2 ready"
        />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Pricing                                                              */
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
    blurb: "For one project, one team, one assistant.",
    features: [
      "1 assistant",
      "500 indexed pages",
      "Source citations on every answer",
      "Community Discord",
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
      "25,000 indexed pages",
      "Audit log + refusal traces",
      "WordPress + sitemap ingestion",
      "Email support, 1-business-day SLA",
    ],
    cta: { label: "Start 14-day trial", href: "/register" },
    highlighted: true,
  },
  {
    name: "Scale",
    price: "Custom",
    cadence: "annual contract",
    blurb: "Multi-tenant, SAML, dedicated infrastructure.",
    features: [
      "Unlimited assistants",
      "SAML / SSO",
      "Custom retention policies",
      "Dedicated tenant isolation",
      "Priority support + named CSM",
    ],
    cta: { label: "Talk to sales", href: "mailto:hello@flakers.studio" },
  },
];

function Pricing() {
  return (
    <section
      id="pricing"
      className="relative bg-[var(--color-surface-sunken)] py-20 sm:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <Badge variant="accent" className="mb-3">
            Pricing
          </Badge>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Pay for governance — not for tokens.
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
                "relative flex h-full flex-col transition-shadow",
                tier.highlighted
                  ? "border-[var(--color-brand-border)] ring-1 ring-[var(--color-brand-border)]"
                  : "hover:shadow-[var(--elevation-2)]"
              )}
            >
              {tier.highlighted ? (
                <div className="absolute -top-3 left-6">
                  <Badge variant="brand">Most popular</Badge>
                </div>
              ) : null}
              <h3 className="text-lg font-semibold tracking-tight">{tier.name}</h3>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-4xl font-semibold tracking-tight">{tier.price}</span>
                <span className="text-sm text-[var(--color-text-muted)]">{tier.cadence}</span>
              </div>
              <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{tier.blurb}</p>

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
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Final CTA                                                            */
/* ------------------------------------------------------------------ */
function CTA() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
      <div
        className={cn(
          "relative isolate overflow-hidden rounded-2xl",
          "bg-[image:var(--gradient-brand)] px-6 py-12 sm:px-12 sm:py-16",
          "shadow-[var(--elevation-3)]"
        )}
      >
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.18),_transparent_50%)]"
        />
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Ship an assistant your legal team approves of.
            </h2>
            <p className="mt-2 text-sm text-white/85 sm:text-base">
              Free tier · No credit card · 60-second setup
            </p>
          </div>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="border-transparent bg-white text-[var(--color-brand)] hover:bg-white/90"
          >
            <Link href="/register">
              Start free
              <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Footer                                                               */
/* ------------------------------------------------------------------ */
function Footer() {
  return (
    <footer className="border-t border-[var(--color-border-subtle)] bg-[var(--color-surface)]">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[image:var(--gradient-brand)] text-white">
                <span className="text-xs font-bold tracking-tight">FS</span>
              </span>
              <span className="text-sm font-semibold">FlakersStudio</span>
            </div>
            <p className="max-w-xs text-sm text-[var(--color-text-secondary)]">
              Governance-first AI assistants for teams who need to prove every answer.
            </p>
          </div>

          <FooterColumn
            title="Product"
            links={[
              { label: "Features", href: "#features" },
              { label: "How it works", href: "#how" },
              { label: "Pricing", href: "#pricing" },
              { label: "Sign in", href: "/login" },
            ]}
          />
          <FooterColumn
            title="Company"
            links={[
              { label: "About", href: "/about" },
              { label: "Blog", href: "/blog" },
              { label: "Contact", href: "mailto:hello@flakers.studio" },
            ]}
          />
          <FooterColumn
            title="Legal"
            links={[
              { label: "Privacy", href: "/privacy" },
              { label: "Terms", href: "/terms" },
              { label: "Security", href: "/security" },
              { label: "DPA", href: "/dpa" },
            ]}
          />
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-[var(--color-border-subtle)] pt-6 text-xs text-[var(--color-text-muted)] md:flex-row md:items-center">
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

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
        {title}
      </p>
      <ul className="flex flex-col gap-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
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
      <LogoBand />
      <Features />
      <Stats />
      <HowItWorks />
      <Testimonial />
      <Pricing />
      <CTA />
      <Footer />
    </main>
  );
}
