"use client";

/**
 * FeatureCard — three-column marketing card composed from the design-system
 * Card primitive. Adds a tinted icon medallion and scroll-triggered fade-up
 * via IntersectionObserver (no animation library beyond framer-motion which
 * is intentionally NOT used here to keep the marketing payload light).
 */
import * as React from "react";
import { Card, CardTitle, CardDescription } from "@/components/ui/primitives";
import { cn, type SemanticTone } from "@/lib/design-system";

export interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  /** Governance tone — drives the icon medallion tint. */
  tone?: Extract<SemanticTone, "brand" | "trust" | "caution" | "refuse" | "accent">;
  /** Stagger delay applied to the entrance animation, in ms. */
  delay?: number;
  className?: string;
}

const toneMedallion: Record<NonNullable<FeatureCardProps["tone"]>, string> = {
  brand:
    "bg-[var(--color-brand-soft)] text-[var(--color-brand)] ring-1 ring-[var(--color-brand-border)]",
  trust:
    "bg-[var(--color-trust-soft)] text-[var(--color-trust-strong)] ring-1 ring-[var(--color-trust-border)]",
  caution:
    "bg-[var(--color-caution-soft)] text-[var(--color-caution-strong)] ring-1 ring-[var(--color-caution-border)]",
  refuse:
    "bg-[var(--color-refuse-soft)] text-[var(--color-refuse-strong)] ring-1 ring-[var(--color-refuse-border)]",
  accent:
    "bg-[var(--color-accent-soft)] text-[var(--color-accent)] ring-1 ring-[var(--color-accent-border)]",
};

export function FeatureCard({
  icon,
  title,
  description,
  tone = "brand",
  delay = 0,
  className,
}: FeatureCardProps) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        "transition-[opacity,transform] duration-[var(--duration-slower)] ease-[var(--ease-out)] motion-reduce:transition-none",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6",
        className
      )}
    >
      <Card
        elevation={1}
        padding="lg"
        className={cn(
          "h-full transition-[transform,box-shadow,border-color] duration-[var(--duration-base)] ease-[var(--ease-out)]",
          "hover:-translate-y-0.5 hover:border-[var(--color-brand-border)] hover:shadow-[var(--elevation-2)]"
        )}
      >
        <div
          aria-hidden
          className={cn(
            "mb-5 inline-flex h-11 w-11 items-center justify-center rounded-lg",
            toneMedallion[tone]
          )}
        >
          {icon}
        </div>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription className="mt-2 text-[var(--color-text-secondary)]">
          {description}
        </CardDescription>
      </Card>
    </div>
  );
}
