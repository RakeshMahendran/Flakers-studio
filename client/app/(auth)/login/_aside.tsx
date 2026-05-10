"use client";

/**
 * Right-column collateral for /login. Rotates through three governance-
 * flavored quotes from imagined customers (used for social proof).
 */
import * as React from "react";
import { Quote, ShieldCheck, Sparkles } from "lucide-react";
import { Card, Chip } from "@/components/ui/primitives";
import { cn } from "@/lib/design-system";

const QUOTES = [
  {
    body: "Refusals stopped being a black box. Compliance signed off in a week, not a quarter.",
    author: "Priya M.",
    role: "Head of Knowledge Ops, fintech",
  },
  {
    body: "Every reply links to the source paragraph. My legal team finally trusts an AI feature.",
    author: "Daniel R.",
    role: "VP Engineering, healthtech",
  },
  {
    body: "We pointed it at a 4,000-page WordPress site and shipped a governed assistant the same day.",
    author: "Aleksei T.",
    role: "Founder, B2B SaaS",
  },
] as const;

export function LoginAside() {
  const [idx, setIdx] = React.useState(0);

  React.useEffect(() => {
    const id = window.setInterval(
      () => setIdx((i) => (i + 1) % QUOTES.length),
      6500
    );
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Chip variant="rule" icon={<ShieldCheck className="h-3.5 w-3.5" />}>
          Governance, by default
        </Chip>
        <h2 className="text-3xl font-semibold leading-tight tracking-tight text-[var(--color-text-primary)]">
          Your assistants{" "}
          <span className="text-gradient-brand">show their work.</span>
        </h2>
        <p className="text-base text-[var(--color-text-secondary)]">
          Sources cited, refusals explained, tenants isolated. Every interaction
          leaves an auditable trail.
        </p>
      </div>

      <Card
        elevation={2}
        padding="lg"
        className="bg-[var(--color-surface)]/85 backdrop-blur-sm"
      >
        <Quote
          aria-hidden
          className="h-6 w-6 text-[var(--color-brand)]"
        />
        <div className="relative mt-3 min-h-[120px]">
          {QUOTES.map((currentQuote, i) => (
            <figure
              key={currentQuote.author}
              className={cn(
                "transition-opacity duration-[var(--duration-slower)] ease-[var(--ease-out)]",
                i === idx
                  ? "relative opacity-100"
                  : "absolute inset-0 opacity-0 pointer-events-none"
              )}
              aria-hidden={i !== idx}
            >
              <blockquote className="text-base leading-relaxed text-[var(--color-text-primary)]">
                &ldquo;{currentQuote.body}&rdquo;
              </blockquote>
              <figcaption className="mt-4 text-sm">
                <span className="font-medium text-[var(--color-text-primary)]">
                  {currentQuote.author}
                </span>
                <span className="text-[var(--color-text-muted)]">
                  {" "}— {currentQuote.role}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
        <div className="mt-5 flex items-center gap-1.5" role="tablist" aria-label="Testimonial slide">
          {QUOTES.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === idx}
              aria-label={`Show testimonial ${i + 1}`}
              onClick={() => setIdx(i)}
              className={cn(
                "h-1.5 w-6 rounded-full transition-colors",
                i === idx
                  ? "bg-[var(--color-brand)]"
                  : "bg-[var(--color-border-default)] hover:bg-[var(--color-border-strong)]"
              )}
            />
          ))}
        </div>
      </Card>

      <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
        <Sparkles className="h-4 w-4 text-[var(--color-accent)]" aria-hidden />
        <span>Backed by governance, not vibes.</span>
      </div>
    </div>
  );
}
